import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mapConfig, printConfig } = body;

    // Stripe Checkout Session creation — implementation pending
    return NextResponse.json({
      message: 'Order API stub — Stripe integration pending',
      received: { mapConfig, printConfig },
    });
  } catch (error) {
    console.error('Order creation failed:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
