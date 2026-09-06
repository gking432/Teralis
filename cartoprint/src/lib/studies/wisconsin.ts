'use client';
import maplibregl from 'maplibre-gl';
import { STYLE_URL, addTerrain } from '@/lib/map/style';
import { fetchBoundary } from '@/lib/print/boundaryCache';
import { fetchDetailedStateFeatures } from '@/lib/print/stateDetails';
import { addDetailedStateFeatures } from '@/lib/print/printRender';

/** Art-direction study only. Does not change any purchasable print scene. */
export async function renderWisconsinStudy(): Promise<string> {
  const W = 1800, H = 2400, mapW = 1600, mapH = 1700;
  const paper = '#f3efe2', ink = '#263f3c', water = '#8fb5b2';
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-20000px;width:${mapW}px;height:${mapH}px;`;
  document.body.appendChild(host);
  const map = new maplibregl.Map({ container: host, style: STYLE_URL, preserveDrawingBuffer: true, interactive: false, attributionControl: false, fadeDuration: 0 });
  try {
    const boundaryTask = fetchBoundary('wisconsin', [-89.8, 44.6], 'state');
    const placesTask = fetch('/atlas-places/wisconsin.json').then(r => r.json()) as Promise<GeoJSON.FeatureCollection<GeoJSON.Point>>;
    await new Promise<void>((resolve, reject) => { map.once('load', () => resolve()); setTimeout(() => reject(new Error('Map style could not load')), 25000); });
    const boundary = await boundaryTask;
    if (!boundary) throw new Error('Wisconsin boundary could not load');
    // Draw land/water from the base tiles, keeping all source coordinates intact.
    for (const layer of map.getStyle().layers) {
      if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#e6e8dc');
      else if (layer.type === 'fill' && /water/.test(layer.id)) {
        map.setPaintProperty(layer.id, 'fill-color', water);
        map.setPaintProperty(layer.id, 'fill-opacity', 1);
      } else map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
    map.addSource('study-state', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: boundary.geometry } });
    const firstWater = map.getStyle().layers.find(l => l.type === 'fill' && /water/.test(l.id))?.id;
    map.addLayer({ id: 'study-land', type: 'fill', source: 'study-state', paint: { 'fill-color': paper } }, firstWater);
    addTerrain(map);
    map.moveLayer('hillshade-layer', firstWater);
    map.setLayoutProperty('hillshade-layer', 'visibility', 'visible');
    map.setPaintProperty('hillshade-layer', 'hillshade-exaggeration', 1);
    map.setPaintProperty('hillshade-layer', 'hillshade-shadow-color', '#6e7661');
    map.setPaintProperty('hillshade-layer', 'hillshade-highlight-color', '#fffcf0');
    map.setPaintProperty('hillshade-layer', 'hillshade-accent-color', '#a7a385');
    const details = await fetchDetailedStateFeatures(['42.49','47.31','-92.9','-86.2'], boundary.geometry);
    addDetailedStateFeatures(map, details, { land: paper, water, roads: ink });
    map.setLayoutProperty('print-state-detail-roads', 'visibility', 'none');
    map.setLayoutProperty('print-state-detail-county-boundaries', 'visibility', 'none');
    map.setPaintProperty('print-state-detail-rivers', 'line-color', '#6c9691');
    map.setPaintProperty('print-state-detail-rivers', 'line-opacity', .6);
    map.setPaintProperty('print-state-detail-rivers', 'line-width', 1.3);
    map.setFilter('print-state-detail-rivers', ['all', ['==', ['get','kind'], 'river'], ['match', ['get','class'], ['river','canal'], true, false]]);
    map.setPaintProperty('print-state-detail-lakes', 'fill-color', water);
    map.setPaintProperty('print-state-detail-lakes', 'fill-opacity', .9);
    map.addLayer({ id: 'study-edge', type: 'line', source: 'study-state', paint: { 'line-color': '#8a9482', 'line-width': 1.3, 'line-opacity': .7 } });
    const places = await placesTask;
    const major = ['Milwaukee','Madison','Green Bay','Eau Claire','La Crosse','Wausau','Duluth','Superior','Appleton','Oshkosh','Racine','Kenosha'];
    const secondary = ['Bayfield','Ashland','Hayward','Spooner','Rhinelander','Minocqua','Eagle River','Marinette','Sturgeon Bay','Fish Creek','Egg Harbor','Manitowoc','Sheboygan','Fond du Lac','Stevens Point','Wisconsin Rapids','Marshfield','Chippewa Falls','Rice Lake','Hudson','River Falls','Prairie du Chien','Baraboo','Portage','Wisconsin Dells','Spring Green','Mineral Point','Platteville','Monroe','Janesville','Beloit','Lake Geneva','West Bend','Waukesha','Menomonie'];
    const features = places.features.filter(p => p.properties?.kind !== 'township' && !(p.properties?.name === 'Superior' && p.properties?.kind !== 'city')).map(p => ({...p, properties: {...p.properties, tier: major.includes(p.properties?.name) ? 0 : secondary.includes(p.properties?.name) ? 1 : 2 }}));
    map.addSource('study-places', { type: 'geojson', data: { type:'FeatureCollection', features } });
    map.addLayer({ id: 'study-dots', type: 'circle', source: 'study-places', filter: ['<', ['get','tier'], 2], paint: { 'circle-color': ink, 'circle-radius': ['case', ['==',['get','tier'],0],3.5,2], 'circle-stroke-color': paper, 'circle-stroke-width': 1.5 } });
    map.addLayer({ id: 'study-names', type: 'symbol', source: 'study-places', filter: ['>', ['get','tier'], 0], layout: { 'text-field': ['get','name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['match',['get','tier'],0,21,1,16,11], 'symbol-sort-key': ['get','tier'], 'text-variable-anchor': ['right','left','top','bottom'], 'text-radial-offset': .55, 'text-padding': 7, 'text-allow-overlap': false }, paint: { 'text-color': ['match',['get','tier'],0,ink,1,'#48635b','#7c8675'], 'text-halo-color':paper, 'text-halo-width':1.3 } });
    map.addLayer({ id: 'study-major-names', type: 'symbol', source: 'study-places', filter: ['==', ['get','tier'], 0], layout: { 'text-field': ['get','name'], 'text-font': ['Noto Sans Regular'], 'text-size': 21, 'text-anchor': 'right', 'text-offset': [-.6, 0], 'text-allow-overlap': true }, paint: { 'text-color': ink, 'text-halo-color': paper, 'text-halo-width': 2 } });
    map.fitBounds([[-93.05,42.08],[-86.05,47.38]], { padding: 25, duration:0 });
    await new Promise<void>((resolve, reject) => { const t = setTimeout(() => reject(new Error('Study map tiles did not finish')), 45000); map.once('idle', () => {clearTimeout(t);resolve();}); map.triggerRepaint(); });
    await document.fonts.ready;
    const canvas = document.createElement('canvas'); canvas.width=W; canvas.height=H;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=paper;ctx.fillRect(0,0,W,H);
    ctx.drawImage(map.getCanvas(),100,450,mapW,mapH);
    const serif=getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
    const sans=getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim();
    ctx.fillStyle=ink;
    ctx.font=`500 24px ${sans}`;ctx.letterSpacing='5px';ctx.fillText('LAND & WATER',110,140);
    ctx.letterSpacing='-4px';ctx.font=`500 190px ${serif}`;ctx.fillText('Wisconsin',100,328);
    ctx.letterSpacing='0px';ctx.font=`400 27px ${sans}`;ctx.fillStyle='#60726a';ctx.fillText('Great Lakes. Northern woods. River country.',110,392);
    // Water lettering is anchored to the same geographic camera as the map.
    function waterName(name: string, lng:number, lat:number, rotation:number, size:number) {
      const p=map.project([lng,lat]);ctx.save();ctx.translate(p.x+100,p.y+450);ctx.rotate(rotation);ctx.font=`italic 500 ${size}px ${serif}`;ctx.textAlign='center';ctx.letterSpacing='3px';ctx.fillStyle='#416c69';ctx.fillText(name,0,0);ctx.restore();
    }
    waterName('Lake Superior',-89.9,47.12,-.06,46);
    waterName('Lake Michigan',-86.65,44.1,-Math.PI/2,43);
    ctx.strokeStyle='#c6cbbd';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(110,2232);ctx.lineTo(1690,2232);ctx.stroke();
    ctx.letterSpacing='2px';ctx.font=`500 19px ${sans}`;ctx.fillStyle=ink;ctx.fillText('WISCONSIN  /  UNITED STATES',110,2295);
    ctx.textAlign='right';ctx.letterSpacing='0px';ctx.font=`italic 400 29px ${serif}`;ctx.fillText('The places we call home.',1690,2295);
    return canvas.toDataURL('image/png');
  } finally { map.remove();host.remove(); }
}
