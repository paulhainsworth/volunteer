<script>
  export let leader = null;
</script>

{#if leader}
  <div class="contact-leader">
    <div class="leader-card">
      <h4>Your Volunteer Leader</h4>

      <div class="leader-info">
        <div class="leader-name">
          ⭐ {leader.first_name} {leader.last_name}
        </div>

        <div class="contact-options">
          <a href="mailto:{leader.email}" class="contact-link">
            📧 {leader.email}
          </a>

          {#if leader.phone}
            <a href="tel:{leader.phone}" class="contact-link">
              📱 {leader.phone}
            </a>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .contact-leader {
    margin-top: 1.5rem;
  }

  .leader-card {
    background: var(--warning-surface);
    border: 1px solid var(--warning-border);
    border-radius: 8px;
    padding: 1.25rem;
  }

  .leader-card h4 {
    margin: 0 0 1rem 0;
    color: var(--warning-text);
    font-size: 1rem;
  }

  .leader-name {
    font-weight: 600;
    font-size: 1.1rem;
    color: var(--warning-text);
    margin-bottom: 0.25rem;
  }

  .contact-options {
    display: flex;
    flex-direction: column;
  }

  .contact-link {
    color: var(--primary-color);
    text-decoration: none;
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    overflow-wrap: anywhere;
  }

  .contact-link:hover {
    text-decoration: underline;
  }

  .contact-link:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
</style>

