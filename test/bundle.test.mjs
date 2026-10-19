import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const B = require('../dist/main/bundle.js');
const root = join(import.meta.dirname, '..');

const tmp = () => mkdtempSync(join(tmpdir(), 'buddy-test-'));
const svg = (body = "<circle cx='64' cy='100' r='20' fill='red'/>") => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>${body}</svg>`;
function bundle(over = {}) {
  return {
    id: 'tester',
    manifest: {
      name: 'Tester', frameWidth: 128, frameHeight: 128, facing: 'right', feetOffset: 6, scale: 1,
      animations: { idle: { fps: 2, frames: ['idle-0.svg'] }, walk: { fps: 6, frames: ['walk-0.svg', 'walk-1.svg'] } },
      ...(over.manifest ?? {}),
    },
    files: { 'idle-0.svg': svg(), 'walk-0.svg': svg(), 'walk-1.svg': svg(), ...(over.files ?? {}) },
  };
}
const text = (b) => JSON.stringify(b);

function promptExample() {
  const md = readFileSync(join(root, 'docs', 'LLM-PROMPT.md'), 'utf8');
  const m = /<!-- example:minimal -->\s*```json\n([\s\S]*?)\n```/.exec(md);
  assert.ok(m, 'docs/LLM-PROMPT.md must contain the minimal example marker and a json block');
  return m[1];
}

test('every bundled pack validates without errors', () => {
  const dir = join(root, 'buddies');
  for (const p of readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory())) {
    const r = B.validateFolder(join(dir, p));
    assert.deepEqual(r.errors, [], `${p}: ${r.errors.join('; ')}`);
  }
});

test('the example in the LLM prompt is valid and imports', () => {
  const dest = tmp();
  try {
    const res = B.importBundleText(promptExample(), { destRoot: dest });
    assert.equal(res.ok, true, B.formatReport(res.report));
    assert.equal(res.id, 'blobby');
    assert.deepEqual(res.report.errors, []);
    const again = B.validateFolder(join(dest, 'blobby'));
    assert.deepEqual(again.errors, []);
    assert.ok(existsSync(join(dest, 'blobby', 'alert-1.svg')));
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('the shipped ghost example is valid, complete and imports', () => {
  const raw = readFileSync(join(root, 'examples', 'ghost.buddy.json'), 'utf8');
  const parsed = B.parseBundleText(raw);
  const r = B.validateBundle(parsed.bundle);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  for (const a of ['idle', 'walk', 'sit', 'sleep', 'watch', 'point', 'alert', 'happy', 'drag', 'trick']) assert.ok(parsed.bundle.manifest.animations[a], a);
  const dest = tmp();
  try {
    assert.equal(B.importBundleText(raw, { destRoot: dest }).ok, true);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('parsing tolerates code fences, surrounding prose and the flat layout', () => {
  const b = bundle();
  const fenced = 'Sure! Here is your buddy:\n\n```json\n' + JSON.stringify(b, null, 2) + '\n```\n\nEnjoy!';
  assert.ok(B.parseBundleText(fenced).bundle);
  assert.ok(B.parseBundleText('```\n' + text(b) + '\n```').bundle);
  const flat = { id: 'flat', ...b.manifest, files: b.files };
  const p = B.parseBundleText(text(flat));
  assert.ok(p.bundle, p.error);
  assert.equal(p.bundle.manifest.name, 'Tester');
  assert.equal(p.bundle.id, 'flat');
});

test('broken JSON reports the line and column', () => {
  const p = B.parseBundleText('{\n  "id": "x",\n  "manifest": {,\n}');
  assert.ok(p.error);
  assert.match(p.error, /line 3/);
  assert.match(p.error, /single quotes/);
});

test('validation catches the mistakes an AI typically makes', () => {
  const errs = (b) => B.validateBundle(b).errors.join(' | ');
  assert.match(errs(bundle({ manifest: { animations: { idle: { fps: 2, frames: ['idle-0.svg'] } } } })), /"walk" is required/);
  assert.match(errs(bundle({ files: { 'walk-1.svg': undefined } })), /missing|walk-1/);
  const noFile = bundle(); delete noFile.files['walk-1.svg'];
  assert.match(errs(noFile), /walk-1\.svg.*missing/);
  assert.match(errs(bundle({ files: { 'idle-0.svg': '```svg\n' + svg() + '\n```' } })), /must start with <svg/);
  assert.match(errs(bundle({ files: { 'idle-0.svg': svg().replace('</svg>', '') } })), /does not end with <\/svg>/);
  assert.match(errs(bundle({ files: { 'idle-0.svg': '<svg viewBox="0 0 128 128"><circle r="5"/></svg>' } })), /xmlns/);
  assert.match(errs(bundle({ files: { 'idle-0.svg': svg('<script>alert(1)</script>') } })), /<script>/);
  assert.match(errs(bundle({ files: { 'idle-0.svg': svg("<rect onclick='x()' width='5' height='5'/>") } })), /event handler/);
  assert.match(errs(bundle({ files: { 'idle-0.svg': svg("<image href='https://evil.example/x.png'/>") } })), /external references/);
  assert.match(errs(bundle({ files: { 'idle-0.svg': svg("<rect fill='url(https://evil.example/g)' width='5' height='5'/>") } })), /url\(/);
  assert.match(errs(bundle({ manifest: { animations: { idle: { fps: 2, frames: ['../evil.svg'] }, walk: { fps: 6, frames: ['walk-0.svg'] } } } })), /not allowed/);
  assert.match(errs(bundle({ manifest: { animations: { idle: { fps: 2, frames: ['sub/idle.svg'] }, walk: { fps: 6, frames: ['walk-0.svg'] } } } })), /not allowed/);
  assert.match(errs(bundle({ manifest: { doubleClick: { animation: 'nope' } } })), /doubleClick\.animation/);
  assert.match(errs(bundle({ manifest: { doubleClick: { effect: { type: 'lasers' } } } })), /unknown effect/);
  assert.match(errs(bundle({ manifest: { doubleClick: { effect: { type: 'arc-letters', text: 'WAYTOOLONGTEXT' } } } })), /1 to 12/);
  assert.match(errs(bundle({ manifest: { name: '' } })), /"name" is required/);
  const huge = bundle({ files: { 'idle-0.svg': svg('<!--' + 'x'.repeat(310 * 1024) + '-->') } });
  assert.match(errs(huge), /limit is 300 KB/);
});

test('warnings do not block, and unused files are called out', () => {
  const b = bundle({ files: { 'extra.svg': svg() }, manifest: { feetOffset: undefined, facing: undefined } });
  delete b.manifest.feetOffset; delete b.manifest.facing;
  const r = B.validateBundle(b);
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /extra\.svg/.test(w)));
  assert.ok(r.warnings.some((w) => /feetOffset/.test(w)));
  assert.ok(r.info.some((i) => /fall back to "idle"/.test(i)));
  const mismatch = bundle({ files: { 'idle-0.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 50'><rect width='10' height='10'/></svg>" } });
  assert.ok(B.validateBundle(mismatch).warnings.some((w) => /stretched/.test(w)));
});

test('import writes only referenced files, refuses duplicates, supports force and auto-suffix', () => {
  const dest = tmp();
  const bundled = tmp();
  try {
    const b = bundle({ files: { 'unused.svg': svg() } });
    const r1 = B.importBundleText(text(b), { destRoot: dest, bundledDir: bundled });
    assert.equal(r1.ok, true);
    assert.deepEqual(readdirSync(join(dest, 'tester')).sort(), ['buddy.json', 'idle-0.svg', 'walk-0.svg', 'walk-1.svg']);
    const r2 = B.importBundleText(text(b), { destRoot: dest, bundledDir: bundled });
    assert.equal(r2.ok, false);
    assert.match(r2.report.errors.join(' '), /already exists/);
    assert.equal(B.importBundleText(text(b), { destRoot: dest, bundledDir: bundled, force: true }).ok, true);
    const r3 = B.importBundleText(text(b), { destRoot: dest, bundledDir: bundled, autoSuffix: true });
    assert.equal(r3.id, 'tester-2');
    const r4 = B.importBundleText(text(b), { destRoot: dest, id: 'Other Name!' });
    assert.equal(r4.id, 'other-name');
    // an id that collides with a bundled pack is refused
    rmSync(bundled, { recursive: true, force: true });
    const fake = join(bundled, 'tester'); execFileSync('mkdir', ['-p', fake]);
    const r5 = B.importBundleText(text(b), { destRoot: tmp(), bundledDir: bundled });
    assert.equal(r5.ok, false);
    assert.match(r5.report.errors.join(' '), /bundled/);
  } finally {
    rmSync(dest, { recursive: true, force: true });
    rmSync(bundled, { recursive: true, force: true });
  }
});

test('importing a folder copies it and rejects invalid folders', () => {
  const dest = tmp();
  try {
    const res = B.importFolder(join(root, 'buddies', 'pumpkin'), { destRoot: dest, id: 'pumpkin-copy' });
    assert.equal(res.ok, true, B.formatReport(res.report));
    assert.deepEqual(B.validateFolder(join(dest, 'pumpkin-copy')).errors, []);
    const bad = B.importFolder(join(root, 'docs'), { destRoot: dest });
    assert.equal(bad.ok, false);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('CLI: validate and import from a file and from stdin', () => {
  const dest = tmp();
  const run = (args, input) => spawnSync('node', ['bin/buddy.js', ...args], { cwd: root, input, encoding: 'utf8' });
  try {
    const ok = run(['validate', 'examples/ghost.buddy.json']);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /Valid/);
    const bad = run(['validate', '-'], text(bundle({ manifest: { name: '' } })));
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /"name" is required/);
    const imp = run(['import', 'examples/ghost.buddy.json', '--dir', dest, '--no-add']);
    assert.equal(imp.status, 0, imp.stdout + imp.stderr);
    assert.match(imp.stdout, /Installed "wisp-ghost"/);
    const piped = run(['import', '-', '--dir', dest, '--no-add', '--id', 'from-stdin'], promptExample());
    assert.equal(piped.status, 0, piped.stdout + piped.stderr);
    assert.ok(existsSync(join(dest, 'from-stdin', 'buddy.json')));
    const dup = run(['import', 'examples/ghost.buddy.json', '--dir', dest, '--no-add']);
    assert.equal(dup.status, 1);
    assert.match(dup.stdout, /already exists/);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('edge, gripOffset and speed are validated', () => {
  const { validatePack } = require('../dist/main/bundle.js');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'><rect width='10' height='10'/></svg>`;
  const man = (extra) => ({ name: 'T', frameWidth: 128, frameHeight: 128, facing: 'right', feetOffset: 6, animations: { idle: { frames: ['a.svg'], fps: 2 }, walk: { frames: ['a.svg'], fps: 4 } }, ...extra });
  const check = (extra) => validatePack(man(extra), () => svg);
  assert.deepEqual(check({ edge: 'top', gripOffset: 8, speed: 0.3 }).errors, []);
  assert.match(check({ edge: 'top' }).warnings.join(), /gripOffset/);
  assert.match(check({ edge: 'left' }).errors.join(), /"edge"/);
  assert.match(check({ speed: 9 }).errors.join(), /"speed"/);
  assert.match(check({ gripOffset: -1 }).errors.join(), /gripOffset/);
});
