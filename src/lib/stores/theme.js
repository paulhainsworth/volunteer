import { writable } from 'svelte/store';

function createThemeStore() {
  // Check localStorage or default to light
  const stored = typeof window !== 'undefined' 
    ? localStorage.getItem('theme') 
    : 'light';
  
  const { subscribe, set, update } = writable(stored || 'light');

  return {
    subscribe,
    
    toggle: () => {
      update(current => {
        const newTheme = current === 'light' ? 'dark' : 'light';
        if (typeof window !== 'undefined') {
          localStorage.setItem('theme', newTheme);
          document.documentElement.setAttribute('data-theme', newTheme);
        }
        return newTheme;
      });
    },
    
    set: (theme) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
      }
      set(theme);
    },
    
    initialize: () => {
      const stored = typeof window !== 'undefined' 
        ? localStorage.getItem('theme') 
        : 'light';
      
      const theme = stored || 'light';
      
      if (typeof window !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme);
      }
      
      set(theme);
    }
  };
}

export const theme = createThemeStore();

