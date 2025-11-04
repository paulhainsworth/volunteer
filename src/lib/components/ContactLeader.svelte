<script>
  import { createEventDispatcher } from 'svelte';

  export let leader = null;
  export let roleName = '';

  const dispatch = createEventDispatcher();

  let showForm = false;
  let message = '';
  let sending = false;

  function toggleForm() {
    showForm = !showForm;
  }

  async function handleSend() {
    if (!message.trim()) {
      alert('Please enter a message');
      return;
    }

    if (!leader || !leader.first_name || !leader.last_name) {
      alert('Leader information is not available. Please try again or contact an administrator.');
      sending = false;
      return;
    }

    sending = true;

    // This would integrate with an email service
    // For now, we'll just show a success message
    setTimeout(() => {
      alert(`Message sent to ${leader.first_name} ${leader.last_name}!`);
      message = '';
      showForm = false;
      sending = false;
      dispatch('sent');
    }, 1000);
  }
</script>

{#if leader}
  <div class="contact-leader">
    <div class="leader-card">
      <div class="leader-header">
        <h4>Your Volunteer Leader</h4>
        {#if !showForm}
          <button class="btn btn-sm btn-primary" on:click={toggleForm}>
            📧 Contact Leader
          </button>
        {/if}
      </div>

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

      {#if showForm}
        <div class="contact-form">
          <textarea
            bind:value={message}
            placeholder="Hi {leader.first_name}, I have a question about {roleName}..."
            rows="5"
            disabled={sending}
          ></textarea>
          
          <div class="form-actions">
            <button class="btn btn-secondary btn-sm" on:click={toggleForm} disabled={sending}>
              Cancel
            </button>
            <button class="btn btn-primary btn-sm" on:click={handleSend} disabled={sending}>
              {sending ? 'Sending...' : 'Send Message'}
            </button>
          </div>
          
          <p class="form-note">
            This will send an email to your volunteer leader
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .contact-leader {
    margin-top: 1.5rem;
  }

  .leader-card {
    background: #fff3cd;
    border: 1px solid #ffeeba;
    border-radius: 8px;
    padding: 1.25rem;
  }

  .leader-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .leader-header h4 {
    margin: 0;
    color: #856404;
    font-size: 1rem;
  }

  .leader-info {
    margin-bottom: 1rem;
  }

  .leader-name {
    font-weight: 600;
    font-size: 1.1rem;
    color: #856404;
    margin-bottom: 0.5rem;
  }

  .contact-options {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .contact-link {
    color: #007bff;
    text-decoration: none;
    font-size: 0.9rem;
  }

  .contact-link:hover {
    text-decoration: underline;
  }

  .contact-form {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #ffeeba;
  }

  textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-family: inherit;
    font-size: 1rem;
    margin-bottom: 1rem;
  }

  textarea:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .form-note {
    margin: 0.5rem 0 0 0;
    font-size: 0.85rem;
    color: #856404;
    font-style: italic;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0056b3;
  }

  .btn-primary:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: white;
    color: #6c757d;
    border: 1px solid #6c757d;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #f8f9fa;
  }
</style>

