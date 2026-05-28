# Print Composition Spec

## Purpose

This document defines what makes a Terralis map "print-ready."

The product can no longer assume that a map that looks acceptable on screen will also look good as a physical print. Print composition needs its own rules, preview system, and validation layer.

This spec defines:

- how the print frame should work
- how label clipping and edge crowding should be prevented
- how density should be tuned for print
- what warnings should appear before checkout
- what the export pipeline must eventually produce

## Core Principle

The editing view and the print output are not the same thing.

Users should be able to explore freely, but the print system must enforce composition rules so the exported artwork feels intentional, legible, and premium.

## Product Goals

- Prevent clipped labels and awkward edge cuts
- Preserve a clean, premium wall-art composition
- Ensure every selected print size has a correct aspect-ratio preview
- Keep the print detailed enough to feel substantial
- Prevent overly dense maps that become muddy when printed
- Give the user clear, plain-language warnings before ordering

## Print Model

Every print should be defined by five composition concepts:

1. `Print frame`
2. `Safe margin`
3. `Subject area`
4. `Detail density`
5. `Readiness status`

### 1. Print frame

The print frame is the final crop ratio for the selected size.

Examples:

- `12x16` -> 3:4
- `18x24` -> 3:4
- `24x36` -> 2:3
- `30x40` -> 3:4

The user must preview the map inside this exact ratio while editing.

### 2. Safe margin

The safe margin is an inner inset area where labels and important visual elements should remain.

Anything critical that touches or crosses the safe margin should trigger a warning or auto-adjustment.

### 3. Subject area

The subject area is the primary geographic focus:

- full country
- single state
- county
- metro area
- town / city

The composition engine should ensure the subject sits intentionally within the frame, not just incidentally.

### 4. Detail density

The print needs enough information to feel rich, but not so much that it becomes noisy.

Density decisions should be based on:

- map scale
- print size
- subject type
- preset/style

### 5. Readiness status

The app should score whether the current composition is ready for print.

Recommended states:

- `Ready`
- `Needs adjustment`
- `Blocked`

## Print Preview Requirements

### Live print frame overlay

The builder must show a live print frame on top of the map.

This frame should:

- match the selected print size ratio
- be centered within the editor canvas
- darken or mute the area outside the print bounds
- remain visible while panning and zooming

### Live safe margin overlay

Inside the frame, the app should also show a safe margin.

Recommended first-pass inset:

- `5%` of frame width on left and right
- `5%` of frame height on top and bottom

This can be tuned later by size or frame option.

### Preview behavior

The print preview must update immediately when the user changes:

- print size
- focus mode
- zoom
- selection target
- preset
- density controls

## Composition Rules

### Rule 1: No clipped labels

No visible label should be partially cut off by the print frame.

If a label would be clipped:

- auto-pan or auto-zoom if possible
- otherwise warn the user

### Rule 2: No critical labels in the danger zone

Important labels should not sit too close to the edge.

Important labels include:

- country names
- state names
- selected subject name
- major city names
- capitals when visible

If these fall between the safe margin and trim edge, the app should flag the composition.

### Rule 3: Subject must feel intentional

The main selected subject should not feel accidentally cropped.

Examples of failure:

- state silhouette pressed against one edge
- county shape cut too tightly
- city subject floating awkwardly in one corner

The subject should be centered or compositionally offset on purpose.

### Rule 4: Minimum detail threshold

Prints should not feel empty.

Examples:

- a local print with almost no roads or water
- a state print with only an outline and no useful interior geography

If the composition is too sparse for the selected size, the app should suggest:

- zooming in
- turning on more roads
- enabling more labels
- switching style

### Rule 5: Maximum density threshold

Prints should not become visually muddy.

Examples:

- every town label in a dense northeastern state
- too many roads at broad regional scale
- excessive terrain plus roads plus dense labels

If density is too high, the app should suggest:

- reducing labels
- reducing roads
- zooming in
- isolating the subject

### Rule 6: Respect aspect ratio

The final map must be composed for the selected print ratio, not the browser viewport.

This matters especially for:

- `24x36` landscape-like compositions
- tall state shapes in portrait prints
- wide US maps in narrower frames

## Density Guidance by Subject Type

