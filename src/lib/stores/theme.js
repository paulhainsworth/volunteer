import { writable } from 'svelte/store';

const root = document.documentElement;
const { subscribe, update } = writable(root.dataset.theme);

export const theme = {
  subscribe,
  toggle() {
    update((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try {
        localStorage.setItem('theme', next);
      } catch {
        // The theme can still change for the current page.
      }
      return next;
    });
  },
};
