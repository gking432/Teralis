# Map Builder Build Plan

## Goal

Implement the new scale-aware, preset-led builder without rewriting the map renderer.

Phase 1 will keep the existing MapLibre style and low-level layer booleans, but place a higher-level UX model on top of them.

## Phase 1 Scope

- Replace the current layer-first sidebar with a simpler Place / Style / Details / Focus flow
- Introduce scale bands derived from map zoom
- Add high-level controls for labels, roads, nature, and borders
- Translate those controls into the current `layers` object
- Preserve raw layer toggles behind an advanced drawer
- Replace binary isolation with focus modes: none, outline, fade, crop

## Codebase Strategy

### 1. Extend the map domain model

Files:

- `src/types/map.ts`
- `src/store/mapStore.ts`

Changes:

- Add `ScaleBand`
- Add `MapPreset`
- Add density controls:
  - `LabelDensity`
  - `RoadDensity`
  - `NatureDensity`
  - `BorderDensity`
- Add `FeatureSetting` with `auto | on | off`
- Add `FocusMode` with `none | outline | fade | crop`
- Add `BuilderState` to hold the new UX-level configuration

Reason:

The UI should no longer talk directly to raw layer booleans for normal usage.

### 2. Add a builder interpreter

Files:

- `src/lib/map/templates.ts`
- new `src/lib/map/builder.ts`

Changes:

- Create scale-band detection from zoom
- Create preset defaults for each style
- Create a function that derives low-level `LayerState` from:
  - scale band
  - preset
  - densities
  - feature settings
  - advanced overrides
  - focus target context if needed
- Add helper functions for disabled-state messaging

Reason:

This lets us preserve the current render engine while changing the user-facing model.

### 3. Update focus-area rendering

Files:

- `src/lib/map/isolation.ts`
- `src/components/Map/MapView.tsx`

Changes:

- Replace `isIsolated` handling with `focusMode`
- Support:
  - `none`
  - `outline`
  - `fade`
  - `crop`
- Keep current mask geometry, but allow mask opacity to vary by mode

Reason:

Selection and framing need to become more expressive than a single isolate toggle.

### 4. Rewrite the control panel

Files:

- `src/components/Panel/ControlPanel.tsx`
- likely supporting subcomponents in `src/components/Panel/`

Changes:

- Replace the long raw-toggle list with:
  - Place
  - Style
  - Details
  - Focus Area
  - Advanced controls
- Add summary chips for current place, preset, focus mode, and scale band
- Add segmented controls for densities
- Show disabled hints like:
  - `Zoom in to show streets`
  - `Select a single state to show all towns`

Reason:

This is the main UX change users will feel.

### 5. Keep advanced power available

Files:

- `src/components/Panel/ControlPanel.tsx`
- existing `LayerToggle` helpers

Changes:

- Keep raw low-level toggles in a collapsed `Advanced controls` section
- Advanced toggles become overrides on top of derived builder defaults

Reason:

We want simplicity first, not loss of capability.

### 6. Adapt the page wiring

Files:

- `src/app/page.tsx`
- `src/components/SelectionBar/SelectionBar.tsx`

Changes:

- Pass the new builder state and actions into the panel
- Update selection actions to use focus modes instead of only isolation
- Keep quick actions for zoom / focus / clear

Reason:

The page needs to shift from low-level layer actions to higher-level builder actions.

## Implementation Order

1. Add new types and builder interpreter
2. Refactor the store to own both builder state and derived layers
3. Update map rendering for new focus modes
4. Rewrite the panel against the new store API
5. Update page-level plumbing
6. Run lint and fix integration issues

## Phase 1 Success Criteria

- Users see a much simpler builder immediately
- Zoom level changes the available detail options
- Whole-US defaults look clean without manual toggling
- Local maps can expose streets, parks, and rivers
- A selected state/county/city can be outlined, faded, or cropped
- Advanced raw-layer access still exists

## Phase 2 Follow-Ups

- Replace current template system fully with richer preset recipes
- Improve focus-area inference from geocoding results
- Tune label density per place type and geography
- Add subtle onboarding hints and guided empty states
- Add visual tests or snapshot coverage for layer derivation rules
