import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseWindowsLine, WINDOWS_PS_SCRIPT } = require('../dist/main/activeWindow.js');
const { parseToastXml, toastAppMatches, decodePayload } = require('../dist/main/notifications.js');
const { buildStartupVbs, installStartup, removeStartup, isStartupInstalled } = require('../dist/main/startup.js');
const { installFileLog } = require('../dist/main/logfile.js');

test('probe script is ASCII-only (PowerShell 5.1 reads BOM-less files as ANSI)', () => {
  assert.ok(/^[\x00-\x7f]*$/.test(WINDOWS_PS_SCRIPT));
  assert.match(WINDOWS_PS_SCRIPT, /GetForegroundWindow/);
});

test('parseWindowsLine parses a probe line', () => {
  const w = parseWindowsLine('chrome\tGoogle - Chrome\t100\t50\t1280\t720\r\n', 42);
  assert.deepEqual(w, { app: 'chrome', title: 'Google - Chrome', bounds: { x: 100, y: 50, width: 1280, height: 720 }, observedAt: 42 });
});

test('parseWindowsLine rejects empty, short and degenerate lines', () => {
  assert.equal(parseWindowsLine(''), null);
  assert.equal(parseWindowsLine('chrome\ttitle\t1\t2'), null);
  assert.equal(parseWindowsLine('chrome\ttitle\t1\t2\t0\t10'), null);
  assert.equal(parseWindowsLine('chrome\ttitle\tx\t2\t10\t10'), null);
});

test('parseWindowsLine allows negative coordinates (monitors left of the primary)', () => {
  const w = parseWindowsLine('code\tfile\t-1920\t-20\t800\t600');
  assert.equal(w.bounds.x, -1920);
});

test('parseToastXml reads title and body, skipping attribution text', () => {
  const xml = `<toast><visual><binding template="ToastGeneric"><text>Alice</text><text>Hello &amp; welcome</text><text placement="attribution">via WhatsApp</text></binding></visual></toast>`;
  assert.deepEqual(parseToastXml(xml), { title: 'Alice', body: 'Hello & welcome' });
  assert.deepEqual(parseToastXml('<toast/>'), { title: null, body: null });
});

test('toastAppMatches matches package ids case-insensitively', () => {
  assert.equal(toastAppMatches('5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App', ['whatsapp']), true);
  assert.equal(toastAppMatches('Microsoft.Teams', ['WhatsApp']), false);
  assert.equal(toastAppMatches(null, ['WhatsApp']), false);
  assert.equal(toastAppMatches('WhatsApp', undefined), false);
});

test('decodePayload handles strings, UTF-8 and UTF-16 bytes', () => {
  assert.equal(decodePayload('<a/>'), '<a/>');
  assert.equal(decodePayload(Buffer.from('<a/>', 'utf8')), '<a/>');
  assert.equal(decodePayload(Buffer.from('<a/>', 'utf16le')), '<a/>');
  assert.equal(decodePayload(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('<a/>', 'utf16le')])), '<a/>');
  assert.equal(decodePayload(null), '');
});

test('startup script launches hidden, with quoted paths', () => {
  const vbs = buildStartupVbs('C:\\Program Files\\Buddy\\Desktop Buddy.exe', null);
  assert.match(vbs, /sh\.Run """C:\\Program Files\\Buddy\\Desktop Buddy\.exe""", 0, False/);
  const dev = buildStartupVbs('C:\\app\\electron.exe', 'C:\\src\\desktop-buddy');
  assert.match(dev, /"""C:\\app\\electron\.exe"" ""C:\\src\\desktop-buddy"""/);
});

test('install / remove startup file round-trips', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'buddy-st-')), 'sub', 'DesktopBuddy.vbs');
  assert.equal(isStartupInstalled(file), false);
  installStartup('x.exe', null, file);
  assert.equal(isStartupInstalled(file), true);
  assert.equal(removeStartup(file), true);
  assert.equal(removeStartup(file), false);
});

test('file log appends console output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-log-'));
  const saved = { ...console };
  const sink = [];
  console.log = (...a) => sink.push(a); // what the wrapper will forward to
  const file = installFileLog(dir);
  console.log('hello-log-line', 42);
  Object.assign(console, saved);
  assert.equal(sink.length, 1);
  assert.match(readFileSync(file, 'utf8'), /LOG\s+hello-log-line 42/);
});
