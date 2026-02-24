# Terralis — Project Scope & Technical Specification

## Overview

Terralis is a premium custom map print shop. Users interactively design a minimalist, greyscale map by toggling geographic features (borders, cities, roads, water, terrain, etc.), selecting a region, and ordering a high-quality physical print. The product targets customers who want beautiful, personalized cartographic art for their walls.

**Price range:** $59–$300+ depending on size, paper, and framing.
**Aesthetic:** Minimalist, greyscale (black/white/grey). Premium, gallery-quality feel.
**MVP geography:** United States. Long-term: global.

---

## Current State (Prototype)

The working prototype is in `/reference/prototype.html`. It is a single-file HTML/JS app that demonstrates:

- ✅ MapLibre GL JS with OpenFreeMap vector tiles (free, no API key)
- ✅ Greyscale conversion applied programmatically to the liberty base style
- ✅ Layer toggles: country borders, state lines, place labels, roads, water, terrain/hillshade, parks/land cover
- ✅ Terrain hillshade via AWS free elevation tiles (`raster-dem` source)
- ✅ Click-to-select regions via Nominatim reverse geocoding (returns polygon boundaries)
- ✅ Isolation/whitespace masking (inverted polygon mask to show only selected region)
- ✅ Search via Nominatim geocoding with auto-selection
- ✅ Quick-start templates (Classic, Topographic, Waterways, Highway Network)
- ✅ Print order modal with size, paper, framing options and live pricing
- ✅ Bolder state/country borders visible at all zoom levels
- ✅ Premium UI with Cormorant Garamond + DM Sans typography

