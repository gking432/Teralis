/**
 * Build the city catalog.
 *
 * v1 sells city prints, so the catalog has to cover the places people search
 * for and the places we advertise: the largest city in every state plus the
 * major metros. Coordinates come from the bundled 2025 US places dataset
 * rather than being typed by hand, so no product page can point at the wrong
 * patch of ground.
 *
 * Output: src/data/us_cities.json. Run with `npm run gen-cities`.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const places = JSON.parse(readFileSync('src/data/us_places_2025.json', 'utf8'));

/**
 * Curated list: [city, state postal, framing radius in miles].
 * The radius is the half-width of the printed frame, chosen by how far the
 * built-up area actually runs — a Manhattan-sized crop of Houston would be
 * meaningless, and a 12-mile crop of Burlington would be mostly farmland.
 */
const CITIES = [
  ['New York', 'NY', 10], ['Brooklyn', 'NY', 6], ['Buffalo', 'NY', 6],
  ['Los Angeles', 'CA', 12], ['San Francisco', 'CA', 6], ['San Diego', 'CA', 9],
  ['San Jose', 'CA', 8], ['Sacramento', 'CA', 7], ['Oakland', 'CA', 5],
  ['Chicago', 'IL', 10], ['Springfield', 'IL', 5],
  ['Houston', 'TX', 12], ['Dallas', 'TX', 10], ['Austin', 'TX', 9],
  ['San Antonio', 'TX', 10], ['Fort Worth', 'TX', 9], ['El Paso', 'TX', 8],
  ['Phoenix', 'AZ', 11], ['Tucson', 'AZ', 8], ['Scottsdale', 'AZ', 7],
  ['Philadelphia', 'PA', 8], ['Pittsburgh', 'PA', 7],
  ['Jacksonville', 'FL', 11], ['Miami', 'FL', 7], ['Tampa', 'FL', 8],
  ['Orlando', 'FL', 8], ['St. Petersburg', 'FL', 7],
  ['Columbus', 'OH', 9], ['Cleveland', 'OH', 7], ['Cincinnati', 'OH', 7],
  ['Indianapolis', 'IN', 9], ['Fort Wayne', 'IN', 6],
  ['Charlotte', 'NC', 9], ['Raleigh', 'NC', 8], ['Asheville', 'NC', 5],
  ['Seattle', 'WA', 7], ['Spokane', 'WA', 6], ['Tacoma', 'WA', 5],
  ['Denver', 'CO', 8], ['Colorado Springs', 'CO', 8], ['Boulder', 'CO', 4],
  ['Boston', 'MA', 6], ['Worcester', 'MA', 5],
  ['Detroit', 'MI', 8], ['Grand Rapids', 'MI', 6], ['Ann Arbor', 'MI', 5],
  ['Nashville', 'TN', 10], ['Memphis', 'TN', 9], ['Knoxville', 'TN', 6],
  ['Portland', 'OR', 8], ['Eugene', 'OR', 5],
  ['Las Vegas', 'NV', 9], ['Reno', 'NV', 6],
  ['Milwaukee', 'WI', 7], ['Madison', 'WI', 6], ['Green Bay', 'WI', 5],
  ['Baltimore', 'MD', 7], ['Annapolis', 'MD', 4],
  ['Albuquerque', 'NM', 9], ['Santa Fe', 'NM', 5],
  ['Kansas City', 'MO', 9], ['St. Louis', 'MO', 7], ['Springfield', 'MO', 5],
  ['Atlanta', 'GA', 8], ['Savannah', 'GA', 5],
  ['Omaha', 'NE', 8], ['Lincoln', 'NE', 6],
  ['Minneapolis', 'MN', 7], ['St. Paul', 'MN', 6], ['Duluth', 'MN', 5],
  ['New Orleans', 'LA', 7], ['Baton Rouge', 'LA', 6],
  ['Honolulu', 'HI', 6], ['Anchorage', 'AK', 8],
  ['Salt Lake City', 'UT', 7], ['Provo', 'UT', 5],
  ['Boise', 'ID', 7], ['Louisville', 'KY', 8], ['Lexington', 'KY', 6],
  ['Oklahoma City', 'OK', 10], ['Tulsa', 'OK', 8],
  ['Little Rock', 'AR', 6], ['Birmingham', 'AL', 7], ['Huntsville', 'AL', 7],
  ['Jackson', 'MS', 6], ['Charleston', 'SC', 6], ['Columbia', 'SC', 6],
  ['Des Moines', 'IA', 7], ['Cedar Rapids', 'IA', 5],
  ['Wichita', 'KS', 8], ['Richmond', 'VA', 7], ['Virginia Beach', 'VA', 8],
  ['Charleston', 'WV', 5], ['Billings', 'MT', 6], ['Missoula', 'MT', 5],
  ['Fargo', 'ND', 5], ['Sioux Falls', 'SD', 6],
  ['Portland', 'ME', 5], ['Burlington', 'VT', 4], ['Manchester', 'NH', 5],
  ['Providence', 'RI', 5], ['Hartford', 'CT', 5], ['New Haven', 'CT', 5],
  ['Newark', 'NJ', 5], ['Jersey City', 'NJ', 4],
  ['Wilmington', 'DE', 5], ['Cheyenne', 'WY', 5], ['Jackson', 'WY', 3],
  ['Washington', 'DC', 6],
];

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

