import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { createApi } from './server/api.js';

// 개발 서버(vite)에 파일 API 를 얹는다. 루트는 NOTES_ROOT 또는 현재 폴더.
// env 는 .env, .env.development 등과 실제 환경변수를 합친 값(실제 환경변수 우선).
function notesApi(env: Record<string, string>): Plugin {
  return {
    name: 'notes-api',
    configureServer(server) {
      const api = createApi(env.NOTES_ROOT || process.cwd(), {
        templatesDir: env.NOTES_TEMPLATES || fileURLToPath(new URL('./templates', import.meta.url)),
      });
      server.middlewares.use((req, res, next) => {
        api(req, res).then((handled) => { if (!handled) next(); }, next);
      });
    },
  };
}

// mode: 'html' → 단일 HTML 스탠드얼론, 그 외 → 웹서버 버전(dist/ + server.js)
export default defineConfig(({ mode }) => {
  const html = mode === 'html';
  const env = loadEnv(mode, process.cwd(), ''); // 접두사 '' → VITE_ 가 아닌 서버 설정도 읽는다
  return {
    plugins: [svelte(), ...(html ? [viteSingleFile()] : [notesApi(env)])],
    resolve: {
      // pandoc-wasm 의 exports 가 하위 경로 import 를 막아, 환경 무관 코어를 직접 가리킨다
      alias: { 'pandoc-wasm-core': fileURLToPath(new URL('./node_modules/pandoc-wasm/src/core.js', import.meta.url)) },
    },
    define: { __MODE__: JSON.stringify(html ? 'html' : 'server') },
    build: {
      outDir: html ? 'dist-html' : 'dist',
      emptyOutDir: true,
      target: 'es2022',
    },
    server: { port: 5173, host: '127.0.0.1' },
  };
});
