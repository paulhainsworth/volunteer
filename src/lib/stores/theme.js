import { writable } from 'svelte/store';

const root = document.documentElement;
const { subscribe, set } = writable(root.dataset.theme);

/** Apply a theme to the page, including the color-scheme hint for native controls. */
function apply(theme) {
  root.dataset.theme = theme;
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = theme;
  set(theme);
}

// Follow a theme change made in another tab.
window.addEventListener('storage', (event) => {
  if (event.key === 'theme') apply(event.newValue === 'light' ? 'light' : 'dark');
});

export const theme = {
  subscribe,
  toggle() {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // The theme can still change for the current page.
    }
  },
};
