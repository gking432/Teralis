/**
 * Generate the automatic doodle backbone for every state print (and the
 * country print) from real geography:
 *
 *   trees     — U.S. national forests (bundled dataset of centroids)
 *   mountains — relief computed from AWS Terrain Tiles (terrarium encoding)
 *   waves     — named Natural Earth lakes inside the state
 *   star      — the state capital, located via the bundled places dataset
 *
 * Output: src/data/state_doodles.json, consumed by lib/print/decorations.ts.
 * Deterministic: same inputs, same output. Run with `npm run gen-doodles`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const offsetDeg = (span, factor, cap) => Math.min(span * factor, cap);

const TERRAIN_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

// --- inputs -----------------------------------------------------------------
const printsSource = readFileSync('src/lib/catalog/prints.ts', 'utf8');
const statePolygons = JSON.parse(readFileSync('src/data/us_states_50m.json', 'utf8'));
const forests = JSON.parse(readFileSync('src/data/us_national_forests.json', 'utf8')).forests;
const lakesData = JSON.parse(readFileSync('src/data/ne_50m_lakes.json', 'utf8'));
const places = JSON.parse(readFileSync('src/data/us_places_2025.json', 'utf8'));

const CAPITALS = {
  alabama: 'Montgomery', alaska: 'Juneau', arizona: 'Phoenix', arkansas: 'Little Rock',
  california: 'Sacramento', colorado: 'Denver', connecticut: 'Hartford', delaware: 'Dover',
  florida: 'Tallahassee', georgia: 'Atlanta', hawaii: 'Honolulu', idaho: 'Boise',
  illinois: 'Springfield', indiana: 'Indianapolis', iowa: 'Des Moines', kansas: 'Topeka',
  kentucky: 'Frankfort', louisiana: 'Baton Rouge', maine: 'Augusta', maryland: 'Annapolis',
  massachusetts: 'Boston', michigan: 'Lansing', minnesota: 'Saint Paul', mississippi: 'Jackson',
  missouri: 'Jefferson City', montana: 'Helena', nebraska: 'Lincoln', nevada: 'Carson City',
  'new-hampshire': 'Concord', 'new-jersey': 'Trenton', 'new-mexico': 'Santa Fe', 'new-york': 'Albany',
  'north-carolina': 'Raleigh', 'north-dakota': 'Bismarck', ohio: 'Columbus', oklahoma: 'Oklahoma City',
  oregon: 'Salem', pennsylvania: 'Harrisburg', 'rhode-island': 'Providence', 'south-carolina': 'Columbia',
  'south-dakota': 'Pierre', tennessee: 'Nashville', texas: 'Austin', utah: 'Salt Lake City',
  vermont: 'Montpelier', virginia: 'Richmond', washington: 'Olympia', 'west-virginia': 'Charleston',
  wisconsin: 'Madison', wyoming: 'Cheyenne', 'district-of-columbia': 'Washington',
};

// --- parse state prints out of the catalog ----------------------------------
const statePrints = [];
const re = /createCatalogPrint\(\{\s*slug: '([a-z-]+)', name: '[^']+', kind: 'state', bbox: \[([-\d.,\s]+)\]/g;
let m;
while ((m = re.exec(printsSource))) {
  const [south, north, west, east] = m[2].split(',').map(Number);
  statePrints.push({ slug: m[1], bbox: [south, north, west, east] });
}
// multi-line DC entry
if (!statePrints.some((s) => s.slug === 'district-of-columbia')) {
  statePrints.push({ slug: 'district-of-columbia', bbox: [38.791, 38.996, -77.119, -76.91] });
}
console.log(`state prints parsed: ${statePrints.length}`);

// --- geometry helpers -------------------------------------------------------
function ringContains(ring, lng, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function polygonContains(geometry, lng, lat) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.some((poly) => ringContains(poly[0], lng, lat) && !poly.slice(1).some((hole) => ringContains(hole, lng, lat)));
}
function lakeVertices(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.flatMap((poly) => poly[0]);
}
function shoelace(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(area / 2);
}
function lakeArea(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.reduce((sum, poly) => sum + shoelace(poly[0]), 0);
}
function hashRotation(seed, spread = 8) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % (spread * 2 + 1)) - spread);
}

// --- terrain sampling -------------------------------------------------------
const tileCache = new Map();
async function fetchTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const resp = await fetch(TERRAIN_URL(z, x, y));
  if (!resp.ok) { tileCache.set(key, null); return null; }
  const buf = Buffer.from(await resp.arrayBuffer());
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const tile = { data, width: info.width, height: info.height, channels: info.channels };
  tileCache.set(key, tile);
  return tile;
}
const lon2tileX = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2tileY = (lat, z) => ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z;
const tileX2lon = (x, z) => (x / 2 ** z) * 360 - 180;
const tileY2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/** Relief grid over a bbox: for each cell, min/max elevation from terrarium pixels. */
async function reliefGrid(bbox, contains) {
  const [south, north, west, east] = bbox;
  const span = Math.max(east - west, north - south);
  const z = Math.max(4, Math.min(8, Math.floor(Math.log2(1440 / span))));
  const gridN = 18;
  const cells = Array.from({ length: gridN * gridN }, () => []);
  const x0 = Math.floor(lon2tileX(west, z));
  const x1 = Math.floor(lon2tileX(east, z));
  const y0 = Math.floor(lat2tileY(north, z));
  const y1 = Math.floor(lat2tileY(south, z));
  let tiles = 0;
  for (let tx = x0; tx <= x1 && tiles < 40; tx++) {
    for (let ty = y0; ty <= y1 && tiles < 40; ty++) {
      const tile = await fetchTile(z, tx, ty);
      tiles++;
      if (!tile) continue;
      const step = 2;
      for (let py = 0; py < tile.height; py += step) {
        const lat = tileY2lat(ty + py / tile.height, z);
        if (lat < south || lat > north) continue;
        const row = Math.min(gridN - 1, Math.floor(((north - lat) / (north - south)) * gridN));
        for (let px = 0; px < tile.width; px += step) {
          const lon = tileX2lon(tx + px / tile.width, z);
          if (lon < west || lon > east) continue;
          const col = Math.min(gridN - 1, Math.floor(((lon - west) / (east - west)) * gridN));
          const i = (py * tile.width + px) * tile.channels;
          const elev = tile.data[i] * 256 + tile.data[i + 1] + tile.data[i + 2] / 256 - 32768;
          if (elev < -0.5) continue; // water / bathymetry — only land relief counts
          cells[row * gridN + col].push(elev);
        }
      }
    }
  }
  const results = [];
  for (let row = 0; row < gridN; row++) {
    for (let col = 0; col < gridN; col++) {
      const cell = cells[row * gridN + col];
      if (cell.length < 30) continue;
      const lat = north - ((row + 0.5) / gridN) * (north - south);
      const lng = west + ((col + 0.5) / gridN) * (east - west);
      if (!contains(lng, lat)) continue;
      // p95 − p5 spread: SRTM spikes and seam artifacts cannot fake a range
      cell.sort((a, b) => a - b);
      const relief = cell[Math.floor(cell.length * 0.95)] - cell[Math.floor(cell.length * 0.05)];
      results.push({ lng, lat, relief });
    }
  }
  return results;
}

