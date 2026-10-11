# Milkdown Notes

Milkdown(Crepe) + Svelte 5 Markdown 에디터. 같은 소스에서 두 가지로 빌드한다.

| | 웹서버 버전 | 스탠드얼론 HTML |
|---|---|---|
| 빌드 | `npm run build` → `dist/` + `server.js` | `npm run build:html` → `dist-html/index.html` |
| 문서 | 루트 폴더의 `.md` 트리 (열기/생성/이름변경/삭제/저장) | 열기 버튼·드래그앤드롭, 내보내기(.md 다운로드) |
| 이미지 | 문서 옆 `assets/<문서명>/` 파일 또는 Base64 (설정 + 문서별 변환) | Base64 고정 |
| 저장 | 수동(Ctrl+S) + 자동 저장 기본 ON(입력 후 0.7초, 최대 10초) + 버전 이력(문서당 20개, 브라우저 IndexedDB) | IndexedDB 에 문서 여러 개를 자동 저장(디스크 연동 없음, 내보내기로 다운로드) |

## 실행

```bash
npm install
npm run build
node server.js [루트폴더] [--port 5173] [--templates 템플릿폴더]   # 또는 npm start
```

- 루트 기본값: `NOTES_ROOT` 환경변수, 없으면 현재 폴더. `127.0.0.1` 에만 바인딩한다.
- 설정 파일: 앱 폴더의 `.env`, `.env.production` 을 읽는다(`.env.example` 참고). 우선순위는 CLI 인자 > 실제 환경변수 > `.env.production` > `.env`. 지원 변수는 `NOTES_ROOT`, `NOTES_TEMPLATES`, `PORT`. `npm run dev` 는 `.env`, `.env.development` 를 읽는다. 상대 경로는 서버를 실행한 폴더 기준이다.
- docx 템플릿 폴더: `--templates` 또는 `NOTES_TEMPLATES`, 기본값은 앱 폴더의 `templates/`.
- docx 변환용 pandoc 엔진은 `node_modules/pandoc-wasm` 의 wasm 을 서버가 직접 제공한다(외부 다운로드 없음). 실행 환경에도 `node_modules` 가 필요하다.
- 루트 밖 경로는 거부하고(symlink 해석 포함) `.md` 와 이미지 확장자만 다룬다.
- 개발: `NOTES_ROOT=<폴더> npm run dev` (Vite 개발 서버에 같은 파일 API 가 붙는다).
- 타입 검사: `npm run check`

스탠드얼론 `index.html` 은 서버 코드 없이 파일 하나로 동작한다. 외부 요청은 docx 기능을 처음 쓸 때의 pandoc 엔진 내려받기뿐이다(아래 참고).

## 설계 메모

- `__MODE__`('server' | 'html') 빌드 상수로 셸(`ServerShell` / `StandaloneShell`)을 동적 import 해, 쓰지 않는 모드의 코드는 번들에서 제거된다.
- Crepe 는 `CrepeBuilder` 로 필요한 기능만 조합한다(Latex 제외 → KaTeX 폰트·JS 미포함).
- 이름 변경 시 `assets/<문서명>/` 폴더를 함께 옮기고 본문의 이미지 링크를 갱신한다.
- 아이콘은 `@lucide/svelte`(개별 import, 트리 셰이킹)를 쓴다.
- 폰트는 시스템에 설치된 `Pretendard Variable` 을 쓰고 없으면 시스템 폰트로 폴백한다(번들·호스팅 없음).
- 기본값: 자동 저장 OFF, 이미지 삽입은 파일 방식, 다른 도구에서의 외부 수정 충돌은 검사하지 않는다.

## 문서 가져오기·내보내기

- **새 문서 만들기**: ".md / .txt 붙여넣기"(사이드바 📋 / 스탠드얼론 '붙여넣기' 버튼), ".md / .txt / .docx 파일 드롭".
  - 서버 버전: 사이드바에서 선택한 폴더(선택이 없으면 열린 문서의 폴더, 그것도 없으면 루트)에 만든다. 드롭은 이름을 확인하고, 같은 이름이 있으면 `이름 (2).md` 로 번호를 붙인다. 여러 파일을 한꺼번에 놓으면 원본 이름으로 만든다.
  - 스탠드얼론: 항상 라이브러리에 새 문서로 추가한다(같은 이름은 `이름 (2).md`).
  - docx 의 이미지는 서버 버전에서 '이미지 삽입 방식' 설정을 따른다(파일이면 `assets/<문서명>/` 로 분리, Base64 면 본문에 포함). 스탠드얼론은 IndexedDB 에 Blob 으로 저장하고 내보낼 때 Base64 로 되돌린다.
- **docx 내보내기**: 상단 '내보내기 ▾' → '.docx 로 내보내기'. pandoc-wasm(workbench 와 동일 구성)이 브라우저 워커에서 변환한다.
  - 서식 템플릿: 서버 버전은 템플릿 폴더의 `.docx` 를 메뉴에서 고른다(선택값 기억). 스탠드얼론은 템플릿 `.docx` 파일을 골라 브라우저(IndexedDB)에 보관한다.
  - 템플릿을 지정하지 않으면 기본 템플릿(`src/lib/pandoc/reference.docx`, workbench 의 것과 동일)을 쓴다.
  - 서버 버전의 상대경로 이미지는 변환 전에 data URI 로 인라인한다.
  - 스탠드얼론은 docx 기능을 처음 쓸 때 pandoc 엔진(약 16MB)을 unpkg 에서 내려받아 IndexedDB 에 캐시한다. 이 때만 외부 요청이 발생한다.

## 보기 설정

⚙ 설정에서 글자 크기(12~24px)와 본문 폭(480~1600px 또는 창 폭에 맞춤)을 조절한다. 값은 브라우저에 저장된다.
