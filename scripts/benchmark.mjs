// Small, reproducible CPU microbenchmarks. Does NOT claim browser GPU/DOM performance.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function loaded(name,symbol){
 const context={window:{},Math};vm.runInNewContext(fs.readFileSync(path.join(root,'src',name),'utf8'),context);
 return context.window[symbol];
}
const search=loaded('search-core.js','NOEMASearchCore');
const canvas=loaded('canvas-core.js','NOEMACanvasCore');
const photos=Array.from({length:20000},(_,i)=>({title:`Sunset ${i}`,desc:`photos/album-${i%12}/frame-${i}.jpg`,category:i%2?'PORTRAIT':'LANDSCAPE'}));
const tiles=Array.from({length:950},(_,i)=>({id:`${i}`,rect:{x:(i%40)*121,y:Math.floor(i/40)*127,w:115,h:121}}));
function bench(label,fn,iterations){let result;const start=performance.now();for(let i=0;i<iterations;i++)result=fn();const ms=(performance.now()-start)/iterations;console.log(`${label}: ${ms.toFixed(2)} ms/op (${iterations} runs)`);return result}
console.log('NOEMA CPU-only microbenchmarks (not a real 20k-photo performance test)');
const s=bench('Search 20k items: phrase in title or path',()=>search.search(photos,'sunset',40),15);
console.log('  Matches',s.total,'Rendered',s.found.length);
const c=bench('Rank 950 viewport candidates',()=>canvas.prioritizeVisible(tiles,{x:1200,y:900,w:1400,h:850},220,1000),50);
console.log('  Visible candidates',c.visibleCount,'Selected',c.selected.length);
