const { chromium }=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>console.error(e.message));
 await page.goto('http://localhost:3000/studies/wisconsin');
 await page.getByText('Study notes',{exact:true}).click();
 await page.getByRole('button',{name:'Render study from map data',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#study-print')?.getAttribute('src').startsWith('data:'),{},{timeout:120000});
 const src=await page.locator('#study-print').getAttribute('src');
 fs.writeFileSync(path.resolve(__dirname,'../../public/studies/wisconsin-land-water.png'),Buffer.from(src.split(',')[1],'base64'));
 console.log('Saved Wisconsin study');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
