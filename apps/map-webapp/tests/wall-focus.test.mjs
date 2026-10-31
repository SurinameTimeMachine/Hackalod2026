import test from 'node:test';
import assert from 'node:assert/strict';
import { wallFocus } from '../app/components/wall/wallFocus.ts';

test('the wall returns to its overview when no person is selected', () => {
  assert.deepEqual(wallFocus(960, 540), { x: 0, y: 0, zoom: 0.5 });
});

test('an edge selection is centered and a long name fits the available width', () => {
  const stamp = { x: 840, y: -460, size: 30, width: 700, rotation: 0 };
  const focus = wallFocus(800, 600, stamp, 'bron');
  assert.equal(focus.x, 840);
  assert.ok(focus.y < -460);
  assert.ok(focus.zoom * stamp.width * 2 <= 800 - 48);
});

test('a long caption fits even in a narrow view', () => {
  const stamp = { x: -700, y: 300, size: 20, width: 100, rotation: 0 };
  const caption = 'Een lange toelichting bij de naam';
  const focus = wallFocus(320, 500, stamp, caption);
  const captionWidth = caption.length * Math.max(stamp.size * 0.45, 6) * 0.6 * 2;
  assert.ok(focus.zoom * captionWidth <= 320 - 48);
});
