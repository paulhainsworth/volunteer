<script>
  import { onDestroy } from 'svelte';
  import { supabase } from '../lib/supabaseClient';

  let query = '';
  let results = [];
  let loading = false;
  let error = '';
  let debounceId;
  let searchSeq = 0;

  /** Derived for display only — do not schedule searches from reactive blocks (that can loop when results/loading update). */
  $: trimmed = (query || '').trim();

  function scheduleSearchFromInput(event) {
    const t = (event?.currentTarget?.value ?? query ?? '').trim();
    clearTimeout(debounceId);
    if (t.length < 3) {
      searchSeq++;
      results = [];
      loading = false;
      error = '';
      return;
    }
    debounceId = setTimeout(() => void runSearch(t), 250);
  }

  function phoneTelHref(phone) {
    if (phone == null || String(phone).trim() === '') return null;
    const d = String(phone).replace(/[^\d+]/g, '');
    if (!d) return null;
    if (d.startsWith('+')) return d;
    if (d.length === 10) return `+1${d}`;
    if (d.length === 11 && d.startsWith('1')) return `+${d}`;
    return d.startsWith('1') && d.length > 10 ? `+${d}` : d;
  }

  async function runSearch(q) {
    if (q.length < 3) {
      results = [];
      loading = false;
      error = '';
      return;
    }
    const seq = ++searchSeq;
    loading = true;
    error = '';
    try {
      const { data, error: rpcError } = await supabase.rpc('search_volunteer_contacts', { p_query: q });
      if (rpcError) throw rpcError;
      if (seq !== searchSeq) return;
      results = Array.isArray(data) ? data : [];
    } catch (e) {
      if (seq !== searchSeq) return;
      error = e?.message || 'Search failed. Try again.';
      results = [];
    } finally {
      if (seq === searchSeq) loading = false;
    }
  }

  onDestroy(() => clearTimeout(debounceId));
</script>

<div class="contacts">
  <div class="hero">
    <h1>🚴 Race Volunteer Management</h1>
    <p class="tagline">Organize, track, and communicate with race volunteers</p>
  </div>

  <section class="search-section" aria-label="Contact search">
    <label class="search-label" for="contacts-search">Search volunteers</label>
    <input
      id="contacts-search"
      class="search-input"
      type="search"
      autocomplete="off"
      placeholder="Start typing a first name, last name, or email…"
      bind:value={query}
      on:input={scheduleSearchFromInput}
      spellcheck="false"
    />
    <p class="search-hint">Type at least three characters to see results.</p>
    {#if error}
      <p class="search-error" role="alert">{error}</p>
    {/if}
  </section>

  <div class="results" aria-live="polite">
    {#if trimmed.length >= 3}
      {#if loading}
        <p class="results-state">Searching…</p>
      {:else if results.length === 0}
        <p class="results-state">No matches.</p>
      {:else}
        <ul class="contact-card-list" role="list">
          {#each results as row (row.id)}
            <li>
              <article class="contact-card" aria-label="Volunteer contact">
                <h2 class="contact-name">
                  {[row.first_name, row.last_name].map((x) => (x || '').trim()).filter(Boolean).join(' ') || '—'}
                </h2>
                <div class="contact-roles" role="list">
                  {#if row.role_names && row.role_names.length}
                    {#each row.role_names as role}
                      <span class="role-chip" role="listitem">{role}</span>
                    {/each}
                  {:else}
                    <span class="role-empty">No role signups on file</span>
                  {/if}
                </div>
                <div class="contact-line">
                  <span class="label">Phone</span>
                  {#if phoneTelHref(row.phone)}
                    <a class="contact-link" href="tel:{phoneTelHref(row.phone)}">{row.phone?.trim() || '—'}</a>
                  {:else}
                    <span class="contact-missing">—</span>
                  {/if}
                </div>
                <div class="contact-line">
                  <span class="label">Email</span>
                  <span class="contact-text">{row.email || '—'}</span>
                </div>
              </article>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</div>

<style>
  .contacts {
    max-width: 1000px;
    margin: 0 auto;
  }

  .hero {
    text-align: center;
    padding: 3rem 1rem 1.5rem;
  }

  .hero h1 {
    font-size: 3rem;
    margin-bottom: 1rem;
    color: #1a1a1a;
  }

  :global([data-theme='dark']) .hero h1,
  :global([data-theme='dark']) .contact-name {
    color: var(--text-color, #f1f1f1);
  }

  .tagline {
    font-size: 1.5rem;
    color: #6c757d;
    margin-bottom: 0.5rem;
  }

  :global([data-theme='dark']) .tagline,
  :global([data-theme='dark']) .search-hint,
  :global([data-theme='dark']) .label,
  :global([data-theme='dark']) .results-state,
  :global([data-theme='dark']) .role-empty {
    color: var(--text-secondary, #adb5bd);
  }

  .search-section {
    max-width: 560px;
    margin: 0 auto 2rem;
    padding: 0 1rem;
  }

  .search-label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: #1a1a1a;
  }

  :global([data-theme='dark']) .search-label {
    color: var(--text-color, #f1f1f1);
  }

  .search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.75rem 1rem;
    font-size: 1.05rem;
    border: 1px solid var(--border-color, #e9ecef);
    border-radius: 8px;
    background: var(--bg-input, #fff);
    color: var(--text-color, #1a1a1a);
  }

  :global([data-theme='dark']) .search-input {
    background: var(--bg-elevated, #2a2a2a);
  }

  .search-hint {
    margin: 0.5rem 0 0;
    font-size: 0.9rem;
    color: #6c757d;
  }

  .search-error {
    color: #dc3545;
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
  }

  .results-state {
    text-align: center;
    color: #6c757d;
    margin: 1rem 0 2rem;
  }

  .contact-card-list {
    list-style: none;
    padding: 0 1rem 3rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .contact-card {
    background: var(--card-bg, white);
    padding: 1.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-color, #e9ecef);
  }

  :global([data-theme='dark']) .contact-card {
    background: var(--bg-elevated, #2a2a2a);
  }

  .contact-name {
    margin: 0 0 0.75rem;
    font-size: 1.2rem;
    color: #1a1a1a;
  }

  .contact-roles {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 1rem;
  }

  .role-chip {
    display: inline-block;
    background: #e7f1ff;
    color: #0b5ed7;
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.2rem 0.55rem;
    border-radius: 6px;
  }

  :global([data-theme='dark']) .role-chip {
    background: #1a3150;
    color: #9ec5fe;
  }

  .role-empty {
    font-size: 0.9rem;
    color: #6c757d;
    font-style: italic;
  }

  .contact-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 0.75rem;
    margin-top: 0.35rem;
    font-size: 0.95rem;
  }

  .label {
    font-weight: 600;
    color: #495057;
    min-width: 3.5rem;
  }

  .contact-link {
    color: #0d6efd;
    text-decoration: none;
  }

  .contact-link:hover {
    text-decoration: underline;
  }

  .contact-text {
    color: #212529;
    word-break: break-all;
  }

  :global([data-theme='dark']) .contact-text {
    color: var(--text-color, #e9ecef);
  }

  .contact-missing {
    color: #6c757d;
  }

  @media (max-width: 768px) {
    .hero h1 {
      font-size: 2rem;
    }
    .tagline {
      font-size: 1.2rem;
    }
  }
</style>
