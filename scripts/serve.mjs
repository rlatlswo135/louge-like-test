// 로컬 게임 서버: 127.0.0.1에 bind하고 public/ 파일과 선택적으로 주입한 랭킹 API만 제공한다.
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

// URL 경로를 root 안의 실제 파일 경로로 바꾼다. 허용되지 않으면 null.
export async function resolvePublicFile(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const segments = decoded.split('/').filter(Boolean);
  // 경로 이탈·dotfile·숨김 경로 차단
  if (segments.some((s) => s === '..' || s.startsWith('.'))) return null;
  if (segments.length === 0) segments.push('index.html');
  const candidate = path.resolve(root, ...segments);
  const rootReal = await realpath(root);
  let fileReal;
  try {
    fileReal = await realpath(candidate);
  } catch {
    return null;
  }
  const rel = path.relative(rootReal, fileReal);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const info = await stat(fileReal);
  if (!info.isFile()) return null;
  return fileReal;
}

export function createHandler({ root = PUBLIC_DIR, routes = {}, leaderboard, legacyLeaderboard } = {}) {
  return async (req, res) => {
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const rawPath = (req.url || '/').split('?')[0];
    if(rawPath==='/api/leaderboard/v2'&&leaderboard)return leaderboard(req,res);
    if(rawPath==='/api/leaderboard'&&(legacyLeaderboard||leaderboard))return (legacyLeaderboard||leaderboard)(req,res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method Not Allowed');
    try {
      if (routes[rawPath]) {
        const r = await routes[rawPath]();
        return send(200, r.body, r.type);
      }
      const file = await resolvePublicFile(root, rawPath);
      if (!file) return send(404, 'Not Found');
      const body = await readFile(file);
      return send(200, body, TYPES[path.extname(file)] || 'application/octet-stream');
    } catch {
      return send(500, 'Internal Server Error');
    }
  };
}

export function startServer({ port = 5173, host = '127.0.0.1', ...options } = {}) {
  const server = createServer(createHandler(options));
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port');
  const port = i > 0 ? Number(process.argv[i + 1]) : 5173;
  const { createLeaderboard } = await import('./leaderboard.mjs');
  const dataDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const server=await startServer({port,leaderboard:createLeaderboard({file:path.join(dataDir,'leaderboard-v2.json')}),legacyLeaderboard:createLeaderboard({file:path.join(dataDir,'leaderboard.json')})});
  const { address, port: actual } = server.address();
  console.log(`보스 러시: http://${address}:${actual}/ (종료: Ctrl+C)`);
}
