/**
 * Order API Route
 *
 * Creates a Stripe Checkout Session for the print order.
 * After successful payment, the Stripe webhook triggers the Prodigi order.
 *
 * POST /api/order
 * Body: { mapConfig, printConfig }
 */

import { NextRequest, NextResponse } from 'next/server';
// import Stripe from 'stripe';
// import { calculatePrice } from '@/lib/pricing';

// TODO: Initialize Stripe
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' });

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mapConfig, printConfig } = body;

    // TODO: Validate input
    // TODO: Calculate price server-side (never trust client price)
    // TODO: Create Stripe Checkout Session
    // TODO: Store pending order in database

    /*
    const price = calculatePrice(printConfig.size, printConfig.paper, printConfig.frame);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `CartoPrint — ${printConfig.size}" ${printConfig.paper} ${printConfig.frame !== 'none' ? `(${printConfig.frame} frame)` : '(unframed)'}`,
            description: `Custom map print: ${mapConfig.selection?.name || 'Custom view'}`,
          },
          unit_amount: price.total * 100, // Stripe uses cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.NEXTAUTH_URL}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}`,
      metadata: {
        mapConfig: JSON.stringify(mapConfig),
        printConfig: JSON.stringify(printConfig),
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
    */

    return NextResponse.json({
      message: 'Order API stub — Stripe integration pending',
      received: { mapConfig, printConfig },
    });
  } catch (error) {
    console.error('Order creation failed:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
