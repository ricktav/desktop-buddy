import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { World } = require('../dist/sim/world.js');
const { floorOf } = require('../dist/sim/buddy.js');
const manifest = require('../buddies/lab-yellow/buddy.json');

const cfg = { idleSitAfter: 60, idleSleepAfter: 120, walkSpeed: 100, bubbleSeconds: 5 };
const D1 = { id: 1, bounds: { x: 0, y: 0, width: 1000, height: 600 }, workArea: { x: 0, y: 25, width: 1000, height: 500 }, primary: true };
const D2 = { id: 2, bounds: { x: 1000, y: -100, width: 800, height: 700 }, workArea: { x: 1000, y: -100, width: 800, height: 700 }, primary: false };

function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function makeWorld({ displays = [D1, D2], seed = 1 } = {}) {
  let now = 0;
  const world = new World({ cfg, rng: seeded(seed), now: () => now });
  world.setDisplays(displays);
  const b = world.addBuddy('b1', 'lab-yellow', manifest);
  const run = (seconds, dt = 1 / 30) => {
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      now += dt * 1000;
      world.tick(dt);
    }
  };
  return { world, b, run, clock: () => now };
}

test('buddy starts on the primary display floor', () => {
  const { b } = makeWorld();
  assert.equal(b.displayId, 1);
  assert.equal(b.y, floorOf(D1));
  assert.ok(b.x > 0 && b.x < 1000);
});

test('wandering keeps the buddy on a floor and inside display bounds', () => {
  const { world, b, run } = makeWorld();
  const seenMoods = new Set();
  for (let i = 0; i < 120; i++) {
    run(2);
    seenMoods.add(b.mood);
    const d = world.displayFor(b);
    assert.ok(d, 'buddy always belongs to a display');
    assert.equal(b.y, floorOf(d), 'feet on the floor');
    assert.ok(b.x >= d.workArea.x && b.x <= d.workArea.x + d.workArea.width, `x ${b.x} inside ${d.id}`);
  }
  assert.ok(seenMoods.has('wander'));
});

test('buddy crosses to a second display while wandering', () => {
  const { b, run } = makeWorld({ seed: 7 });
  const visited = new Set();
  for (let i = 0; i < 400 && visited.size < 2; i++) {
    run(2);
    visited.add(b.displayId);
  }
  assert.deepEqual([...visited].sort(), [1, 2]);
});

test('buddy walks under the active window and watches it', () => {
  const { world, b, run } = makeWorld();
  b.x = 100;
  world.activeWindow = { app: 'Code', title: 'main.ts', bounds: { x: 600, y: 100, width: 300, height: 300 }, observedAt: 0 };
  run(0.5);
  assert.equal(b.mood, 'approach');
  assert.equal(b.facing, 'right');
  assert.equal(b.animation, 'walk');
  run(15);
  assert.equal(b.mood, 'watch');
  assert.equal(b.animation, 'watch');
  assert.ok(Math.abs(b.x - 750) < 2, `stands under window centre, got ${b.x}`);
  // Same window again does not retrigger.
  run(70);
  assert.equal(b.mood, 'wander');
  world.activeWindow = { ...world.activeWindow, observedAt: 1 };
  run(1);
  assert.notEqual(b.mood, 'approach');
});

test('idle: sits, then sleeps, then wakes happy on activity', () => {
  const { world, b, run } = makeWorld();
  world.idleSeconds = 61;
  run(0.2);
  assert.equal(b.mood, 'sit');
  assert.equal(b.animation, 'sit');
  world.idleSeconds = 121;
  run(0.2);
  assert.equal(b.mood, 'sleep');
  assert.equal(b.animation, 'sleep');
  world.idleSeconds = 0;
  run(0.2);
  assert.equal(b.mood, 'happy');
  run(3);
  assert.equal(b.mood, 'wander');
});

test('alert at the active window: walks there, shows bubble, bubble expires', () => {
  const { world, b, run, clock } = makeWorld();
  b.x = 50;
  world.activeWindow = { app: 'Terminal', title: '', bounds: { x: 400, y: 100, width: 200, height: 200 }, observedAt: 0 };
  world.alert({ message: 'Build failed', level: 'error' });
  run(0.1);
  assert.equal(b.mood, 'alert');
  run(6);
  assert.ok(Math.abs(b.x - 500) < 2, `walked under the window, got ${b.x}`);
  assert.equal(b.bubble?.text, 'Build failed');
  assert.equal(b.bubble?.level, 'error');
  assert.equal(b.animation, 'alert');
  const shownAt = clock();
  run(5.5);
  assert.equal(b.bubble, null, 'bubble gone after bubbleSeconds');
  assert.ok(clock() - shownAt >= 5000);
  assert.notEqual(b.mood, 'alert');
});

test('guide to a point: rises to the point, points, then falls back to the floor', () => {
  const { world, b, run } = makeWorld();
  b.x = 100;
  world.alert({ message: 'Click here', target: { x: 300, y: 200 }, duration: 2 });
  run(0.1);
  assert.equal(b.mood, 'guide');
  run(4);
  assert.equal(b.animation, 'point');
  assert.deepEqual(b.pointer, { x: 300, y: 200 });
  assert.ok(b.y < floorOf(D1), 'left the floor');
  assert.equal(b.bubble?.text, 'Click here');
  run(3);
  assert.equal(b.pointer, null);
  run(2);
  assert.equal(b.y, floorOf(D1), 'back on the floor');
  assert.ok(b.mood === 'watch' || b.mood === 'wander');
});

test('sticky bubble (duration 0) stays until dismissed', () => {
  const { world, b, run } = makeWorld();
  world.alert({ message: 'Read me', target: 'here', duration: 0 });
  run(30);
  assert.equal(b.bubble?.text, 'Read me');
  b.dismissBubble();
  run(0.1);
  assert.equal(b.bubble, null);
});

test('alerts interrupt sleeping and queue up', () => {
  const { world, b, run } = makeWorld();
  world.idleSeconds = 500;
  run(0.2);
  assert.equal(b.mood, 'sleep');
  world.alert({ message: 'one', target: 'here', duration: 1 });
  world.alert({ message: 'two', target: 'here', duration: 1 });
  run(0.1);
  assert.equal(b.bubble?.text, 'one');
  run(1.2);
  run(0.1);
  assert.equal(b.bubble?.text, 'two');
});

test('drag and drop: follows the cursor then falls to the floor of the new display', () => {
  const { world, b, run } = makeWorld();
  b.startDrag(b.x, b.y);
  b.drag(1200, 100, world.displays);
  run(0.1);
  assert.equal(b.mood, 'drag');
  assert.equal(b.displayId, 2);
  b.endDrag(world.displays);
  run(2);
  assert.equal(b.y, floorOf(D2));
});

test('view exposes a valid frame for the current animation', () => {
  const { b, run } = makeWorld();
  run(1);
  const v = b.view();
  const def = manifest.animations[v.animation];
  assert.ok(def, `animation ${v.animation} exists`);
  assert.ok(v.frame >= 0 && v.frame < def.frames.length);
});

test('mouse target resolves to a point on the right display', () => {
  const { world, b, run } = makeWorld();
  world.mouse = { x: 1500, y: 300 };
  world.alert({ message: 'here', target: 'mouse', duration: 1 });
  run(20);
  assert.equal(b.displayId, 2);
});
