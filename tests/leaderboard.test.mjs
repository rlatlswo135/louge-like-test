import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { request } from 'node:http';
import { createLeaderboard } from '../scripts/leaderboard.mjs';
import { startServer } from '../scripts/serve.mjs';

async function tempFile(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'leaderboard-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'scores.json');
}
function call(port, method, body, headers = {}) {
  if (headers.origin === 'http://127.0.0.1') headers = { ...headers, origin: `http://127.0.0.1:${port}` };
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/leaderboard', method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}
const record = (id, extra = {}) => ({ id, nickname: '  Ace_1  ', classId: 'warrior', weaponId: 'sword', hits: 2, durationMs: 90000, clearedStages: 20, ...extra });
const sameOrigin = { origin: 'http://127.0.0.1', 'content-type': 'application/json' };

test('HTTP leaderboard sorts, normalizes, caps, and accepts identical retries', async (t) => {
  const file = await tempFile(t);
  const leaderboard = createLeaderboard({ file });
  const server = await startServer({ port: 0, leaderboard });
  t.after(() => server.close());
  const port = server.address().port;
  const get = await call(port, 'GET');
  assert.equal(get.status, 200);
  assert.deepEqual(JSON.parse(get.body), { entries: [], limit: 100, unverified: true });
  const id = '00000000-0000-4000-8000-000000000001';
  let res = await call(port, 'POST', record(id), sameOrigin);
  assert.equal(res.status, 201);
  const entry = JSON.parse(res.body).entry;
  assert.equal(entry.nickname, 'Ace_1');
  assert.equal(entry.createdAt, new Date(entry.createdAt).toISOString());
  assert.equal(JSON.parse((await readFile(file)).toString()).length, 1);
  res = await call(port, 'POST', record(id), sameOrigin);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).entry.createdAt, entry.createdAt);
  assert.equal((await call(port, 'POST', record(id, { hits: 3 }), sameOrigin)).status, 409);
  assert.equal((await call(port, 'HEAD')).status, 200);
  assert.equal((await call(port, 'HEAD')).body, '');
});

test('validation, origin, body size, methods, top100 and durable concurrent writes', async (t) => {
  const file = await tempFile(t);
  const server = await startServer({ port: 0, leaderboard: createLeaderboard({ file }) });
  t.after(() => server.close());
  const port = server.address().port;
  const invalids = [record('bad'), record('00000000-0000-4000-8000-000000000001', { clearedStages: 19 }), record('00000000-0000-4000-8000-000000000001', { classId: 'mage', weaponId: 'sword' }), record('00000000-0000-4000-8000-000000000001', { hits: 1.5 }), record('00000000-0000-4000-8000-000000000001', { nickname: '<img>x' })];
  for (const value of invalids) assert.equal((await call(port, 'POST', value, sameOrigin)).status, 400);
  assert.equal((await call(port, 'POST', record('00000000-0000-4000-8000-000000000001'), { ...sameOrigin, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(port, 'POST', record('00000000-0000-4000-8000-000000000001'), { origin: 'http://127.0.0.1' })).status, 415);
  assert.equal((await call(port, 'PUT')).status, 405);
  assert.equal((await call(port, 'POST', 'x'.repeat(2049), sameOrigin)).status, 413);
  const results = await Promise.all(Array.from({ length: 105 }, (_, i) => call(port, 'POST', record(`00000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}`, { hits: i }), sameOrigin)));
  assert.equal(results.filter((r) => r.status === 201).length, 10);
  const list = JSON.parse((await call(port, 'GET')).body);
  assert.equal(list.entries.length, 10); // bounded global new-submission rate
  assert.ok(list.entries.every((e, i) => !i || list.entries[i - 1].hits <= e.hits));
});

test('GET and submission rank expose at most top 100 and flag dropped records', async (t) => {
  const file = await tempFile(t);
  const server = await startServer({ port: 0, leaderboard: createLeaderboard({ file }) });
  t.after(() => server.close());
  const port = server.address().port;
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  try {
    let last;
    for (let i = 0; i <= 100; i++) {
      now += 60_001;
      last = await call(port, 'POST', record(`00000000-0000-4000-8000-${String(i + 1000).padStart(12, '0')}`, { hits: i }), sameOrigin);
      assert.equal(last.status, 201);
    }
    assert.equal(JSON.parse(last.body).retained, false);
    assert.equal(JSON.parse(last.body).rank, 101);
    assert.equal(JSON.parse((await readFile(file, 'utf8')).toString()).length, 100);
    const result = JSON.parse((await call(port, 'GET')).body);
    assert.equal(result.entries.length, 100);
    assert.equal(result.entries[0].hits, 0);
    assert.equal(result.entries.at(-1).hits, 99);
    assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), result.entries);
    const reload = createLeaderboard({ file });
    const req = { method: 'GET', headers: { host: '127.0.0.1' } };
    const response = { writeHead(code) { this.status = code; }, end(body) { this.body = body; } };
    await reload(req, response);
    assert.equal(JSON.parse(response.body).entries.length, 100);
    assert.deepEqual(JSON.parse(response.body).entries.map((entry) => entry.hits), Array.from({ length: 100 }, (_, i) => i));
  } finally { Date.now = realNow; }
});

