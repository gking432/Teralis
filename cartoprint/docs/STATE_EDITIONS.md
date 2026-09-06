# Curated state editions

State discovery and ad links enter the same Studio with Terrain, Towns & Terrain, and Illustrated choices. The first two have live map previews. Illustrated is available only for prepared artwork (currently Tennessee and Wisconsin); other states show its availability honestly.

Prepared illustrations lead where available. Mountain states lead with Terrain. Other states lead with Towns & Terrain. Explicit edition links and saved designs take precedence. Legacy state `atlas` links and saved designs migrate to `detailed` (Towns & Terrain).

Terrain emphasizes relief and waterways; flatter/water-led states use softer relief. Towns & Terrain uses subdued relief, waterways, and collision-managed place labels, without road clutter. It starts at Medium; the larger proof viewer lets customers inspect names. This is a curated baseline, not a claim that every state has received individual artistic review or every settlement will fit.

The 50 public atlas-places GeoJSON files are derived from bundled us_places_2025.json and us_townships_2025.json, selected by state code. Each state loads its own file, keeping the national dataset out of the browser JavaScript bundle. Census places and civil townships do not mean every informal settlement. Names can be omitted by collision handling.

Hometown search selects a point from that state's dataset. The saved RegionDesign holds its name and coordinates; the same symbol layers draw it in the live map and exported proof. Its payload is included in shared designs and proof cache keys. Switching editions preserves the choice while showing it only in Towns & Terrain.

State customization offers four palettes (for cartographic editions), title/caption wording, and optional hometown emphasis. Layer/density/framing controls are absent from the state workspace. Illustrations retain their finished composition and palette.

Verification: scripts/tests/state-editions.cjs covers hometown selection, palette changes, proof, reload, edition switching, size handoff, representative state defaults, legacy atlas links, real Illinois labels and mobile overflow. Existing illustrated-flow.cjs covers saved art and city regression paths.
