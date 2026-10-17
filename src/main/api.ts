import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AlertRequest, TimerInfo } from '../shared/types';

export interface ApiHandlers {
  alert(req: AlertRequest): { ok: true; buddy: string } | { ok: false; error: string };
  startTimer(durationMs: number, name?: string, buddy?: string): TimerInfo;
  listTimers(): Array<TimerInfo & { remaining: string }>;
  cancelTimer(id: string): boolean;
  state(): unknown;
  listBuddies(): unknown;
  addBuddy(ref: string): Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  removeBuddy(id: string): { ok: boolean };
  reload(): Promise<void>;
}

/**
 * Tiny localhost HTTP API so scripts and tools can talk to the buddy:
 *   POST /alert   {message, level?, target?, duration?, buddy?}
 *   POST /guide   {message, x, y, ...}   (sugar for target: {x, y})
 *   GET  /state
 *   GET  /buddies
 *   POST /buddies {pack}
 *   DELETE /buddies/:id
 *   POST /reload
 *   POST /timer    {minutes | seconds | duration:"25m", name?, buddy?}
 *   GET  /timers
 *   DELETE /timers/:id
 */
export function startApi(port: number, token: string | undefined, h: ApiHandlers): Server {
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res, token, h);
    } catch (err) {
      send(res, 500, { ok: false, error: (err as Error).message });
    }
  });
  server.on('error', (err) => console.error('API server error:', err.message));
  server.listen(port, '127.0.0.1', () => console.log(`buddy API listening on http://127.0.0.1:${port}`));
  return server;
}

async function handle(req: IncomingMessage, res: ServerResponse, token: string | undefined, h: ApiHandlers): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (token && req.headers['x-buddy-token'] !== token && url.searchParams.get('token') !== token) {
    return send(res, 401, { ok: false, error: 'missing or wrong x-buddy-token' });
  }
  const method = req.method ?? 'GET';
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (method === 'GET' && (path === '/' || path === '/state')) return send(res, 200, { ok: true, ...(h.state() as object) });
  if (method === 'GET' && path === '/buddies') return send(res, 200, { ok: true, buddies: h.listBuddies() });
  if (method === 'POST' && path === '/reload') {
    await h.reload();
    return send(res, 200, { ok: true });
  }
  if (method === 'POST' && (path === '/alert' || path === '/say' || path === '/guide')) {
    const body = await readJson(req);
    const message = typeof body.message === 'string' ? body.message : typeof body.text === 'string' ? body.text : '';
    if (!message) return send(res, 400, { ok: false, error: '"message" is required' });
    const alert: AlertRequest = {
      message,
      level: body.level === 'warn' || body.level === 'error' ? body.level : 'info',
      duration: typeof body.duration === 'number' ? body.duration : undefined,
      buddy: typeof body.buddy === 'string' ? body.buddy : undefined,
    };
    if (path === '/guide' || (typeof body.x === 'number' && typeof body.y === 'number')) {
      if (typeof body.x !== 'number' || typeof body.y !== 'number') return send(res, 400, { ok: false, error: '"x" and "y" are required' });
      alert.target = { x: body.x, y: body.y };
    } else if (path === '/say') {
      alert.target = 'here';
    } else if (body.target === 'active' || body.target === 'here' || body.target === 'mouse') {
      alert.target = body.target;
    } else if (body.target && typeof body.target === 'object') {
      const t = body.target as { x?: unknown; y?: unknown };
      if (typeof t.x === 'number' && typeof t.y === 'number') alert.target = { x: t.x, y: t.y };
    }
    const result = h.alert(alert);
    return send(res, result.ok ? 200 : 404, result);
  }
  if (method === 'POST' && (path === '/timer' || path === '/timers')) {
    const body = await readJson(req);
    let ms: number | null = null;
    if (typeof body.minutes === 'number') ms = body.minutes * 60_000;
    else if (typeof body.seconds === 'number') ms = body.seconds * 1000;
    else if (typeof body.duration === 'string') ms = parseDurationMs(body.duration);
    if (!ms || ms <= 0) return send(res, 400, { ok: false, error: 'give "minutes", "seconds" or "duration" like "25m"' });
    const timer = h.startTimer(ms, typeof body.name === 'string' ? body.name : undefined, typeof body.buddy === 'string' ? body.buddy : undefined);
    return send(res, 200, { ok: true, timer });
  }
  if (method === 'GET' && path === '/timers') return send(res, 200, { ok: true, timers: h.listTimers() });
  const delTimer = path.match(/^\/timers\/([^/]+)$/);
  if (method === 'DELETE' && delTimer) {
    const ok = h.cancelTimer(decodeURIComponent(delTimer[1]));
    return send(res, ok ? 200 : 404, { ok, ...(ok ? {} : { error: 'no such timer' }) });
  }
  if (method === 'POST' && path === '/buddies') {
    const body = await readJson(req);
    if (typeof body.pack !== 'string') return send(res, 400, { ok: false, error: '"pack" is required' });
    const result = await h.addBuddy(body.pack);
    return send(res, result.ok ? 200 : 400, result);
  }
  const del = path.match(/^\/buddies\/([^/]+)$/);
  if (method === 'DELETE' && del) return send(res, 200, h.removeBuddy(decodeURIComponent(del[1])));
  send(res, 404, { ok: false, error: `no route ${method} ${path}` });
}

/** "25m", "1h30m", "90s", "2" (minutes) → ms. */
export function parseDurationMs(text: string): number | null {
  const t = text.trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) * 60_000;
  let total = 0, matched = false;
  const re = /(\d+(?:\.\d+)?)\s*(h|hr|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    matched = true;
    const n = Number(m[1]);
    const u = m[2][0];
    total += u === 'h' ? n * 3_600_000 : u === 'm' ? n * 60_000 : n * 1000;
  }
  return matched ? total : null;
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      data += chunk;
      if (data.length > 64 * 1024) reject(new Error('body too large'));
    });
    req.on('end', () => {
      if (!data.trim()) return resolve({});
      try {
        resolve(JSON.parse(data) as Record<string, unknown>);
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  res.end(json);
}
