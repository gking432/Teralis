'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { inferKind, placeTypeLabel } from '@/lib/catalog/placeFromQuery';
import { findCityCatalogPrint, getCityCatalogPrints, getStateCatalogPrints, type CatalogPrintKind } from '@/lib/catalog/prints';
import { trackDemoEvent } from '@/lib/demoAnalytics';

interface NominatimResult {
  place_id: number;
  display_name: string;
  name: string;
  type?: string;
  class?: string;
  category?: string;
  addresstype?: string;
  boundingbox: [string, string, string, string]; // south, north, west, east
  lat: string;
  lon: string;
}

interface DisplayResult {
  key: string;
  slug?: string;
  primary: string;
  secondary: string;
  kind: CatalogPrintKind;
  placeType: string;
  typeLabel: string;
  bbox: [number, number, number, number];
  center: [number, number];
  displayName: string;
}

const SEARCH_DEBOUNCE_MS = 260;
const RECENTS_KEY = 'teralis:recent-places';
const MAX_RECENTS = 4;

function toDisplay(result: NominatimResult): DisplayResult {
  const kind = inferKind(result.addresstype, result.type);
  const parts = result.display_name.split(',').map((part) => part.trim()).filter(Boolean);
  const primary = result.name || parts[0] || result.display_name;
  const secondary = parts.length > 1 ? parts.slice(1).slice(-3).join(', ') : '';
  const bbox = result.boundingbox.map(Number) as [number, number, number, number];
  const longitude = Number(result.lon);
  const latitude = Number(result.lat);

  return {
    key: String(result.place_id),
    primary,
    secondary,
    kind,
    placeType: result.addresstype || result.type || kind,
    // The badge says what we actually found, rather than forcing every result
    // into one of the three rendering modes.
    typeLabel: placeTypeLabel(result.addresstype, result.type, result.class || result.category),
    bbox,
    center: Number.isFinite(longitude) && Number.isFinite(latitude)
      ? [longitude, latitude]
      : [(bbox[2] + bbox[3]) / 2, (bbox[0] + bbox[1]) / 2],
    displayName: result.display_name,
  };
}

function navigateUrl(result: DisplayResult): string {
  if (result.slug) return `/maps/${result.slug}`;
  if (result.kind === 'state') {
    const state = getStateCatalogPrints().find((p) => p.name.toLowerCase() === result.primary.toLowerCase());
    if (state && /united states/i.test(result.displayName)) return `/maps/${state.slug}`;
  }
  const params = new URLSearchParams({
    place: result.primary,
    kind: result.kind,
    type: result.placeType,
    bbox: result.bbox.join(','),
    center: result.center.join(','),
    display: result.displayName,
  });
  if (result.kind === 'city') {
    const catalogCity = findCityCatalogPrint(result.primary, result.displayName);
    return catalogCity ? `/maps/${catalogCity.slug}` : `/maps/custom?${params.toString()}`;
  }
  return `/maps/custom?${params.toString()}`;
}

function readRecents(): DisplayResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as DisplayResult[]).slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function rememberPlace(result: DisplayResult): void {
  try {
    const existing = readRecents().filter((entry) => entry.key !== result.key);
    window.localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify([result, ...existing].slice(0, MAX_RECENTS)),
    );
  } catch {}
}

