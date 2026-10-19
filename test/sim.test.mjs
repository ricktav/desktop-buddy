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

function makeWorld({ displays = [D1, D2], seed = 1, cfgOver = {} } = {}) {
  let now = 0;
  const world = new World({ cfg: { ...cfg, ...cfgOver }, rng: seeded(seed), now: () => now });
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

test('double-click trick plays the pack animation with its effect, then returns to wandering', () => {
  const { world, b, run } = makeWorld();
  const uni = require('../buddies/unicorn/buddy.json');
  const u = world.addBuddy('u1', 'unicorn', uni);
  u.trick(0);
  run(0.1);
  assert.equal(u.mood, 'trick');
  assert.equal(u.animation, 'rear');
  assert.deepEqual(u.view().effect, { type: 'arc-letters', text: 'LILY' });
  // Petting and idling do not interrupt the trick.
  u.pet(100);
  world.idleSeconds = 500;
  run(1);
  assert.equal(u.mood, 'trick');
  world.idleSeconds = 0;
  run(4);
  assert.notEqual(u.mood, 'trick');
  assert.equal(u.view().effect, null);
  // A pack without a trick ignores double-clicks.
  b.trick(0);
  run(0.1);
  assert.notEqual(b.mood, 'trick');
});

test('a trick with a line shows it in a bubble for the trick duration', () => {
  const { world, run, clock } = makeWorld();
  const pk = require('../buddies/pumpkin/buddy.json');
  const j = world.addBuddy('j1', 'pumpkin', pk);
  j.trick(clock());
  run(0.1);
  assert.equal(j.mood, 'trick');
  assert.equal(j.animation, 'spin');
  assert.equal(j.bubble?.text, 'BOO!');
  assert.deepEqual(j.view().effect, { type: 'bats', count: 5 });
  run(4);
  assert.notEqual(j.mood, 'trick');
  assert.equal(j.bubble, null);
});

test('a cheer alert plays the trick animation with confetti and bounces until dismissed', () => {
  const { world, run } = makeWorld();
  const pk = require('../buddies/pumpkin/buddy.json');
  const j = world.addBuddy('j1', 'pumpkin', pk);
  world.activeWindow = { app: 'Code', title: '', bounds: { x: 500, y: 100, width: 200, height: 200 }, observedAt: 0 };
  world.alert({ message: 'Timer done!', target: 'active', duration: 0, cheer: true, buddy: 'j1' });
  run(8);
  assert.equal(j.mood, 'alert');
  assert.equal(j.bubble?.text, 'Timer done!');
  const v = j.view();
  assert.equal(v.cheering, true);
  assert.equal(v.animation, 'spin', 'uses the pack trick animation');
  assert.deepEqual(v.effect, { type: 'confetti' });
  run(30);
  assert.equal(j.view().cheering, true, 'sticky until clicked');
  j.dismissBubble();
  run(0.2);
  assert.equal(j.view().cheering, false);
  assert.equal(j.view().effect, null);
  // A pack without a trick cheers with its happy animation.
  const b = world.buddies[0];
  world.alert({ message: 'Done', target: 'here', duration: 1, cheer: true, buddy: b.id });
  run(0.2);
  assert.equal(b.view().animation, 'happy');
});

test('clicking a cheering buddy ends the celebration and nothing lingers', () => {
  const { world, b, run } = makeWorld();
  world.alert({ message: 'Timer done!', target: 'here', duration: 0, cheer: true });
  run(0.5);
  assert.equal(b.view().cheering, true);
  b.pet(1000);
  run(0.2);
  assert.equal(b.view().cheering, false);
  assert.equal(b.view().effect, null);
  assert.equal(b.bubble, null);
  assert.ok(b.mood !== 'alert');
  // Petting afterwards works normally again.
  b.pet(2000);
  run(0.1);
  assert.equal(b.mood, 'happy');
  run(3);
  assert.equal(b.mood, 'wander');
});

const FAR_WINDOW = { app: 'Code', title: 'far', bounds: { x: 650, y: 100, width: 100, height: 200 }, observedAt: 0 };

test('speed factor scales how far a buddy walks', () => {
  const dist = (factor) => {
    const { world, b, run } = makeWorld({ cfgOver: { speedFactor: factor } });
    b.x = 60;
    world.activeWindow = FAR_WINDOW;
    run(1);
    return b.x - 60;
  };
  const slow = dist(1), fast = dist(3), turbo = dist(6);
  assert.ok(slow > 30, `walks at normal speed (${slow})`);
  assert.ok(fast / slow > 2.7 && fast / slow < 3.3, `3x is about 3 times as far (${fast / slow})`);
  assert.ok(turbo / slow > 5.4 && turbo / slow < 6.6, `6x is about 6 times as far (${turbo / slow})`);
});

test('a speed boost applies per buddy, can be timed, and expires', () => {
  const { world, b, run } = makeWorld();
  const other = world.addBuddy('o1', 'lab-yellow', manifest);
  other.x = 60;
  b.x = 60;
  world.activeWindow = FAR_WINDOW;
  assert.equal(world.boostSpeed(4, 2, 'b1'), 1);
  assert.equal(world.boostSpeed(4, 2, 'nobody'), 0);
  assert.equal(world.speedBoosts().length, 1);
  run(1.5);
  assert.ok((b.x - 60) / (other.x - 60) > 3, 'boosted buddy is much further along');
  run(1.5);
  assert.equal(world.speedBoosts().length, 0, 'boost expired');
  // untimed boost on all buddies stays until cleared with factor 1
  assert.equal(world.boostSpeed(2, null), 2);
  run(1);
  assert.equal(world.speedBoosts().length, 2);
  world.boostSpeed(1, null);
  assert.equal(world.speedBoosts().length, 0);
});

test('hurry and speed make an alert trip faster', () => {
  const arrival = (req) => {
    const { world, b, run, clock } = makeWorld();
    b.x = 60;
    world.activeWindow = FAR_WINDOW;
    world.alert({ message: 'go', duration: 0, ...req });
    const start = clock();
    for (let i = 0; i < 600 && !b.bubble; i++) run(0.1);
    return clock() - start;
  };
  const normal = arrival({}), hurry = arrival({ hurry: true }), custom = arrival({ speed: 5 });
  assert.ok(hurry < normal * 0.6, `hurry (${hurry}ms) is much faster than normal (${normal}ms)`);
  assert.ok(custom < hurry, `speed 5 (${custom}ms) beats hurry (${hurry}ms)`);
});

test('the leg animation runs faster when the buddy does', () => {
  const frameChanges = (factor) => {
    const { world, b, run } = makeWorld({ cfgOver: { speedFactor: factor } });
    b.x = 60;
    world.activeWindow = FAR_WINDOW;
    run(0.2);
    assert.equal(b.view().animation, 'walk');
    let last = b.view().frame, changes = 0;
    for (let i = 0; i < 60; i++) {
      run(1 / 30);
      const f = b.view().frame;
      if (f !== last) changes++;
      last = f;
    }
    return changes;
  };
  assert.ok(frameChanges(3) > frameChanges(1) * 1.8, 'more frame changes at 3x');
});

// ---- top-edge buddies (the sloth) ------------------------------------------------

const slothManifest = require('../buddies/sloth/buddy.json');
function makeSloth(opts = {}) {
  let now = 0;
  const world = new World({ cfg: { ...cfg, ...(opts.cfg ?? {}) }, rng: seeded(3), now: () => now });
  world.setDisplays([D1, D2]);
  const b = world.addBuddy('s1', 'sloth', { ...slothManifest, ...(opts.manifest ?? {}) });
  const run = (seconds, dt = 1 / 30) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) { now += dt * 1000; world.tick(dt); }
  };
  return { world, b, run };
}

