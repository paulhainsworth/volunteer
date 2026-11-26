import { writable } from 'svelte/store';

/** Success messages close themselves; errors stay until dismissed. */
const SUCCESS_TIMEOUT_MS = 8000;

let nextId = 1;

export const notifications = writable([]);

/**
 * Show a status message in the notifications region and announce it to screen readers.
 * @param {string} message
 * @param {{ tone?: 'success' | 'error', timeout?: number }} [options] timeout 0 keeps it open.
 */
export function notify(message, { tone = 'success', timeout } = {}) {
  const id = nextId++;
  const opener = typeof document !== 'undefined' ? document.activeElement : null;
  notifications.update((list) => [
    ...list,
    { id, message, tone, opener, timeout: timeout ?? (tone === 'error' ? 0 : SUCCESS_TIMEOUT_MS) },
  ]);
  return id;
}

export function dismissNotification(id) {
  notifications.update((list) => list.filter((item) => item.id !== id));
}

export const pendingConfirmation = writable(null);

/**
 * Ask the user to confirm an action in a modal dialog.
 * Resolves true for the confirm button and false for Cancel, Esc, or a replaced request.
 */
export function confirmAction({
  title,
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
}) {
  return new Promise((resolve) => {
    pendingConfirmation.update((previous) => {
      previous?.resolve(false);
      return { title, message, confirmLabel, cancelLabel, destructive, resolve };
    });
  });
}
