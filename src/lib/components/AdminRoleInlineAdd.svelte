<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { supabase } from '../supabaseClient';

  export let role;
  export let affiliations = [];
  export let existingVolunteers = [];

  const dispatch = createEventDispatcher();

  const EMPTY_FORM = {
    existing_profile_id: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    team_club_affiliation_id: ''
  };

  let form = { ...EMPTY_FORM };
  let suggestions = [];
  let suggestionLoading = false;
  let loading = false;
  let error = '';
  let success = '';
  let suggestionTimer = null;

  $: assignedVolunteerIds = new Set(
    (existingVolunteers || [])
      .map((signup) => signup?.volunteer?.id)
      .filter(Boolean)
  );

  $: roleIsFull = Number(role?.positions_filled || 0) >= Number(role?.positions_total || 0);

  function resetMessages() {
    error = '';
    success = '';
  }

  function resetForm() {
    form = { ...EMPTY_FORM };
    suggestions = [];
    suggestionLoading = false;
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function updateField(field, value) {
    form = { ...form, [field]: value };
    resetMessages();

    if (
      form.existing_profile_id &&
      (field === 'email' || field === 'first_name' || field === 'last_name')
    ) {
      const selected = suggestions.find((person) => person.id === form.existing_profile_id);
      if (
        !selected ||
        (field === 'email' && value.trim().toLowerCase() !== (selected.email || '').toLowerCase()) ||
        (field === 'first_name' && value.trim() !== (selected.first_name || '')) ||
        (field === 'last_name' && value.trim() !== (selected.last_name || ''))
      ) {
        form = { ...form, existing_profile_id: '' };
      }
    }

    queueSuggestions();
  }

  function queueSuggestions() {
    if (suggestionTimer) clearTimeout(suggestionTimer);

    const email = form.email.trim();
    const first = form.first_name.trim();
    const last = form.last_name.trim();

    if (!email && first.length < 2 && last.length < 2) {
      suggestions = [];
      suggestionLoading = false;
      return;
    }

    suggestionLoading = true;
    suggestionTimer = setTimeout(loadSuggestions, 250);
  }

  async function loadSuggestions() {
    suggestionTimer = null;

    try {
      const email = form.email.trim().toLowerCase();
      const first = form.first_name.trim().replace(/[,%]/g, '');
      const last = form.last_name.trim().replace(/[,%]/g, '');

      let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, role, team_club_affiliation_id')
        .limit(6)
        .order('first_name');

      if (email && email.includes('@')) {
        query = query.ilike('email', `%${email}%`);
      } else {
        const filters = [];
        if (first) {
          filters.push(`first_name.ilike.%${first}%`);
          filters.push(`last_name.ilike.%${first}%`);
          filters.push(`email.ilike.%${first}%`);
        }
        if (last) {
          filters.push(`first_name.ilike.%${last}%`);
          filters.push(`last_name.ilike.%${last}%`);
          filters.push(`email.ilike.%${last}%`);
        }
        if (first && last) {
          filters.push(`and(first_name.ilike.%${first}%,last_name.ilike.%${last}%)`);
        }
        if (filters.length) {
          query = query.or(filters.join(','));
        }
      }

      const { data, error: lookupError } = await query;
      if (lookupError) throw lookupError;

      const filtered = (data || []).filter((person) => {
        if (!person?.id || !person?.email) return false;
        return !assignedVolunteerIds.has(person.id);
      });

      suggestions = filtered;
    } catch (lookupError) {
      console.error('Admin role inline add suggestions failed:', lookupError);
      suggestions = [];
    } finally {
      suggestionLoading = false;
    }
  }

  function selectExistingVolunteer(person) {
    form = {
      existing_profile_id: person.id,
      first_name: person.first_name || '',
      last_name: person.last_name || '',
      email: person.email || '',
      phone: person.phone || '',
      team_club_affiliation_id: person.team_club_affiliation_id || ''
    };
    suggestions = [];
    suggestionLoading = false;
    resetMessages();
  }

  async function getActiveSession() {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      throw new Error('Your admin session is not active in this tab. Please refresh and try again.');
    }

    const session = sessionData.session;
    const expiresAt = session.expires_at || 0;
    const nowInSeconds = Math.floor(Date.now() / 1000);

    if (expiresAt > nowInSeconds + 300) {
      return session;
    }

    const refreshResult = await Promise.race([
      supabase.auth.refreshSession(),
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ data: { session: null }, error: new Error('Session refresh timed out') }),
          5000
        )
      )
    ]);

    if (refreshResult?.data?.session) {
      return refreshResult.data.session;
    }

    if (expiresAt > nowInSeconds + 60) {
      return session;
    }

    throw new Error('Your admin session expired. Please refresh and try again.');
  }

  async function addVolunteer() {
    if (loading) return;

    resetMessages();

    if (roleIsFull) {
      error = 'This role is already full.';
      return;
    }

    const email = form.email.trim();
    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const teamClubAffiliationId = form.team_club_affiliation_id.trim();

    if (!email || !validateEmail(email)) {
      error = 'Please enter a valid email address.';
      return;
    }

    if (!teamClubAffiliationId) {
      error = 'Please select a team or club affiliation.';
      return;
    }

    if (!form.existing_profile_id && (!firstName || !lastName)) {
      error = 'First and last name are required for a new volunteer.';
      return;
    }

    loading = true;

    try {
      const activeSession = await getActiveSession();
      const { data, error: invokeError } = await supabase.functions.invoke('admin-add-role-volunteer', {
        body: {
          role_id: role.id,
          existing_profile_id: form.existing_profile_id || null,
          email,
          first_name: firstName || null,
          last_name: lastName || null,
          phone: form.phone.trim() || null,
          team_club_affiliation_id: teamClubAffiliationId,
        },
        headers: {
          Authorization: `Bearer ${activeSession.access_token}`
        }
      });

      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);

      const displayName = data?.volunteer?.display_name || [firstName, lastName].filter(Boolean).join(' ').trim() || email;
      success = data?.createdNewProfile
        ? `Added ${displayName}. Their account was created and they were assigned to this role.`
        : `Added ${displayName} to this role.`;

      resetForm();
      dispatch('added', {
        roleId: role.id,
        volunteerId: data?.volunteerId || data?.volunteer?.id || null,
      });
    } catch (addError) {
      console.error('Admin role inline add failed:', addError);
      error = addError?.message || 'Failed to add volunteer to this role.';
    } finally {
      loading = false;
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addVolunteer();
    }
  }

  onDestroy(() => {
    if (suggestionTimer) clearTimeout(suggestionTimer);
  });
