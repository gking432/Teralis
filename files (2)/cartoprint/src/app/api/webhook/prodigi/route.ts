/**
 * Prodigi Webhook Handler
 *
 * Handles order status updates from Prodigi.
 * Updates our database with shipping/tracking info.
 *
 * POST /api/webhook/prodigi
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // TODO: Verify Prodigi webhook authenticity
    // TODO: Handle order status events:
    // - Order.Created
    // - Order.InProgress (printing)
    // - Order.Shipped (has tracking info)
    // - Order.Complete
    // - Order.Cancelled

    console.log('Prodigi webhook received:', body);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Prodigi webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 400 });
  }
}
