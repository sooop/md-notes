// 표 ↔ CSV/TSV 변환의 순수 함수들 (에디터와 무관)

// RFC4180 식 파서. 따옴표는 필드가 `"` 로 시작할 때만 인정한다(엑셀이 TSV 에서도 같은 규칙으로 감싼다).
export function parseDelimited(text: string, delim: string): string[][] {
  const src = text.replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    if (src[i] === '"' && field === '') {
      i++;
      for (; i < n; i++) {
        if (src[i] === '"') {
          if (src[i + 1] === '"') { field += '"'; i++; }
          else { i++; break; }
        } else field += src[i];
      }
      continue;
    }
    const ch = src[i];
    if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
    i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export type PastedTable = { kind: 'tsv' | 'csv'; rows: string[][] };

// 모든 행의 열 수가 같고 2행·2열 이상이어야 표로 본다. 탭이 있으면 TSV(자동 변환), 없고 쉼표만 있으면 CSV(확인 필요).
export function detectTable(text: string): PastedTable | null {
  if (!text.includes('\n')) return null;
  const kind = text.includes('\t') ? 'tsv' : text.includes(',') ? 'csv' : null;
  if (!kind) return null;
  const rows = parseDelimited(text, kind === 'tsv' ? '\t' : ',');
  if (rows.length < 2) return null;
  const cols = rows[0].length;
  if (cols < 2 || rows.some((r) => r.length !== cols)) return null;
  return { kind, rows };
}

const quoteIf = (s: string, special: RegExp) => (special.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export const toTsv = (rows: string[][]) =>
  rows.map((r) => r.map((c) => quoteIf(c, /[\t\n\r"]/)).join('\t')).join('\n');

export const toCsv = (rows: string[][]) =>
  rows.map((r) => r.map((c) => quoteIf(c, /[,\n\r"]/)).join(',')).join('\r\n');
