# Map Builder UX Spec

## Purpose

This document defines a simpler, more scalable interaction model for the Terralis map builder.

The goal is to make the product feel effortless for non-technical users while still supporting a wide range of outputs:

- A whole-US print with state lines, capitals, major cities, and highways
- A state print with all towns if desired
- A county or city print with rivers, parks, and roads
- A small-town print with local streets and natural features

This spec replaces the current "flat list of layer toggles" mental model with an intent-first, scale-aware system.

## Product Goals

- Let users get to a good-looking map in seconds
- Reveal more detail automatically as the map becomes more local
- Keep customization powerful, but mostly subtractive rather than additive
- Separate "what area is this map about?" from "what details are shown?"
- Prevent messy or nonsensical outputs at broad zoom levels
- Preserve an advanced path for power users without exposing it first

## Core UX Principles

### 1. Progressive reveal

Users should not need to build a map from scratch.

The map should automatically gain appropriate detail as the user zooms in or narrows focus. Users mainly turn things off, not on.

### 2. Intent-first controls

Users think in outcomes, not map schema.

They want:

- "a US map with highways"
- "a state map with every town"
- "my hometown with streets and rivers"

They do not want to reason about internal layer groups like `capitals`, `cities`, `towns`, `mainroads`, `allroads`, `landcover`.

### 3. Focus area is separate from detail

There are two different decisions:

- What area is the print about?
- How much detail is visible inside that area?

Selection/isolation should be treated as a first-class framing feature, not just another toggle.

### 4. Safe defaults

The app should never default to a cluttered or broken-looking print.

If a detail level would create visual noise at the current map scale, it should be hidden, downgraded, or presented as unavailable until the user zooms in or narrows the focus area.

## User Experience Summary

### Primary workflow

1. User searches or clicks a place
2. App recognizes the scale of the map
3. App applies a sensible default detail recipe
4. User removes or adjusts a few features
5. User optionally focuses the print on a selected area
6. User proceeds to print configuration

### Key product shift

The app should move from:

- "Here are all the possible toggles"

to:

- "Here is a beautiful default for this kind of place, and here are a few simple ways to adjust it"

## Information Architecture

The control panel should be reorganized into five top-level sections:

1. `Place`
2. `Style`
3. `Details`
4. `Focus Area`
5. `Print`

### Section details

#### 1. Place

Purpose:

- Search for a country, state, county, city, or town
- Show the currently selected place
- Allow reset back to the full US

Controls:

- Search field
- Current selection summary
- Reset button
- "Use current view" helper if no place is selected

#### 2. Style

Purpose:

- Choose a visual starting point

Recommended presets:

- `Classic`
- `Roads`
- `Nature`
- `Minimal`
- `Detailed Local`

These presets should not only toggle layers. They should also bias label density, line weight, and which feature families are emphasized.

#### 3. Details

Purpose:

- Let users tune the result using plain language

Recommended controls:

- `Labels`: None / Major / More / Dense
- `Roads`: None / Highways / Major Roads / Streets
- `Nature`: None / Water / Water + Parks / Water + Parks + Terrain
- `Borders`: None / State / County

Advanced controls should live inside a collapsed `More controls` drawer.

#### 4. Focus Area

Purpose:

- Define the geographic subject of the print

Controls:

- `Selected area`: none or current selected place
- `Framing mode`: None / Outline / Fade outside / Crop to area
- `Area level`: Country / State / County / City

The UI should offer these levels dynamically based on the current clicked or searched result.

#### 5. Print

Purpose:

- Size, paper, frame, pricing

This area can remain largely as-is for now.

## Scale Model

The map builder should operate on four scale bands.

These bands should drive defaults, available controls, label density, and which options are exposed.

### Band A: National

Typical use:

- Whole US
- Whole country
- Very broad regional prints

Characteristics:

- Large area
- Low geographic detail
- Strong emphasis on clarity

Default visible features:

- Country labels
- State labels
- State lines
- State capitals
- Major cities
- Major highways
- Major water bodies

Default hidden features:

- Towns
- Streets
- County lines
- Parks
- Dense local rivers

