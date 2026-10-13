import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer } from '../scripts/serve.mjs';

// fetch는 경로를 정규화하므로 원시 경로를 그대로 보내는 http.request를 사용한다.
function rawGet(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('서버는 127.0.0.1에 bind하고 public 파일만 제공한다', async (t) => {
  const server = await startServer({ port: 0 });
  t.after(() => server.close());
  const { address, port } = server.address();
  assert.equal(address, '127.0.0.1');

  const index = await rawGet(port, '/');
  assert.equal(index.status, 200);
  assert.match(index.headers['content-type'], /text\/html/);
  assert.match(index.body, /균열의 투기장/);

  const mod = await rawGet(port, '/src/main.mjs');
  assert.equal(mod.status, 200);
  assert.match(mod.headers['content-type'], /javascript/);

  const css = await rawGet(port, '/styles.css?v=1');
  assert.equal(css.status, 200);

  for(const [file,type] of [['/assets/art/monastery-stone.jpg','image/jpeg'],['/assets/audio/Ominous.mp3','audio/mpeg'],['/assets/audio/Fanfare%20for%20Space%20-%20clear.m4a','audio/mp4'],['/assets/audio/CREDITS.txt','text/plain; charset=utf-8']]){
    const asset=await rawGet(port,file,'HEAD');assert.equal(asset.status,200);assert.equal(asset.headers['content-type'],type);assert.equal(asset.body,'');
  }
  const credits=await rawGet(port,'/credits.html');assert.match(credits.body,/Kevin MacLeod/);assert.match(credits.body,/creativecommons.org\/licenses\/by\/4.0/);

  const blocked = [
    '/../AGENTS.md',
    '/%2e%2e/AGENTS.md',
    '/%2e%2e%2fAGENTS.md',
    '/src/..%2f..%2fAGENTS.md',
    '/..%2f.git/config',
    '/.git/config',
    '/%2egit/config',
    '/src/%2e%2e/%2e%2e/scripts/serve.mjs',
    '/..%5c..%5cAGENTS.md',
    '/src/%00main.mjs',
    '/%E0%A4%A',
    '/.env',
    '/src',
    '/missing.html',
    '/%252e%252e/AGENTS.md',
  ];
  for (const path of blocked) {
    const res = await rawGet(port, path);
    assert.ok(res.status === 404 || res.status === 400 || res.status === 403, `${path} → ${res.status}`);
    assert.doesNotMatch(res.body, /하네스|AUTO|executor|createServer/, `${path} 본문 노출 없음`);
  }

  const post = await rawGet(port, '/', 'POST');
  assert.equal(post.status, 405);
});
