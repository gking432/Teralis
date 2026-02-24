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

export const PRODUCT_SKUS = {
  '12x16_matte': 'GLOBAL-FAP-12x16',
  '18x24_matte': 'GLOBAL-FAP-18x24',
  '24x36_matte': 'GLOBAL-FAP-24x36',
  '30x40_matte': 'GLOBAL-FAP-30x40',
  '12x16_black': 'GLOBAL-FRP-12x16-BK',
  '18x24_black': 'GLOBAL-FRP-18x24-BK',
} as const;

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
  assets: Array<{ printArea: 'default'; url: string }>;
}

interface ProdigiOrder {
  shippingMethod: 'Budget' | 'Standard' | 'Express';
  recipient: ProdigiRecipient;
  items: ProdigiOrderItem[];
  idempotencyKey?: string;
}

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

export async function getOrder(orderId: string): Promise<any> {
  const resp = await fetch(`${getBaseUrl()}/Orders/${orderId}`, {
    headers: getHeaders(),
  });
  if (!resp.ok) throw new Error(`Prodigi order fetch failed: ${resp.status}`);
  return resp.json();
}

export async function listProducts(): Promise<any> {
  const resp = await fetch(`${getBaseUrl()}/Products`, {
    headers: getHeaders(),
  });
  if (!resp.ok) throw new Error(`Prodigi products fetch failed: ${resp.status}`);
  return resp.json();
}
