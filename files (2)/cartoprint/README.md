# CartoPrint

Premium custom map prints. Design your perfect greyscale map and order a museum-quality print.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Working Prototype

The fully functional single-file prototype is at `reference/prototype.html`. Open it directly in a browser — no build step needed. It contains all the core map logic that needs to be ported into the React/Next.js components.

## Project Documentation

- **[PROJECT_SCOPE.md](./PROJECT_SCOPE.md)** — Complete technical specification, architecture, API details, roadmap
- **[docs/API_NOTES.md](./docs/API_NOTES.md)** — API-specific implementation notes and setup guides
- **[.cursorrules](./.cursorrules)** — Context file for Cursor AI assistant

## Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **MapLibre GL JS** + **OpenFreeMap** tiles (free, no API key)
- **Zustand** for state management
- **Tailwind CSS** for styling
- **Stripe** for payments
- **Prodigi** for print fulfillment

## Architecture

```
src/
├── app/           # Next.js pages and API routes
├── components/    # React components (Map, Panel, PrintModal, etc.)
├── lib/           # Core logic (map style, layers, geocoding, pricing)
├── store/         # Zustand stores (map state, order state)
├── hooks/         # Custom React hooks
└── types/         # TypeScript type definitions
```

See `PROJECT_SCOPE.md` for the full file structure and component breakdown.
