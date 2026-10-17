import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REQUIRED = ['idle', 'walk'];
const EXPECTED = ['idle', 'walk', 'sit', 'sleep', 'watch', 'point', 'alert', 'happy', 'drag'];
const root = join(import.meta.dirname, '..', 'buddies');
const packs = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory());

test('bundled packs include the seven shipped buddies', () => {
  for (const p of ['lab-yellow', 'lab-chocolate', 'lab-black', 'robot-pixel', 'unicorn', 'rainbow-man', 'lab-doctor']) {
    assert.ok(packs.includes(p), `${p} missing`);
  }
});

for (const pack of packs) {
  test(`pack ${pack} has a valid manifest and all frames`, () => {
    const dir = join(root, pack);
    const m = JSON.parse(readFileSync(join(dir, 'buddy.json'), 'utf8'));
    assert.equal(typeof m.name, 'string');
    assert.ok(m.frameWidth > 0 && m.frameHeight > 0);
    for (const r of REQUIRED) assert.ok(m.animations[r]?.frames?.length, `${pack}: ${r} required`);
    for (const a of EXPECTED) assert.ok(m.animations[a]?.frames?.length, `${pack}: shipped packs should define ${a}`);
    for (const [a, def] of Object.entries(m.animations)) {
      assert.ok(def.fps > 0, `${pack}/${a} fps`);
      for (const f of def.frames) {
        const file = join(dir, f);
        assert.ok(existsSync(file), `${pack}/${a}: missing ${f}`);
        const svg = readFileSync(file, 'utf8');
        assert.match(svg, /^<svg /, `${pack}/${f} is not an SVG`);
        assert.match(svg, /<\/svg>\s*$/, `${pack}/${f} truncated`);
      }
    }
  });
}
