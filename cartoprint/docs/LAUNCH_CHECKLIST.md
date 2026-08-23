# Terralis launch checklist

The application stays in safe demo mode until every fulfillment dependency is present and `COMMERCE_MODE=live`.

## Required services

- Run `supabase/migrations/202608200001_commerce.sql` in a dedicated Supabase project.
- Configure Stripe Checkout and point `checkout.session.completed` and `checkout.session.expired` at `/api/webhook/stripe`.
- Configure a Prodigi sandbox account, validate every SKU/attribute combination with Product Details, then add the sandbox key.
- Deploy a protected print-render worker that accepts the versioned `PrintScene` payload and returns a public 300-DPI `artworkUrl`.
- Set `NEXT_PUBLIC_SITE_URL`, `PRODIGI_WEBHOOK_TOKEN`, and the Prodigi callback URL.
- Keep `COMMERCE_MODE=demo` until the complete sandbox order reaches Prodigi and its callback updates the Terralis order.

## Required commercial decisions

- Replace placeholder retail prices with a margin model based on Prodigi product, shipping, tax, Stripe, replacement, and support costs.
- Decide whether shipping is included or calculated separately.
- Publish shipping, returns, damaged-order, privacy, terms, and customer-support pages.
- Set up receipt, production, shipment, failure, and support emails.

## Required print QA

- Order one 12 × 16 and one 18 × 24 Wisconsin Doodle Atlas sample from the intended paper lab.
- Inspect script lettering, county/road hierarchy, fine doodle strokes, dark-area banding, crop, and frame/mat fit in daylight and room light.
- Compare the delivered piece against the stored 300-DPI asset before enabling live mode.
- Repeat the physical proof for every materially different product/SKU, not every colorway.

## Expansion sequence

1. Wisconsin Doodle Atlas: learn which labels, icons, themes, and finishes people choose.
2. Add state recipes backed by geography manifests rather than hard-coded UI.
3. Add country recipes with region-specific landmark packs.
4. Keep city products road-led and restrained; do not force state illustration controls into city maps.
5. Use `analytics_events` to promote repeated customer patterns into new ready-made products.
