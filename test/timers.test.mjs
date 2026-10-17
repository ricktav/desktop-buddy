import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { TimerManager, timerDoneMessage } = require('../dist/main/timers.js');
const { parseNotificationPlist, announcement, parseBadge, badgeDelta } = require('../dist/main/notifications.js');

function fakeClock() {
  let now = 1_000_000;
  const pending = [];
  const schedule = (fn, ms) => {
    const h = { at: now + ms, fn };
    pending.push(h);
    return h;
  };
  const cancel = (h) => {
    const i = pending.indexOf(h);
    if (i >= 0) pending.splice(i, 1);
  };
  const advance = (ms) => {
    now += ms;
    for (const h of [...pending].sort((a, b) => a.at - b.at)) {
      if (h.at <= now) {
        cancel(h);
        h.fn();
      }
    }
  };
  return { now: () => now, schedule, cancel, advance };
}

test('timers fire once, in order, and can be cancelled', () => {
  const clock = fakeClock();
  const done = [];
  const tm = new TimerManager((t) => done.push(t.name), clock.now, clock.schedule, clock.cancel);
  const a = tm.start(5 * 60_000, { name: 'Tea' });
  const b = tm.start(60_000, { name: 'Eggs' });
  const c = tm.start(120_000);
  assert.deepEqual(tm.list().map((t) => t.name), ['Eggs', 'Timer 3', 'Tea']);
  assert.equal(tm.remainingLabel(a), '5:00');
  assert.ok(tm.cancel(c.id));
  assert.ok(!tm.cancel(c.id));
  clock.advance(61_000);
  assert.deepEqual(done, ['Eggs']);
  assert.equal(tm.remainingLabel(a), '3:59');
  clock.advance(5 * 60_000);
  assert.deepEqual(done, ['Eggs', 'Tea']);
  assert.equal(tm.list().length, 0);
  assert.throws(() => tm.start(0));
  assert.equal(timerDoneMessage(b), '⏰ Eggs is done! (1 min)');
});

test('notification plist parsing pulls title, subtitle and body', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>app</key><string>net.whatsapp.WhatsApp</string>
  <key>req</key><dict>
    <key>body</key><string>Are we still on for 7? &amp; bring the cake</string>
    <key>titl</key><string>Lily</string>
    <key>subt</key><string></string>
  </dict>
</dict></plist>`;
  const p = parseNotificationPlist(xml);
  assert.deepEqual(p, { title: 'Lily', subtitle: null, body: 'Are we still on for 7? & bring the cake' });
  assert.equal(announcement({ label: 'WhatsApp', title: 'Lily', body: p.body, unread: null, source: 'notification-center' }, true),
    '📨 WhatsApp message from Lily: Are we still on for 7? & bring the cake');
  assert.equal(announcement({ label: 'WhatsApp', title: 'Lily', body: p.body, unread: null, source: 'notification-center' }, false),
    '📨 WhatsApp message from Lily');
  assert.equal(announcement({ label: 'WhatsApp', title: null, body: null, unread: 3, source: 'dock-badge' }, true),
    '📨 WhatsApp: 3 unread messages');
});

test('dock badge parsing and delta rules', () => {
  assert.equal(parseBadge('3'), 3);
  assert.equal(parseBadge('12 new'), 12);
  assert.equal(parseBadge('•'), 1);
  assert.equal(parseBadge(''), 0);
  assert.equal(parseBadge(null), 0);
  assert.equal(badgeDelta(null, 5), null, 'first reading is a silent baseline');
  assert.equal(badgeDelta(2, 3), 3);
  assert.equal(badgeDelta(3, 3), null);
  assert.equal(badgeDelta(3, 0), null);
});
