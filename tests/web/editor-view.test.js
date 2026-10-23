const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../../web/src/editor/view.js');

const image = { width: 128, height: 48 };
const stage = { width: 1000, height: 600 };

test('fit picks the largest whole zoom that holds the image with its margin, and centers it', () => {
  const view = v.fit(image, stage, 24);
  assert.equal(view.zoom, 6);                // 128 * 6 = 768 <= 952; 128 * 8 = 1024 does not fit
  assert.equal(view.x, Math.round((1000 - 768) / 2));
  assert.equal(view.y, Math.round((600 - 288) / 2));
  // a huge sheet is shown smaller than its size
  assert.equal(v.fit({ width: 4096, height: 4096 }, stage).zoom, 0.25);
  // a tiny stage still gives a zoom of the list
  assert.equal(v.fit(image, { width: 10, height: 10 }).zoom, v.ZOOMS[0]);
});

test('actual is one image pixel per stage pixel, centered', () => {
  const view = v.actual(image, stage);
  assert.equal(view.zoom, 1);
  assert.deepEqual([view.x, view.y], [436, 276]);
});

test('zooming at a point keeps the pixel under it', () => {
  const view = { zoom: 4, x: 100, y: 50 };
  const before = v.toImage(view, 300, 200);
  const next = v.zoomAt(view, 8, 300, 200);
  assert.equal(next.zoom, 8);
  const after = v.toImage(next, 300, 200);
  assert.ok(Math.abs(after.x - before.x) < 0.2 && Math.abs(after.y - before.y) < 0.2);
});

test('image and stage coordinates convert back and forth', () => {
  const view = { zoom: 6, x: -30, y: 12 };
  const s = v.toStage(view, 10, 20);
  assert.deepEqual(s, { x: 30, y: 132 });
  assert.deepEqual(v.toImage(view, s.x, s.y), { x: 10, y: 20 });
});

test('steps of the zoom follow the list and stop at its ends', () => {
  assert.equal(v.stepZoom({ zoom: 4 }, 1), 6);
  assert.equal(v.stepZoom({ zoom: 4 }, -1), 3);
  assert.equal(v.stepZoom({ zoom: 64 }, 1), 64);
  assert.equal(v.stepZoom({ zoom: 0.25 }, -1), 0.25);
  assert.equal(v.stepZoom({ zoom: 5 }, 1), 6);  // a zoom between two steps counts as the nearest one (4, the first of two equals)
});

test('panning moves the image and the clamp keeps part of it in view', () => {
  const moved = v.pan({ zoom: 4, x: 10, y: 10 }, -20, 5);
  assert.deepEqual(moved, { zoom: 4, x: -10, y: 15 });
  const far = v.clamp({ zoom: 4, x: 5000, y: -5000 }, image, stage);
  assert.equal(far.x, 1000 - v.MIN_VISIBLE);
  assert.equal(far.y, v.MIN_VISIBLE - 48 * 4);
  const left = v.clamp({ zoom: 4, x: -5000, y: 100 }, image, stage);
  assert.equal(left.x, v.MIN_VISIBLE - 128 * 4);
  // inside the allowed area nothing moves
  assert.deepEqual(v.clamp({ zoom: 4, x: 100, y: 100 }, image, stage), { zoom: 4, x: 100, y: 100 });
  // an image smaller than the margin may be fully visible
  assert.deepEqual(v.clamp({ zoom: 1, x: 10, y: 10 }, { width: 8, height: 8 }, stage), { zoom: 1, x: 10, y: 10 });
});
