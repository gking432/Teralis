import { NextRequest, NextResponse } from 'next/server';

interface DemoOrderBody {
  scene?: {
    version?: number;
    place?: { slug?: string; name?: string };
    viewport?: { bbox?: unknown; center?: unknown };
    composition?: string;
  };
  printConfig?: {
    size?: string;
    dimensions?: string;
    frame?: string;
    mat?: boolean;
    orientation?: string;
    sku?: string;
    total?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as DemoOrderBody;
    const { scene, printConfig } = body;

    if (
      scene?.version !== 1 ||
      !scene.place?.slug ||
      !scene.place.name ||
      !Array.isArray(scene.viewport?.bbox) ||
      !Array.isArray(scene.viewport?.center) ||
      !scene.composition ||
      !printConfig?.size ||
      !printConfig.orientation ||
      !printConfig.sku ||
      typeof printConfig.total !== 'number'
    ) {
      return NextResponse.json({ error: 'The artwork or finish configuration is incomplete.' }, { status: 400 });
    }

    // Demo mode deliberately stops before payment or fulfillment. This payload
    // shape is the contract a future Stripe/Prodigi handoff can consume.
    const orderId = `TER-${Date.now().toString(36).toUpperCase()}`;
    return NextResponse.json({
      mode: 'demo',
      orderId,
      status: 'artwork-ready',
      summary: {
        place: scene.place.name,
        composition: scene.composition,
        sku: printConfig.sku,
        total: printConfig.total,
      },
    });
  } catch (error) {
    console.error('Order creation failed:', error);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