test('Origin scheme must match direct transport or loopback proxy termination',async t=>{
  const file=await tempFile(t),handler=createLeaderboard({file}),server=await startServer({port:0,leaderboard:handler});t.after(()=>server.close());
  const port=server.address().port,value=record('00000000-0000-4000-8000-000000080001'),httpsOrigin=`https://127.0.0.1:${port}`;
  assert.equal((await call(port,'POST',value,{...sameOrigin,origin:httpsOrigin})).status,403);
  assert.equal((await call(port,'POST',value,{...sameOrigin,origin:httpsOrigin,'x-forwarded-proto':'https'})).status,201);
  assert.equal((await call(port,'POST',value,{...sameOrigin,'x-forwarded-proto':'https'})).status,403);
  const req={method:'POST',headers:{host:`127.0.0.1:${port}`,origin:httpsOrigin,'content-type':'application/json','x-forwarded-proto':'https'},socket:{remoteAddress:'192.0.2.1'}};
  const res={writeHead(status){this.status=status;},end(){}};await handler(req,res);assert.equal(res.status,403);
});

test('sorts hits, duration, then ID for stable timestamp ties', async (t) => {
  const file = await tempFile(t);
  const server = await startServer({ port: 0, leaderboard: createLeaderboard({ file }) });
  t.after(() => server.close());
  const port = server.address().port;
  const realNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    for (const [id, hits, durationMs] of [
      ['00000000-0000-4000-8000-000000000003', 2, 100],
      ['00000000-0000-4000-8000-000000000002', 1, 200],
      ['00000000-0000-4000-8000-000000000004', 1, 100],
      ['00000000-0000-4000-8000-000000000001', 1, 100],
    ]) {
      await call(port, 'POST', record(id, { hits, durationMs }), sameOrigin);
    }
    const ids = JSON.parse((await call(port, 'GET')).body).entries.map((entry) => entry.id);
    assert.deepEqual(ids, [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000004',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]);
  } finally { Date.now = realNow; }
});

test('chunked oversize request gets 413 and concurrent identical IDs persist once', async (t) => {
  const file = await tempFile(t);
  const server = await startServer({ port: 0, leaderboard: createLeaderboard({ file }) });
  t.after(() => server.close());
  const port = server.address().port;
  const oversized = new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/leaderboard', method: 'POST', headers: { origin: `http://127.0.0.1:${port}`, 'content-type': 'application/json', 'transfer-encoding': 'chunked' } }, (res) => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write('x'.repeat(1200));
    setTimeout(() => { req.write('x'.repeat(1200)); req.end(); }, 5);
  });
  assert.equal(await oversized, 413);
  const value = record('00000000-0000-4000-8000-000000000001');
  const writes = await Promise.all([call(port, 'POST', value, sameOrigin), call(port, 'POST', value, sameOrigin)]);
  assert.deepEqual(writes.map((result) => result.status).sort(), [200, 201]);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).length, 1);
});

test('aborted bodies do not publish; failed writes preserve records and permit a retry', async t=>{
  const file=await tempFile(t),server=await startServer({port:0,leaderboard:createLeaderboard({file})});t.after(()=>server.close());const port=server.address().port;
  await new Promise(resolve=>{const req=request({host:'127.0.0.1',port,path:'/api/leaderboard',method:'POST',headers:{...sameOrigin,origin:`http://127.0.0.1:${port}`}},()=>{});req.on('error',resolve);req.write('{"id":');setTimeout(()=>req.destroy(),20);});
  assert.deepEqual(JSON.parse((await call(port,'GET')).body).entries,[]);
  const first=record('00000000-0000-4000-8000-000000090001');assert.equal((await call(port,'POST',first,sameOrigin)).status,201);
  const before=await readFile(file,'utf8');await rename(file,file+'.saved');await mkdir(file);
  const second=record('00000000-0000-4000-8000-000000090002');assert.equal((await call(port,'POST',second,sameOrigin)).status,500);
  assert.equal(await readFile(file+'.saved','utf8'),before);
  await rm(file,{recursive:true});await rename(file+'.saved',file);
  assert.equal((await call(port,'POST',second,sameOrigin)).status,201);
  assert.equal(JSON.parse(await readFile(file,'utf8')).length,2);
});

test('oversized or corrupt backing file rejects writes without discarding existing bytes',async t=>{
  const file=await tempFile(t),server=await startServer({port:0,leaderboard:createLeaderboard({file})});t.after(()=>server.close());
  for(const bytes of [' '.repeat(65537),'{broken']) {
    await writeFile(file,bytes);
    assert.equal((await call(server.address().port,'POST',record('00000000-0000-4000-8000-000000090003'),sameOrigin)).status,500);
    assert.equal(await readFile(file,'utf8'),bytes);
  }
});

test('oversized persisted store fails closed and is never overwritten', async (t) => {
  const file = await tempFile(t);
  const oversized = Array.from({ length: 101 }, (_, i) => ({ ...record(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`), nickname: 'Ace_1', createdAt: new Date(0).toISOString() }));
  await import('node:fs/promises').then(({ writeFile }) => writeFile(file, JSON.stringify(oversized)));
  const original = await readFile(file, 'utf8');
  const handler = createLeaderboard({ file });
  const req = { method: 'GET', headers: { host: '127.0.0.1' } };
  const response = { writeHead(code) { this.status = code; }, end(body) { this.body = body; } };
  await handler(req, response);
  assert.equal(response.status, 500);
  assert.equal(await readFile(file, 'utf8'), original);
  await import('node:fs/promises').then(({ writeFile }) => writeFile(file, '[]'));
  const recovered = { writeHead(code) { this.status = code; }, end(body) { this.body = body; } };
  await handler(req, recovered);
  assert.equal(recovered.status, 200);
  assert.deepEqual(JSON.parse(recovered.body).entries, []);
});
