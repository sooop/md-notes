<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from './Editor.svelte';
  import TreeNode from './TreeNode.svelte';
  import Settings from './Settings.svelte';
  import DropOverlay from './DropOverlay.svelte';
  import PasteModal from './PasteModal.svelte';
  import ExportMenu from './ExportMenu.svelte';
  import HistoryPanel from './HistoryPanel.svelte';
  import FilePlus from '@lucide/svelte/icons/file-plus';
  import FolderPlus from '@lucide/svelte/icons/folder-plus';
  import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
  import PanelLeft from '@lucide/svelte/icons/panel-left';
  import Save from '@lucide/svelte/icons/save';
  import Image from '@lucide/svelte/icons/image';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { doc, settings } from '../store.svelte';
  import {
    tree, nav, templates, init, save, onEditorChange, upload, resolveUrl, createDoc, createFolder,
    convertImages, createFromText, handleDrop, exportDocxCurrent, exportMdCurrent, refreshTemplates, selectTemplate,
    restoreVersion,
  } from '../server-mode.svelte';
  import { stripExt } from '../utils';

  let sidebarOpen = $state(true);
  let convertOpen = $state(false);
  let pasteOpen = $state(false);

  const templateOptions = $derived([
    { id: '', label: '기본 템플릿' },
    ...templates.files.map((f) => ({ id: f, label: f })),
  ]);
  const templateHint = $derived(
    templates.dir
      ? `템플릿 폴더: ${templates.dir}${templates.files.length ? '' : ' (.docx 파일을 넣으면 여기에 나타납니다)'}`
      : '',
  );

  onMount(() => { void init(); });

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
    }
  }
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (doc.dirty) e.preventDefault();
  }
  function convert(to: 'base64' | 'file') {
    convertOpen = false;
    void convertImages(to);
  }
</script>

<svelte:window onkeydown={onKey} onbeforeunload={onBeforeUnload} />
<svelte:head>
  <title>{doc.dirty ? '● ' : ''}{doc.path ? stripExt(doc.name) : 'Notes'}</title>
</svelte:head>

<div class="shell">
  {#if sidebarOpen}
    <aside class="sidebar">
      <header>
        <button
          class="root-btn"
          class:selected={nav.dir === ''}
          title={`${tree.root} (새 문서는 선택한 폴더에 만들어집니다)`}
          onclick={() => (nav.dir = '')}
        >{tree.root || 'Notes'}</button>
        <span class="ops-head">
          <button class="icon-btn" title="새 문서" aria-label="새 문서" onclick={() => createDoc(nav.dir)}><FilePlus size={17} /></button>
          <button class="icon-btn" title="새 폴더" aria-label="새 폴더" onclick={() => createFolder(nav.dir)}><FolderPlus size={17} /></button>
          <button class="icon-btn" title="붙여넣어 새 문서 만들기" aria-label="붙여넣어 새 문서 만들기" onclick={() => (pasteOpen = true)}><ClipboardPaste size={17} /></button>
        </span>
      </header>
      <nav class="tree">
        {#if tree.nodes.length}
          <ul>
            {#each tree.nodes as node (node.path)}
              <TreeNode {node} />
            {/each}
          </ul>
        {:else}
          <p class="empty">문서가 없습니다. 위의 새 문서 버튼으로 만들거나 .md · .txt · .docx 파일을 끌어다 놓으세요.</p>
        {/if}
      </nav>
    </aside>
  {/if}

  <main class="main">
    <header class="topbar">
      <button class="icon-btn" aria-label="사이드바 토글" onclick={() => (sidebarOpen = !sidebarOpen)}><PanelLeft size={18} /></button>
      <h1 class="doc-title">
        {doc.path ? stripExt(doc.name) : '문서를 선택하세요'}
        {#if doc.dirty}<span class="dot" title="저장 안 됨">●</span>{/if}
      </h1>
      <span class="spacer"></span>
      {#if doc.path}
        <div class="menu">
          <button onclick={() => (convertOpen = !convertOpen)} aria-expanded={convertOpen}><Image size={15} />이미지 변환<ChevronDown size={14} /></button>
          {#if convertOpen}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <div class="backdrop" onclick={() => (convertOpen = false)}></div>
            <div class="popover menu-list">
              <button onclick={() => convert('base64')}>이 문서의 이미지를 Base64로 변환</button>
              <button onclick={() => convert('file')}>이 문서의 이미지를 파일로 분리</button>
            </div>
          {/if}
        </div>
        <HistoryPanel docKey={doc.path} {resolveUrl} onRestore={restoreVersion} />
        <ExportMenu
          onMd={exportMdCurrent}
          onDocx={exportDocxCurrent}
          options={templateOptions}
          selected={settings.template}
          onSelect={selectTemplate}
          onOpen={refreshTemplates}
          hint={templateHint}
        />
        <button class="primary" disabled={!doc.dirty || doc.saving} onclick={save}>
          <Save size={15} />{doc.saving ? '저장 중…' : '저장'}
        </button>
      {/if}
      <Settings server />
    </header>

    <section class="editor-wrap">
      {#if doc.path}
        {#key doc.key}
          <Editor initial={doc.content} onChange={onEditorChange} {upload} {resolveUrl} />
        {/key}
      {:else}
        <div class="placeholder">왼쪽 목록에서 문서를 열거나 새로 만드세요.</div>
      {/if}
    </section>
  </main>
</div>

<DropOverlay onDrop={(items) => handleDrop(items.map((d) => d.file))} />
<PasteModal open={pasteOpen} onClose={() => (pasteOpen = false)} onCreate={createFromText} />