### Band B: State / Regional

Typical use:

- Single state
- Multi-county region
- Smaller country region

Default visible features:

- State outline
- Optional county lines
- Capitals if relevant
- Cities
- Optional towns
- Highways
- Major roads
- Rivers and lakes

Default hidden features:

- Full street grids
- Very dense neighborhood labels

### Band C: County / Metro

Typical use:

- County print
- Metro area
- Multi-town area

Default visible features:

- County outline
- Towns and cities
- Major roads
- Optional local roads
- Rivers
- Parks

Default hidden features:

- Hyper-dense street detail unless zoomed further

### Band D: Local

Typical use:

- City
- Small town
- Neighborhood-scale print

Default visible features:

- Local streets
- Parks
- Rivers and water features
- Town/city labels
- Optional nearby small settlements

Default hidden features:

- County lines unless explicitly enabled
- State labels unless useful context is needed

## Zoom and Detail Gating

The app should gate controls by both current zoom and selected focus area.

### Gating rule philosophy

- If a feature would look bad or unreadable, do not show it yet
- If a feature might become useful soon, keep the control visible but disabled with explanatory text
- Do not punish exploration; instead, guide it

### Control behavior types

Each feature family should support one of three states:

- `Auto`
- `On`
- `Off`

Meaning:

- `Auto`: controlled by scale rules
- `On`: user forces it on if allowed at current scale
- `Off`: user forces it off

This prevents the user from feeling like the app is arbitrarily changing their settings, while still allowing progressive reveal.

### Recommended feature gates

#### Labels

- `Major`: available at all scales
- `More`: available from Band B downward
- `Dense`: available only from Band B and strongest at Band C/D

Special behavior:

- On a selected state, `Dense` may include all towns in the state
- On a whole-US view, `Dense` should not mean "every town in the country"

#### Roads

- `Highways`: available at all scales
- `Major Roads`: available from Band B downward
- `Streets`: available from Band C downward, strongest at Band D

Special behavior:

- At broad zoom, selecting `Streets` should either be disabled or prompt the user to zoom in

#### Borders

- `State`: available at all scales where relevant
- `County`: available from Band B downward

Special behavior:

- County lines should not be offered on a whole-US map

#### Nature

- `Water`: available at all scales
- `Parks`: available from Band C downward
- `Terrain`: available from Band B downward, depending on style preset

## Focus Area Spec

Focus Area is the framing system for the print.

It should work independently from zoom-based detail reveal.

### User model

After selecting a place, users should be able to decide:

- Keep it as contextual view
- Outline the selected area
- Fade everything outside it
- Crop the print to that area

### Focus modes

#### 1. None

- No special framing
- Current view is the print area

#### 2. Outline

- Draw selected area boundary
- Keep outside context fully visible

Best for:

- State maps with surrounding context
- Metro maps where the region should be called out but not isolated

#### 3. Fade outside

- Keep surrounding geography visible but muted
- Selected area remains dominant

Best for:

- State, county, or city focus maps
- Aesthetic prints where context helps orientation

#### 4. Crop to area

- Hide everything outside the selected boundary
- Selected geometry becomes the frame subject

Best for:

- State, county, or city silhouette-style prints
- Strong minimalist compositions

### Area level behavior

The app should infer likely area levels from the selected result and offer sensible actions.

Examples:

- If user selects `Texas`, offer: `Use this state`
- If user selects `Dane County`, offer: `Use this county`
- If user selects `Madison`, offer: `Use this city`
- If user selects `United States`, offer: `Use this country`

The UI should avoid forcing the user to think in administrative jargon unless needed.

## Preset System

Presets should become stronger opinionated starting points, not just saved toggles.

### Recommended presets

#### Classic

Best for:

- Elegant wall maps
- Broad area prints

Bias:

- Balanced labels
- Borders on
- Moderate roads
- Water on
- Terrain optional

#### Roads

Best for:

- Transportation-focused prints
- US or state highway maps

Bias:

- Higher road visibility
- Lower nature emphasis
- Label density moderate

#### Nature

Best for:

- Waterways, parks, terrain-forward prints

