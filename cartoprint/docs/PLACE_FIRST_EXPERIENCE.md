# Place-first experience — September 2026

The normal route is homepage search or discovery → `/maps/[slug]` (or `/maps/custom` for arbitrary results) → size and frame. Advertisement links and homepage links use the same live workspace. `/customize` is retained for existing links.

## Direct-entry links

- `/maps/chicago-il?look=on-water&palette=navy`
- `/maps/wisconsin?edition=topographic`
- `/maps/wisconsin?edition=atlas`
- `/maps/tennessee?edition=illustrated`

The encoded `d` design takes precedence over named starting parameters and session state. Personal wording, colors, framing, edition, label level and orientation survive reload and sharing. Size/frame returns carry the latest design. The homepage's Chicago artwork comes from the same rendered proof as its destination.

## Editions and assets

Topographic and Street Atlas use existing map data and rendering. All catalog states support both. Street Atlas supports no place names, cities, or cities and towns; MapLibre collision placement keeps labels apart. Topographic carries elevation, rivers and lakes, with three detail levels.

Illustrated Atlas uses a saved bitmap plus separately rendered personal caption. Tennessee, Wisconsin, and Madison are the initial pilots. Other states explicitly show that illustration is not available, with a link to Tennessee; no generic or mislabeled replacement is used. Adding a reviewed asset to `ILLUSTRATIONS` enables the edition for its state. Prepared art uses its registered portrait or landscape composition, original colors, and a shared preview/export geometry. This avoids runtime AI generation and preserves its design.

Tennessee artwork: `public/illustrations/tennessee-atlas.png`, generated with the built-in image_gen tool (1693 × 929). It is a pictorial interpretation, not surveyed cartography. It needs geographic/art-direction review and a production-resolution master before a physical print launch. This iteration implements preview, personalization, and proof handoff; it does not claim the bitmap is a 300-DPI large-format master.

Generation brief: Complete north-up Tennessee silhouette on cream paper #f5f0e5. Fine original black hand-inked fantasy atlas linework; eastern Smoky Mountains, middle Tennessee hills, trees, winding rivers, lakes and settlement drawings. Restrained rust-red labels: Memphis (southwest), Nashville (north-central), Chattanooga (southeast), Knoxville (east), Great Smoky Mountains. No giant title, footer, frame, UI, signature, or extra text. Original antique pictorial-map composition; do not copy a particular artist.

## Validation

`node scripts/tests/place-flow.cjs` checks advertisement entry, exact proof routing, wording and palette persistence, a fresh shared-link load, state label levels, edition switching, illustrated proof handoff, mobile search and overflow, and browser runtime errors. Run with the development server available at `TERRALIS_TEST_URL` (defaults to localhost:3000). `UPDATE_MARKETING_ART=1` explicitly refreshes the Chicago hero from its rendered proof.

Checkout/fulfillment are outside this change. Personal geographic pins and further illustrated places remain future work.

## Development and deployment

Development builds use `.next-dev`; production builds and `next start` use `.next`. Separating these directories prevents missing Webpack chunk errors when local development and production builds overlap.

Push completed, validated updates to the repository's GitHub branch to trigger the existing Vercel Git integration. Branch pushes produce their configured Vercel deployment; do not substitute an untracked local preview for deployment. The local `.vercel` link points to a separate project, so GitHub commit statuses are the authority for this repository's deployment URLs.
