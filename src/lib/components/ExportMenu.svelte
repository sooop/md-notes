<script lang="ts">
  import Download from '@lucide/svelte/icons/download';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Check from '@lucide/svelte/icons/check';
  interface Props {
    onDocx: () => void;
    onMd?: () => void;
    /** docx 템플릿 선택지 (id '' 는 기본 템플릿) */
    options: { id: string; label: string }[];
    selected: string;
    onSelect: (id: string) => void;
    /** 메뉴를 열 때 호출 (템플릿 목록 새로고침 등) */
    onOpen?: () => void;
    hint?: string;
    actions?: { label: string; run: () => void }[];
    disabled?: boolean;
  }
  let { onDocx, onMd, options, selected, onSelect, onOpen, hint = '', actions = [], disabled = false }: Props = $props();

  let open = $state(false);

  function toggle() {
    open = !open;
    if (open) onOpen?.();
  }
  function run(fn: () => void) {
    open = false;
    fn();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') open = false; }} />

<div class="menu">
  <button {disabled} onclick={toggle} aria-expanded={open}><Download size={15} />내보내기<ChevronDown size={14} /></button>
  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={() => (open = false)}></div>
    <div class="popover menu-list">
      {#if onMd}<button onclick={() => run(onMd)}>.md 파일로 내려받기</button>{/if}
      <button onclick={() => run(onDocx)}>.docx 로 내보내기</button>
      <hr />
      <span class="label">DOCX 서식 템플릿</span>
      {#each options as o (o.id)}
        <button class:active={selected === o.id} onclick={() => onSelect(o.id)}>
          <span class="check">{#if selected === o.id}<Check size={14} />{/if}</span>{o.label}
        </button>
      {/each}
      {#each actions as a (a.label)}
        <button onclick={() => run(a.run)}>{a.label}</button>
      {/each}
      {#if hint}<p class="menu-hint">{hint}</p>{/if}
    </div>
  {/if}
</div>
