import type maplibregl from 'maplibre-gl';
import type { PrintScene } from './scene';
import { getPrintInkColor } from './colorSchemes';
import { strokeScaleFor } from './strokes';

export const CITY_LANDMARKS = {
  'madison-wi': [
    { name: 'State Capitol', icon: 'capitol', coordinates: [-89.38417, 43.07469] },
    { name: 'Memorial Union Terrace', icon: 'terrace', coordinates: [-89.4000, 43.0769] },
    { name: 'James Madison Park', icon: 'trees', coordinates: [-89.38319, 43.08126] },
  ],
};
export function hasCityLandmarks(slug: string) { return slug in CITY_LANDMARKS; }
const SOURCE = 'city-landmark-illustrations';

/** Small original line-drawn symbols. Their bottom point is the geographic anchor. */
function symbol(icon: string, ink: string, paper: string) {
  const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 240;
  const ctx = canvas.getContext('2d')!; ctx.scale(2.4, 2.4);
  ctx.strokeStyle = ink; ctx.fillStyle = paper; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const draw = (d: string, fill = false) => { const p = new Path2D(d); if (fill) ctx.fill(p); ctx.save(); ctx.strokeStyle = paper; ctx.lineWidth = 4; ctx.stroke(p); ctx.restore(); ctx.stroke(p); };
  if (icon === 'capitol') {
    draw('M12 84V62H32V53H68V62H88V84Z', true);
    draw('M32 53Q34 31 47 29V23H53V29Q66 31 68 53Z', true);
    draw('M47 23V18H53V23M50 18V12M39 51Q40 35 48 31M61 51Q60 35 52 31M30 58H70M9 85H91M14 89H86');
    for (const x of [19,25,39,46,54,61,75,81]) draw(`M${x} 66V80`);
    draw('M47 83V72Q50 68 53 72V83');
  } else if (icon === 'terrace') {
    draw('M33 57V37C33 16 67 16 67 37V57Z', true);
    draw('M33 48H67M28 60H72L68 65H32ZM35 65L29 87M65 65L71 87M50 45V25M37 30L48 44M63 30L52 44M34 39L47 46M66 39L53 46');
    draw('M15 90H85');
  } else {
    draw('M21 79V68M73 82V68M47 86V70');
    draw('M8 68L21 49L14 49L25 33L35 49H29L42 68Z', true);
    draw('M56 68L68 50H62L75 29L86 50H80L94 68Z', true);
    draw('M30 71L44 51H37L50 27L63 51H56L70 71Z', true);
    draw('M14 88Q48 83 85 89');
  }
  draw('M50 91V97'); ctx.beginPath();ctx.arc(50,98,1.2,0,Math.PI*2);ctx.fillStyle=ink;ctx.fill();
  return ctx.getImageData(0,0,240,240);
}

/** Shared live/export map layer; geography never comes from an image model. */
export function applyCityLandmarks(map: maplibregl.Map, scene: PrintScene) {
  const active = scene.region.theme === 'landmarks' && hasCityLandmarks(scene.place.slug);
  if (!active) { if (map.getLayer(SOURCE)) map.setLayoutProperty(SOURCE,'visibility','none'); return; }
  const ink = getPrintInkColor(scene.colors); const paper = scene.colors.land;
  const places = CITY_LANDMARKS[scene.place.slug as keyof typeof CITY_LANDMARKS];
  for (const place of places) {
    const id = `city-drawing-${place.icon}`; const pixels = symbol(place.icon,ink,paper);
    if (map.hasImage(id)) map.updateImage(id,pixels); else map.addImage(id,pixels,{pixelRatio:2.4});
  }
  if (!map.getSource(SOURCE)) map.addSource(SOURCE,{type:'geojson',data:{type:'FeatureCollection',features:places.map(p=>({type:'Feature',properties:{name:p.name,icon:`city-drawing-${p.icon}`},geometry:{type:'Point',coordinates:p.coordinates}}))}});
  if (!map.getLayer(SOURCE)) map.addLayer({id:SOURCE,type:'symbol',source:SOURCE,layout:{
    'icon-image':['get','icon'],'icon-anchor':'bottom','icon-allow-overlap':false,
    'text-field':['get','name'],'text-font':['Noto Sans Regular'],'text-anchor':'top','text-offset':[0,.4],
    'text-allow-overlap':false,'text-max-width':12,
  }});
  const scale=strokeScaleFor(map.getCanvas().clientWidth).widthScale;
  map.setLayoutProperty(SOURCE,'visibility','visible');
  map.setLayoutProperty(SOURCE,'icon-size',.65*scale);
  map.setLayoutProperty(SOURCE,'text-size',12*scale);
  map.setPaintProperty(SOURCE,'text-color',ink);map.setPaintProperty(SOURCE,'text-halo-color',paper);map.setPaintProperty(SOURCE,'text-halo-width',1.5*scale);
  map.moveLayer(SOURCE);
}
