# Wisconsin: Land & Water

A single art-direction study, separate from purchasable editions. Preview at /studies/wisconsin, with a toggle to compare the current Towns & Terrain print.

The study uses real map tiles, the existing terrain DEM, the Wisconsin boundary and detailed waterways, and the bundled place-name dataset. It is rendered with MapLibre and Canvas, not generated imagery. This lets the chosen visual direction be implemented in the normal cartographic renderer later.

Changes: Great Lakes retained in the frame, softened blue-green water, visible relief, warmer land, three levels of place-name emphasis, large asymmetrical serif heading, geographic lake lettering, restrained page furniture. Adjacent geography is retained for context. Civil townships are omitted here; this is not the all-towns atlas. Point anchors remain dataset centroids.

The PNG is an 1800 × 2400 visual proof, not a production 300-DPI master. No store edition or customization behavior is replaced by this study.

To regenerate locally with the dev server on port 3000, run node scripts/art-studies/wisconsin.cjs from cartoprint. The renderer lives in src/lib/studies/wisconsin.ts. Its local-only button is inside Study notes. Public output: public/studies/wisconsin-land-water.png.
