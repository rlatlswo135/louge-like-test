import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CLASSES } from '../public/src/content.mjs';

const LIMIT = 100;
const MAX_BODY = 2048;
const MAX_HITS = 1_000_000;
const loadouts = new Set(CLASSES.flatMap((cls) => cls.weapons.map((weapon) => `${cls.id}/${weapon.id}`)));
const compare = (a, b) => a.hits - b.hits || a.durationMs - b.durationMs || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
const fields = ['id', 'nickname', 'classId', 'weaponId', 'hits', 'durationMs', 'clearedStages'];

function json(res, status, value, method) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(method === 'HEAD' ? undefined : JSON.stringify(value));
}
function validHost(req) {
  const host = req.headers.host;
  if (!host || /[\s/@?#]/.test(host)) return false;
  try {
    const parsed = new URL(`http://${host}`);
    return parsed.host.toLowerCase() === host.toLowerCase() && !parsed.username && !parsed.password;
  } catch { return false; }
}
function validOrigin(req) {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !validHost(req)) return false;
  try {
    const parsed = new URL(origin);
    // cloudflared terminates HTTPS, then connects over loopback HTTP; remote peers cannot assert its protocol.
    const localProxy=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
    const protocol=localProxy&&req.headers['x-forwarded-proto']!==undefined?req.headers['x-forwarded-proto']:req.socket?.encrypted?'https':'http';
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.protocol===`${protocol}:` && !parsed.username && !parsed.password && parsed.origin === origin.replace(/\/$/, '') && parsed.host.toLowerCase() === req.headers.host.toLowerCase();
  } catch { return false; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.removeAllListeners('data');
        req.resume();
        reject(Object.assign(new Error('large'), { status: 413 }));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('json'), { status: 400 })); }
    });
    req.on('aborted', () => reject(Object.assign(new Error('aborted'), { status: 400 })));
    req.on('error', () => reject(Object.assign(new Error('request'), { status: 400 })));
  });
}
function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== fields.length || fields.some((key) => !Object.hasOwn(input, key))) return null;
  const { id, classId, weaponId, hits, durationMs, clearedStages } = input;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  if (typeof classId !== 'string' || typeof weaponId !== 'string' || !loadouts.has(`${classId}/${weaponId}`)) return null;
  if (!Number.isSafeInteger(hits) || hits < 0 || hits > MAX_HITS || !Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > 86_400_000 || clearedStages !== 20) return null;
  if (typeof input.nickname !== 'string') return null;
  const nickname = input.nickname.normalize('NFC').trim();
  if ([...nickname].length < 2 || [...nickname].length > 16 || !/^[\p{L}\p{N} _-]+$/u.test(nickname)) return null;
  return { id: id.toLowerCase(), nickname, classId, weaponId, hits, durationMs, clearedStages };
}

// shortcut: single-process, unverified scores; use a database and replay validation before competitive multi-server use.
export function createLeaderboard({ file }) {
  if (typeof file !== 'string' || !file) throw new TypeError('file required');
  let loaded;
  let loading;
  let queue = Promise.resolve();
  let pendingWrites = 0;
  let windowStart = 0;
  let windowCount = 0;
  const load = () => {
    if (loaded) return Promise.resolve(loaded);
    if (!loading) loading = (async () => {
      try {
        if((await stat(file)).size>65536)throw new Error('oversized store');
        const parsed = JSON.parse(await readFile(file, 'utf8'));
        if (!Array.isArray(parsed) || parsed.length > LIMIT || parsed.some((entry) => {
          if (!entry || typeof entry !== 'object' || typeof entry.createdAt !== 'string' || !Number.isFinite(Date.parse(entry.createdAt)) || new Date(entry.createdAt).toISOString() !== entry.createdAt) return true;
          const { createdAt, ...record } = entry;
          return !normalize(record) || JSON.stringify(normalize(record)) !== JSON.stringify(record);
        }) || new Set(parsed.map((entry) => entry.id)).size !== parsed.length) throw new Error('invalid store');
        loaded = parsed;
      } catch (error) {
        if (error.code === 'ENOENT') loaded = [];
        else throw error;
      }
      return loaded;
    })().finally(() => { loading = undefined; });
    return loading;
  };
  const persist = async (entries) => {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(entries), { flag: 'wx', mode: 0o600 });
      await rename(tmp, file);
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
  };
  return async (req, res) => {
    const method = req.method;
    if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, method);
    if (!validHost(req)) return json(res, 400, { error: 'invalid_host' }, method);
    if (method === 'GET' || method === 'HEAD') {
      try { const entries = [...await load()].sort(compare).slice(0, LIMIT); return json(res, 200, { entries, limit: LIMIT, unverified: true }, method); }
      catch { return json(res, 500, { error: 'storage_unavailable' }, method); }
    }
    if (!validOrigin(req)) return json(res, 403, { error: 'origin_denied' }, method);
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) return json(res, 415, { error: 'content_type_required' }, method);
    if (Number(req.headers['content-length']) > MAX_BODY) { req.resume(); return json(res, 413, { error: 'body_too_large' }, method); }
    let record;
    try { record = normalize(await readBody(req)); }
    catch (error) { return json(res, error.status || 400, { error: error.status === 413 ? 'body_too_large' : 'invalid_json' }, method); }
    if (!record) return json(res, 400, { error: 'invalid_record' }, method);
    if (pendingWrites >= 10) return json(res, 429, { error: 'rate_limited' }, method);
    pendingWrites++;
    const operation = queue.then(async () => {
      const entries = await load();
      const existing = entries.find((entry) => entry.id === record.id);
      if (existing) {
        const { createdAt, ...stored } = existing;
        if (JSON.stringify(stored) !== JSON.stringify(record)) return { status: 409, body: { error: 'id_conflict' } };
        const rank = [...entries].sort(compare).findIndex((entry) => entry.id === existing.id) + 1;
        return { status: 200, body: { entry: existing, rank, retained: true } };
      }
      const now = Date.now();
      if (now - windowStart >= 60_000) { windowStart = now; windowCount = 0; }
      if (windowCount >= 10) return { status: 429, body: { error: 'rate_limited' } };
      windowCount++;
      const entry = { ...record, createdAt: new Date(now).toISOString() };
      const sorted = [...entries, entry].sort(compare);
      const rank = sorted.findIndex((item) => item.id === entry.id) + 1;
      const retained = sorted.slice(0, LIMIT);
      await persist(retained);
      loaded = retained;
      return { status: 201, body: { entry, rank, retained: rank <= LIMIT } };
    });
    queue = operation.then(() => {}, () => {});
    try { const result = await operation; return json(res, result.status, result.body, method); }
    catch { return json(res, 500, { error: 'storage_unavailable' }, method); }
    finally { pendingWrites--; }
  };
}