Bias:

- Water and parks emphasized
- Roads subdued
- Labels lighter

#### Minimal

Best for:

- Clean decor-first prints

Bias:

- Fewer labels
- Fewer roads
- Strong whitespace
- Borders selective

#### Detailed Local

Best for:

- Town and city prints

Bias:

- Local roads enabled
- Parks and rivers enabled
- Place density higher

## Recommended Default Recipes

These recipes define what a user should get automatically before making adjustments.

### Whole US map

Default:

- State lines on
- State capitals on
- Major cities on
- Major highways on
- Country label optional
- Water on
- Towns off
- Streets off
- County lines off

### State map

Default:

- State outline on
- Cities on
- Towns optional
- Highways on
- Major roads optional
- Rivers on
- County lines off by default

### State map with all towns

Allowed only when:

- A single state is selected as focus area

Behavior:

- `Labels = Dense` enables towns statewide
- If label crowding is severe, downgrade automatically or prompt:
  - "This state is very dense. Switch to major + towns at closer zoom?"

### County / metro map

Default:

- County outline on
- Cities and towns on
- Major roads on
- Parks and rivers on
- Streets optional

### Small-town map

Default:

- Streets on
- Water on
- Parks on
- Town label on
- Nearby place labels light
- State/county labels off unless explicitly enabled

## Sidebar Interaction Spec

The current long scrolling panel should be replaced with a shorter guided flow.

### Recommended layout

#### Always visible summary strip

At top of panel:

- Current place
- Current preset
- Current focus mode

Example:

- `Place: Texas`
- `Style: Classic`
- `Focus: Fade outside`

#### Main body

Accordion or tab sections:

1. Place
2. Style
3. Details
4. Focus Area
5. Print

Only one or two sections should need attention at a time.

#### Advanced drawer

Contains:

- Raw layer toggles
- Fine label control
- Boundary overrides
- Experimental options

This keeps power available without making the main UX feel like GIS software.

## Empty and Disabled States

The product should explain unavailable features in plain language.

Examples:

- `Zoom in to show streets`
- `Select a single state to show all towns`
- `County borders appear at regional scale`
- `Dense labels are unavailable for whole-country maps`

These messages are important. They help users discover capabilities without cluttering the default interface.

## State Management Model

The current data model is overly layer-centric. The UI layer should move toward a higher-level configuration model.

### Recommended concepts

- `place`
- `scaleBand`
- `preset`
- `labelDensity`
- `roadDensity`
- `natureDensity`
- `borderDensity`
- `focusMode`
- `focusTarget`
- `advancedOverrides`

### Behavior model

The rendered map should be the result of:

- current place and zoom
- current preset
- current density settings
- current focus mode
- any advanced overrides

Not every user action should directly toggle a raw layer.

## Implementation Strategy

This spec can be implemented in phases.

### Phase 1: UX simplification without full engine rewrite

- Keep existing layer system underneath
- Add a scale-band interpreter
- Replace top-level controls with simplified controls
- Translate simplified controls into existing layer toggles
- Keep current advanced toggles behind `More controls`

### Phase 2: Add auto/detail logic

- Introduce `Auto / On / Off` behavior for feature families
- Drive visibility from scale band plus overrides
- Add disabled-state messaging

### Phase 3: Improve focus-area handling

- Separate selection from framing mode
- Add `Outline / Fade outside / Crop to area`
- Improve selection language by place type

### Phase 4: Polish and user testing

- Tune defaults for broad prints vs local prints
- Test label density thresholds
- Check if "all towns in a state" is useful and legible in practice

## Success Criteria

This redesign is successful if:

- A first-time user can make a beautiful US map in under 30 seconds
- A first-time user can make a small-town print without understanding map layers
- Users discover richer detail naturally by zooming in
- The app produces fewer cluttered, ugly outputs by default
- Advanced users can still force specific looks when needed

## Summary Decision

The Terralis builder should become:

- scale-aware
- preset-led
- mostly subtractive
- focused on outcomes instead of raw map layers

The product should guide users toward good maps automatically, then let them refine, rather than asking them to assemble a map piece by piece.
