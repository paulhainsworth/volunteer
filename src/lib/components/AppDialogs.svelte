<script>
  import { tick } from 'svelte';
  import { modalDialog, openModalCount } from '../actions/modalDialog';
  import { notifications, dismissNotification, pendingConfirmation } from '../stores/notifications';

  const supportsPopover = typeof HTMLElement !== 'undefined' && Object.hasOwn(HTMLElement.prototype, 'popover');

  let announcement = '';
  const announced = new Set();
  let regionNode;

  // Hold notifications while a modal is open: the page behind it is inert and the message would be missed.
  $: visible = $openModalCount === 0 ? $notifications : [];
  $: announce(visible);

  function announce(list) {
    for (const item of list) {
      if (announced.has(item.id)) continue;
      announced.add(item.id);
      if (typeof document.ariaNotify === 'function') {
        document.ariaNotify(item.message);
      } else {
        // Clear first so a repeated message is announced again.
        announcement = '';
        tick().then(() => {
          announcement = item.message;
        });
      }
    }
  }

  function settle(returnValue) {
    const request = $pendingConfirmation;
    pendingConfirmation.set(null);
    request?.resolve(returnValue === 'confirm');
  }

  async function dismiss(item) {
    const toasts = [...(regionNode?.querySelectorAll('.toast') ?? [])];
    const index = toasts.findIndex((node) => node.dataset.id === String(item.id));
    const hadFocus = toasts[index]?.contains(document.activeElement);
    dismissNotification(item.id);
    if (!hadFocus) return;
    await tick();
    const next = regionNode?.querySelectorAll('.toast-close')[Math.max(0, index - 1)];
    if (next) next.focus();
    else if (item.opener?.isConnected) item.opener.focus();
  }

  /** Shows the region in the top layer where popover is supported; it is position: fixed otherwise. */
  function topLayer(node) {
    if (supportsPopover) node.showPopover();
  }

  /** Closes a toast after its timeout, pausing while it has focus or the pointer. */
  function autoDismiss(node, item) {
    if (!item.timeout) return {};
    let timer;
    let paused = 0;
    const start = () => {
      clearTimeout(timer);
      timer = setTimeout(() => dismissNotification(item.id), item.timeout);
    };
    const pause = () => {
      paused += 1;
      clearTimeout(timer);
    };
    const resume = () => {
      paused = Math.max(0, paused - 1);
      if (!paused) start();
    };
    node.addEventListener('focusin', pause);
    node.addEventListener('focusout', resume);
    node.addEventListener('pointerenter', pause);
    node.addEventListener('pointerleave', resume);
    start();
    return {
      destroy() {
        clearTimeout(timer);
        node.removeEventListener('focusin', pause);
        node.removeEventListener('focusout', resume);
        node.removeEventListener('pointerenter', pause);
        node.removeEventListener('pointerleave', resume);
      },
    };
  }
</script>

<!-- A route change cancels a pending confirmation so it cannot act on a page that is gone. -->
<svelte:window on:hashchange={() => $pendingConfirmation && settle('')} />

<div class="visually-hidden" aria-live="polite">{announcement}</div>

{#if visible.length}
  <section
    class="toast-region"
    popover="manual"
    aria-label="Notifications"
    bind:this={regionNode}
    use:topLayer
  >
    {#each visible as item (item.id)}
      <div class="toast" class:error={item.tone === 'error'} data-id={item.id} use:autoDismiss={item}>
        <p>{item.message}</p>
        <button type="button" class="toast-close" aria-label="Dismiss notification" on:click={() => dismiss(item)}>×</button>
      </div>
    {/each}
  </section>
{/if}

{#if $pendingConfirmation}
  {@const request = $pendingConfirmation}
  <dialog
    class="confirm-dialog"
    aria-labelledby="confirm-dialog-title"
    aria-describedby={request.message ? 'confirm-dialog-message' : undefined}
    use:modalDialog={{ onClose: settle, lightDismiss: false }}
  >
    <h1 id="confirm-dialog-title">{request.title}</h1>
    {#if request.message}
      <p id="confirm-dialog-message">{request.message}</p>
    {/if}
    <form method="dialog" class="confirm-actions">
      <!-- svelte-ignore a11y_autofocus -->
      <button value="cancel" class="confirm-cancel" autofocus>{request.cancelLabel}</button>
      <button value="confirm" class="confirm-ok" class:destructive={request.destructive}>{request.confirmLabel}</button>
    </form>
  </dialog>
{/if}

<style>
  .toast-region {
    position: fixed;
    inset: auto 1rem 1rem auto;
    width: min(26rem, calc(100% - 2rem));
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    overflow: visible;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 2000;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.85rem 0.85rem 0.85rem 1rem;
    border-radius: var(--radius-lg);
    border: 1px solid var(--success-border);
    background: var(--success-surface);
    color: var(--success-text);
    box-shadow: var(--shadow-lg);
  }

  .toast.error {
    border-color: var(--danger-border);
    background: var(--danger-surface);
    color: var(--danger-text);
  }

  .toast p {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .toast-close {
    flex-shrink: 0;
    min-width: 32px;
    min-height: 32px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    font-size: 1.25rem;
    line-height: 1;
  }

  .toast-close:hover {
    background: rgb(0 0 0 / 0.08);
  }

  .toast-close:focus-visible,
  .confirm-actions button:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: no-preference) {
    .toast {
      animation: toast-in 0.2s ease-out;
    }
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
  }

  .confirm-dialog {
    width: min(28rem, calc(100% - 2rem));
    padding: 1.5rem;
    border-radius: var(--radius-lg);
    background: var(--bg-primary);
    color: var(--text-primary);
    box-shadow: var(--shadow-lg);
  }

  .confirm-dialog h1 {
    font-size: 1.2rem;
    line-height: 1.3;
    margin-bottom: 0.5rem;
  }

  .confirm-dialog p {
    color: var(--text-secondary);
    white-space: pre-line;
  }

  .confirm-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }

  .confirm-actions button {
    min-height: 44px;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-md);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .confirm-cancel {
    border: 1px solid var(--input-border);
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .confirm-ok {
    border: 1px solid #0069d9;
    background: #0069d9;
    color: #fff;
  }

  .confirm-ok.destructive {
    border-color: #c82333;
    background: #c82333;
  }
</style>