### What's NOT yet built:
- Print fulfillment API integration (Printify/Prodigi)
- High-resolution export pipeline (300 DPI for print)
- User accounts, cart, checkout (Stripe)
- Granular layer controls (separate highways vs local roads, capitals vs cities vs towns)
- County-level boundaries and drill-down
- Territory clipping for coastline-accurate land shapes
- Pre-built state templates with curated defaults
- Mobile responsive design
- SEO, analytics, marketing pages

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 14+ (App Router)** | React, server components, API routes |
| Language | **TypeScript** | Strict mode |
| Map Engine | **MapLibre GL JS 4.x** | Open-source, vector tiles |
| Tile Source | **OpenFreeMap** | Free, no API key, OpenMapTiles schema |
| Terrain | **AWS Terrain Tiles** | Free elevation tiles for hillshade |
| Geocoding | **Nominatim** (OSM) | Free, rate-limited (1 req/sec) |
| Styling | **Tailwind CSS 3.x** | Utility-first, custom theme |
| State Mgmt | **Zustand** | Lightweight, no boilerplate |
| Payments | **Stripe** | Checkout Sessions API |
| Print Fulfillment | **Prodigi API** (preferred) or Printify | Print-on-demand, fine art prints |
| Auth | **NextAuth.js** or **Clerk** | Optional for MVP, needed for order history |
| Database | **Supabase** or **PlanetScale** | Orders, saved maps, user accounts |
| Hosting | **Vercel** | Native Next.js hosting |
| High-res Export | **Puppeteer** or **MapLibre Native** | Server-side map rendering at 300 DPI |
| Analytics | **PostHog** or **Plausible** | Privacy-friendly |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND                       │
│  Next.js App (React + MapLibre GL JS)           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │ Map View │ │ Controls │ │ Print Config     ││
│  │ (WebGL)  │ │ (Panel)  │ │ (Modal/Page)     ││
│  └──────────┘ └──────────┘ └──────────────────┘│
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│                 API ROUTES                       │
│  /api/geocode    - Proxy Nominatim (rate limit) │
│  /api/export     - High-res map image export    │
│  /api/order      - Create print order           │
│  /api/webhook    - Stripe + Prodigi webhooks    │
│  /api/templates  - Pre-built map configurations │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              EXTERNAL SERVICES                   │
│  OpenFreeMap (tiles) │ AWS (terrain)            │
│  Nominatim (geocode) │ Stripe (payments)        │
│  Prodigi (printing)  │ Supabase (data)          │
└─────────────────────────────────────────────────┘
```

---

## Map Feature Layers (Toggle Groups)

Each toggle controls visibility of one or more MapLibre style layers. The liberty base style has ~100+ layers that we classify into these groups:

### Boundaries
| Toggle | Description | Zoom Visibility | Layer ID Patterns |
|--------|-------------|-----------------|-------------------|
| Country Borders | National boundaries | 0–24 (always) | `admin.*country`, `admin.*2` |
| State Lines | State/province boundaries | 2–24 | `admin.*(state\|3\|4)` |
| County Lines | County/district boundaries | 6–24 | `admin.*(5\|6\|7\|8)` |

### Places
| Toggle | Description | Zoom Visibility | Layer ID Patterns |
|--------|-------------|-----------------|-------------------|
| State Capitals | Capital city labels with marker | 3–24 | `place.*capital` |
| Major Cities | Large city labels | 3–24 | `place.*city` |
| Towns & Villages | Smaller place labels | 8–24 | `place.*(town\|village\|hamlet)` |
| State Labels | State name text | 3–9 | `place.*(state\|province)` |
| Country Labels | Country name text | 0–8 | `place.*(country\|continent)` |

### Transportation
| Toggle | Description | Zoom Visibility | Layer ID Patterns |
|--------|-------------|-----------------|-------------------|
| Highways / Interstates | Motorways and trunk roads | 3–24 | `*motorway*`, `*trunk*` |
| Major Roads | Primary and secondary roads | 6–24 | `*primary*`, `*secondary*` |
| All Roads & Streets | Minor, tertiary, service roads | 10–24 | `*minor*`, `*tertiary*`, `*service*` |

### Natural Features
| Toggle | Description | Zoom Visibility | Layer ID Patterns |
|--------|-------------|-----------------|-------------------|
| Water (Lakes, Rivers, Ocean) | All water bodies and waterways | 0–24 | `water*`, `waterway*` |
| Terrain / Hillshade | Elevation shading (mountains) | 0–24 | Custom `hillshade-layer` |
| Parks & Forests | National parks, forests, land cover | 4–24 | `park*`, `landcover*`, `landuse*` |

### Selection & Isolation
| Toggle | Description | Notes |
|--------|-------------|-------|
| Isolate Selection | Mask everything outside selected region with white | Requires a selected region |

---

## User Flows

### Flow 1: Browse → Customize → Print
1. User lands on homepage, sees US map with default "Classic" preset
2. User toggles features on/off using the left panel
3. User zooms/pans to area of interest
4. User clicks "Order Print" → print config modal
5. User selects size, paper, framing → sees live price
6. User clicks "Add to Cart" → Stripe checkout
7. Order sent to Prodigi API → print + ship

### Flow 2: Search → Select → Isolate → Print
1. User searches "Dane County, Wisconsin"
2. Map zooms to Dane County, auto-selects it (dashed outline appears)
3. User clicks "Isolate" → everything outside Dane County turns white
4. User enables rivers/lakes, disables roads
5. User clicks "Order Print" → sees their isolated Dane County map
6. Proceeds to checkout

### Flow 3: Template → Modify → Print
1. User clicks "United States — Topographic" template
2. Map resets to US view with terrain, water, cities, state lines
3. User disables cities, enables highways
4. User clicks a state → selects it → isolates it
5. Proceeds to print

---

## API Integrations

### 1. OpenFreeMap (Map Tiles)
- **Status:** ✅ Working in prototype
- **URL:** `https://tiles.openfreemap.org/styles/liberty` (style JSON)
- **Tiles:** `https://tiles.openfreemap.org/planet` (vector tiles)
- **Fonts:** `https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf`
- **Sprites:** `https://tiles.openfreemap.org/sprites/ofm_f384/ofm`
- **Cost:** Free (consider sponsoring on GitHub)
- **Rate limits:** None documented, be reasonable
- **API key:** Not required
- **Notes:** Uses OpenMapTiles schema. Liberty style is the base we modify to greyscale.

