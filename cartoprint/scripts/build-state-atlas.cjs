// Export one cacheable GeoJSON per state from the bundled place datasets.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const states = {"AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"};
states.DC = 'District of Columbia';
const places = [...require('../src/data/us_places_2025.json'), ...require('../src/data/us_townships_2025.json')];
fs.mkdirSync(path.join(root, 'public/atlas-places'), { recursive: true });
for (const [code, name] of Object.entries(states)) {
 const features = places.filter(p => p.s === code).map(p => ({ type: 'Feature', properties: { name: p.n, kind: p.k, rank: p.k === 'city' ? 0 : p.k === 'township' ? 2 : 1 }, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }));
 fs.writeFileSync(path.join(root, 'public/atlas-places', name.toLowerCase().replaceAll(' ', '-') + '.json'), JSON.stringify({ type: 'FeatureCollection', features }));
}
