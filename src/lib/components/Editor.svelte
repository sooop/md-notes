<script lang="ts">
  import { untrack } from 'svelte';
  import { CrepeBuilder } from '@milkdown/crepe/builder';
  import { blockEdit } from '@milkdown/crepe/feature/block-edit';
  import { codeMirror } from '@milkdown/crepe/feature/code-mirror';
  import { cursor } from '@milkdown/crepe/feature/cursor';
  import { imageBlock } from '@milkdown/crepe/feature/image-block';
  import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip';
  import { listItem } from '@milkdown/crepe/feature/list-item';
  import { placeholder } from '@milkdown/crepe/feature/placeholder';
  import { table } from '@milkdown/crepe/feature/table';
  import { toolbar } from '@milkdown/crepe/feature/toolbar';
  import { editorViewCtx } from '@milkdown/kit/core';
  import { editorBridge, doc, toast, askChoose } from '../store.svelte';
  import { stripExt } from '../utils';
  import { tablePaste, attachTableTools } from '../tableTools';
  import { attachFinder } from '../search/pmSearch';
  import { bindComments } from '../comments/store.svelte';
  import { finder } from '../search/state.svelte';
  import { codeLanguages, codeHighlight } from '../codeLanguages';
  import { onlyDoubleTilde } from '../gfmTilde';

  interface Props {
    initial: string;
    onChange: (md: string) => void;
    upload: (file: File) => Promise<string>;
    resolveUrl: (src: string) => string | Promise<string>;
    readonly?: boolean; // 읽기 모드 (바뀌면 에디터를 다시 만들지 않고 편집 가능 여부만 바꾼다)
    preview?: boolean; // 이력 미리보기: 문서 내 검색·코멘트에 연결하지 않는다
  }
  let { initial, onChange, upload, resolveUrl, readonly = false, preview = false }: Props = $props();

  let host: HTMLDivElement;
  let builder: CrepeBuilder | undefined;
  let ready = $state(false);

  $effect(() => {
    const ro = readonly;
    if (ready) builder?.setReadonly(ro);
  });

  // 문서가 바뀌면 부모가 {#key} 로 이 컴포넌트를 새로 만든다. 여기서는 한 번만 생성한다.
  $effect(() => {
    let crepe: CrepeBuilder | undefined;
    let ctl: ReturnType<typeof attachFinder> | undefined;
    let unbind: (() => void) | undefined;
    let unbindTable: (() => void) | undefined;
    let disposed = false;
    untrack(() => {
      const c = new CrepeBuilder({ root: host, defaultValue: initial })
        .addFeature(cursor)
        .addFeature(listItem)
        .addFeature(linkTooltip)
        .addFeature(blockEdit)
        .addFeature(toolbar)
        .addFeature(codeMirror, { languages: codeLanguages, theme: codeHighlight })
        .addFeature(table)
        .addFeature(placeholder, { text: '내용을 입력하세요. / 를 누르면 블록 메뉴가 열립니다.' })
        .addFeature(imageBlock, {
          onUpload: upload,
          blockOnUpload: upload,
          inlineOnUpload: upload,
          proxyDomURL: resolveUrl,
        });
      const tableEnv = { toast, askChoose, docName: () => stripExt(doc.name) };
      c.editor.use(tablePaste(tableEnv)); // TSV/CSV 붙여넣기 → 표
      onlyDoubleTilde(c.editor); // 취소선은 ~~A~~ 만 인식하고 글자 그대로의 ~ 는 보존한다
      if (readonly) c.setReadonly(true);
      c.on((l) => l.markdownUpdated((_ctx, md, prev) => { if (md !== prev) onChange(md); }));
      c.create().then(() => {
        if (disposed) void c.destroy();
        else {
          crepe = c;
          builder = c;
          ready = true;
          unbindTable = attachTableTools(c.editor.action((ctx) => ctx.get(editorViewCtx)), tableEnv); // 표 → TSV/CSV 복사·저장
          if (!preview) {
            editorBridge.getMarkdown = () => c.getMarkdown();
            // 문서 내 검색·코멘트: 열린 문서의 에디터만 연결한다
            const view = c.editor.action((ctx) => ctx.get(editorViewCtx));
            ctl = attachFinder(view, (st) => Object.assign(finder, st));
            finder.ctlPath = doc.path;
            finder.ctl = ctl;
            unbind = bindComments(view, doc.path);
          }
        }
      });
    });
    return () => {
      disposed = true;
      ready = false;
      builder = undefined;
      unbind?.();
      unbindTable?.();
      if (ctl) {
        ctl.destroy();
        if (finder.ctl === ctl) { finder.ctl = null; finder.total = 0; finder.current = -1; finder.error = ''; }
      }
      void crepe?.destroy();
    };
  });
</script>

<div class="editor-host" class:is-readonly={readonly} bind:this={host}></div>