/**
 * Consolidated city-counties whose census centroid is nowhere near downtown.
 * Anchorage's "place" spans 1,900 square miles, so its centroid lands in the
 * mountains and an 8-mile crop would miss the city entirely. These are the
 * downtown coordinates a customer actually means.
 */
const DOWNTOWN_OVERRIDES = {
  'anchorage-ak': [-149.8631, 61.2181],
  'jacksonville-fl': [-81.6557, 30.3322],
  'louisville-ky': [-85.7585, 38.2527],
  'indianapolis-in': [-86.1581, 39.7684],
  'nashville-tn': [-86.7816, 36.1627],
  'oklahoma-city-ok': [-97.5164, 35.4676],
  'kansas-city-mo': [-94.5786, 39.0997],
  'columbus-ga': [-84.9877, 32.4610],
  'honolulu-hi': [-157.8583, 21.3069],
  'butte-mt': [-112.5348, 46.0038],
  'new-orleans-la': [-90.0715, 29.9511],
  'new-york-ny': [-73.9857, 40.7484],
  'chicago-il': [-87.6298, 41.8781],
  'boston-ma': [-71.0589, 42.3601],
  'denver-co': [-104.9903, 39.7392],
  // San Francisco's place includes the Farallon Islands, 30 miles offshore,
  // which drags its centroid into the Pacific.
  'san-francisco-ca': [-122.4194, 37.7749],
  'los-angeles-ca': [-118.2437, 34.0522],
  'san-diego-ca': [-117.1611, 32.7157],
  'virginia-beach-va': [-75.9779, 36.8529],
  'houston-tx': [-95.3698, 29.7604],
  'san-antonio-tx': [-98.4936, 29.4241],
  'phoenix-az': [-112.0740, 33.4484],
  'philadelphia-pa': [-75.1652, 39.9526],
  'atlanta-ga': [-84.3880, 33.7490],
  'seattle-wa': [-122.3321, 47.6062],
  'portland-or': [-122.6784, 45.5152],
  'detroit-mi': [-83.0458, 42.3314],
  'austin-tx': [-97.7431, 30.2672],
  'miami-fl': [-80.1918, 25.7617],
  'minneapolis-mn': [-93.2650, 44.9778],
};

const MILES_PER_LAT = 69.055;
const milesPerLon = (lat) => Math.cos((lat * Math.PI) / 180) * 69.172;

function findPlace(name, postal) {
  const variants = [name, name.replace('St. ', 'Saint '), name.replace('St. ', 'St ')];
  for (const variant of variants) {
    const exact = places.find((p) => p.s === postal && p.n === variant);
    if (exact) return exact;
  }
  // Census composite names: "Nashville-Davidson metropolitan government…"
  const prefixed = places.find((p) => p.s === postal && p.n.startsWith(name));
  if (prefixed) return prefixed;
  return places.find((p) => p.s === postal && p.n.includes(name)) ?? null;
}

const seen = new Set();
const out = [];
const missing = [];

for (const [name, postal, radius] of CITIES) {
  const place = findPlace(name, postal);
  if (!place) { missing.push(`${name}, ${postal}`); continue; }

  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${postal.toLowerCase()}`;
  if (seen.has(slug)) continue;
  seen.add(slug);

  const override = DOWNTOWN_OVERRIDES[slug];
  const lng = override ? override[0] : place.lng;
  const lat = override ? override[1] : place.lat;
  const latDelta = radius / MILES_PER_LAT;
  const lngDelta = radius / milesPerLon(lat);
  out.push({
    slug,
    name,
    state: STATE_NAMES[postal],
    postal,
    center: [Number(lng.toFixed(5)), Number(lat.toFixed(5))],
    bbox: [
      Number((lat - latDelta).toFixed(5)),
      Number((lat + latDelta).toFixed(5)),
      Number((lng - lngDelta).toFixed(5)),
      Number((lng + lngDelta).toFixed(5)),
    ],
    radiusMiles: radius,
    anchor: override ? 'downtown' : 'census',
  });
}

out.sort((a, b) => a.name.localeCompare(b.name) || a.postal.localeCompare(b.postal));
writeFileSync('src/data/us_cities.json', JSON.stringify(out, null, 0));

console.log(`wrote ${out.length} cities across ${new Set(out.map((c) => c.postal)).size} states/territories`);
if (missing.length) console.log(`NOT FOUND (${missing.length}): ${missing.join(' · ')}`);