</script>

<div class="admin-role-inline-add">
  <div class="admin-role-inline-add__header">
    <div>
      <h4>Add volunteer directly to this role</h4>
      <p>Type a new volunteer or choose an existing profile below.</p>
    </div>
    {#if roleIsFull}
      <span class="admin-role-inline-add__status">Role is full</span>
    {/if}
  </div>

  <div class="admin-role-inline-add__grid">
    <input
      type="text"
      class="input"
      placeholder="First name"
      value={form.first_name}
      on:input={(event) => updateField('first_name', event.currentTarget.value)}
      on:keydown={handleKeydown}
      disabled={loading || roleIsFull}
      aria-label={`First name for ${role.name}`}
    />
    <input
      type="text"
      class="input"
      placeholder="Last name"
      value={form.last_name}
      on:input={(event) => updateField('last_name', event.currentTarget.value)}
      on:keydown={handleKeydown}
      disabled={loading || roleIsFull}
      aria-label={`Last name for ${role.name}`}
    />
    <input
      type="email"
      class="input"
      placeholder="Email address"
      value={form.email}
      on:input={(event) => updateField('email', event.currentTarget.value)}
      on:keydown={handleKeydown}
      disabled={loading || roleIsFull}
      aria-label={`Email for ${role.name}`}
    />
    <input
      type="tel"
      class="input"
      placeholder="Phone (optional)"
      value={form.phone}
      on:input={(event) => updateField('phone', event.currentTarget.value)}
      on:keydown={handleKeydown}
      disabled={loading || roleIsFull}
      aria-label={`Phone for ${role.name}`}
    />
    <select
      class="input"
      value={form.team_club_affiliation_id}
      on:change={(event) => updateField('team_club_affiliation_id', event.currentTarget.value)}
      disabled={loading || roleIsFull}
      aria-label={`Team/club for ${role.name}`}
    >
      <option value="">Team/Club *</option>
      {#each affiliations as affiliation (affiliation.id)}
        <option value={affiliation.id}>{affiliation.name}</option>
      {/each}
    </select>
    <button
      type="button"
      class="btn btn-primary admin-role-inline-add__button"
      on:click={addVolunteer}
      disabled={loading || roleIsFull}
    >
      {loading ? 'Adding…' : '+ Add'}
    </button>
  </div>

  {#if suggestionLoading}
    <div class="admin-role-inline-add__loading">Searching existing volunteers…</div>
  {:else if suggestions.length > 0}
    <div class="admin-role-inline-add__suggestions">
      <span class="admin-role-inline-add__suggestions-intro">Select an existing volunteer:</span>
      <div class="admin-role-inline-add__suggestions-list">
        {#each suggestions as person (person.id)}
          <button
            type="button"
            class="admin-role-inline-add__suggestion-chip"
            on:click={() => selectExistingVolunteer(person)}
            disabled={loading}
          >
            <span class="name">{person.first_name || 'No'} {person.last_name || 'Name'}</span>
            <span class="email">{person.email}</span>
            {#if person.phone}
              <span class="phone">{person.phone}</span>
            {/if}
            {#if person.role}
              <span class="badge">{person.role === 'volunteer_leader' ? 'Leader' : person.role === 'admin' ? 'Admin' : 'Volunteer'}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if error}
    <div class="inline-alert error">{error}</div>
  {/if}

  {#if success}
    <div class="inline-alert success">{success}</div>
  {/if}
</div>

<style>
  .admin-role-inline-add {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    padding-top: 1rem;
    border-top: 1px solid #e9ecef;
  }

  .admin-role-inline-add__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .admin-role-inline-add__header h4 {
    margin: 0 0 0.2rem;
    font-size: 1rem;
  }

  .admin-role-inline-add__header p {
    margin: 0;
    color: #6c757d;
    font-size: 0.9rem;
  }

  .admin-role-inline-add__status {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: #fff3cd;
    border: 1px solid #ffe69c;
    color: #8a6d1d;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .admin-role-inline-add__grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.75rem;
    align-items: center;
  }

  .admin-role-inline-add__button {
    width: 100%;
    justify-self: stretch;
  }

  .admin-role-inline-add__loading {
    color: #6c757d;
    font-size: 0.9rem;
    font-style: italic;
  }

  .admin-role-inline-add__suggestions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .admin-role-inline-add__suggestions-intro {
    color: #6c757d;
    font-size: 0.85rem;
  }

  .admin-role-inline-add__suggestions-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .admin-role-inline-add__suggestion-chip {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
    min-width: 180px;
    padding: 0.55rem 0.75rem;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    background: white;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  }

  .admin-role-inline-add__suggestion-chip:hover:enabled {
    border-color: #0d6efd;
    box-shadow: 0 4px 12px rgba(13, 110, 253, 0.12);
    transform: translateY(-1px);
  }

  .admin-role-inline-add__suggestion-chip .name {
    font-weight: 600;
    color: #1a1a1a;
  }

  .admin-role-inline-add__suggestion-chip .email {
    color: #0d6efd;
  }

  .admin-role-inline-add__suggestion-chip .phone,
  .admin-role-inline-add__suggestion-chip .badge {
    color: #6c757d;
    font-size: 0.8rem;
  }

  .inline-alert {
    border-radius: 10px;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
    font-weight: 500;
  }

  .inline-alert.error {
    background: #fdecea;
    color: #b02a37;
    border: 1px solid #f5c2c7;
  }

  .inline-alert.success {
    background: #e6f4ea;
    color: #1d7530;
    border: 1px solid #b6e3c1;
  }

  @media (max-width: 1200px) {
    .admin-role-inline-add__grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 768px) {
    .admin-role-inline-add__header {
      flex-direction: column;
      align-items: stretch;
    }

    .admin-role-inline-add__grid {
      grid-template-columns: 1fr;
    }
  }
</style>
