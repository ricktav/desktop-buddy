#!/usr/bin/env node
// Command-line client for the Desktop Buddy local API.
//
//   buddy alert "Build failed" [--level error] [--target active|here|mouse] [--duration 10] [--buddy Biscuit]
//   buddy say "Hello"                       (bubble where the buddy stands)
//   buddy guide X Y "Click here"            (walk to a screen point and point at it)
//   buddy state | buddies | add <pack> | remove <id> | reload
//
// Env: BUDDY_PORT (default 47821), BUDDY_TOKEN (if the API has a token configured).
const http = require('node:http');

const args = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) { opts[key] = next; i++; } else opts[key] = true;
  } else positional.push(a);
}
const port = Number(opts.port ?? process.env.BUDDY_PORT ?? 47821);
const token = opts.token ?? process.env.BUDDY_TOKEN;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: { 'content-type': 'application/json', ...(token ? { 'x-buddy-token': token } : {}) } },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(out) }); } catch { resolve({ status: res.statusCode, body: out }); }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function usage() {
  console.log(`Usage:
  buddy alert <message> [--level info|warn|error] [--target active|here|mouse] [--duration SEC] [--buddy NAME]
  buddy say <message> [--duration SEC] [--buddy NAME]
  buddy guide <x> <y> <message> [--duration SEC] [--buddy NAME]
  buddy state
  buddy buddies
  buddy add <pack-folder-name-or-path>
  buddy remove <buddy-id>
  buddy reload
Options: --port N (or BUDDY_PORT), --token T (or BUDDY_TOKEN)`);
}

async function main() {
  const [cmd, ...rest] = positional;
  const common = {
    level: opts.level,
    duration: opts.duration !== undefined ? Number(opts.duration) : undefined,
    buddy: opts.buddy,
  };
  let r;
  switch (cmd) {
    case 'alert':
      if (!rest.length) return usage();
      r = await request('POST', '/alert', { message: rest.join(' '), target: opts.target, ...common });
      break;
    case 'say':
      if (!rest.length) return usage();
      r = await request('POST', '/say', { message: rest.join(' '), ...common });
      break;
    case 'guide': {
      const [x, y, ...msg] = rest;
      if (!msg.length || Number.isNaN(Number(x)) || Number.isNaN(Number(y))) return usage();
      r = await request('POST', '/guide', { message: msg.join(' '), x: Number(x), y: Number(y), ...common });
      break;
    }
    case 'state': r = await request('GET', '/state'); break;
    case 'buddies': r = await request('GET', '/buddies'); break;
    case 'add': if (!rest[0]) return usage(); r = await request('POST', '/buddies', { pack: rest[0] }); break;
    case 'remove': if (!rest[0]) return usage(); r = await request('DELETE', `/buddies/${encodeURIComponent(rest[0])}`); break;
    case 'reload': r = await request('POST', '/reload'); break;
    default: return usage();
  }
  console.log(JSON.stringify(r.body, null, 2));
  if (r.status >= 400) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`Could not reach Desktop Buddy on port ${port}: ${err.message}\nIs the app running?`);
  process.exitCode = 2;
});
