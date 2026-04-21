<script>
  /**
   * Dedicated magic-link completion shell. Session recovery and navigation run in App.svelte
   * so legacy landings on `/` with `#access_token=…` and new `redirectTo` landings share one code path.
   */
</script>

<div class="auth-callback">
  <p class="auth-callback__title">Completing sign-in…</p>
  <p class="auth-callback__hint">If this screen stays more than a few seconds, try the link again or open a fresh tab.</p>
</div>

<style>
  .auth-callback {
    max-width: 28rem;
    margin: 4rem auto;
    padding: 0 1.25rem;
    text-align: center;
    font-family: system-ui, sans-serif;
    color: #1a1a1a;
  }
  .auth-callback__title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0 0 0.75rem;
  }
  .auth-callback__hint {
    margin: 0;
    font-size: 0.9rem;
    color: #555;
    line-height: 1.45;
  }
</style>
