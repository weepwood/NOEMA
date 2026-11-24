import { chromium,firefox,webkit } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const engine=process.env.NOEMA_BROWSER||'chromium',type={chromium,firefox,webkit}[engine];
const browser=await type.launch({headless:true}),out='artifacts/'+engine;
await fs.mkdir(out,{recursive:true});
const errors=[],fixture=await fs.mkdtemp(path.join(os.tmpdir(),'noema-fixture-'));
const assets=(await fs.readdir('assets')).filter(x=>/^poster-.*\.webp$/.test(x)).sort();
const count=Number(process.env.NOEMA_FILE_COUNT|| (engine==='chromium'?1200:48));
async function ready(page){await page.waitForFunction(()=>{const stage=document.getElementById('stage'),r=stage.getBoundingClientRect();if(stage.classList.contains('is-moving'))return false;const visible=[...stage.querySelectorAll('.m-tile')].filter(t=>{const q=t.getBoundingClientRect();return q.width>0&&q.height>0&&q.right>r.left&&q.bottom>r.top&&q.left<r.right&&q.top<r.bottom});return visible.length>0&&visible.every(t=>{const i=t.querySelector('img.low-res');return i&&i.complete&&i.naturalWidth>0&&i.classList.contains('loaded')})},undefined,{timeout:90000});await page.waitForTimeout(450)}
try{
 // Actual filesystem entries and encoded image data, repeated bundled image content.
 for(let i=0;i<count;i++)await fs.link(path.resolve('assets',assets[i%assets.length]),path.join(fixture,'photo-'+String(i).padStart(5,'0')+'.webp')).catch(()=>fs.copyFile(path.resolve('assets',assets[i%assets.length]),path.join(fixture,'photo-'+String(i).padStart(5,'0')+'.webp')));
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8000/');await page.locator('.m-tile').first().waitFor();
 await ready(page);await page.screenshot({path:out+'/demo.png'});
 const start=Date.now();
 await page.locator('#folderInput').setInputFiles(fixture);
 await page.locator('#app.local-collection').waitFor({timeout:120000});
 assert.ok((await page.locator('#collectionTag').textContent()).includes(String(count)));
 const importMs=Date.now()-start;
 await ready(page);
 const tile=page.locator('.m-tile').first();await tile.focus();await page.keyboard.press('Enter');
 await page.locator('.m-tile[aria-expanded="true"]').waitFor();
 await page.keyboard.press('i');await page.locator('#inspector').waitFor();
 assert.equal(await page.locator('.m-tile[aria-expanded="true"]').count(),1);
 await page.waitForFunction(()=>document.getElementById('inspectorImage').naturalWidth>0);
 await page.screenshot({path:out+'/inspector.png'});
 await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowLeft');
 await page.keyboard.press('Escape');await page.locator('#inspector').waitFor({state:'hidden'});
 assert.equal(await page.locator('.m-tile[aria-expanded="true"]').count(),1);
 await ready(page);await page.waitForFunction(()=>{const t=document.querySelector('.m-tile.is-active');return t&&Math.abs(parseFloat(t.style.width)-756)<1&&Math.abs(parseFloat(t.style.height)-756)<1});await page.screenshot({path:out+'/local-focus.png'});
 await page.keyboard.press('Escape');
 await page.keyboard.press('f');assert.ok(await page.locator('#app.is-immersive').count());await page.keyboard.press('f');
 await page.keyboard.press('Control+k');await page.locator('#searchOverlay').waitFor();
 await page.locator('#searchInput').fill('photo-'+String(count-1).padStart(5,'0'));await page.waitForTimeout(250);
 await page.keyboard.press('Enter');await page.waitForTimeout(600);await page.keyboard.press('Escape');
 const frames=await page.evaluate(async n=>{let times=[],previous=performance.now(),peak=0,samples=[];for(let i=0;i<n;i++){await new Promise(requestAnimationFrame);const now=performance.now();times.push(now-previous);previous=now;if(i%12===0)document.getElementById(i%24===0?'plusBtn':'minusBtn').click();if(i%48===0){const b=[...document.querySelectorAll('.m-tile')].find(x=>x.tabIndex===0);b?.focus();b?.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:0}))}peak=Math.max(peak,document.querySelectorAll('.m-tile').length);if(i%60===0)samples.push({...window.NOEMADiagnostics.snapshot(),frame:i,heapBytes:performance.memory?.usedJSHeapSize??null})}return{times,peak,samples}},Number(process.env.NOEMA_FRAMES||640));
 const sorted=frames.times.slice().sort((a,b)=>a-b);
 await fs.writeFile(out+'/frame-report.json',JSON.stringify({engine,fixtureFiles:count,distinctEncodedSources:assets.length,importMs,frames:frames.times.length,p95:sorted[Math.floor(sorted.length*.95)],max:Math.max(...frames.times),over33ms:frames.times.filter(x=>x>33.4).length,peakMounted:frames.peak,samples:frames.samples,errors},null,2));
 assert.deepEqual(errors,[]);assert.ok(frames.peak<1200);
 await ready(page);await page.screenshot({path:out+'/local-wall.png'});
 const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:2,...(engine==='firefox'?{}:{isMobile:true})});
 mobile.on('pageerror',e=>errors.push(e.message));
 await mobile.goto('http://127.0.0.1:8000/');await mobile.locator('.m-tile').first().waitFor();
 await ready(mobile);await mobile.screenshot({path:out+'/mobile.png'});
 if(engine==='chromium'){
  const session=await mobile.context().newCDPSession(mobile);
  const t=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
  const point=(x,y,id)=>({x,y,id,radiusX:3,radiusY:3});
  const before=await mobile.locator('#world').evaluate(e=>e.style.transform);
  await t('touchStart',[point(110,350,1)]);await t('touchMove',[point(155,390,1)]);await t('touchStart',[point(155,390,1),point(235,390,2)]);await t('touchMove',[point(125,390,1),point(265,390,2)]);await t('touchEnd',[point(125,390,1)]);await t('touchMove',[point(160,420,1)]);await t('touchEnd',[]);
  await mobile.waitForTimeout(150);
  assert.notEqual(await mobile.locator('#world').evaluate(e=>e.style.transform),before);
  await t('touchStart',[point(200,450,3)]);await t('touchMove',[point(160,420,3)]);await t('touchEnd',[]);await ready(mobile);
 }
 assert.deepEqual(errors,[]);
}finally{await browser.close();await fs.rm(fixture,{recursive:true,force:true})}
