// Legacy landmark URLs and saved designs now open the illustrated city composition.
const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch();try{const page=await browser.newPage();const base=process.env.TERRALIS_TEST_URL||'http://localhost:3000';
await page.goto(`${base}/maps/madison-wi?edition=landmarks`);
await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('teralis:print-scene'))?.region.theme==='illustrated');
await page.waitForFunction(()=>new URL(location.href).searchParams.has('d'));
const url=new URL(page.url());const packed=JSON.parse(Buffer.from(url.searchParams.get('d'),'base64url').toString());packed.rg={theme:'landmarks'};packed.o='portrait';packed.t[0]='Our Madison';url.searchParams.set('d',Buffer.from(JSON.stringify(packed)).toString('base64url'));
await page.goto(url.toString());await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('teralis:print-scene'))?.title.text==='Our Madison');
const scene=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('teralis:print-scene')));assert.equal(scene.region.theme,'illustrated');assert.equal(scene.orientation,'landscape');assert.equal(scene.detail.border,'none');assert.equal(scene.colors.water,'#8b3c25');assert.equal(await page.getByRole('button',{name:/Landmark Map Real/}).count(),0);
console.log('PASS old landmark URL and saved design migrate to aerial artwork with caption intact');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
