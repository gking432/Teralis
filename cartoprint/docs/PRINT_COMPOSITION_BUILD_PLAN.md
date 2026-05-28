# Print Composition Build Plan

## Goal

Implement a print-safe composition system on top of the current map builder so users can preview, validate, and eventually export a wall-art-ready map.

## Phase 1 Scope

- Add live print frame and safe-margin overlays
- Make print size part of the active editor state, not just the order modal
- Add a basic print-readiness checker
- Surface readiness warnings in the UI before checkout
- Prepare export inputs around resolved print composition

## Current Code Touchpoints

Primary files:

- `src/app/page.tsx`
- `src/components/Map/MapView.tsx`
- `src/components/PrintModal/PrintModal.tsx`
- `src/store/mapStore.ts`
- `src/store/orderStore.ts`
- `src/types/map.ts`
- `src/types/order.ts`
- `src/app/api/export/route.ts`

Supporting logic:

- `src/lib/map/builder.ts`
- `src/lib/map/isolation.ts`
- future composition logic in a new `src/lib/print/` area

## Architecture Direction

The app should move from:

- `map state -> export whatever is visible`

to:

- `map state + print config -> composition engine -> readiness report -> export`

This means we need a new print composition layer between the current builder and the eventual export route.

## Recommended New Domain Objects

### 1. Print frame state

Add to shared state:

- selected print size
- print aspect ratio
- frame bounds in screen space
- safe margin inset

### 2. Composition result

New derived object:

- resolved print bounds
- safe margin bounds
- subject bounds
- readiness status
- readiness warnings

### 3. Readiness report

Suggested shape:

- `status: ready | needs-adjustment | blocked`
- `warnings: string[]`
- `suggestions: string[]`

## Phase Breakdown

### Phase 1: Add print-preview primitives

Files:

- `src/store/orderStore.ts`
- `src/components/Map/MapView.tsx`
- new `src/components/Map/PrintFrameOverlay.tsx`

Tasks:

- Move selected print size into the active editing experience
- Compute current aspect ratio from size
- Render a print frame overlay over the map
- Render a safe-margin inset inside the frame
- Dim the outside area so users clearly understand the crop

Success criteria:

- user can switch sizes and see the crop change immediately

### Phase 2: Add composition analysis layer

Files:

- new `src/lib/print/composition.ts`
- new `src/lib/print/readiness.ts`
- `src/types/map.ts` or new `src/types/print.ts`

Tasks:

- create functions to evaluate:
  - subject centering
  - frame ratio fit
  - sparse composition
  - dense composition
  - edge safety
- return a basic readiness report

Important note:

This first pass can use heuristics and screen-space approximations. It does not need perfect cartographic intelligence immediately.

### Phase 3: Detect label-edge problems

Files:

- `src/components/Map/MapView.tsx`
- `src/lib/print/readiness.ts`

Tasks:

- inspect visible rendered labels where possible
- estimate whether important labels sit outside or too near the safe area
- flag clipped or dangerous label positions

Possible implementation paths:

- query rendered features and estimate anchor positions
- use map projection to test key selected/place features against frame bounds

Success criteria:

- obvious clipped-label cases are caught reliably

### Phase 4: Show readiness in the UI

Files:

- `src/components/Panel/ControlPanel.tsx`
- `src/components/PrintModal/PrintModal.tsx`
- possibly new `src/components/Print/ReadinessBadge.tsx`

Tasks:

- show readiness badge in the main builder
- show warnings in the print modal
- block final order step when status is `blocked`
- provide plain-language suggestions

Success criteria:

- user understands what needs fixing before they order

### Phase 5: Auto-adjust helpers

Files:

- `src/app/page.tsx`
- `src/components/Map/MapView.tsx`
- new helper functions in `src/lib/print/composition.ts`

Tasks:

- add small auto-fit adjustments for:
  - keeping selected subject inside frame
  - nudging labels away from trim edge
  - improving composition for selected ratio

Important limitation:

Only make subtle adjustments automatically. Do not drastically change the user's chosen composition.

### Phase 6: Export-aware composition

Files:

- `src/app/api/export/route.ts`
- new server-side composition helpers as needed

Tasks:

- make export route accept a composition payload
- export using resolved print bounds rather than arbitrary viewport
- ensure size/dpi/frame data stay consistent with preview

Success criteria:

- exported print matches the composed print preview

## Data Model Changes

### Store changes

`orderStore` should become the source of truth for:

- print size
- paper
- frame
- price

`mapStore` or a new print-composition store should derive:

- current frame aspect ratio
- readiness state
- composition warnings

### Recommended split

- `mapStore`: geography, selection, map style, camera
- `orderStore`: print purchase config
- `print composition`: derived state from both

## UI Changes

### Builder UI

Always visible:

- print size
- readiness badge
- print frame overlay

Optional expanded details:

- why a print is not ready
- suggested fixes

### Print modal

Add:

- `Print readiness` section
- warning list
- note that the preview reflects final crop

If blocked:

- disable `Add to Cart`

## Heuristic Starter Rules

These are intentionally simple first-pass rules.

### Frame inset

- `5%` safe margin on all sides

### Subject centering

Warn if selected subject bounds are too close to any frame edge

### Sparse composition

Warn if:

- local print has almost no roads or water
- state print has very little internal geography
- selected subject occupies too little of the frame

### Dense composition

Warn if:

- dense labels + strong roads + broad area are active together
- all-town labeling is enabled in very dense regions

### Label safety

Warn if:

- important labels project outside frame
- important labels fall inside the danger band between trim and safe margin

## Implementation Order

1. Add print size awareness to the active editor
2. Render print frame + safe margin overlay
3. Create composition/readiness helpers
4. Show readiness badge + warnings
5. Wire readiness into print modal and block invalid orders
6. Expand export route to use resolved composition inputs

## Risks

### 1. Map label introspection is imperfect

MapLibre does not make every label-layout decision easy to inspect precisely.

Mitigation:

- start with heuristics
- focus on catching obvious bad cases first

### 2. Export parity

Browser preview and eventual server export may not perfectly match.

Mitigation:

- make composition inputs explicit and deterministic
- keep preview and export driven by the same resolved bounds

### 3. Too many warnings

Over-warning will make the product feel brittle.

Mitigation:

- distinguish between `needs adjustment` and `blocked`
- reserve blocking for genuinely bad print outcomes

## Deliverables by Phase

### After Phase 1

- visible print frame
- visible safe margin
- size-aware preview

### After Phase 2

- readiness badge
- sparse/dense/frame-fit heuristics

### After Phase 3

- basic label-edge warnings

### After Phase 4

- print modal readiness gating

### After Phase 5

- gentle auto-fit behavior

### After Phase 6

- export driven by print composition, not editor viewport

## Success Criteria

- users can design against the real print crop
- print size meaningfully affects composition while editing
- the app catches clipped-label and awkward-edge issues before ordering
- exported prints feel intentional and premium

## Recommended Next Step

Build Phase 1 and Phase 2 together:

- live print frame
- safe-margin overlay
- readiness badge

That will create immediate product value and force the right composition model into the codebase before the export pipeline becomes more complex.
