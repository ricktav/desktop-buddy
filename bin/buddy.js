#!/usr/bin/env node
// Command-line client for the Desktop Buddy local API.
//
//   buddy alert "Build failed" [--level error] [--target active|here|mouse] [--duration 10] [--buddy Biscuit]
//   buddy say "Hello"                       (bubble where the buddy stands)
//   buddy guide X Y "Click here"            (walk to a screen point and point at it)
//   buddy timer 25m "Pomodoro"              (buddy cheers when it is done)
//   buddy timers | buddy cancel <timer-id>
//   buddy state | buddies | add <pack> | remove <id> | reload
//   buddy service install|uninstall|restart|status   (run in the background, start at login)
//
// Env: BUDDY_PORT (default 47821), BUDDY_TOKEN (if the API has a token configured).
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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
  buddy timer <duration> [name...]       e.g. buddy timer 25m Pomodoro   (--buddy NAME to pick who cheers)
  buddy timers
  buddy cancel <timer-id>
  buddy state
  buddy buddies
  buddy add <pack-folder-name-or-path>
  buddy remove <buddy-id>
  buddy reload
  buddy service install|uninstall|restart|status   run Desktop Buddy in the background and at login (macOS)
  buddy diagnose                         check WhatsApp/notification watching step by step
  buddy validate <folder|file.json|->    check a buddy (folder or single-file bundle; - reads stdin) and list problems
  buddy import <folder|file.json|->      install a buddy and put it on screen   [--id name] [--force] [--no-add] [--dir path]
                                         e.g.  pbpaste | node bin/buddy.js import -
