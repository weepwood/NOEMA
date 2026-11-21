import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inlineScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];

class FakeNode {
  constructor(tag = 'div', id = '') {
    this.tag = tag;
    this.id = id;
    this.hidden = /^(helpModal|inspector|searchOverlay|importProgress|metricsHud|filterBanner)$/.test(id);
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.attrs = new Map();
    this.style = { setProperty() {}, removeProperty() {} };
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
      toggle: (name, force) => {
        const active = force === undefined ? !classes.has(name) : Boolean(force);
        active ? classes.add(name) : classes.delete(name);
        return active;
      }
    };
    this.isConnected = true;
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatch(type, values = {}) {
    const event = {
      target: this, currentTarget: this, detail: 1, key: '',
      preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {},
      ...values
    };
    for (const callback of this.listeners.get(type) || []) callback(event);
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  removeAttribute(name) { this.attrs.delete(name); }
  appendChild(child) { this.children.push(child); child.isConnected = true; return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  prepend(child) { this.children.unshift(child); child.isConnected = true; }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  remove() { this.isConnected = false; }
  querySelector(selector) {
    this.subnodes ||= new Map();
    if (!this.subnodes.has(selector)) this.subnodes.set(selector, new FakeNode('img'));
    return this.subnodes.get(selector);
  }
  querySelectorAll() { return []; }
  closest(selector) { return selector === '.m-tile' && this.className === 'm-tile' ? this : null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  focus() { this.ownerDocument.activeElement = this; }
  setPointerCapture() {}
  releasePointerCapture() {}
}

test('real page bootstrap, first paint, selection, controls and keyboard navigation do not throw', () => {
  assert.ok(inlineScript, 'inline application script is present');
  const elements = new Map();
  const doc = new FakeNode('document');
  doc.activeElement = null;
  const getNode = key => {
    if (!elements.has(key)) {
      const node = new FakeNode('div', key);
      node.ownerDocument = doc;
      elements.set(key, node);
    }
    return elements.get(key);
  };
  doc.getElementById = getNode;
  doc.querySelector = getNode;
  doc.createElement = tag => {
    const node = new FakeNode(tag);
    node.ownerDocument = doc;
    return node;
  };
  const queuedFrames = [];
  let rafId = 0;
  const win = {
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    NOEMACanvasCore: {
      viewportBounds(camera, viewport) {
        return { x: -camera.x / camera.s, y: -camera.y / camera.s,
          w: viewport.w / camera.s, h: viewport.h / camera.s };
      },
      prioritizeVisible(candidates) {
        return { selected: candidates.slice(0, 24),
          clippedCount: Math.max(0, candidates.length - 24) };
      },
      anchoredZoom(camera, factor, px, py, min, max) {
        const s = Math.max(min, Math.min(max, camera.s * factor));
        return { x: px - (px - camera.x) * s / camera.s,
          y: py - (py - camera.y) * s / camera.s, s };
      }
    },
    NOEMASearchCore: { normalize: value => value, search: () => ({ found: [], total: 0 }) },
    NOEMADirectoryScanner: { scan: async () => ({ files: [] }) }
  };
  const context = vm.createContext({
    window: win, document: doc,
    innerWidth: 1280, innerHeight: 720,
    location: { protocol: 'https:' },
    ResizeObserver: class { constructor(callback) { this.callback = callback; } observe() { this.callback(); } },
    IntersectionObserver: class { observe() {} unobserve() {} },
    requestAnimationFrame(callback) { queuedFrames.push(callback); return ++rafId; },
    cancelAnimationFrame() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    performance: { now: () => 100 },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    console
  });
  // This module runs before the inline page code in the actual HTML.
  vm.runInContext(fs.readFileSync(path.join(root, 'src/posterwall-layout.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'src/wall-motion.js'), 'utf8'), context);
  vm.runInContext(inlineScript, context, { timeout: 2000 });
  for (let i = 0; i < 3 && queuedFrames.length; i++) queuedFrames.shift()(16 * (i + 1));
  const wall = getNode('world');
  const tiles = wall.children.filter(child => child.className === 'm-tile');
  assert.ok(tiles.length > 0, 'the initial view creates visible tiles');
  const tile = tiles[0];
  const scaleBefore=Number(getNode('world').style.transform.match(/scale\(([^)]+)\)/)[1]);
  tile.dispatch('click', { detail: 0 });
  assert.equal(tile.getAttribute('aria-expanded'), 'true', 'selection expands the clicked tile');
  const occluders = wall.children.filter(child => child.className === 'focus-underlay' && child.isConnected);
  assert.equal(occluders.length, 1, 'one occluder is created for the selected block');
  assert.equal(occluders[0].getAttribute('aria-hidden'), 'true', 'occluder is decorative');
  assert.equal(occluders[0].children.length, 0, 'the occluder never contains ghost image snapshots');
  const block = tile.dataset.instance.split(':').slice(0, 2).join(':');
  const members = wall.children.filter(child => child.className === 'm-tile' && child.isConnected && child.dataset.instance.startsWith(block + ':'));
  assert.equal(members.length, 12, 'the selected 12x8 block is fully retained');
  assert.ok(members.every(child => child.classList.contains('is-reflowing')),
    'all moving tiles render above the opaque occluder');
  let time=48;
  for(let i=0;i<40&&queuedFrames.length;i++)queuedFrames.shift()(time+=16);
  const scaleAfter=Number(getNode('world').style.transform.match(/scale\(([^)]+)\)/)[1]);
  assert.ok(Math.abs(scaleBefore-scaleAfter)<1e-8,'expanding a poster never zooms the wall');
  assert.ok(parseFloat(tile.style.width)>500,'the selected poster expands into the 6x6 gear');
  getNode('closeBtn').dispatch('click');
  assert.equal(tile.getAttribute('aria-expanded'), 'false', 'close restores the wall');
  getNode('plusBtn').dispatch('click');
  getNode('homeBtn').dispatch('click');
  doc.dispatch('keydown', { key: 'ArrowRight' });
  assert.ok(doc.activeElement, 'keyboard focus-walk selects a poster');
  const app=getNode('app'),modeButton=getNode('immersiveBtn');
  modeButton.dispatch('click');
  assert.ok(app.classList.contains('is-immersive'), 'immersive button hides the chrome');
  assert.equal(modeButton.getAttribute('aria-pressed'),'true','button exposes pressed state');
  assert.equal(modeButton.querySelector('use').getAttribute('href'),'#lucide-shrink');
  doc.dispatch('keydown',{key:'Escape'});
  assert.ok(!app.classList.contains('is-immersive'),'Escape exits image-only mode');
  doc.dispatch('keydown',{key:'f'});
  assert.ok(app.classList.contains('is-immersive'),'F enters immersive mode');
  doc.dispatch('keydown',{key:'f'});
  assert.ok(!app.classList.contains('is-immersive'),'F toggles back to normal');
});