import { writable } from 'svelte/store';

/** Number of open modal dialogs. Notifications wait until it returns to zero. */
export const openModalCount = writable(0);

const supportsClosedBy =
  typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;

// Test the pointer position, not event.target: the dialog is also the target for its own padding.
function isOutside(event, dialog) {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

/**
 * Opens a <dialog> with showModal() when it mounts. The browser supplies the inert page,
 * focus containment, Esc and back-gesture dismissal, and focus return on close.
 * `onClose(returnValue)` runs after any native close so component state can follow.
 * `lightDismiss` (default true) also closes the dialog on a click outside it.
 */
export function modalDialog(dialog, options = {}) {
  let { onClose, lightDismiss = true } = options;
  const opener = document.activeElement;
  let pressedOutside = false;

  const handleClose = () => onClose?.(dialog.returnValue);
  // Safari lacks closedby, so emulate click-outside dismissal there. Require the press and
  // the release outside so a text-selection drag that ends on the backdrop does not close it.
  const handlePointerDown = (event) => {
    pressedOutside = lightDismiss && isOutside(event, dialog);
  };
  const handlePointerUp = (event) => {
    if (pressedOutside && isOutside(event, dialog)) dialog.close();
    pressedOutside = false;
  };

  dialog.setAttribute('closedby', lightDismiss ? 'any' : 'closerequest');
  dialog.addEventListener('close', handleClose);
  if (!supportsClosedBy) {
    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
  }
  dialog.showModal();
  openModalCount.update((count) => count + 1);

  return {
    update(next = {}) {
      onClose = next.onClose;
      lightDismiss = next.lightDismiss ?? true;
      dialog.setAttribute('closedby', lightDismiss ? 'any' : 'closerequest');
    },
    destroy() {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
      openModalCount.update((count) => Math.max(0, count - 1));
      // Closing through component state removes the dialog without close(), which skips
      // the browser's focus return, so restore focus when it would otherwise be lost.
      queueMicrotask(() => {
        const active = document.activeElement;
        if ((!active || active === document.body) && opener instanceof HTMLElement && opener.isConnected) {
          opener.focus();
        }
      });
    },
  };
}
