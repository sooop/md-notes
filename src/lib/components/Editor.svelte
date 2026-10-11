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
  import { editorBridge } from '../store.svelte';
  import { codeLanguages, codeHighlight } from '../codeLanguages';

  interface Props {
    initial: string;
    onChange: (md: string) => void;
    upload: (file: File) => Promise<string>;
    resolveUrl: (src: string) => string;
  }
  let { initial, onChange, upload, resolveUrl }: Props = $props();

  let host: HTMLDivElement;

  // 문서가 바뀌면 부모가 {#key} 로 이 컴포넌트를 새로 만든다. 여기서는 한 번만 생성한다.
  $effect(() => {
    let crepe: CrepeBuilder | undefined;
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
      c.on((l) => l.markdownUpdated((_ctx, md, prev) => { if (md !== prev) onChange(md); }));
      c.create().then(() => {
        if (disposed) void c.destroy();
        else {
          crepe = c;
          editorBridge.getMarkdown = () => c.getMarkdown();
        }
      });
    });
    return () => {
      disposed = true;
      void crepe?.destroy();
    };
  });
</script>

<div class="editor-host" bind:this={host}></div>
