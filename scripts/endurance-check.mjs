import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
const duration=Number(process.env.NOEMA_ENDURANCE_SECONDS||1800)*1000;
const browser=await chromium.launch({headless:true}),fixture=await fs.mkdtemp(path.join(os.tmpdir(),'noema-endurance-'));
const out='artifacts/endurance';await fs.mkdir(out,{recursive:true});
const report={durationMs:duration,fixtureFiles:20000,samples:[],errors:[],cycles:0};
let page,session;
try{
 const assets=(await fs.readdir('assets')).filter(n=>/^poster-.*\.webp$/.test(n)).sort();report.distinctEncodedSources=assets.length;
 for(let i=0;i<20000;i++)await fs.link(path.resolve('assets',assets[i%assets.length]),path.join(fixture,'photo-'+String(i).padStart(5,'0')+'.webp'));
 page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));session=await page.context().newCDPSession(page);
 await page.goto('http://127.0.0.1:8000/');await page.locator('#folderInput').setInputFiles(fixture);await page.waitForFunction(()=>window.NOEMADiagnostics?.snapshot().collectionCount===20000,undefined,{timeout:120000});
 async function settle(){await page.waitForFunction(()=>{const s=window.NOEMADiagnostics.snapshot();return !s.moving&&s.queue===0&&s.workers===0&&s.pendingWorker===0},undefined,{timeout:90000})}
 async function sample(label){await settle();await session.send('HeapProfiler.collectGarbage');const heap=await session.send('Runtime.getHeapUsage'),dom=await session.send('Memory.getDOMCounters'),state=await page.evaluate(()=>window.NOEMADiagnostics.snapshot());report.samples.push({label,elapsedMs:Date.now()-start,heap,dom,state});await fs.writeFile(out+'/endurance-report.json',JSON.stringify(report,null,2));assert.equal(state.queue,0);assert.equal(state.pendingWorker,0);assert.ok(state.tiles<1200);assert.ok(state.cacheBytes<=32*1024*1024);assert.ok(state.estimatedPixelsBytes<=128*1024*1024)}
 const start=Date.now();await sample('baseline');
 while(Date.now()-start<duration){
  const index=(report.cycles*7919+123)%20000;
  await page.keyboard.press('Control+k');const query='photo-'+String(index).padStart(5,'0');await page.locator('#searchInput').fill(query);await page.locator('.search-result').filter({hasText:query}).first().waitFor();
  await page.keyboard.press('Enter');await page.locator('#searchOverlay').waitFor({state:'hidden'});
  await page.keyboard.press('i');await page.locator('#inspector').waitFor();await page.waitForFunction(()=>document.getElementById('inspectorImage').naturalWidth>0,undefined,{timeout:30000});
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');await page.locator('#inspector').waitFor({state:'hidden'});await page.keyboard.press('Escape');
  await page.locator('#plusBtn').click();await page.locator('#minusBtn').click();
  await settle();report.cycles++;
  if(report.cycles%10===0)await sample('cycle-'+report.cycles);
  assert.deepEqual(report.errors,[]);
 }
 report.elapsedMs=Date.now()-start;await sample('before-demo-reset');
 await page.locator('#collectionTag button').click();await page.waitForFunction(()=>window.NOEMADiagnostics.snapshot().collectionCount===16);await sample('after-demo-reset');
 const last=report.samples.at(-1).state;assert.equal(last.cacheCount,0);assert.equal(last.cacheBytes,0);assert.equal(last.estimatedPixelsBytes,0);
 assert.ok(report.elapsedMs>=duration);assert.deepEqual(report.errors,[]);report.passed=true;await page.screenshot({path:out+'/final.png'});
}catch(e){report.failure=String(e?.stack||e);if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e}
finally{await fs.writeFile(out+'/endurance-report.json',JSON.stringify(report,null,2));await browser.close();await fs.rm(fixture,{recursive:true,force:true})}
