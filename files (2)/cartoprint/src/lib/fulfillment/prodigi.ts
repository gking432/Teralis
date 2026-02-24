/**
 * Prodigi API Client
 *
 * Handles print order creation and status tracking with Prodigi.
 * Docs: https://www.prodigi.com/print-api/docs/
 *
 * Sandbox: https://api.sandbox.prodigi.com/v4.0
 * Production: https://api.prodigi.com/v4.0
 */

const PRODIGI_SANDBOX = 'https://api.sandbox.prodigi.com/v4.0';
const PRODIGI_PRODUCTION = 'https://api.prodigi.com/v4.0';

function getBaseUrl(): string {
  return process.env.PRODIGI_ENV === 'production' ? PRODIGI_PRODUCTION : PRODIGI_SANDBOX;
}

function getHeaders(): HeadersInit {
  return {
    'X-API-Key': process.env.PRODIGI_API_KEY || '',
    'Content-Type': 'application/json',
  };
}

// ─── Product SKUs ────────────────────────────────────────────────
// These need to be confirmed from Prodigi's product catalog.
// Run GET /v4.0/Products to see available products.
export const PRODUCT_SKUS = {
  // Fine art prints (giclée on premium paper)
  '12x16_matte': 'GLOBAL-FAP-12x16', // Placeholder — confirm with Prodigi
  '18x24_matte': 'GLOBAL-FAP-18x24',
  '24x36_matte': 'GLOBAL-FAP-24x36',
  '30x40_matte': 'GLOBAL-FAP-30x40',

  // Framed prints
  '12x16_black': 'GLOBAL-FRP-12x16-BK',
  '18x24_black': 'GLOBAL-FRP-18x24-BK',
  // ... etc
} as const;

// ─── Types ───────────────────────────────────────────────────────

interface ProdigiRecipient {
  name: string;
  address: {
    line1: string;
    line2?: string;
    postalOrZipCode: string;
    countryCode: string;
    townOrCity: string;
    stateOrCounty?: string;
  };
}

interface ProdigiOrderItem {
  sku: string;
  copies: number;
  sizing: 'fillPrintArea' | 'fitPrintArea';
  assets: Array<{
    printArea: 'default';
    url: string;
  }>;
}

interface ProdigiOrder {
  shippingMethod: 'Budget' | 'Standard' | 'Express';
  recipient: ProdigiRecipient;
  items: ProdigiOrderItem[];
  idempotencyKey?: string;
}

// ─── API Methods ─────────────────────────────────────────────────

/** Create a print order */
export async function createOrder(order: ProdigiOrder): Promise<any> {
  const resp = await fetch(`${getBaseUrl()}/Orders`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(order),
  });

  if (!resp.ok) {
    const error = await resp.text();
    throw new Error(`Prodigi order creation failed: ${resp.status} — ${error}`);
  }

  return resp.json();
}

/** Get order status */
export async function getOrder(orderId: string): Promise<any> {
  const resp = await fetch(`${getBaseUrl()}/Orders/${orderId}`, {
    headers: getHeaders(),
  });

  if (!resp.ok) {
    throw new Error(`Prodigi order fetch failed: ${resp.status}`);
  }

  return resp.json();
}

/** List available products (useful for confirming SKUs) */
export async function listProducts(): Promise<any> {
  const resp = await fetch(`${getBaseUrl()}/Products`, {
    headers: getHeaders(),
  });

  if (!resp.ok) {
    throw new Error(`Prodigi products fetch failed: ${resp.status}`);
  }

  return resp.json();
}
