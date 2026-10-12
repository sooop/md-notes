// 두 모드가 공유하는 상태: 설정, 현재 문서, 토스트, 대화상자
export type Theme = 'system' | 'light' | 'dark';
export type ImageMode = 'file' | 'base64';

const SETTINGS_KEY = 'notes.settings';
const SETTINGS_VERSION = 2;

function loadSettings() {
  const base = {
    theme: 'system' as Theme,
    autosave: true,
    imageMode: 'file' as ImageMode,
    fontSize: 16, // 에디터 기본 글자 크기(px)
    contentWidth: 860, // 본문 최대 폭(px), 0 이면 전체 폭
    template: '', // 서버 버전의 docx 템플릿 파일명, 빈 값이면 기본 템플릿
    version: SETTINGS_VERSION,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    const merged = { ...base, ...stored };
    // v2: 자동 저장 기본값이 ON 으로 바뀌었다. 이전 설정을 가진 사용자도 한 번만 ON 으로 전환한다(이후 끄면 존중).
    if (stored.version !== SETTINGS_VERSION) {
      merged.autosave = true;
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged));
    }
    return merged;
  } catch {
    return base;
  }
}

export const settings = $state(loadSettings());

export function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* 저장소를 못 쓰는 환경 */ }
}

export function applyTheme() {
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export const FONT_RANGE = { min: 12, max: 24 };
export const WIDTH_RANGE = { min: 480, max: 1600 };

// 글자 크기와 본문 폭을 CSS 변수로 반영한다
export function applyLayout() {
  const f = Math.min(FONT_RANGE.max, Math.max(FONT_RANGE.min, Number(settings.fontSize) || 16));
  const w = Number(settings.contentWidth) || 0;
  const root = document.documentElement.style;
  root.setProperty('--editor-font-size', `${f}px`);
  root.setProperty('--editor-width', w > 0 ? `${Math.min(WIDTH_RANGE.max, Math.max(WIDTH_RANGE.min, w))}px` : 'none');
}

export const doc = $state({
  key: 0, // 바뀌면 에디터를 새로 만든다
  path: '', // 서버 모드: 루트 기준 경로, 스탠드얼론: 빈 문자열
  name: '제목 없음',
  content: '',
  dirty: false,
  saving: false,
  edit: false, // 편집 모드 여부. 기존 문서는 읽기 모드로 열고, 새로 만든 문서만 편집 모드로 시작한다
});

// 마지막 에디터 내용을 외부에서 읽기 위한 훅 (Editor 가 등록)
export const editorBridge: { getMarkdown: () => string } = { getMarkdown: () => doc.content };

// ---- 진행 상태 (pandoc 엔진 준비/변환 등 시간이 걸리는 작업) ----
export const status = $state({ text: '' });
export async function withStatus<T>(text: string, fn: (set: (t: string) => void) => Promise<T>): Promise<T> {
  status.text = text;
  try {
    return await fn((t) => { status.text = t; });
  } finally {
    status.text = '';
  }
}

// ---- 토스트 ----
export const toasts = $state<{ id: number; text: string; kind: 'info' | 'error' }[]>([]);
let toastId = 0;
export function toast(text: string, kind: 'info' | 'error' = 'info') {
  const id = ++toastId;
  toasts.push({ id, text, kind });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, kind === 'error' ? 6000 : 3000);
}

// ---- 대화상자 (Promise 기반) ----
export const dialog = $state<{
  open: boolean;
  title: string;
  message: string;
  input: boolean;
  value: string;
  buttons: string[];
  resolve: (r: { button: number; value: string }) => void;
}>({ open: false, title: '', message: '', input: false, value: '', buttons: [], resolve: () => {} });

function ask(opts: { title?: string; message?: string; input?: boolean; value?: string; buttons: string[] }) {
  return new Promise<{ button: number; value: string }>((resolve) => {
    Object.assign(dialog, {
      open: true,
      title: opts.title ?? '',
      message: opts.message ?? '',
      input: opts.input ?? false,
      value: opts.value ?? '',
      buttons: opts.buttons,
      resolve: (r: { button: number; value: string }) => {
        dialog.open = false;
        resolve(r);
      },
    });
  });
}

export async function askPrompt(title: string, value = ''): Promise<string | null> {
  const r = await ask({ title, input: true, value, buttons: ['취소', '확인'] });
  return r.button === 1 ? r.value.trim() : null;
}

export async function askConfirm(message: string, okLabel = '확인'): Promise<boolean> {
  return (await ask({ message, buttons: ['취소', okLabel] })).button === 1;
}

// 버튼 라벨 목록 중 누른 인덱스, 닫으면 -1
export async function askChoose(message: string, buttons: string[]): Promise<number> {
  return (await ask({ message, buttons })).button;
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