export function LocationSearch({
  autoFocus = false,
  placeholder = 'City, town, or state',
}: {
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const resultsId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DisplayResult[]>([]);
  const [recents, setRecents] = useState<DisplayResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setRecents(readRecents()); }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const catalog = [...getStateCatalogPrints(), ...getCityCatalogPrints()]
      .filter((place) => `${place.name} ${place.defaultSubtitle}`.toLowerCase().includes(trimmed.toLowerCase()))
      .slice(0, 6).map((place): DisplayResult => ({ key: `catalog-${place.slug}`, slug: place.slug, primary: place.name, secondary: place.kind === 'state' ? 'United States' : place.defaultSubtitle, kind: place.kind, placeType: place.kind, typeLabel: place.kind === 'state' ? 'State' : 'City', bbox: place.bbox.map(Number) as DisplayResult['bbox'], center: place.center, displayName: `${place.name}, ${place.defaultSubtitle}, United States` }));
    setResults(catalog);
    setActiveIndex(0);
    setLoading(true);
    setError(null);

    const timer = window.setTimeout(() => {
      fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            // The proxy sends a readable reason; never surface a parser error.
            throw new Error(
              (payload && typeof payload === 'object' && 'error' in payload
                ? String((payload as { error: unknown }).error)
                : null) || 'Place search is unavailable right now.',
            );
          }
          return Array.isArray(payload) ? (payload as NominatimResult[]) : [];
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          setResults([...catalog, ...data.map(toDisplay).filter((result) => !catalog.some((local) => local.primary.toLowerCase() === result.primary.toLowerCase() && Math.abs(local.center[0] - result.center[0]) < 1 && Math.abs(local.center[1] - result.center[1]) < 1))].slice(0, 9));
          setActiveIndex(0);
        })
        .catch((err) => {
          if (err?.name === 'AbortError' || controller.signal.aborted) return;
          if (!catalog.length) setError(err instanceof Error ? err.message : 'Place search failed.');
        })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, SEARCH_DEBOUNCE_MS);

    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  function pick(result: DisplayResult) {
    rememberPlace(result);
    trackDemoEvent('search_result_selected', {
      place: result.primary,
      kind: result.kind,
      placeType: result.placeType,
      catalog: Boolean(findCityCatalogPrint(result.primary, result.displayName)),
    });
    router.push(navigateUrl(result));
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('This browser cannot share your location.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(`/api/geocode?lat=${latitude}&lng=${longitude}&z=12`);
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.boundingbox) throw new Error('Could not identify that location.');
          pick(toDisplay(payload as NominatimResult));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not identify that location.');
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setError('Location permission was declined.');
      },
      { timeout: 10000 },
    );
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const list = query.trim().length >= 2 ? results : recents;
    if (!open || list.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(list.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (list[activeIndex]) pick(list[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showRecents = open && query.trim().length < 2 && recents.length > 0;
  const showResults = open && query.trim().length >= 2 && results.length > 0;
  const showEmpty = open && query.trim().length >= 2 && !loading && !error && results.length === 0;
  const list = showRecents ? recents : results;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#173f35]"
          width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={showResults || showRecents}
          aria-controls={resultsId}
          aria-label="Search a city, town, or state"
          aria-activedescendant={(showResults || showRecents) && list[activeIndex] ? `${resultsId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-sm border border-white/25 bg-[#f8f6ef] py-[19px] pl-14 pr-5 text-[16px] text-[#14201d] shadow-[0_18px_50px_rgba(0,0,0,0.16)] outline-none transition-all placeholder:text-[#77817b] focus:border-[#c66b4e] focus:shadow-[0_22px_60px_rgba(0,0,0,0.26)] sm:pr-[132px]"
        />

        <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-2 sm:flex">
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#d4d8d3] border-t-[#173f35]" />
          )}
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="rounded-sm px-3 py-2 text-[12px] text-[#4a544e] transition-colors hover:bg-[#e9ede8] disabled:opacity-50"
          >
            {locating ? 'Locating…' : 'Use my location'}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border border-white/20 bg-white/[0.06] px-4 text-[11px] text-[#dce2dd]/75 transition-colors hover:bg-white/10 disabled:opacity-50 sm:hidden"
      >
        <span aria-hidden>◎</span>
        {locating ? 'Finding your location…' : 'Use my location'}
      </button>

      {(showResults || showRecents) && (
        <ul
          id={resultsId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[420px] overflow-y-auto rounded-sm border border-[#c9cec8] bg-[#fbfaf6] text-[#14201d] shadow-[0_24px_70px_rgba(0,0,0,0.3)]"
        >
          {showRecents && (
            <li className="px-5 pb-1 pt-3 text-[11px] uppercase tracking-[0.14em] text-[#8a918d]">Recent</li>
          )}
          {list.map((result, index) => (
            <li id={`${resultsId}-${index}`} key={result.key} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onClick={() => pick(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-baseline justify-between gap-4 border-b border-[#e4e5df] px-5 py-3.5 text-left last:border-b-0 ${
                  index === activeIndex ? 'bg-[#e9ede8]' : 'bg-transparent'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-lg">{result.primary}</span>
                  {result.secondary && (
                    <span className="block truncate text-[12px] text-[#6f7973]">{result.secondary}</span>
                  )}
                </span>
                <span className="flex-shrink-0 rounded-full border border-[#cad0cb] px-2.5 py-1 text-[11px] text-[#65716a]">
                  {result.typeLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && error && (
        <div
          role="status"
          className="absolute left-0 right-0 top-full z-30 mt-2 rounded-sm border border-[#c9cec8] bg-[#fbfaf6] px-5 py-4 text-[13px] text-[#8f2a21] shadow-[0_24px_70px_rgba(0,0,0,0.3)]"
        >
          {error}
        </div>
      )}

      {showEmpty && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-sm border border-[#c9cec8] bg-[#fbfaf6] px-5 py-4 text-[13px] text-[#6f7973] shadow-[0_24px_70px_rgba(0,0,0,0.3)]">
          No places found. Try a different spelling, or add a state or country.
        </div>
      )}
    </div>
  );
}
