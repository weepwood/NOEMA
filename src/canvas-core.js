/* NOEMA Canvas Core: camera geometry and viewport candidate selection.
   Pure, independently testable logic; no rendering or DOM access. */
(function (root) {
  'use strict';
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  function anchoredZoom(camera, factor, pointerX, pointerY, min = .40, max = 1.9) {
    const scale = clamp(camera.s * factor, min, max);
    const worldX = (pointerX - camera.x) / camera.s;
    const worldY = (pointerY - camera.y) / camera.s;
    return {x: pointerX - worldX * scale, y: pointerY - worldY * scale, s: scale};
  }
  function viewportBounds(camera, viewport) {
    return {x:-camera.x / camera.s, y:-camera.y / camera.s, w:viewport.w / camera.s, h:viewport.h / camera.s};
  }
  const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function prioritizeVisible(candidates, actual, minCount = 220, hardLimit = 1000) {
    const centerX = actual.x + actual.w / 2, centerY = actual.y + actual.h / 2;
    // Sort all genuinely visible tiles ahead of overscan; deterministic tie break.
    const rated = candidates.map((tile, order) => ({...tile, order,
      onScreen: intersects(tile.rect, actual),
      metric: Math.hypot(tile.rect.x + tile.rect.w/2 - centerX, tile.rect.y + tile.rect.h/2 - centerY)}));
    rated.sort((a,b) => Number(b.onScreen) - Number(a.onScreen) || a.metric - b.metric || a.order - b.order);
    const count = rated.reduce((n,c) => n + Number(c.onScreen), 0);
    return {selected:rated.slice(0,Math.min(hardLimit,Math.max(minCount,count))), visibleCount:count, clippedCount:Math.max(0,count-hardLimit)};
  }
  root.NOEMACanvasCore = Object.freeze({anchoredZoom,viewportBounds,prioritizeVisible,intersects});
})(typeof window === 'undefined' ? globalThis : window);
