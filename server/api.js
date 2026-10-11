// 파일 API: 루트 폴더 안의 .md 문서와 assets 이미지를 다룬다. 외부 의존성 없음.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp']);
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.bmp': 'image/bmp',
};
const MAX_JSON = 20 * 1024 * 1024;
const MAX_UPLOAD = 50 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', 'assets']);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const WASM_FILE = fileURLToPath(new URL('../node_modules/pandoc-wasm/src/pandoc.wasm', import.meta.url));

// opts.templatesDir: docx 내보내기 템플릿(.docx)을 모아 둔 폴더. 없으면 기본 템플릿만 쓴다.
export function createApi(rootInput, opts = {}) {
  const root = path.resolve(rootInput);
  const templatesDir = opts.templatesDir ? path.resolve(opts.templatesDir) : null;

  // 루트 기준 상대경로(슬래시)를 절대경로로 변환한다. symlink 를 해석해 루트 밖이면 거부한다.
  async function safe(relPath, { mustExist = true } = {}) {
    if (typeof relPath !== 'string' || relPath.includes('\0')) throw new HttpError(400, '잘못된 경로');
    const abs = path.resolve(root, relPath);
    const realRoot = await fs.realpath(root);
    let real;
    try {
      real = await fs.realpath(abs);
    } catch {
      if (mustExist) throw new HttpError(404, '없는 경로');
      // 아직 없는 대상은 존재하는 가장 가까운 상위 폴더를 해석한 뒤 나머지를 이어 붙여 검사
      let cur = abs;
      const tail = [];
      for (;;) {
        const up = path.dirname(cur);
        tail.unshift(path.basename(cur));
        if (up === cur) break;
        cur = up;
        try { cur = await fs.realpath(cur); break; } catch { /* 계속 위로 */ }
      }
      real = path.join(cur, ...tail.slice(1));
    }
    if (!(real === realRoot || real.startsWith(realRoot + path.sep))) {
      throw new HttpError(403, '루트 밖 경로는 허용되지 않음');
    }
    return abs;
  }

  const rel = (abs) => path.relative(root, abs).split(path.sep).join('/');
  const isMd = (p) => p.toLowerCase().endsWith('.md');
  const docAssetsDir = (docAbs) =>
    path.join(path.dirname(docAbs), 'assets', path.basename(docAbs, path.extname(docAbs)));

  async function readBody(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new HttpError(413, '본문이 너무 큼');
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }
  const readJson = async (req) => {
    const buf = await readBody(req, MAX_JSON);
    try { return JSON.parse(buf.toString('utf8') || '{}'); }
    catch { throw new HttpError(400, 'JSON 형식 오류'); }
  };

  async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

  async function buildTree(dirAbs) {
    const entries = await fs.readdir(dirAbs, { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
      const abs = path.join(dirAbs, e.name);
      if (e.isDirectory()) {
        out.push({ name: e.name, path: rel(abs), type: 'dir', children: await buildTree(abs) });
      } else if (e.isFile() && isMd(e.name)) {
        out.push({ name: e.name, path: rel(abs), type: 'file' });
      }
    }
    out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'ko') : a.type === 'dir' ? -1 : 1));
    return out;
  }

  const routes = {
    'GET /api/info': async () => ({ root: path.basename(root) || root }),

    'GET /api/templates': async () => {
      if (!templatesDir) return { dir: '', files: [] };
      try {
        const names = (await fs.readdir(templatesDir, { withFileTypes: true }))
          .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.docx') && !e.name.startsWith('~$'))
          .map((e) => e.name)
          .sort((x, y) => x.localeCompare(y, 'ko'));
        return { dir: templatesDir, files: names };
      } catch {
        return { dir: templatesDir, files: [] };
      }
    },

    'GET /api/tree': async () => ({ children: await buildTree(root) }),

    'GET /api/file': async (_req, q) => {
      const abs = await safe(q.get('path'));
      if (!isMd(abs)) throw new HttpError(400, '.md 파일만 허용');
      const [content, st] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)]);
      return { content, mtime: st.mtimeMs };
    },

    'PUT /api/file': async (req, q) => {
      const abs = await safe(q.get('path'), { mustExist: false });
      if (!isMd(abs)) throw new HttpError(400, '.md 파일만 허용');
      const { content } = await readJson(req);
      if (typeof content !== 'string') throw new HttpError(400, 'content 필요');
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content, 'utf8');
      return { mtime: (await fs.stat(abs)).mtimeMs };
    },

    'POST /api/create': async (req) => {
      const { path: p, type } = await readJson(req);
      const abs = await safe(p, { mustExist: false });
      if (await exists(abs)) throw new HttpError(409, '이미 존재함');
      if (type === 'dir') {
        await fs.mkdir(abs, { recursive: true });
      } else {
        if (!isMd(abs)) throw new HttpError(400, '.md 파일만 허용');
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, '', 'utf8');
      }
      return { path: rel(abs) };
    },

    // 이름 변경/이동. 문서면 assets/<문서명> 폴더를 함께 옮기고 본문 링크를 갱신한다.
    'POST /api/rename': async (req) => {
      const { from, to } = await readJson(req);
      const src = await safe(from);
      const dst = await safe(to, { mustExist: false });
      if (await exists(dst)) throw new HttpError(409, '대상이 이미 존재함');
      const st = await fs.stat(src);
      if (st.isFile() && !(isMd(src) && isMd(dst))) throw new HttpError(400, '.md 파일만 허용');
      await fs.mkdir(path.dirname(dst), { recursive: true });
      const oldAssets = st.isFile() ? docAssetsDir(src) : null;
      await fs.rename(src, dst);
      if (oldAssets && (await exists(oldAssets))) {
        const newAssets = docAssetsDir(dst);
        await fs.mkdir(path.dirname(newAssets), { recursive: true });
        await fs.rename(oldAssets, newAssets);
        const oldPrefix = `assets/${encodeURIComponent(path.basename(oldAssets))}/`;
        const newPrefix = `assets/${encodeURIComponent(path.basename(newAssets))}/`;
        if (oldPrefix !== newPrefix) {
          const text = await fs.readFile(dst, 'utf8');
          await fs.writeFile(dst, text.split(oldPrefix).join(newPrefix), 'utf8');
        }
      }
      return { path: rel(dst) };
    },

    'DELETE /api/file': async (_req, q) => {
      const abs = await safe(q.get('path'));
      if (abs === root) throw new HttpError(400, '루트는 삭제할 수 없음');
      const st = await fs.stat(abs);
      if (st.isDirectory()) {
        await fs.rm(abs, { recursive: true });
      } else {
        if (!isMd(abs)) throw new HttpError(400, '.md 파일만 허용');
        await fs.rm(abs);
        await fs.rm(docAssetsDir(abs), { recursive: true, force: true });
      }
      return { ok: true };
    },

    // 이미지 업로드: 본문은 원본 바이너리, doc=문서경로, ext=확장자
    'POST /api/upload': async (req, q) => {
      const docAbs = await safe(q.get('doc'));
      if (!isMd(docAbs)) throw new HttpError(400, '.md 문서만 가능');
      const ext = '.' + String(q.get('ext') || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase();
      if (!IMAGE_EXT.has(ext)) throw new HttpError(400, '허용되지 않는 이미지 형식');
      const body = await readBody(req, MAX_UPLOAD);
      const dir = docAssetsDir(docAbs);
      await fs.mkdir(dir, { recursive: true });
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
      let name = `${stamp}${ext}`;
      for (let i = 2; await exists(path.join(dir, name)); i++) name = `${stamp}-${i}${ext}`;
      await fs.writeFile(path.join(dir, name), body);
      return { url: `assets/${encodeURIComponent(path.basename(dir))}/${name}` };
    },
  };

  async function raw(res, q) {
    const abs = await safe(q.get('path'));
    const ext = path.extname(abs).toLowerCase();
    if (!IMAGE_EXT.has(ext)) throw new HttpError(400, '이미지만 허용');
    const data = await fs.readFile(abs);
    res.writeHead(200, {
      'Content-Type': MIME[ext],
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    });
    res.end(data);
  }

  async function template(res, q) {
    const name = q.get('name') ?? '';
    if (!templatesDir || name !== path.basename(name) || !name.toLowerCase().endsWith('.docx')) {
      throw new HttpError(400, '잘못된 템플릿 이름');
    }
    let data;
    try { data = await fs.readFile(path.join(templatesDir, name)); }
    catch { throw new HttpError(404, '템플릿을 찾을 수 없음'); }
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  }

  // pandoc-wasm 엔진(58MB)을 로컬에서 직접 제공한다. 외부 다운로드 없음.
  async function wasm(res) {
    const st = await fs.stat(WASM_FILE).catch(() => null);
    if (!st) throw new HttpError(404, 'pandoc.wasm 이 없습니다. npm install 을 실행하세요');
    res.writeHead(200, {
      'Content-Type': 'application/wasm',
      'Content-Length': st.size,
      'Cache-Control': 'public, max-age=86400',
    });
    createReadStream(WASM_FILE).pipe(res);
  }

  // 처리했으면 true, 아니면 false(다음 핸들러로)
  return async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    try {
      // 다른 출처 페이지가 보내는 요청 차단
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, '허용되지 않는 출처');
      if (req.method === 'GET' && url.pathname === '/api/raw') { await raw(res, url.searchParams); return true; }
      if (req.method === 'GET' && url.pathname === '/api/template') { await template(res, url.searchParams); return true; }
      if (req.method === 'GET' && url.pathname === '/api/pandoc.wasm') { await wasm(res); return true; }
      const fn = routes[`${req.method} ${url.pathname}`];
      if (!fn) throw new HttpError(404, '없는 API');
      const data = await fn(req, url.searchParams);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) console.error(e);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return true;
  };
}
