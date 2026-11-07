import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];

function templateFromSource() {
  const source = html.match(/const TEMPLATE=\[([\s\S]*?)\];/)?.[1];
  assert.ok(source, 'Fixed mosaic template must exist');
  return vm.runInNewContext(`[${source}]`, {}, { timeout: 1000 });
}

test('inline script parses as JavaScript', () => {
  assert.ok(script, 'Missing main script');
  new vm.Script(script);
});

test('fixed 12 × 8 mosaic covers every cell exactly once', () => {
  const board = Array.from({ length: 8 }, () => Array(12).fill(0));
  for (const tile of templateFromSource()) {
    for (let y = tile.y; y < tile.y + tile.h; y++) {
      for (let x = tile.x; x < tile.x + tile.w; x++) {
        assert.ok(x >= 0 && x < 12 && y >= 0 && y < 8, 'Tile exceeds template');
        board[y][x]++;
      }
    }
  }
  for (const row of board) assert.ok(row.every(v => v === 1), 'No gaps or overlaps permitted');
});

test('all 16 thumbnail and full-resolution assets are valid WebP files', () => {
  for (let index = 0; index < 16; index++) {
    for (const kind of ['thumb', 'poster']) {
      const file = path.join(root, 'assets', `${kind}-${String(index).padStart(2, '0')}.webp`);
      assert.ok(fs.existsSync(file), `Missing ${file}`);
      const bytes = fs.readFileSync(file);
      assert.ok(bytes.length > 100, `Unexpectedly small ${file}`);
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    }
  }
});

test('page preserves accessibility and self-hosted image contracts', () => {
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-label="随机发现作品"/);
  assert.match(html, /stage\.inert=true/);
  assert.match(html, /assets\/\$\{/);
  assert.doesNotMatch(html, /https?:\/\/(?:images\.unsplash|picsum\.photos|source\.unsplash)/);
});

test('local image import keeps user files on this device', () => {
  assert.match(html, /id="folderInput"[^>]*webkitdirectory/);
  assert.match(html, /id="fileInput"[^>]*multiple/);
  assert.match(html, /id="dropOverlay"/);
  assert.match(script, /async function importFiles\(/);
  assert.match(script, /async function handleDrop\(/);
  assert.match(script, /MAX_LOCAL_FILES=20000/);
  assert.match(script, /document\.getElementById\('fileInput'\)\.click\(\)/);
});

test('local image rendering escapes filenames before inserting HTML', () => {
  const implementation = script.match(/function escapeHTML\(text\)\{[^\n]+\}/)?.[0];
  assert.ok(implementation, 'Filename escaping helper missing');
  const escaped = vm.runInNewContext(`(() => { ${implementation}; return escapeHTML('<img src=x onerror="alert(1)">'); })()`, {}, { timeout: 1000 });
  assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.match(script, /escapeHTML\(a\.title\)/);
  assert.match(script, /escapeHTML\(a\.desc\)/);
});

test('local thumbnail pipeline is bounded and revokes object URLs', () => {
  assert.match(script, /thumbnailWorkers<3/);
  assert.match(script, /MAX_THUMB_CACHE=260/);
  assert.match(script, /resizeWidth:THUMB_SIZE/);
  assert.doesNotMatch(script, /resizeHeight:THUMB_SIZE/);
  assert.match(script, /URL\.revokeObjectURL\(url\)/);
  assert.match(script, /function releaseFullImage\(/);
  assert.match(script, /window\.addEventListener\('pagehide'/);
});
