import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Prodigi webhook received:', body);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Prodigi webhook error:', error);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 400 });
  }
}
