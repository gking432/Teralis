const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function commerceStorageConfigured(): boolean {
  return Boolean(supabaseUrl() && serviceKey());
}

function adminHeaders(extra: HeadersInit = {}): HeadersInit {
  return {
    apikey: serviceKey(),
    authorization: `Bearer ${serviceKey()}`,
    'content-type': 'application/json',
    ...extra,
  };
}

export async function insertCommerceRow<T extends Record<string, unknown>>(
  table: string,
  row: T,
): Promise<T> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}`, {
    method: 'POST',
    headers: adminHeaders({ prefer: 'return=representation' }),
    body: JSON.stringify(row),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not save ${table}: ${response.status} ${await response.text()}`);
  const rows = await response.json() as T[];
  return rows[0];
}

export async function updateCommerceRows(
  table: string,
  query: string,
  values: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: adminHeaders({ prefer: 'return=minimal' }),
    body: JSON.stringify(values),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not update ${table}: ${response.status} ${await response.text()}`);
}

export async function selectCommerceRows<T>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/${table}?${query}`, {
    headers: adminHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not read ${table}: ${response.status} ${await response.text()}`);
  return response.json() as Promise<T[]>;
}

export async function uploadOrderArtwork(orderId: string, dataUrl: string): Promise<string> {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg));base64,(.+)$/);
  if (!match) throw new Error('The print proof is not a supported image.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 4_000_000) throw new Error('The print proof is too large to upload.');
  const extension = match[1] === 'image/jpeg' ? 'jpg' : 'png';
  const objectName = `${orderId}/proof.${extension}`;
  const response = await fetch(`${supabaseUrl()}/storage/v1/object/artwork/${objectName}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey(),
      authorization: `Bearer ${serviceKey()}`,
      'content-type': match[1],
      'x-upsert': 'true',
    },
    body: bytes,
  });
  if (!response.ok) throw new Error(`Could not upload the print proof: ${response.status} ${await response.text()}`);
  return `${supabaseUrl()}/storage/v1/object/public/artwork/${objectName}`;
}