### 2. AWS Terrain Tiles (Hillshade)
- **Status:** ✅ Working in prototype
- **URL:** `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- **Encoding:** Terrarium
- **Cost:** Free (AWS Open Data)
- **Max zoom:** 15
- **Notes:** Used as `raster-dem` source for MapLibre's native hillshade layer.

### 3. Nominatim (Geocoding & Reverse Geocoding)
- **Status:** ✅ Working in prototype
- **Search:** `https://nominatim.openstreetmap.org/search?q={query}&format=json&polygon_geojson=1`
- **Reverse:** `https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=json&zoom={z}&polygon_geojson=1`
- **Cost:** Free
- **Rate limit:** 1 request per second (MUST proxy through our API route with rate limiting)
- **API key:** Not required, but set a custom User-Agent header
- **Notes:** The `polygon_geojson=1` parameter returns the actual boundary polygon, which we use for isolation masking. The `zoom` parameter on reverse geocoding controls the admin level returned (higher zoom = more specific region). For production, consider self-hosting Nominatim or using a paid service like Mapbox Geocoding or LocationIQ.

### 4. Stripe (Payments)
- **Status:** 🔲 Not yet integrated
- **Docs:** https://stripe.com/docs/api
- **Integration:** Stripe Checkout Sessions
- **Flow:**
  1. Frontend sends map config + selected options to `/api/order`
  2. API route creates a Stripe Checkout Session with line items
  3. User redirected to Stripe-hosted checkout page
  4. On success, webhook fires to `/api/webhook/stripe`
  5. We create the print order via Prodigi
- **Environment variables:**
  ```
  STRIPE_SECRET_KEY=sk_live_...
  STRIPE_PUBLISHABLE_KEY=pk_live_...
  STRIPE_WEBHOOK_SECRET=whsec_...
  ```
- **Pricing structure:**
  | Size | Base Price | Lustre Add | Black Frame | White Frame | Oak Frame |
  |------|-----------|------------|-------------|-------------|-----------|
  | 12×16" | $59 | +$15 | +$89 | +$89 | +$139 |
  | 18×24" | $89 | +$15 | +$89 | +$89 | +$139 |
  | 24×36" | $129 | +$15 | +$119 | +$119 | +$179 |
  | 30×40" | $169 | +$15 | +$149 | +$149 | +$219 |

### 5. Prodigi (Print Fulfillment)
- **Status:** 🔲 Not yet integrated
- **Docs:** https://www.prodigi.com/print-api/docs/
- **Sandbox:** https://api.sandbox.prodigi.com/v4.0
- **Production:** https://api.prodigi.com/v4.0
- **Flow:**
  1. Receive confirmed Stripe payment webhook
  2. Generate high-res map image (see Export Pipeline below)
  3. Upload image to Prodigi or host on our CDN
  4. POST to `/v4.0/Orders` with product SKU, image URL, shipping address
  5. Prodigi prints and ships directly to customer
  6. Track order status via webhooks or polling
- **Key endpoints:**
  - `POST /v4.0/Orders` — Create order
  - `GET /v4.0/Orders/{id}` — Get order status
  - `GET /v4.0/Products` — List available products
- **Products of interest:**
  - Fine art prints (giclée on Hahnemühle or similar)
  - Framed prints
  - Canvas wraps (stretch goal)
- **Environment variables:**
  ```
  PRODIGI_API_KEY=your_api_key
  PRODIGI_SANDBOX_KEY=your_sandbox_key
  ```
