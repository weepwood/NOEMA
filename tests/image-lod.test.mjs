import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/image-lod.js';
const lod=globalThis.NOEMAImageLOD;
test('LOD responds to projected size and conservative concurrent pixel budget',()=>{
 const tile={w:400,h:300};
 assert.equal(lod.edgeFor(tile,.4,1,12),192);
 assert.equal(lod.edgeFor(tile,1,1,12),768);
 assert.equal(lod.edgeFor(tile,1.9,2,12),1024);
 assert.equal(lod.edgeFor(tile,1.9,2,220),384);
 assert.equal(lod.estimateMiB([{thumbEdge:1024,ratio:1}]),'4.0');
});
