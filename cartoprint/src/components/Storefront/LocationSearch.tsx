'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { inferKind } from '@/lib/catalog/placeFromQuery';
import { getAllCatalogPrints, type CatalogPrintKind } from '@/lib/catalog/prints';

interface NominatimResult {
  place_id: number;
  display_name: string;
  name: string;
  type?: string;
  class?: string;
  addresstype?: string;
  boundingbox: [string, string, string, string]; // south, north, west, east (strings)
  lat: string;
  lon: string;
}

interface DisplayResult {
  key: string;
  primary: string;       // "Madison"
  secondary: string;     // "Wisconsin, United States"
  kind: CatalogPrintKind;
  bbox: [number, number, number, number];
  displayName: string;
}

const SEARCH_DEBOUNCE_MS = 280;

function toDisplay(r: NominatimResult): DisplayResult {
  const kind = inferKind(r.addresstype, r.type);
  const parts = r.display_name.split(',').map((s) => s.trim()).filter(Boolean);
  const primary = r.name || parts[0] || r.display_name;
  const secondary = parts.length > 1 ? parts.slice(1).slice(-3).join(', ') : '';
  const bb = r.boundingbox.map(Number) as [number, number, number, number];
  return {
    key: `${r.place_id}`,
    primary,
    secondary,
    kind,
    bbox: bb,
    displayName: r.display_name,
  };
}

function catalogSlug(r: DisplayResult): string | null {
  if (r.kind !== 'state' && r.kind !== 'country') return null;
  const needle = r.primary.toLowerCase();
  const match = getAllCatalogPrints().find((p) => p.name.toLowerCase() === needle);
  return match?.slug ?? null;
}

function navigateUrl(r: DisplayResult): string {
  const slug = catalogSlug(r);
  if (slug) return `/customize?print=${slug}`;
  const params = new URLSearchParams({
    place: r.primary,
    kind: r.kind,
    bbox: r.bbox.join(','),
    display: r.displayName,
  });
  return `/customize?${params.toString()}`;
}

export function LocationSearch({ autoFocus = false, placeholder = 'Type a state, city, or town…' }: {
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DisplayResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) { setResults([]); setLoading(false); return; }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const t = window.setTimeout(() => {
      fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((data: NominatimResult[]) => {
          if (controller.signal.aborted) return;
          const mapped = (Array.isArray(data) ? data : []).map(toDisplay);
          setResults(mapped);
          setActiveIndex(0);
        })
        .catch((err) => { if (err?.name !== 'AbortError') console.warn('Search failed', err); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, SEARCH_DEBOUNCE_MS);

    return () => { window.clearTimeout(t); controller.abort(); };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  function pick(r: DisplayResult) {
    router.push(navigateUrl(r));
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[#aaa]"
          width="18" height="18" viewBox="0 0 18 18" fill="none"
        >
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
          <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="w-full border border-[#cfc1aa] bg-white py-5 pl-14 pr-5 text-lg outline-none transition-colors placeholder:text-[#aaa] focus:border-text"
        />
        {loading && (
          <div className="absolute right-5 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#ddd] border-t-[#555]" />
          </div>
        )}
      </div>

      {open && query.trim().length >= 2 && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[420px] overflow-y-auto border border-[#cfc1aa] bg-white shadow-[0_20px_60px_rgba(67,48,29,0.15)]"
        >
          {results.map((r, i) => (
            <li
              key={r.key}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-4 border-b border-[#ece2cf] px-5 py-3 last:border-b-0 ${
                i === activeIndex ? 'bg-[#f6efe1]' : 'bg-white'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-base">{r.primary}</div>
                {r.secondary && (
                  <div className="truncate text-[12px] text-[#888]">{r.secondary}</div>
                )}
              </div>
              <div className="flex-shrink-0 text-[10px] uppercase tracking-[1.4px] text-[#999]">
                {r.kind === 'country' ? 'Country' : r.kind === 'state' ? 'State' : 'City'}
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && query.trim().length >= 2 && !loading && results.length === 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 border border-[#cfc1aa] bg-white px-5 py-4 text-sm text-[#888] shadow-[0_20px_60px_rgba(67,48,29,0.15)]">
          No places found. Try a different spelling or a nearby city.
        </div>
      )}
    </div>
  );
}
