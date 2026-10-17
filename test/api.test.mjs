import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { startApi } = require('../dist/main/api.js');
const run = promisify(execFile);

const received = [];
const server = startApi(0, 'secret', {
  alert: (req) => { received.push(req); return { ok: true, buddy: 'b1' }; },
  state: () => ({ buddies: [] }),
  listBuddies: () => ({ active: [], available: [] }),
  addBuddy: async (ref) => (ref === 'bad' ? { ok: false, error: 'nope' } : { ok: true, id: ref + '-1' }),
  removeBuddy: () => ({ ok: true }),
  reload: async () => {},
});
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
