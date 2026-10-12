<script lang="ts">
  import Eye from '@lucide/svelte/icons/eye';
  import Pencil from '@lucide/svelte/icons/pencil';
  import { doc } from '../store.svelte';

  function onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      doc.edit = !doc.edit;
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<button class="modetoggle" class:active={doc.edit} role="switch" aria-checked={doc.edit} onclick={() => (doc.edit = !doc.edit)}
  title={doc.edit ? '편집 모드: 누르면 읽기 모드로 (Ctrl+E)' : '읽기 모드: 본문이 바뀌지 않습니다. 누르면 편집 모드로 (Ctrl+E)'}>
  {#if doc.edit}<Pencil size={15} />편집 중{:else}<Eye size={15} />읽기{/if}
</button>
