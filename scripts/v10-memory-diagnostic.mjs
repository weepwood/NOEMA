import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const out='artifacts/memory-diagnostic';
await fs.mkdir(out,{recursive:true});
const fixture=await fs.mkdtemp(path.join(os.tmpdir(),'noema-memory-'));
const browser=await chromium.launch({headless:true});
const targets=Array.from({length:12},(_,i)=>(i*7919+123)%20000);
const report={productionSha:'eff798941b48d37658af9ecda4bdd31c4970eb85',fixtureFiles:20000,targets,warmupCycles:24,measuredCycles:96,samples:[],errors:[],passed:false};
let page,session;
const start=Date.now();
async function write(){await fs.writeFile(out+'/memory-diagnostic.json',JSON.stringify(report,null,2))}
try{
  const assets=(await fs.readdir('assets')).filter(n=>/^poster-.*\.webp$/.test(n)).sort();
  report.distinctEncodedSources=assets.length;
  for(let i=0;i<20000;i++)await fs.link(path.resolve('assets',assets[i%assets.length]),path.join(fixture,'photo-'+String(i).padStart(5,'0')+'.webp'));
  page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  session=await page.context().newCDPSession(page);
  await page.goto('http://127.0.0.1:8000/');
  async function settle(){
    await page.waitForFunction(()=>{const s=window.NOEMADiagnostics?.snapshot();return s&&!s.moving&&s.queue===0&&s.workers===0&&s.pendingWorker===0},undefined,{timeout:90000});
    await page.waitForTimeout(300);
    await page.waitForFunction(()=>{const s=window.NOEMADiagnostics.snapshot();return !s.moving&&s.queue===0&&s.workers===0&&s.pendingWorker===0},undefined,{timeout:90000});
  }
  async function sample(label){
    await settle();
    await session.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(200);
    await session.send('HeapProfiler.collectGarbage');
    const heap=await session.send('Runtime.getHeapUsage');
    const dom=await session.send('Memory.getDOMCounters');
    const state=await page.evaluate(()=>({...window.NOEMADiagnostics.snapshot(),liveElements:document.querySelectorAll('*').length,liveTiles:document.querySelectorAll('.m-tile').length}));
    let detached=null,detachedError=null;
    try{const r=await session.send('DOM.getDetachedDomNodes');detached={trees:r.detachedNodes.length,retainedNodeIds:r.detachedNodes.reduce((n,t)=>n+(t.retainedNodeIds?.length||0),0),rootNames:r.detachedNodes.slice(0,20).map(t=>t.treeNode?.nodeName||null)}}
    catch(e){detachedError=String(e.message||e)}
    report.samples.push({label,elapsedMs:Date.now()-start,heap,dom,state,detached,detachedError});
    await write();
    assert.equal(state.queue,0);assert.equal(state.workers,0);assert.equal(state.pendingWorker,0);
    assert.ok(state.cacheBytes<=32*1024*1024);assert.ok(state.estimatedPixelsBytes<=128*1024*1024);
    assert.deepEqual(report.errors,[]);
  }
  async function importLibrary(){
    await page.locator('#folderInput').setInputFiles(fixture);
    await page.waitForFunction(()=>window.NOEMADiagnostics.snapshot().collectionCount===20000,undefined,{timeout:120000});
    await settle();
  }
  async function cycle(index){
    await page.keyboard.press('Control+k');const query='photo-'+String(index).padStart(5,'0');
    await page.locator('#searchInput').fill(query);
    await page.locator('.search-result').filter({hasText:query}).first().waitFor();
    await page.keyboard.press('Enter');await page.locator('#searchOverlay').waitFor({state:'hidden'});
    await page.keyboard.press('i');await page.locator('#inspector').waitFor();
    await page.waitForFunction(()=>document.getElementById('inspectorImage').naturalWidth>0,undefined,{timeout:30000});
    await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');
    await page.locator('#inspector').waitFor({state:'hidden'});await page.keyboard.press('Escape');
    await page.locator('#plusBtn').click();await page.locator('#minusBtn').click();await settle();
  }
  await sample('demo-before-import');
  await importLibrary();
  for(let i=0;i<120;i++){
    await cycle(targets[i%targets.length]);
    if((i+1)%12===0){
      await page.locator('#homeBtn').click();
      await sample('fixed-set-'+(i+1));
    }
  }
  await page.locator('#collectionTag button').click();
  await page.waitForFunction(()=>window.NOEMADiagnostics.snapshot().collectionCount===16);
  await sample('demo-after-reset-1');
  assert.equal(report.samples.at(-1).state.cacheCount,0);
  await importLibrary();
  for(const index of targets)await cycle(index);
  await page.locator('#collectionTag button').click();
  await page.waitForFunction(()=>window.NOEMADiagnostics.snapshot().collectionCount===16);
  await sample('demo-after-reset-2');
  assert.equal(report.samples.at(-1).state.cacheCount,0);
  report.passed=true;await page.screenshot({path:out+'/final.png'});
}catch(e){report.failure=String(e?.stack||e);if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e}
finally{report.elapsedMs=Date.now()-start;await write();await browser.close();await fs.rm(fixture,{recursive:true,force:true})}
