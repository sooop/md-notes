<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from './Editor.svelte';
  import Settings from './Settings.svelte';
  import DropOverlay from './DropOverlay.svelte';
  import PasteModal from './PasteModal.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import FilePlus from '@lucide/svelte/icons/file-plus';
  import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import Save from '@lucide/svelte/icons/save';
  import { doc } from '../store.svelte';
  import {
    init, save, exportMd, openPicker, newDoc, onEditorChange, upload, resolveUrl, handleDrop, fsaSupported,
    createFromText, exportDocxCurrent, tpl, pickTemplate, clearTemplate,
  } from '../standalone-mode.svelte';
  import { stripExt } from '../utils';

  let pasteOpen = $state(false);

  const templateOptions = $derived([
    { id: '', label: '기본 템플릿' },
    ...(tpl.name ? [{ id: 'custom', label: tpl.name }] : []),
  ]);

  onMount(() => { void init(); });

  function onKey(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); void save(); }
    else if (k === 'o') { e.preventDefault(); void openPicker(); }
  }
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (doc.dirty) e.preventDefault();
  }
</script>

<svelte:window onkeydown={onKey} onbeforeunload={onBeforeUnload} />
<svelte:head>
  <title>{doc.dirty ? '● ' : ''}{stripExt(doc.name)}</title>
</svelte:head>

<div class="shell single">
  <main class="main">
    <header class="topbar">
      <h1 class="doc-title">
        {stripExt(doc.name)}
        {#if doc.dirty}<span class="dot" title="저장 안 됨">●</span>{/if}
      </h1>
      <span class="spacer"></span>
      <button onclick={newDoc}><FilePlus size={15} />새 문서</button>
      <button onclick={() => (pasteOpen = true)} title="붙여넣은 텍스트로 새 문서 만들기"><ClipboardPaste size={15} />붙여넣기</button>
      <button onclick={openPicker} title="Ctrl+O"><FolderOpen size={15} />열기</button>
      <ExportMenu
        onMd={exportMd}
        onDocx={exportDocxCurrent}
        options={templateOptions}
        selected={tpl.name ? 'custom' : ''}
        onSelect={(id) => { if (id === '') void clearTemplate(); }}
        actions={[{ label: '템플릿 .docx 파일 선택…', run: pickTemplate }]}
        hint="템플릿은 이 브라우저에 보관됩니다. 첫 docx 사용 때 pandoc 엔진(약 16MB)을 내려받습니다."
      />
      {#if fsaSupported}
        <button class="primary" onclick={save} title="열어 둔 파일에 덮어씁니다 (Ctrl+S)"><Save size={15} />저장</button>
      {/if}
      <Settings />
    </header>

    <section class="editor-wrap">
      {#key doc.key}
        <Editor initial={doc.content} onChange={onEditorChange} {upload} {resolveUrl} />
      {/key}
    </section>
  </main>
</div>

<DropOverlay onDrop={handleDrop} />
<PasteModal open={pasteOpen} onClose={() => (pasteOpen = false)} onCreate={createFromText} />
