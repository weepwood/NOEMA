import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
await fs.mkdir('artifacts',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8000/');await page.locator('.m-tile').first().waitFor();
 await page.waitForTimeout(500);await page.screenshot({path:'artifacts/demo.png'});
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const x=c.getContext('2d');x.fillStyle='#456789';x.fillRect(0,0,320,240);return c.toDataURL().split(',')[1]});
 await page.locator('#fileInput').setInputFiles(Array.from({length:24},(_,i)=>({name:'photo-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})));
 await page.locator('#app.local-collection').waitFor();
 const tile=page.locator('.m-tile').first();await tile.focus();await page.keyboard.press('Enter');
 await page.locator('.m-tile[aria-expanded="true"]').waitFor();
 await page.keyboard.press('i');await page.locator('#inspector').waitFor();
 assert.equal(await page.locator('.m-tile[aria-expanded="true"]').count(),1);
 await page.keyboard.press('Escape');await page.locator('#inspector').waitFor({state:'hidden'});
 assert.equal(await page.locator('.m-tile[aria-expanded="true"]').count(),1);
 await page.screenshot({path:'artifacts/local-focus.png'});
 await page.keyboard.press('Escape');
 const frames=await page.evaluate(async()=>{let times=[],previous=performance.now();for(let i=0;i<240;i++){await new Promise(requestAnimationFrame);const now=performance.now();times.push(now-previous);previous=now;if(i%12===0)document.getElementById(i%24===0?'plusBtn':'minusBtn').click()}return times});
 const sorted=frames.slice().sort((a,b)=>a-b);await fs.writeFile('artifacts/frame-report.json',JSON.stringify({frames:frames.length,p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...frames),over33ms:frames.filter(x=>x>33.4).length,errors},null,2));
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'artifacts/local-wall.png'});
 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 await mobile.goto('http://127.0.0.1:8000/');await mobile.locator('.m-tile').first().waitFor();await mobile.screenshot({path:'artifacts/mobile.png'});
}finally{await browser.close()}
