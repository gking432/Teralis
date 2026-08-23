import { NextRequest, NextResponse } from 'next/server';
import {
  commerceStorageConfigured,
  insertCommerceRow,
  updateCommerceRows,
} from '@/lib/commerce/supabaseAdmin';

interface ProdigiCloudEvent {
  specversion?: string;
  id?: string;
  type?: string;
  subject?: string;
  data?: {
    order?: {
      id?: string;
      status?: { stage?: string; issues?: unknown[] };
      shipments?: unknown[];
    };
  };
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.PRODIGI_WEBHOOK_TOKEN;
  const suppliedToken = request.nextUrl.searchParams.get('token');
  if (!expectedToken || suppliedToken !== expectedToken || !commerceStorageConfigured()) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const event = await request.json() as ProdigiCloudEvent;
    const prodigiOrderId = event.subject ?? event.data?.order?.id;
    if (event.specversion !== '1.0' || !event.id?.startsWith('evt_') || !event.type?.startsWith('com.prodigi.') || !prodigiOrderId?.startsWith('ord_')) {
      return NextResponse.json({ error: 'Invalid callback.' }, { status: 400 });
    }

    const stage = event.data?.order?.status?.stage ?? event.type.split('#')[1] ?? 'unknown';
    await updateCommerceRows('orders', `prodigi_order_id=eq.${prodigiOrderId}`, {
      fulfillment_status: stage,
      status: stage.toLowerCase() === 'complete' ? 'fulfilled' : 'in_fulfillment',
      updated_at: new Date().toISOString(),
    });
    await insertCommerceRow('fulfillment_events', {
      provider: 'prodigi',
      event_type: event.type,
      provider_event_id: event.id,
      payload: event,
    }).catch(() => undefined);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Prodigi webhook processing failed:', error);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 400 });
  }
}
