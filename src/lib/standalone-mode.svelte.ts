// 스탠드얼론 HTML 버전: 열기/드롭, 내보내기, File System Access 덮어쓰기, IndexedDB 임시 보관
import { doc, toast, askChoose, errMsg } from './store.svelte';
import { downloadText, fileToDataUrl } from './utils';
import { exportDocx, isDocxFile, isImportable, isTextDocFile, readImport } from './docx-flow';

// File System Access API 타입 (lib.dom 에 없는 부분)
interface FsHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (o?: unknown) => Promise<FsHandle[]>;
  showSaveFilePicker?: (o?: unknown) => Promise<FsHandle>;
};
const w = window as PickerWindow;

export const fsaSupported = typeof w.showOpenFilePicker === 'function';

const MD_TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] } }];
const OPEN_TYPES = [
  ...MD_TYPES,
  { description: 'Word', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } },
];
let handle: FsHandle | null = null;

// ---- IndexedDB 임시 보관 (문서 1개) ----
const DB = 'notes-standalone';
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction('kv', mode).objectStore('kv'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
interface Draft { name: string; content: string; dirty: boolean }

let draftTimer: ReturnType<typeof setTimeout> | undefined;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const d: Draft = { name: doc.name, content: doc.content, dirty: doc.dirty };
    idb('readwrite', (s) => s.put(d, 'draft')).catch(() => { /* 저장소를 못 쓰는 환경 */ });
  }, 400);
}

export async function init() {
  void loadTemplateInfo();
  try {
    const d = await idb<Draft | undefined>('readonly', (s) => s.get('draft'));
    if (d && (d.content || d.dirty)) {
      Object.assign(doc, { name: d.name, content: d.content, dirty: d.dirty });
      doc.key++;
      toast('이전 작업을 복구했습니다');
    }
  } catch { /* 임시 보관 없이 시작 */ }
}

export function onEditorChange(md: string) {
  doc.content = md;
  doc.dirty = true;
  saveDraft();
}

function setDoc(name: string, content: string, h: FsHandle | null) {
  handle = h;
  Object.assign(doc, { name, content, dirty: false });
  doc.key++;
  saveDraft();
}

// 변경이 있으면 저장/버리기/취소를 묻는다. true 면 진행해도 된다.
async function guardDirty(): Promise<boolean> {
  if (!doc.dirty) return true;
  const pick = await askChoose(`'${doc.name}' 에 저장하지 않은 변경이 있습니다.`, ['저장', '버리기', '취소']);
  if (pick === 0) return save();
  return pick === 1;
}

export async function newDoc() {
  if (await guardDirty()) setDoc('제목 없음.md', '', null);
}

export async function openFile(file: File, h: FsHandle | null = null) {
  try {
    if (isDocxFile(file)) {
      const imp = await readImport(file); // 변환 후 현재 문서를 대체하므로 그 전에 변경 여부를 묻는다
      if (await guardDirty()) setDoc(imp.name, imp.content, null);
      return;
    }
    if (!(await guardDirty())) return;
    setDoc(file.name, await file.text(), h);
  } catch (e) {
    toast(errMsg(e), 'error');
  }
}

// 붙여넣은 텍스트로 새 문서를 만든다
export async function createFromText(name: string, text: string) {
  if (!(await guardDirty())) return;
  const stem = name.replace(/.(md|markdown|txt)$/i, '').trim() || '새 문서';
  setDoc(`${stem}.md`, text, null);
}

export async function openPicker() {
  try {
    if (fsaSupported) {
      const [h] = await w.showOpenFilePicker!({ types: OPEN_TYPES, multiple: false });
      await openFile(await h.getFile(), h);
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.txt,.docx,text/markdown,text/plain';
      input.onchange = () => { if (input.files?.[0]) void openFile(input.files[0]); };
      input.click();
    }
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) toast(errMsg(e), 'error');
  }
}

export function isDocFile(f: File): boolean {
  return /\.(md|markdown|txt)$/i.test(f.name) || f.type === 'text/markdown';
}

export function exportMd() {
  const name = /\.(md|markdown|txt)$/i.test(doc.name) ? doc.name : `${doc.name}.md`;
  downloadText(name, doc.content);
}

// Ctrl+S: 열어둔 파일(또는 새로 고른 파일)에 덮어쓰고, 미지원 브라우저는 다운로드
export async function save(): Promise<boolean> {
  try {
    if (!fsaSupported) {
      exportMd();
      doc.dirty = false;
      saveDraft();
      return true;
    }
    if (!handle) {
      handle = await w.showSaveFilePicker!({ suggestedName: doc.name, types: MD_TYPES });
      doc.name = handle.name;
    }
    const wr = await handle.createWritable();
    await wr.write(doc.content);
    await wr.close();
    doc.dirty = false;
    saveDraft();
    toast(`'${doc.name}' 에 저장했습니다`);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    toast(`저장 실패: ${errMsg(e)}`, 'error');
    return false;
  }
}

// 스탠드얼론은 이미지를 항상 Base64 로 문서에 넣는다
export function upload(file: File): Promise<string> {
  return fileToDataUrl(file);
}
export const resolveUrl = (src: string) => src;

// 드롭된 파일. 핸들은 드롭 이벤트 안에서 동기적으로 요청해 둬야 한다.
export interface Dropped {
  file: File;
  handle: Promise<FsHandle | null>;
}

// 드롭: .md/.txt 는 현재 문서를 대체해 열고(FSA 지원 시 원본에 덮어쓰기 가능), .docx 는 변환해서 연다
export async function handleDrop(items: Dropped[]) {
  const first = items.find((d) => isImportable(d.file));
  if (!first) {
    toast('.md / .txt / .docx 파일만 열 수 있습니다', 'error');
    return;
  }
  let h: FsHandle | null = null;
  if (isTextDocFile(first.file)) {
    try {
      const got = await first.handle;
      h = got && 'createWritable' in got ? got : null;
    } catch { /* 핸들 없이 열기 */ }
  }
  await openFile(first.file, h);
}

// ---- docx 내보내기와 템플릿 ----
// 템플릿 .docx 는 IndexedDB 에 보관한다. 없으면 기본 템플릿(workbench 와 동일)을 쓴다.
export const tpl = $state({ name: '' });

export async function loadTemplateInfo() {
  try {
    const t = await idb<{ name: string; blob: Blob } | undefined>('readonly', (s) => s.get('template'));
    tpl.name = t?.name ?? '';
  } catch { /* 기본 템플릿 */ }
}

export function pickTemplate() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      await idb('readwrite', (s) => s.put({ name: f.name, blob: f }, 'template'));
      tpl.name = f.name;
      toast(`DOCX 템플릿을 '${f.name}' 으로 지정했습니다`);
    } catch (e) {
      toast(`템플릿을 보관하지 못했습니다: ${errMsg(e)}`, 'error');
    }
  };
  input.click();
}

export async function clearTemplate() {
  try { await idb('readwrite', (s) => s.delete('template')); } catch { /* 무시 */ }
  tpl.name = '';
  toast('기본 템플릿을 사용합니다');
}

export async function exportDocxCurrent() {
  try {
    let template: Blob | null = null;
    if (tpl.name) {
      const t = await idb<{ name: string; blob: Blob } | undefined>('readonly', (s) => s.get('template'));
      template = t?.blob ?? null;
    }
    await exportDocx(doc.content, doc.name, template);
  } catch (e) {
    toast(`DOCX 내보내기 실패: ${errMsg(e)}`, 'error');
  }
}