test('a top-edge buddy hangs from the top of the work area and stays there while wandering', () => {
  const { b, run } = makeSloth();
  assert.equal(b.y, D1.bounds.y);
  for (let i = 0; i < 40; i++) {
    run(2);
    const d = [D1, D2].find((x) => x.id === b.displayId);
    assert.equal(b.y, d.bounds.y, 'always on the top edge of its display');
  }
});

test('the manifest speed slows a buddy down but alerts still travel at a sensible pace', () => {
  const slow = makeSloth(), normal = makeWorld();
  slow.b.x = normal.b.x = 100;
  slow.b.queueAlert({ message: 'go', level: 'info', target: { kind: 'floor', x: 600, displayId: 1 }, durationMs: 1000 });
  normal.b.queueAlert({ message: 'go', level: 'info', target: { kind: 'floor', x: 600, displayId: 1 }, durationMs: 1000 });
  slow.run(1); normal.run(1);
  const slowTravel = Math.abs(slow.b.x - 100), normalTravel = Math.abs(normal.b.x - 100);
  assert.ok(slowTravel > 0 && slowTravel < normalTravel, `sloth ${slowTravel} < normal ${normalTravel}`);
  assert.ok(slowTravel > normalTravel * 0.4, 'alerts do not crawl at full sloth speed');
});

test('a dropped top-edge buddy climbs back up to the top of the display it was dropped on', () => {
  const { world, b, run } = makeSloth();
  b.startDrag(b.x, b.y);
  b.drag(1200, 300, world.displays);
  run(0.1);
  assert.equal(b.displayId, 2);
  b.endDrag(world.displays);
  run(0.3);
  assert.ok(b.y < 300 && b.y > D2.bounds.y, 'climbing, not teleporting');
  run(3);
  assert.equal(b.y, D2.bounds.y);
});

test('guiding a top-edge buddy lowers it toward the target without covering it, then it returns', () => {
  const { world, b, run } = makeSloth();
  b.x = 100;
  world.alert({ message: 'Here', target: { x: 300, y: 450 }, duration: 2 });
  for (let i = 0; i < 100 && b.animation !== 'point'; i++) run(0.1);
  assert.equal(b.animation, 'point');
  run(0.5);
  assert.equal(b.animation, 'point');
  const below = (slothManifest.frameHeight - slothManifest.gripOffset) * b.scale;
  assert.ok(b.y > D1.bounds.y, 'lowered from the edge');
  assert.ok(b.y + below < 450, `sprite bottom ${b.y + below} stays above the target`);
  run(8);
  assert.equal(b.y, D1.bounds.y);
});

test('a pack with a run animation plays it only when moving fast', () => {
  const m = JSON.parse(JSON.stringify(manifest));
  m.animations.run = { frames: ['walk-0.svg'], fps: 10 };
  let now = 0;
  const world = new World({ cfg, rng: seeded(5), now: () => now });
  world.setDisplays([D1, D2]);
  const b = world.addBuddy('r1', 'lab-yellow', m);
  const step = (sec) => { for (let i = 0; i < Math.round(sec * 30); i++) { now += 1000 / 30; world.tick(1 / 30); } };
  b.x = 100;
  b.queueAlert({ message: 'go', level: 'info', target: { kind: 'floor', x: 800, displayId: 1 }, durationMs: 1000, speed: 1.4 });
  step(0.5);
  assert.equal(b.view().animation, 'walk');
  b.queueAlert({ message: 'hurry', level: 'info', target: { kind: 'floor', x: 100, displayId: 1 }, durationMs: 1000, speed: 3 });
  let ran = false;
  for (let i = 0; i < 300 && !ran; i++) { step(0.1); ran = b.view().animation === 'run'; }
  assert.ok(ran, 'run animation used on a hurried trip');
});
