import { NextRequest, NextResponse } from 'next/server';
import { commerceStorageConfigured, insertCommerceRow } from '@/lib/commerce/supabaseAdmin';

const EVENT_NAME = /^[a-z][a-z0-9_]{1,63}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      name?: string;
      at?: string;
      path?: string;
      sessionId?: string;
      properties?: Record<string, unknown>;
    };
    if (!body.name || !EVENT_NAME.test(body.name) || !body.sessionId || body.sessionId.length > 100) {
      return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
    }

    if (commerceStorageConfigured()) {
      await insertCommerceRow('analytics_events', {
        session_id: body.sessionId,
        event_name: body.name,
        path: body.path?.slice(0, 500) ?? null,
        properties: body.properties ?? {},
        occurred_at: body.at && !Number.isNaN(Date.parse(body.at)) ? body.at : new Date().toISOString(),
      });
    }
    return new NextResponse(null, { status: 202 });
  } catch {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 });
  }
}
