import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
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
