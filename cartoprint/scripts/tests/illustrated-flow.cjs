const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.TERRALIS_TEST_URL||'http://localhost:3000';
 const ready=()=>page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Choose size & frame'&&!b.disabled),{},{timeout:60000});
 const scene=()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('teralis:print-scene')));
 for(const [slug,orientation] of [['madison-wi','landscape'],['wisconsin','portrait'],['tennessee','landscape']]){
  await page.goto(`${base}/maps/${slug}?edition=illustrated`);await ready();assert.equal((await scene()).region.theme,'illustrated');assert.equal((await scene()).orientation,orientation);
  assert(await page.locator('.place-stage img').evaluate(i=>i.complete&&i.naturalWidth>0));
  await page.getByText('Edit wording',{exact:true}).click();await page.getByRole('textbox',{name:'Title',exact:true}).fill('Our favorite place');await page.waitForTimeout(500);
  await page.reload();await ready();assert.equal((await scene()).title.text,'Our favorite place');
  await page.screenshot({path:`/tmp/${slug}-illustrated.png`});
  await page.getByRole('button',{name:'Inspect print ↗'}).click();await page.getByRole('dialog').getByRole('img').waitFor({timeout:45000});await page.getByRole('button',{name:'Magnify',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('button',{name:'Choose size & frame',exact:true}).click();await page.waitForURL('**/size?**',{timeout:45000});assert(page.url().includes(`o=${orientation}`));
  if(slug==='madison-wi'){await page.goBack();await ready();await page.getByRole('button',{name:'Gallery',exact:true}).click();await ready();assert.notEqual((await scene()).region.theme,'illustrated');}
  console.log('PASS illustration, title persistence, inspector and proof',slug);
 }
 await page.goto(`${base}/maps/wisconsin?edition=detailed`);await ready();assert.equal((await scene()).region.theme,'detailed');assert.equal((await scene()).detail.places,'more');assert.equal((await scene()).detail.rivers,true);
 await page.getByRole('button',{name:'Inspect print ↗'}).click();const img=page.getByRole('dialog').getByRole('img');await img.waitFor({timeout:60000});
 const proof=await img.getAttribute('src');fs.writeFileSync('/tmp/wisconsin-detailed-proof.png',Buffer.from(proof.split(',')[1],'base64'));
 if(process.env.UPDATE_MARKETING_ART==='1')fs.writeFileSync('public/thumbnails/wisconsin-landscape-atlas.png',Buffer.from(proof.split(',')[1],'base64'));
 await page.getByRole('button',{name:'Close',exact:true}).click();await page.screenshot({path:'/tmp/wisconsin-detailed.png'});
 await page.getByRole('button',{name:/Street Atlas Roads/}).click();await ready();assert.equal((await scene()).region.theme,'atlas');
 await page.setViewportSize({width:390,height:844});await page.goto(base);await page.getByRole('link',{name:/Wisconsin in ink/}).click();await ready();assert.equal((await scene()).region.theme,'illustrated');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'/tmp/wisconsin-illustrated-mobile.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS Landscape Atlas, edition switching, homepage entry and mobile layout');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
