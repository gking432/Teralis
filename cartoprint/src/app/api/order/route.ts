import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PRINT_SCENE_VERSION, type PrintScene } from '@/lib/print/scene';
import {
  FRAME_OPTIONS,
  SIZE_CATALOG,
  SIZE_LABELS,
  getFulfillmentVariant,
  getSizePrice,
  type FrameOption,
  type SizeLabel,
} from '@/lib/print/sizeCatalog';
import { isValidOrientation, type Orientation } from '@/lib/print/orientation';
import {
  commerceStorageConfigured,
  insertCommerceRow,
  updateCommerceRows,
  uploadOrderArtwork,
} from '@/lib/commerce/supabaseAdmin';

interface OrderBody {
  scene?: PrintScene;
  proof?: string | null;
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

function missingCommerceServices(): string[] {
  const missing: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) missing.push('Stripe');
  if (!commerceStorageConfigured()) missing.push('Supabase');
  if (!process.env.PRODIGI_API_KEY) missing.push('Prodigi');
  if (!process.env.PRINT_RENDER_SERVICE_URL) missing.push('print renderer');
  if (process.env.COMMERCE_MODE !== 'live') missing.push('COMMERCE_MODE=live');
  return missing;
}

async function renderProductionArtwork(
  scene: PrintScene,
  config: { size: SizeLabel; orientation: Orientation; dimensions: string },
): Promise<string> {
  const response = await fetch(process.env.PRINT_RENDER_SERVICE_URL!, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.PRINT_RENDER_SERVICE_TOKEN
        ? { authorization: `Bearer ${process.env.PRINT_RENDER_SERVICE_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({ scene, ...config, dpi: 300 }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`The production render service returned ${response.status}.`);
  const result = await response.json() as { artworkUrl?: string };
  if (!result.artworkUrl?.startsWith('https://')) throw new Error('The production renderer did not return an artwork URL.');
  return result.artworkUrl;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as OrderBody;
    const { scene, printConfig, proof } = body;
    const orientation = printConfig?.orientation;
    const size = printConfig?.size;
    const frame = printConfig?.frame;

    if (
      scene?.version !== PRINT_SCENE_VERSION ||
      !scene.place?.slug ||
      !scene.place.name ||
      !Array.isArray(scene.viewport?.bbox) ||
      !Array.isArray(scene.viewport?.center) ||
      !scene.layoutId ||
      !scene.paletteId ||
      !orientation || !isValidOrientation(orientation) ||
      !size || !SIZE_LABELS.includes(size as SizeLabel) ||
      !frame || !FRAME_OPTIONS.some((option) => option.value === frame) ||
      typeof printConfig?.mat !== 'boolean'
    ) {
      return NextResponse.json({ error: 'The artwork or finish configuration is incomplete.' }, { status: 400 });
    }

    const typedSize = size as SizeLabel;
    const typedFrame = frame as FrameOption;
    const typedOrientation = orientation as Orientation;
    const catalogOption = SIZE_CATALOG[typedOrientation][typedSize];
    const authoritativeTotal = getSizePrice(typedSize, typedFrame, printConfig.mat);
    const fulfillment = getFulfillmentVariant(typedSize, typedOrientation, typedFrame, printConfig.mat);
    if (
      printConfig.total !== authoritativeTotal ||
      printConfig.dimensions !== catalogOption.dimensionStr
    ) {
      return NextResponse.json({ error: 'The price or product configuration changed. Refresh and try again.' }, { status: 409 });
    }

    const orderId = randomUUID();
    const orderNumber = `TER-${Date.now().toString(36).toUpperCase()}`;
    const missing = missingCommerceServices();
    if (missing.length > 0) {
      return NextResponse.json({
        mode: 'demo',
        orderId: orderNumber,
        status: 'artwork-ready',
        missingServices: missing,
        summary: {
          place: scene.place.name,
          layout: scene.layoutId,
          palette: scene.paletteId,
          illustration: scene.illustration?.theme,
          orientation: typedOrientation,
          sku: fulfillment.sku,
          total: authoritativeTotal,
        },
      });
    }

    if (!proof) {
      return NextResponse.json({ error: 'The exact print proof is still being prepared.' }, { status: 400 });
    }

    const previewUrl = await uploadOrderArtwork(orderId, proof);
    const artworkUrl = await renderProductionArtwork(scene, {
      size: typedSize,
      orientation: typedOrientation,
      dimensions: catalogOption.dimensionStr,
    });
    await insertCommerceRow('orders', {
      id: orderId,
      order_number: orderNumber,
      status: 'checkout_pending',
      amount_cents: authoritativeTotal,
      currency: 'usd',
      preview_url: previewUrl,
      artwork_url: artworkUrl,
      artwork_status: 'ready',
      design_scene: scene,
      print_config: {
        size: typedSize,
        dimensions: catalogOption.dimensionStr,
        frame: typedFrame,
        mat: printConfig.mat,
        orientation: typedOrientation,
        sku: fulfillment.sku,
        attributes: fulfillment.attributes,
      },
    });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: orderId,
      customer_creation: 'always',
      billing_address_collection: 'auto',
      shipping_address_collection: { allowed_countries: ['US', 'CA'] },
      phone_number_collection: { enabled: true },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: authoritativeTotal,
          product_data: {
            name: `${scene.place.name} custom map print`,
            description: `${catalogOption.dimensionStr} · ${typedFrame === 'none' ? 'unframed' : `${typedFrame} frame`}${printConfig.mat ? ' · snow white mat' : ''}`,
            metadata: { orderId, place: scene.place.slug },
          },
        },
      }],
      metadata: { orderId, orderNumber },
      success_url: `${request.nextUrl.origin}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.nextUrl.origin}/size?print=${encodeURIComponent(scene.place.slug)}&o=${typedOrientation}`,
    }, { idempotencyKey: orderId });

    await updateCommerceRows('orders', `id=eq.${orderId}`, { stripe_session_id: session.id });
    return NextResponse.json({ mode: 'live', orderId: orderNumber, status: 'checkout_pending', checkoutUrl: session.url });
  } catch (error) {
    console.error('Order creation failed:', error);
    return NextResponse.json({ error: 'Unable to begin checkout. Please try again.' }, { status: 500 });
  }
}
