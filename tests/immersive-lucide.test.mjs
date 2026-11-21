import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
const license=fs.readFileSync(path.join(root,'assets','LUCIDE-LICENSE.txt'),'utf8');

test('every rendered control icon refers to one local Lucide definition',()=>{
 const symbols=[...html.matchAll(/<symbol id="lucide-([\w-]+)" viewBox="0 0 24 24">([\s\S]*?)<\/symbol>/g)];
 const refs=[...html.matchAll(/<use href="#lucide-([\w-]+)">/g)];
 const names=new Set(symbols.map(x=>x[1]));
 assert.ok(symbols.length>=15,'the self-contained icon sprite has the UI icon set');
 assert.equal(names.size,symbols.length,'symbols do not duplicate ids');
 assert.ok(refs.length>=23,'all UI controls and the dynamic tile arrow use Lucide');
 for(const [,name] of refs)assert.ok(names.has(name),'missing local icon: '+name);
 const withoutDefinitions=html.replace(/<svg class="lucide-definitions"[\s\S]*?<\/svg>/,'');
 assert.doesNotMatch(withoutDefinitions,/<svg\b[^>]*>[\s\S]*?<(?:path|circle|rect|line|polyline)\b/,'no ad-hoc vector controls remain');
 assert.match(license,/ISC License/);
 assert.match(license,/Copyright \(c\) 2026 Lucide Icons and Contributors/);
 assert.doesNotMatch(html,/<script[^>]+https?:\/\/(?:unpkg|cdn\.jsdelivr)/);
});

test('immersive mode removes all visual chrome, poster metadata and inspector chrome',()=>{
 const groups=[
  '.topbar','.top-tools>:not(#immersiveBtn)','.corner-index',
  '.bottom-left','.bottom-center','.floating-controls',
  '.selection-inspect','.selection-exit','.stage-vignette','.grain',
  '.toast','.filter-banner','.metrics-hud',
  '.m-tile .tile-shade','.m-tile .tile-dimmer',
  '.m-tile .tile-index','.m-tile .tile-info','.m-tile .tile-arrow',
  '.inspector-top','.inspector-bottom','.inspector-viewport'
 ];
 for(const group of groups)assert.ok(html.includes(group),group+' keeps a corresponding immersive style');
 assert.match(html,/#app\.is-immersive \.m-tile \.tile-info,[\s\S]{0,200}?#app\.is-immersive \.m-tile \.tile-arrow\{display:none!important\}/);
 assert.match(html,/#app\.is-immersive #immersiveBtn:is\(:hover,:focus-visible\)\{opacity:1\}/);
 assert.match(html,/#app\.is-immersive \.inspector-viewport\{inset:0\}/);
 assert.match(html,/@media\(hover:none\)\{#app\.is-immersive #immersiveBtn\{opacity:\.4\}\}/);
 assert.match(html,/aria-keyshortcuts="F" aria-pressed="false"/);
 assert.match(html,/<span class="kbd">F<\/span> 沉浸模式/);
});

test('mode toggle updates aria-pressed, accessible label, icon, focus and is reversible',()=>{
 assert.ok(inline);
 const start=inline.indexOf('function setImmersiveMode(enabled){');
 const stop=inline.indexOf("const collectionTag=",start);
 assert.ok(start>=0&&stop>start,'toggle implementation exists');
 const source=inline.slice(start,stop);
 new vm.Script(source);
 let focused='',iconHref='';
 const classes=new Set();
 const attrs=new Map();
 const button={
  setAttribute(name,value){attrs.set(name,String(value))},
  querySelector(){return {setAttribute(name,value){if(name==='href')iconHref=value}}}
 };
 const stage={focus(){focused='stage'}};
 const ctx={
  app:{classList:{contains:name=>classes.has(name),toggle(name,on){if(on)classes.add(name);else classes.delete(name)}}},
  immersiveButton:button,
  inspector:{hidden:true},sceneStatus:{textContent:''},stage,
  document:{getElementById:()=>({hidden:true})}
 };
 vm.createContext(ctx);
 vm.runInContext(source+'globalThis.changeMode=setImmersiveMode;',ctx);
 ctx.changeMode(true);
 assert.ok(classes.has('is-immersive'));
 assert.equal(attrs.get('aria-pressed'),'true');
 assert.equal(attrs.get('aria-label'),'退出沉浸模式');
 assert.equal(iconHref,'#lucide-shrink');
 assert.equal(focused,'stage');
 assert.match(ctx.sceneStatus.textContent,/已开启沉浸/);
 ctx.changeMode(false);
 assert.ok(!classes.has('is-immersive'));
 assert.equal(attrs.get('aria-pressed'),'false');
 assert.equal(iconHref,'#lucide-expand');
 assert.equal(attrs.get('aria-label'),'进入沉浸模式');
 ctx.changeMode(false);
 assert.ok(!classes.has('is-immersive'));
});

test('keyboard shortcuts retain Escape close first, then exit immersive and avoid text input hijacking',()=>{
 assert.match(inline,/immersiveButton\.addEventListener\('click',\(\)=>setImmersiveMode/);
 assert.match(inline,/if\(active\)\{close\(\);return\}/);
 assert.match(inline,/if\(app\.classList\.contains\('is-immersive'\)\)\{e\.preventDefault\(\);setImmersiveMode\(false\);return\}/);
 assert.match(inline,/e\.key\.toLowerCase\(\)==='f'/);
 assert.match(inline,/e\.target\?\.closest\?\.\('input,textarea,\[contenteditable="true"\]'\)/);
 assert.match(inline,/if\(app\.classList\.contains\('is-immersive'\)\)\{event\.preventDefault\(\);return\}/);
 assert.match(inline,/stage\.focus\(\{preventScroll:true\}\)/);
});