// --- assembly ---------------------------------------------------------------
const usLakes = lakesData.features.filter((f) => f.properties?.name && f.geometry);
const postalToSlug = Object.fromEntries(Object.entries(statePolygons).map(([slug, s]) => [s.postal, slug]));

function findCapital(slug) {
  const name = CAPITALS[slug];
  const postal = statePolygons[slug]?.postal;
  if (!name || !postal) return null;
  const variants = [name, name.replace('Saint ', 'St. '), name.replace('Saint ', 'St ')];
  for (const v of variants) {
    const hit = places.find((p) => p.s === postal && p.n === v)
      ?? places.find((p) => p.s === postal && p.n.startsWith(v))
      ?? places.find((p) => p.s === postal && p.n.includes(v));
    if (hit) return { name, lat: hit.lat, lng: hit.lng };
  }
  return null;
}

function spaced(items, minDist) {
  const chosen = [];
  for (const item of items) {
    if (chosen.every((c) => Math.hypot(c.lng - item.lng, c.lat - item.lat) >= minDist)) chosen.push(item);
  }
  return chosen;
}

async function generateFor(slug, bbox, { isCountry = false } = {}) {
  const [south, north, west, east] = bbox;
  const span = Math.max(east - west, north - south);
  const geometry = isCountry ? null : statePolygons[slug]?.geometry;
  const conus = Object.entries(statePolygons).filter(([s]) => s !== 'alaska' && s !== 'hawaii');
  const contains = isCountry
    ? (lng, lat) => conus.some(([, s]) => polygonContains(s.geometry, lng, lat))
    : (lng, lat) => (geometry ? polygonContains(geometry, lng, lat) : false);
  const out = [];
  const pad = span * 0.02;
  const inBbox = (lng, lat) => lng > west + pad && lng < east - pad && lat > south + pad && lat < north - pad;

  // trees — national forests
  const stateForests = (isCountry
    ? forests.filter((f) => f.size >= 2 && inBbox(f.lng, f.lat)).sort((a, b) => b.size - a.size).slice(0, 6)
    : forests.filter((f) => f.state === slug))
    .filter((f) => inBbox(f.lng, f.lat) && (isCountry || contains(f.lng, f.lat) || true));
  const chosenForests = spaced(stateForests.sort((a, b) => b.size - a.size), span * 0.11).slice(0, isCountry ? 5 : 4);
  chosenForests.forEach((f, i) => {
    out.push({ id: `${slug}-forest-${i + 1}`, kind: 'forest', lng: f.lng, lat: f.lat, size: 0.95 + f.size * 0.16, rotation: hashRotation(f.name, 6), layer: 'terrain' });
  });
  if (!isCountry && chosenForests[0]) {
    const f = chosenForests[0];
    out.push({ id: `${slug}-forest-label`, kind: 'text', lng: f.lng, lat: f.lat - offsetDeg(span, 0.055, 0.4), size: 0.6, rotation: hashRotation(f.name, 4), text: f.name.replace(/ National Forests?$/, ''), font: 'condensed', layer: 'terrain' });
  }

  // mountains / hills — relief
  const relief = await reliefGrid(bbox, contains);
  const sorted = relief.filter((c) => c.relief >= 240).sort((a, b) => b.relief - a.relief);
  const forestAnchors = chosenForests.map((f) => ({ lng: f.lng, lat: f.lat }));
  const terrainSpacing = span * (isCountry ? 0.09 : 0.17);
  const picked = [];
  for (const cell of sorted) {
    if (picked.length >= (isCountry ? 8 : 5)) break;
    if (!inBbox(cell.lng, cell.lat)) continue;
    if (picked.some((p) => Math.hypot(p.lng - cell.lng, p.lat - cell.lat) < terrainSpacing)) continue;
    if (forestAnchors.some((p) => Math.hypot(p.lng - cell.lng, p.lat - cell.lat) < span * 0.08)) continue;
    picked.push(cell);
  }
  if (picked.length === 0) {
    for (const cell of relief.filter((c) => c.relief >= 110).sort((a, b) => b.relief - a.relief)) {
      if (picked.length >= 2) break;
      if (!inBbox(cell.lng, cell.lat)) continue;
      if (picked.some((p) => Math.hypot(p.lng - cell.lng, p.lat - cell.lat) < terrainSpacing)) continue;
      if (forestAnchors.some((p) => Math.hypot(p.lng - cell.lng, p.lat - cell.lat) < span * 0.08)) continue;
      picked.push(cell);
    }
  }
  picked.forEach((cell, i) => {
    const mountain = cell.relief >= 750;
    out.push({
      id: `${slug}-${mountain ? 'mtn' : 'hills'}-${i + 1}`,
      kind: mountain ? 'mountains' : 'hills',
      lng: Math.round(cell.lng * 100) / 100,
      lat: Math.round(cell.lat * 100) / 100,
      size: mountain ? Math.min(1.42, 1.05 + cell.relief / 3200) : 1.0,
      rotation: hashRotation(`${slug}${i}`, 6),
      layer: 'terrain',
    });
  });

  // waves + lake labels — named NE lakes with vertices inside
  const candidates = [];
  for (const lake of usLakes) {
    const verts = lakeVertices(lake.geometry);
    const inside = verts.filter(([lng, lat]) => (isCountry ? inBbox(lng, lat) : contains(lng, lat) || false));
    const inBox = verts.filter(([lng, lat]) => inBbox(lng, lat));
    const rank = lake.properties.scalerank ?? 9;
    // Great Lakes touch the state without vertices strictly inside the land
    // polygon; accept top-rank lakes that clearly enter the bbox.
    const qualifies = inside.length >= 1 || (rank <= 1 && inBox.length >= 3);
    if (!qualifies || inBox.length === 0) continue;
    const anchor = inBox.reduce((acc, v) => [acc[0] + v[0], acc[1] + v[1]], [0, 0]).map((v) => v / inBox.length);
    candidates.push({ name: lake.properties.name, rank, area: lakeArea(lake.geometry), lng: anchor[0], lat: anchor[1] });
  }
  candidates.sort((a, b) => a.rank - b.rank || b.area - a.area);
  const minLakeArea = (span * span) * (isCountry ? 0.0012 : 0.0035);
  const bigLakes = spaced(candidates.filter((l) => l.area >= minLakeArea || l.rank <= 1), span * 0.14).slice(0, isCountry ? 3 : 3);
  bigLakes.forEach((lake, i) => {
    out.push({ id: `${slug}-waves-${i + 1}`, kind: 'waves', lng: Math.round(lake.lng * 100) / 100, lat: Math.round(lake.lat * 100) / 100, size: lake.rank <= 1 ? 1.12 : 0.95, rotation: hashRotation(lake.name, 4), layer: 'water' });
    out.push({ id: `${slug}-lake-label-${i + 1}`, kind: 'text', lng: Math.round(lake.lng * 100) / 100, lat: Math.round((lake.lat - offsetDeg(span, 0.045, 0.5)) * 100) / 100, size: lake.rank <= 1 ? 0.82 : 0.62, rotation: hashRotation(lake.name, 3), text: lake.name, font: 'hand', layer: 'water' });
  });

  // capital star + name
  const capital = isCountry ? null : findCapital(slug);
  const inRawBbox = (lng, lat) => lng > west && lng < east && lat > south && lat < north;
  if (capital && inRawBbox(capital.lng, capital.lat)) {
    out.push({ id: `${slug}-capital-star`, kind: 'star', lng: capital.lng, lat: capital.lat, size: 0.85, rotation: hashRotation(capital.name, 8), layer: 'landmarks' });
    out.push({ id: `${slug}-capital-label`, kind: 'text', lng: capital.lng, lat: capital.lat - offsetDeg(span, 0.05, 0.35), size: 0.68, rotation: 0, text: capital.name, font: 'condensed', layer: 'landmarks' });
  }
  if (isCountry) {
    const dc = findCapital('district-of-columbia');
    if (dc) {
      out.push({ id: `${slug}-capital-star`, kind: 'star', lng: dc.lng, lat: dc.lat, size: 0.8, rotation: 0, layer: 'landmarks' });
      out.push({ id: `${slug}-capital-label`, kind: 'text', lng: dc.lng, lat: dc.lat - span * 0.03, size: 0.6, rotation: 0, text: 'Washington, D.C.', font: 'condensed', layer: 'landmarks' });
    }
  }

  return out;
}

// --- run --------------------------------------------------------------------
const output = {};
for (const state of statePrints) {
  process.stdout.write(`${state.slug} … `);
  try {
    const decorations = await generateFor(state.slug, state.bbox);
    output[state.slug] = decorations;
    console.log(`${decorations.length} decorations`);
  } catch (error) {
    console.log(`FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
process.stdout.write('united-states … ');
output['united-states'] = await generateFor('united-states', [24.396, 49.384, -124.849, -66.885], { isCountry: true });
console.log(`${output['united-states'].length} decorations`);

writeFileSync('src/data/state_doodles.json', JSON.stringify(output, null, 0));
const total = Object.values(output).reduce((sum, list) => sum + list.length, 0);
console.log(`\nwrote src/data/state_doodles.json — ${Object.keys(output).length} regions, ${total} decorations`);