Options: --port N (or BUDDY_PORT), --token T (or BUDDY_TOKEN)`);
}

// ---- validate / import ----------------------------------------------------------
function bundleModule() {
  const mod = path.join(PROJECT, 'dist', 'main', 'bundle.js');
  if (!fs.existsSync(mod)) throw new Error('No build found. Run "npm run build" first.');
  return require(mod);
}

function readSource(src) {
  if (src === '-') return { kind: 'text', value: fs.readFileSync(0, 'utf8') };
  const p = path.resolve(src);
  if (!fs.existsSync(p)) throw new Error(`${src} does not exist`);
  return fs.statSync(p).isDirectory() ? { kind: 'folder', value: p } : { kind: 'text', value: fs.readFileSync(p, 'utf8') };
}

function validateCmd(src) {
  const b = bundleModule();
  const s = readSource(src);
  let report;
  if (s.kind === 'folder') report = b.validateFolder(s.value);
  else {
    const parsed = b.parseBundleText(s.value);
    report = parsed.bundle ? b.validateBundle(parsed.bundle) : { errors: [parsed.error], warnings: [], info: [] };
  }
  console.log(b.formatReport(report) || '(nothing to report)');
  if (report.errors.length) {
    console.log(`\n${report.errors.length} error(s). Fix these (or paste this list to the AI that made the buddy) and validate again.`);
    process.exitCode = 1;
  } else {
    console.log('\nValid. Install it with: node bin/buddy.js import ' + (src === '-' ? '-' : src));
  }
}

async function importCmd(src) {
  const b = bundleModule();
  const s = readSource(src);
  const options = {
    destRoot: opts.dir ? path.resolve(String(opts.dir)) : b.userBuddiesPath(),
    id: typeof opts.id === 'string' ? opts.id : undefined,
    force: !!opts.force,
    bundledDir: path.join(PROJECT, 'buddies'),
  };
  const result = s.kind === 'folder' ? b.importFolder(s.value, options) : b.importBundleText(s.value, options);
  console.log(b.formatReport(result.report) || '(nothing to report)');
  if (!result.ok) {
    console.log('\nNot imported. Fix the problems above (or paste them to the AI that made the buddy).');
    process.exitCode = 1;
    return;
  }
  console.log(`\nInstalled "${result.id}" in ${result.dir}`);
  if (opts['no-add']) return;
  try {
    const r = await request('POST', '/buddies', { pack: result.id });
    if (r.status < 400) console.log('Added to your screen. Untick it under Buddies in the paw menu to remove it.');
    else console.log(`Installed, but the running app could not add it: ${JSON.stringify(r.body)}`);
  } catch {
    console.log('Desktop Buddy is not running. Start it and tick the new buddy under Buddies in the paw menu.');
  }
}

async function diagnose() {
  const mod = path.join(PROJECT, 'dist', 'main', 'notifications.js');
  if (!fs.existsSync(mod)) {
    console.error('No build found. Run "npm run build" first.');
    process.exitCode = 1;
    return;
  }
  const { diagnose: run } = require(mod);
  const { DEFAULT_CONFIG } = require(path.join(PROJECT, 'dist', 'shared', 'types.js'));
  let cfg = DEFAULT_CONFIG.notifications;
  const cfgPath = path.join(os.homedir(), 'Library', 'Application Support', 'desktop-buddy', 'config.json');
  try {
    const user = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (user.notifications) cfg = { ...cfg, ...user.notifications };
    console.log(`config: ${cfgPath}`);
  } catch {
    console.log(`config: ${cfgPath} (not found, using defaults)`);
  }
  for (const line of await run(cfg)) console.log(line);
}

// ---- background service (macOS launchd user agent) ----------------------------
const SERVICE_LABEL = 'dev.buddy.desktop';
const PROJECT = path.resolve(__dirname, '..');
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);
const LOG = path.join(os.homedir(), 'Library', 'Logs', 'desktop-buddy.log');

function electronBinary() {
  try {
    return require('electron'); // path to the Electron executable
  } catch {
    throw new Error(`electron is not installed in ${PROJECT}; run npm install first`);
  }
}

function launchctl(args, ignoreFailure = false) {
  try {
    return execFileSync('launchctl', args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (err) {
    if (ignoreFailure) return '';
    throw new Error(`launchctl ${args.join(' ')} failed: ${(err.stderr || err.message).toString().trim()}`);
  }
}

function serviceDomain() {
  return `gui/${process.getuid()}`;
}

function service(sub) {
  if (process.platform !== 'darwin') {
    console.error('buddy service only supports macOS (launchd). On other systems use your login-items / autostart mechanism to run: electron ' + PROJECT);
    process.exitCode = 1;
    return;
  }
  switch (sub) {
    case 'install': {
      if (!fs.existsSync(path.join(PROJECT, 'dist', 'main', 'main.js'))) {
        console.error('No build found. Run "npm run build" in ' + PROJECT + ' first.');
        process.exitCode = 1;
        return;
      }
      const bin = electronBinary();
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${bin}</string>
    <string>${PROJECT}</string>
  </array>
  <key>WorkingDirectory</key><string>${PROJECT}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin</string></dict>
</dict>
</plist>
`;
      fs.mkdirSync(path.dirname(PLIST), { recursive: true });
      fs.mkdirSync(path.dirname(LOG), { recursive: true });
      launchctl(['bootout', serviceDomain(), PLIST], true);
      fs.writeFileSync(PLIST, plist);
      launchctl(['bootstrap', serviceDomain(), PLIST]);
      console.log(`Installed ${PLIST}\nDesktop Buddy now runs in the background and starts at login. Logs: ${LOG}`);
      console.log('If the buddy should read WhatsApp notifications, grant Full Disk Access to:\n  ' + bin);
      return;
    }
    case 'uninstall':
      launchctl(['bootout', serviceDomain(), PLIST], true);
      if (fs.existsSync(PLIST)) fs.unlinkSync(PLIST);
      console.log('Service removed. The app is no longer started at login.');
      return;
    case 'restart':
      if (!fs.existsSync(PLIST)) {
        console.error('Service is not installed; run: buddy service install');
        process.exitCode = 1;
        return;
      }
      launchctl(['kickstart', '-k', `${serviceDomain()}/${SERVICE_LABEL}`]);
      console.log('Restarted.');
      return;
    case 'status': {
      if (!fs.existsSync(PLIST)) {
        console.log('Service not installed.');
        return;
      }
      const out = launchctl(['print', `${serviceDomain()}/${SERVICE_LABEL}`], true);
      const state = /state = (\w+)/.exec(out);
      const pid = /pid = (\d+)/.exec(out);
      console.log(`Installed: ${PLIST}\nState: ${state ? state[1] : 'not loaded'}${pid ? ` (pid ${pid[1]})` : ''}\nLogs: ${LOG}`);
      return;
    }
    default:
      usage();
  }
}

async function main() {
  const [cmd, ...rest] = positional;
  if (cmd === 'service') return service(rest[0]);
  if (cmd === 'diagnose') return diagnose();
  if (cmd === 'validate') return rest[0] ? validateCmd(rest[0]) : usage();
  if (cmd === 'import') return rest[0] ? importCmd(rest[0]) : usage();
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
    case 'timer': {
      const [duration, ...name] = rest;
      if (!duration) return usage();
      r = await request('POST', '/timer', { duration, name: name.join(' ') || undefined, buddy: opts.buddy });
      break;
    }
    case 'timers': r = await request('GET', '/timers'); break;
    case 'cancel': if (!rest[0]) return usage(); r = await request('DELETE', `/timers/${encodeURIComponent(rest[0])}`); break;
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
  if (err && (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET')) {
    console.error(`Could not reach Desktop Buddy on port ${port}: ${err.message}\nIs the app running?`);
  } else {
    console.error(err && err.message ? err.message : String(err));
  }
  process.exitCode = 2;
});
