import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createOrder as createProdigiOrder } from '@/lib/fulfillment/prodigi';
import {
  commerceStorageConfigured,
  insertCommerceRow,
  selectCommerceRows,
  updateCommerceRows,
} from '@/lib/commerce/supabaseAdmin';

interface StoredOrder {
  id: string;
  order_number: string;
  artwork_url: string;
  status: string;
  print_config: {
    sku: string;
    attributes?: Record<string, string>;
    frame: string;
    mat: boolean;
  };
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const signature = request.headers.get('stripe-signature');
  if (!webhookSecret || !stripeKey || !signature || !commerceStorageConfigured()) {
    return NextResponse.json({ error: 'Commerce webhooks are not configured.' }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (error) {
    console.error('Stripe signature verification failed:', error);
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await fulfillCheckout(event.data.object, event.id);
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      const orderId = session.metadata?.orderId ?? session.client_reference_id;
      if (orderId) await updateCommerceRows('orders', `id=eq.${orderId}`, { status: 'checkout_expired', updated_at: new Date().toISOString() });
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing failed:', error);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}

async function fulfillCheckout(session: Stripe.Checkout.Session, eventId: string): Promise<void> {
  const orderId = session.metadata?.orderId ?? session.client_reference_id;
  if (!orderId) throw new Error('Stripe checkout did not include an order id.');

  const address = session.shipping_details?.address ?? session.customer_details?.address;
  const recipientName = session.shipping_details?.name ?? session.customer_details?.name;
  const email = session.customer_details?.email ?? session.customer_email;
  const paymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;

  await updateCommerceRows('orders', `id=eq.${orderId}`, {
    status: 'paid',
    stripe_payment_intent_id: paymentIntent ?? null,
    customer_email: email ?? null,
    shipping_address: address ?? null,
    updated_at: new Date().toISOString(),
  });

  await insertCommerceRow('fulfillment_events', {
    order_id: orderId,
    provider: 'stripe',
    event_type: 'checkout.session.completed',
    provider_event_id: eventId,
    payload: { sessionId: session.id, paymentStatus: session.payment_status },
  }).catch(() => undefined);

  if (!process.env.PRODIGI_API_KEY || !address || !recipientName || !address.line1 || !address.postal_code || !address.city || !address.country) {
    await updateCommerceRows('orders', `id=eq.${orderId}`, {
      status: 'paid_needs_fulfillment',
      error_message: 'Paid order requires a complete address or Prodigi credentials.',
    });
    return;
  }

  const [order] = await selectCommerceRows<StoredOrder>('orders', `select=id,order_number,artwork_url,status,print_config&id=eq.${orderId}&limit=1`);
  if (!order) throw new Error(`Order ${orderId} was not found.`);

  const result = await createProdigiOrder({
    shippingMethod: 'Standard',
    idempotencyKey: order.id,
    merchantReference: order.order_number,
    ...(process.env.NEXT_PUBLIC_SITE_URL && process.env.PRODIGI_WEBHOOK_TOKEN
      ? { callbackUrl: `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api/webhook/prodigi?token=${encodeURIComponent(process.env.PRODIGI_WEBHOOK_TOKEN)}` }
      : {}),
    recipient: {
      name: recipientName,
      address: {
        line1: address.line1,
        ...(address.line2 ? { line2: address.line2 } : {}),
        postalOrZipCode: address.postal_code,
        countryCode: address.country,
        townOrCity: address.city,
        ...(address.state ? { stateOrCounty: address.state } : {}),
      },
    },
    items: [{
      sku: order.print_config.sku,
      attributes: order.print_config.attributes,
      copies: 1,
      sizing: 'fitPrintArea',
      assets: [{ printArea: 'default', url: order.artwork_url }],
    }],
  });

  const prodigiOrderId = typeof result?.id === 'string' ? result.id : null;
  await updateCommerceRows('orders', `id=eq.${orderId}`, {
    status: 'submitted_to_fulfillment',
    fulfillment_status: result?.status?.stage ?? 'submitted',
    prodigi_order_id: prodigiOrderId,
    error_message: null,
    updated_at: new Date().toISOString(),
  });
  await insertCommerceRow('fulfillment_events', {
    order_id: orderId,
    provider: 'prodigi',
    event_type: 'order.created',
    provider_event_id: prodigiOrderId,
    payload: result,
  });
}
