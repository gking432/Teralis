'use client';

export type DemoEventName =
  | 'home_viewed'
  | 'search_result_selected'
  | 'product_viewed'
  | 'product_palette_selected'
  | 'product_customize_started'
  | 'finish_viewed'
  | 'finish_step_viewed'
  | 'finish_size_selected'
  | 'finish_frame_selected'
  | 'finish_mat_selected'
  | 'finish_scene_selected'
  | 'finish_reviewed'
  | 'demo_order_created'
  | 'demo_order_failed'
  | 'checkout_started'
  | 'personal_element_added'
  | 'region_theme_selected'
  | 'region_detail_changed'
  | 'design_landing_viewed'
  | 'design_landing_shortcut'
  // The bounce signal that matters most: an edit session the customer
  // abandoned back to the design they arrived with.
  | 'design_reset';

interface DemoEvent {
  name: DemoEventName;
  at: string;
  path: string;
  sessionId: string;
  properties: Record<string, string | number | boolean | null | undefined>;
}

const SESSION_KEY = 'terralis:analytics-session';
const EVENTS_KEY = 'terralis:analytics-events';

function analyticsSessionId(): string {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (stored) return stored;
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

/**
 * Keeps the demo measurable without introducing an analytics dependency.
 * If PostHog is added later, the same events are forwarded automatically.
 */
export function trackDemoEvent(
  name: DemoEventName,
  properties: DemoEvent['properties'] = {},
): void {
  if (typeof window === 'undefined') return;

  try {
    const event: DemoEvent = {
      name,
      properties: {
        ...properties,
        utmSource: new URLSearchParams(window.location.search).get('utm_source'),
        utmMedium: new URLSearchParams(window.location.search).get('utm_medium'),
        utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        utmContent: new URLSearchParams(window.location.search).get('utm_content'),
      },
      at: new Date().toISOString(),
      path: window.location.pathname + window.location.search,
      sessionId: analyticsSessionId(),
    };
    const existing = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]') as DemoEvent[];
    localStorage.setItem(EVENTS_KEY, JSON.stringify([...existing.slice(-99), event]));
    window.dispatchEvent(new CustomEvent('terralis:analytics', { detail: event }));

    fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => undefined);

    const posthog = (window as Window & {
      posthog?: { capture?: (eventName: string, eventProperties?: DemoEvent['properties']) => void };
    }).posthog;
    posthog?.capture?.(name, properties);
  } catch {
    // Analytics must never interrupt the print-design flow.
  }
}
