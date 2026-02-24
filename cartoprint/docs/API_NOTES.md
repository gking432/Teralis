# API Implementation Notes

## OpenFreeMap

**No setup required.** Tiles are free and open, no API key needed.

- Style JSON: `https://tiles.openfreemap.org/styles/liberty`
- Vector tiles: `https://tiles.openfreemap.org/planet`
- Font glyphs: `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`
- Sprites: `https://tiles.openfreemap.org/sprites/ofm_f384/ofm`

The liberty style uses **Noto Sans** for all map labels. The tile schema follows **OpenMapTiles** conventions — source layers include: `boundary`, `transportation`, `water`, `waterway`, `place`, `landcover`, `landuse`, `park`, `aeroway`, `building`, `poi`.

If reliability becomes an issue, consider:
- **MapTiler** — Free tier of 100k tile loads/month. Requires API key.
- **Self-hosted** — OpenFreeMap provides Btrfs images for self-hosting.

---

## AWS Terrain Tiles

**No setup required.** Free via AWS Open Data.

- URL: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- Encoding: `terrarium` (elevation encoded in RGB channels)
- Max zoom: 15
- Used as MapLibre `raster-dem` source for the `hillshade` layer type

---

## Nominatim (OSM Geocoding)

**No API key required, but must follow usage policy.**

### Usage Policy
- Max 1 request per second
- Must set a custom `User-Agent` header
- Must not bulk geocode
- See: https://operations.osmfoundation.org/policies/nominatim/

### Key Parameters
- `polygon_geojson=1` — Returns the actual boundary polygon (CRITICAL for isolation feature)
- `zoom` parameter on reverse geocoding controls admin level:
  - zoom 3-5: country level
  - zoom 5-8: state level
  - zoom 8-10: county level
  - zoom 10-14: city/town level
  - zoom 14+: neighborhood/street level

### Production Alternatives
If we outgrow Nominatim's free tier:
- **LocationIQ** — $0.50/1000 requests, Nominatim-compatible API
- **Mapbox Geocoding** — More expensive but very reliable
- **Self-hosted Nominatim** — Requires ~1TB disk for full planet import

---

## Stripe

### Setup
1. Create account at https://dashboard.stripe.com
2. Get test keys from Dashboard → Developers → API keys
3. Set up webhook endpoint pointing to `/api/webhook/stripe`
4. Subscribe to `checkout.session.completed` event

### Checkout Flow
```
Frontend → POST /api/order { mapConfig, printConfig }
           ↓
API Route → stripe.checkout.sessions.create()
           ↓
Frontend ← { sessionId, url }
           ↓
Redirect → Stripe Checkout Page
           ↓
Payment Success → Stripe fires webhook
           ↓
POST /api/webhook/stripe → Verify signature → Trigger export + Prodigi order
```

### Testing
Use Stripe CLI to forward webhooks locally:
```bash
stripe listen --forward-to localhost:3000/api/webhook/stripe
```

Test card numbers:
- Success: 4242 4242 4242 4242
- Decline: 4000 0000 0000 0002

---

## Prodigi

### Setup
1. Create account at https://dashboard.prodigi.com
2. Get sandbox API key
3. Explore products via `GET /v4.0/Products`
4. Confirm SKUs for fine art prints in desired sizes

### Order Flow
```
Stripe Webhook (payment confirmed)
  ↓
POST /api/export { mapConfig, size } → High-res PNG
  ↓
Upload PNG to cloud storage → Get URL
  ↓
POST /v4.0/Orders {
  shippingMethod: "Standard",
  recipient: { name, address },
  items: [{
    sku: "GLOBAL-FAP-24x36",
    copies: 1,
    sizing: "fillPrintArea",
    assets: [{ printArea: "default", url: imageUrl }]
  }]
}
  ↓
Prodigi prints + ships → Webhooks update status
```

### Important Notes
- Image must be publicly accessible URL (or use Prodigi's upload endpoint)
- Image should be 300 DPI at the print size
- Prodigi supports JPEG, PNG, TIFF, PDF
- Sandbox orders are free but not actually printed
- Allow 3-7 business days for production + shipping

### Product Research Needed
- Confirm exact SKUs for fine art prints (giclée)
- Confirm framing SKUs and options
- Check if lustre/matte is a separate product or an option
- Get shipping cost estimates for different regions

---

## Supabase (Future)

### Setup
1. Create project at https://supabase.com
2. Run migration for tables (see PROJECT_SCOPE.md)
3. Set environment variables

Not needed for initial MVP — can launch with Stripe only (no saved maps or order history).
