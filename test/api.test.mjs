import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { startApi } = require('../dist/main/api.js');
const run = promisify(execFile);

const received = [];
const { parseDurationMs } = require('../dist/main/api.js');
const server = startApi(0, 'secret', {
  alert: (req) => { received.push(req); return { ok: true, buddy: 'b1' }; },
  state: () => ({ buddies: [] }),
  listBuddies: () => ({ active: [], available: [] }),
  addBuddy: async (ref) => (ref === 'bad' ? { ok: false, error: 'nope' } : { ok: true, id: ref + '-1' }),
  removeBuddy: () => ({ ok: true }),
  reload: async () => {},
  setSpeed: (req) => { speedCalls.push(req); return req.buddy === 'ghost' ? { ok: false, error: 'buddy "ghost" not found' } : { ok: true, scope: req.buddy ? 'buddy' : req.seconds ? 'temporary' : 'global', affected: 1 }; },
  getSpeed: () => ({ global: 2, boosts: [{ buddy: 'Biscuit', factor: 4, remainingSeconds: 12 }] }),
  startTimer: (ms, name, buddy) => { started.push({ ms, name, buddy }); return { id: 't1', name: name ?? 'Timer 1', endsAt: Date.now() + ms, durationMs: ms, buddy }; },
  listTimers: () => [{ id: 't1', name: 'Tea', endsAt: 0, durationMs: 60000, remaining: '0:59' }],
  cancelTimer: (id) => id === 't1',
  restart: () => { lifecycle.push('restart'); },
  quit: () => { lifecycle.push('quit'); },
});
const lifecycle = [];
const started = [];
const speedCalls = [];
await new Promise((r) => server.once('listening', r));
const port = server.address().port;
after(() => server.close());

const cli = (...args) => run('node', ['bin/buddy.js', '--port', String(port), '--token', 'secret', ...args]);

test('rejects requests without the token', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/state`);
  assert.equal(res.status, 401);
});

test('CLI alert / say / guide reach the handler with the right shape', async () => {
  received.length = 0;
  await cli('alert', 'Build', 'failed', '--level', 'error', '--target', 'mouse', '--duration', '3');
  await cli('say', 'hello there');
  await cli('guide', '120', '340', 'Click', 'this');
  assert.deepEqual(received, [
    { message: 'Build failed', level: 'error', target: 'mouse', duration: 3, buddy: undefined },
    { message: 'hello there', level: 'info', target: 'here', duration: undefined, buddy: undefined },
    { message: 'Click this', level: 'info', target: { x: 120, y: 340 }, duration: undefined, buddy: undefined },
  ]);
});

test('validation errors and buddy management', async () => {
  const bad = await fetch(`http://127.0.0.1:${port}/alert`, { method: 'POST', headers: { 'x-buddy-token': 'secret' }, body: '{}' });
  assert.equal(bad.status, 400);
  const add = await cli('add', 'lab-black');
  assert.match(add.stdout, /lab-black-1/);
  await assert.rejects(cli('add', 'bad'));
  const st = await cli('state');
  assert.match(st.stdout, /"ok": true/);
});

test('timer routes and CLI', async () => {
  started.length = 0;
  const r = await cli('timer', '25m', 'Pomodoro', '--buddy', 'Jack');
  assert.match(r.stdout, /"ok": true/);
  await cli('timer', '90s');
  assert.deepEqual(started, [{ ms: 25 * 60_000, name: 'Pomodoro', buddy: 'Jack' }, { ms: 90_000, name: undefined, buddy: undefined }]);
  const list = await cli('timers');
  assert.match(list.stdout, /"remaining": "0:59"/);
  const ok = await cli('cancel', 't1');
  assert.match(ok.stdout, /"ok": true/);
  await assert.rejects(cli('cancel', 'nope'));
  const bad = await fetch(`http://127.0.0.1:${port}/timer`, { method: 'POST', headers: { 'x-buddy-token': 'secret' }, body: '{"name":"x"}' });
  assert.equal(bad.status, 400);
});

test('parseDurationMs', () => {
  assert.equal(parseDurationMs('25m'), 25 * 60_000);
  assert.equal(parseDurationMs('1h30m'), 90 * 60_000);
  assert.equal(parseDurationMs('90s'), 90_000);
  assert.equal(parseDurationMs('2'), 120_000);
  assert.equal(parseDurationMs('2 hours 5 minutes'), 125 * 60_000);
  assert.equal(parseDurationMs('soon'), null);
});

test('speed routes and CLI', async () => {
  speedCalls.length = 0;
  const g = await cli('speed', 'fast');
  assert.match(g.stdout, /"scope": "global"/);
  assert.match(g.stdout, /"factor": 2/);
  await cli('speed', 'turbo', '--for', '30');
  await cli('speed', '3x', '--buddy', 'Jack');
  await cli('speed', 'normal', '--buddy', 'Jack');
  assert.deepEqual(speedCalls, [
    { factor: 2, seconds: undefined, buddy: undefined },
    { factor: 4, seconds: 30, buddy: undefined },
    { factor: 3, seconds: undefined, buddy: 'Jack' },
    { factor: 1, seconds: undefined, buddy: 'Jack' },
  ]);
  const status = await cli('speed');
  assert.match(status.stdout, /"global": 2/);
  assert.match(status.stdout, /"remainingSeconds": 12/);
  await assert.rejects(cli('speed', 'ludicrous'));
  await assert.rejects(cli('speed', 'fast', '--buddy', 'ghost'));
  const bad = await fetch(`http://127.0.0.1:${port}/speed`, { method: 'POST', headers: { 'x-buddy-token': 'secret' }, body: '{"factor":-1}' });
  assert.equal(bad.status, 400);
});

test('alert --hurry and --speed reach the handler', async () => {
  received.length = 0;
  await cli('alert', 'Now!', '--hurry');
  await cli('guide', '10', '20', 'There', '--speed', '5');
  assert.equal(received[0].hurry, true);
  assert.equal(received[0].message, 'Now!');
  assert.equal(received[1].speed, 5);
  assert.deepEqual(received[1].target, { x: 10, y: 20 });
});

test('POST /restart and /quit call the lifecycle handlers and need the token', async () => {
  const noTok = await fetch(`http://127.0.0.1:${port}/quit`, { method: 'POST' });
  assert.equal(noTok.status, 401);
  assert.deepEqual(lifecycle, []);
  for (const path of ['/restart', '/quit']) {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'x-buddy-token': 'secret' } });
    assert.equal(r.status, 200);
  }
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(lifecycle, ['restart', 'quit']);
});
