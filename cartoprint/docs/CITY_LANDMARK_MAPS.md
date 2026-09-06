> Superseded by the illustrated aerial composition in MADISON_AERIAL_ART.md. The notes below document the retired map-symbol prototype.

# City Landmark Maps

Madison is the first prototype at `/maps/madison-wi?edition=landmarks`. Its north-up streets and shorelines use the existing OpenFreeMap / OpenStreetMap renderer. Three original, code-drawn map symbols mark the State Capitol, Memorial Union Terrace and James Madison Park. These are location symbols, not scaled building footprints. No generated image supplies the city's geography.

Landmarks are geographic point features with coordinates in `src/lib/print/cityLandmarks.ts`. The icon's bottom point anchors at its coordinate; layout collision checks prevent overlapping symbols and captions. The same layer function runs in the live canvas and the exported proof, using the shared print stroke scale. Ink and paper follow the selected palette. Choosing a regular city version hides the landmark layer.

Sources checked for the prototype:
- Capitol coordinate record: https://www.wikidata.org/wiki/Q2915273 and https://mapcarta.com/22904590
- UW Memorial Union address and lakefront location: https://union.wisc.edu/about/contact and https://conferences.union.wisc.edu/ngptmeetings/meeting-site/
- James Madison Park plan: https://www.cityofmadison.com/parks/documents/projects/James%20Madison%20Park%20DRAFT%20Master%20Plan%20Report%20and%20AppendicesREDUCED.pdf

Coordinates mark the site approximately, not entrances or surveyed architectural footprints. Review site placement against the map when adding or revising symbols. Add new cities only with a curated coordinate list and relevant original symbols, not invented buildings or random trees.

The old Madison bird's-eye raster is no longer registered or referenced by the homepage or customizer. Its file remains for historical reference. Old `edition=illustrated` URLs and saved Madison illustrated scenes resolve to the landmark theme. Wisconsin and Tennessee's saved illustrations are unchanged.

The homepage thumbnail is captured from the actual 2400px print proof. Run `UPDATE_MARKETING_ART=1 node scripts/tests/city-landmarks.cjs` to regenerate it. Without that flag, the test checks entry migration, geographic source placement (dev), caption and palette persistence, edition switching, proof handoff and mobile discovery without editing assets.