- **Alternative:** Printify (https://developers.printify.com/) — more consumer-focused, slightly less premium feel. Gooten (https://www.gooten.com/api) is another option.

### 6. Supabase (Database)
- **Status:** 🔲 Not yet integrated
- **Purpose:** Store orders, saved map configurations, user accounts
- **Tables:**
  ```sql
  -- Users (managed by auth provider, stored here for reference)
  users (id, email, name, created_at)

  -- Saved map configurations
  saved_maps (
    id, user_id, name,
    center_lat, center_lng, zoom,
    layers_config JSONB,  -- { countries: true, states: true, ... }
    selection_geojson JSONB,
    is_isolated BOOLEAN,
    created_at, updated_at
  )

  -- Orders
  orders (
    id, user_id, saved_map_id,
    stripe_session_id, stripe_payment_intent,
    prodigi_order_id,
    status,  -- pending, paid, submitted, printing, shipped, delivered
    size, paper, frame,
    price_cents,
    shipping_address JSONB,
    image_url,  -- high-res export URL
    created_at, updated_at
  )
  ```
- **Environment variables:**
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJ...
  ```

### 7. NextAuth.js or Clerk (Authentication)
- **Status:** 🔲 Not yet integrated
- **Purpose:** User accounts for order history and saved maps
- **Providers:** Email/password, Google, Apple
- **Notes:** Not required for MVP checkout (can do guest checkout via Stripe), but needed for saved maps and order history.

---

## High-Resolution Export Pipeline

This is the most technically complex piece. The map must be rendered at 300 DPI for print quality.

### Approach: Server-side rendering with Puppeteer

1. Frontend sends map state to `/api/export`:
   ```json
   {
     "center": [-89.4, 43.07],
     "zoom": 10,
     "layers": { "countries": true, "states": true, ... },
     "selection": { "geojson": {...}, "isolate": true },
     "size": "24x36",
     "dpi": 300
   }
   ```

2. API route spins up a headless Chromium instance via Puppeteer

3. Loads a special `/export` page that renders the map at the target resolution:
   - 24×36" at 300 DPI = 7,200 × 10,800 pixels
   - Map is rendered in a hidden iframe/div at that exact pixel size
   - All layers, styles, isolation mask applied
   - Wait for all tiles to load

4. Captures screenshot as high-quality PNG

5. Uploads to cloud storage (S3/Supabase Storage)

6. Returns the image URL for Prodigi order submission

### Alternative approaches:
- **MapLibre Native (C++)** — Can render maps server-side without a browser. More efficient but harder to set up.
- **Static Map API** — MapTiler and Mapbox offer static image APIs, but they don't support our custom style.
- **Canvas export** — MapLibre can export the canvas directly via `map.getCanvas().toDataURL()`, but this is limited to the current viewport size (screen resolution, not print resolution).

### Implementation notes:
- Puppeteer needs to run on a server with enough RAM for large renders (2GB+ for 30×40" at 300 DPI)
- Consider using a queue (Bull/BullMQ) for export jobs
- Cache rendered images to avoid re-rendering identical configurations
- Add a loading state in the UI ("Preparing your print...")

---

## Phased Roadmap

### Phase 1: Foundation (Current → Week 1)
- [x] Working map prototype with greyscale style
- [x] Layer toggles
- [x] Terrain hillshade
- [x] Region selection + isolation
- [ ] Port prototype to Next.js + TypeScript
- [ ] Extract map logic into React components
- [ ] Set up Tailwind with custom theme matching prototype
- [ ] Zustand store for map state
- [ ] Proxy Nominatim through API route with rate limiting

### Phase 2: Granular Controls (Week 2)
- [ ] Split "Place Labels" into: Capitals, Major Cities, Towns, State Labels, Country Labels
- [ ] Split "Roads" into: Highways, Major Roads, All Streets
- [ ] Add county boundaries toggle
- [ ] Improve layer classification regex to cover all liberty style layers
- [ ] Add zoom-based auto-show/hide hints (e.g., "Counties visible at zoom 6+")
- [ ] Pre-built templates for each US state
- [ ] Drill-down: click state → zoom in + show counties on hover

### Phase 3: Print Pipeline (Week 3)
- [ ] Stripe integration (Checkout Sessions)
- [ ] High-res export via Puppeteer
- [ ] Prodigi API integration (sandbox first)
- [ ] Order confirmation page
- [ ] Email receipts (Resend or SendGrid)

### Phase 4: Polish & Launch (Week 4)
- [ ] Landing page / marketing homepage
- [ ] Mobile responsive design
- [ ] User accounts + saved maps (optional for launch)
- [ ] SEO metadata, Open Graph images
- [ ] Error handling, loading states, edge cases
- [ ] Prodigi production mode
- [ ] Analytics (PostHog)
- [ ] Launch!

### Phase 5: Post-Launch
- [ ] Global map support (beyond US)
- [ ] Color palette options (muted blues for water, greens for parks)
- [ ] Canvas and metal print options
- [ ] Social sharing ("Share your map design")
- [ ] Gallery of popular designs for inspiration
- [ ] Gift cards
- [ ] Bulk/wholesale pricing
- [ ] Custom text overlay (add a title to your print)
- [ ] Multiple print formats (poster, postcard, notebook cover)

---

## File Structure

```
terralis/
├── .cursorrules              # Cursor AI context
├── .env.local                # Environment variables (not committed)
├── .env.example              # Template for env vars
├── .gitignore
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── PROJECT_SCOPE.md          # This file (master spec)
│
├── reference/
│   └── prototype.html        # Working single-file prototype
│
├── public/
│   └── fonts/                # Self-hosted fonts (Cormorant Garamond, DM Sans)
│
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Root layout with fonts
│   │   ├── page.tsx          # Main map builder page
│   │   ├── globals.css       # Tailwind imports + custom vars
│   │   ├── export/
│   │   │   └── page.tsx      # Hidden page for server-side rendering
│   │   └── api/
│   │       ├── geocode/
│   │       │   └── route.ts  # Nominatim proxy with rate limiting
│   │       ├── export/
│   │       │   └── route.ts  # High-res image export
│   │       ├── order/
│   │       │   └── route.ts  # Create Stripe session + Prodigi order
│   │       └── webhook/
│   │           ├── stripe/
│   │           │   └── route.ts
│   │           └── prodigi/
│   │               └── route.ts
│   │
│   ├── components/
│   │   ├── Map/
│   │   │   ├── MapView.tsx           # Main MapLibre component
│   │   │   ├── MapStyleEngine.ts     # Greyscale conversion + layer classification
│   │   │   └── useMapLayers.ts       # Hook for layer visibility management
│   │   ├── Panel/
│   │   │   ├── ControlPanel.tsx      # Left sidebar container
│   │   │   ├── SearchBar.tsx         # Location search input
│   │   │   ├── TemplateGrid.tsx      # Quick start templates
│   │   │   ├── LayerToggle.tsx       # Individual toggle component
│   │   │   ├── LayerGroup.tsx        # Section of toggles
│   │   │   └── SelectionControls.tsx # Isolate toggle + selection info
│   │   ├── Header/
│   │   │   └── Header.tsx
│   │   ├── SelectionBar/
│   │   │   └── SelectionBar.tsx      # Bottom bar for selected region
│   │   ├── PrintModal/
│   │   │   ├── PrintModal.tsx        # Order configuration modal
│   │   │   ├── SizeSelector.tsx
│   │   │   ├── PaperSelector.tsx
│   │   │   ├── FrameSelector.tsx
│   │   │   └── PriceDisplay.tsx
│   │   └── ui/                       # Shared UI primitives
│   │       ├── Toggle.tsx
│   │       ├── Modal.tsx
│   │       └── Button.tsx
│   │
│   ├── lib/
│   │   ├── map/
│   │   │   ├── style.ts             # Map style constants + greyscale logic
│   │   │   ├── layers.ts            # Layer group definitions + classification
│   │   │   ├── templates.ts         # Pre-built map templates
│   │   │   └── isolation.ts         # Polygon masking / isolation logic
│   │   ├── geo/
│   │   │   ├── nominatim.ts         # Nominatim API client
│   │   │   └── boundaries.ts        # Boundary polygon utilities
│   │   ├── payments/
│   │   │   └── stripe.ts            # Stripe client setup
│   │   ├── fulfillment/
│   │   │   └── prodigi.ts           # Prodigi API client
│   │   ├── export/
│   │   │   └── renderer.ts          # High-res export logic
│   │   └── pricing.ts               # Price calculation
│   │
│   ├── store/
│   │   ├── mapStore.ts              # Zustand store for map state
│   │   └── orderStore.ts            # Zustand store for order state
│   │
│   ├── hooks/
│   │   ├── useMap.ts                # Map instance hook
│   │   ├── useSelection.ts          # Region selection hook
│   │   └── useExport.ts             # Export/print hook
│   │
│   └── types/
│       ├── map.ts                   # Map-related types
│       ├── order.ts                 # Order-related types
│       └── api.ts                   # API response types
│
└── docs/
    └── API_NOTES.md                 # API-specific implementation notes
```

---

## Environment Variables

```bash
# Map (no keys needed for OpenFreeMap or AWS terrain)
NEXT_PUBLIC_NOMINATIM_URL=https://nominatim.openstreetmap.org

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Prodigi
PRODIGI_API_KEY=          # Get from https://dashboard.prodigi.com/
PRODIGI_ENV=sandbox       # "sandbox" or "production"

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Auth (if using NextAuth)
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Export
EXPORT_STORAGE_URL=       # S3 bucket or Supabase storage URL
```

---

## Key Design Decisions

1. **OpenFreeMap over Mapbox/MapTiler** — Free, no API key, no usage limits. The tradeoff is less documentation and potentially less stable infrastructure. If we hit reliability issues, migrate to MapTiler (has a free tier of 100k tile loads/month).

2. **Liberty style + programmatic greyscale** — Rather than building a custom style from scratch (which is fragile with font/sprite dependencies), we load the proven liberty style and convert all colors to greyscale after load. This guarantees tile/font/sprite compatibility.

3. **Nominatim for geocoding + boundaries** — Free and returns actual polygon boundaries (critical for isolation). Rate-limited to 1 req/sec, so we MUST proxy through our API with rate limiting. For production scale, consider LocationIQ ($0.50/1000 requests) or self-hosted Nominatim.

4. **Prodigi over Printify** — Better suited for fine art / premium prints. Higher quality paper and printing options. Better API documentation.

5. **Puppeteer for export** — Simplest path to high-res rendering since we can reuse the exact same MapLibre setup. The alternative (MapLibre Native) is more efficient but requires C++ toolchain.

6. **Zustand over Redux/Context** — Minimal boilerplate for our relatively simple state. Map state (layers, selection, view) and order state (size, paper, frame, price) are the two stores.

---

## Performance Considerations

- **Tile caching:** MapLibre caches tiles in the browser. For repeat visitors, subsequent loads are fast.
- **Greyscale conversion:** Runs once on map load (~50ms for ~100 layers). No ongoing performance cost.
- **Isolation mask:** Single GeoJSON polygon rendered as a fill layer. Negligible performance impact.
- **Nominatim rate limiting:** MUST enforce 1 req/sec server-side. Debounce search input client-side (300ms).
- **High-res export:** CPU and memory intensive. Run on a separate worker/serverless function with adequate resources. Consider Vercel's `maxDuration` limits for serverless functions (default 10s on hobby, 60s on pro).
- **Bundle size:** MapLibre GL JS is ~200KB gzipped. Load asynchronously to avoid blocking initial render.