### Country / US prints

Should feel:

- clean
- broad
- elegant

Preferred content:

- state lines
- capitals
- major cities
- major highways
- major water

Avoid:

- dense town labels
- county lines
- street grids

### State prints

Should feel:

- informative
- balanced
- regionally rich

Preferred content:

- state outline
- selected cities
- optional towns
- highways / major roads
- water

Avoid:

- cluttered statewide label density unless the state can support it visually

### County / metro prints

Should feel:

- detailed
- navigable
- grounded

Preferred content:

- county outline or metro focus
- towns / cities
- major roads
- optional streets
- rivers / lakes

### Local town / city prints

Should feel:

- intimate
- dense enough to reward close viewing
- still legible from a distance

Preferred content:

- streets
- water
- terrain if useful
- local place labels

Avoid:

- broad administrative labels that overwhelm the local subject

## Print Readiness System

Before checkout, the app should run a print-readiness check.

### Status levels

#### Ready

No major composition problems detected.

#### Needs adjustment

The print may technically export, but one or more composition issues should be fixed.

#### Blocked

The print should not proceed until the issue is resolved.

### Warning types

Recommended first-pass warnings:

- `A label is cut off by the print edge`
- `Important labels are too close to the edge`
- `This map may print too sparsely`
- `This map may be too dense for clean printing`
- `The selected subject is cropped awkwardly`
- `This composition is not optimized for the selected print ratio`

### UI language

Warnings should be written in plain language.

Good:

- `Zoom in slightly to keep labels inside the print area.`
- `This state map is very dense. Try fewer labels for a cleaner print.`

Bad:

- `Label bounding boxes exceed frame margin threshold.`

## Automatic Adjustment Rules

The app should attempt gentle correction before showing warnings.

### Allowed automatic fixes

- small pan adjustments
- small zoom adjustments
- small fit-to-selection adjustments
- switching from dense to more moderate label density in guided mode

### Not allowed automatically

- changing print size
- removing the user's selected subject
- dramatically changing style
- disabling core features without explanation

If auto-adjustment changes the composition meaningfully, the UI should say so.

Example:

- `Adjusted slightly to keep labels inside the print frame.`

## Export Requirements

The export pipeline must eventually render the print, not the editor viewport.

### Export must honor

- selected print size
- selected frame ratio
- safe crop area
- final label state after composition adjustments
- focus mode
- exact layer styling

### Minimum export output

- 300 DPI
- exact pixel dimensions per selected size
- deterministic bounds
- no clipped labels

### Export inputs

The export API should eventually receive a composition object, not just raw map state.

Recommended shape:

- `mapConfig`
- `printConfig`
- `compositionFrame`
- `safeMargins`
- `resolvedBounds`
- `readinessReport`

## UI Requirements

### In the editor

Always visible:

- print frame
- safe margin
- print size selector
- readiness badge

### In the print modal

Show:

- final print size
- preview thumbnail or statement of current frame
- readiness status
- warnings that need action

If status is `Blocked`, the order button should not proceed.

## Suggested Heuristics

These should be treated as starting values, not final truth.

### Safe margin

- `5%` inset on all sides

### Edge warning threshold

- important labels entering the outer `5%` zone

### Sparse warning

Trigger when the visible print frame contains too few:

- roads
- labels
- water features
- recognizable internal geography

Exact thresholds should be tuned visually.

### Dense warning

Trigger when label overlap, road crowding, or visual noise exceeds acceptable levels.

## Non-Goals for First Pass

The first print-composition phase does not need:

- a perfect cartographic optimization engine
- exact typographic collision detection for every label
- full server-side preview parity on day one

It does need:

- aspect-ratio preview
- safe-margin awareness
- basic clipping prevention
- readable print warnings

## Success Criteria

This system is successful if:

- users can see the real print crop while designing
- labels are not cut off in exported prints
- state, county, and local prints feel intentionally composed
- low-detail and over-dense prints are caught before ordering
- users trust that what they preview is what they receive

## Summary

Terralis needs to treat print composition as a first-class product system.

The map builder should no longer simply expose a map view. It should guide users toward a print-safe composition with:

- a real print frame
- safe margins
- readiness checks
- controlled density
- export based on final composition rules
