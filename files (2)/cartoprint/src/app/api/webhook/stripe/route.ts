/**
 * Stripe Webhook Handler
 *
 * Handles payment events from Stripe.
 * On successful payment, triggers the print order creation via Prodigi.
 *
 * POST /api/webhook/stripe
 */

import { NextRequest, NextResponse } from 'next/server';
// import Stripe from 'stripe';

// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' });
// const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    // const sig = request.headers.get('stripe-signature')!;

    // TODO: Verify webhook signature
    // const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    // TODO: Handle events
    /*
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const mapConfig = JSON.parse(session.metadata!.mapConfig);
        const printConfig = JSON.parse(session.metadata!.printConfig);

        // 1. Generate high-res export
        // const exportResp = await fetch(`${process.env.NEXTAUTH_URL}/api/export`, {
        //   method: 'POST',
        //   body: JSON.stringify({ mapConfig, size: printConfig.size }),
        // });
        // const { imageUrl } = await exportResp.json();

        // 2. Create Prodigi order
        // await createProdigiOrder(imageUrl, printConfig, session);

        // 3. Update order status in database
        break;
      }
    }
    */

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 400 });
  }
}
