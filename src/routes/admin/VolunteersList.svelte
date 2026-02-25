<script>
  import { onMount } from 'svelte';
  import { volunteers } from '../../lib/stores/volunteers';
  import { auth } from '../../lib/stores/auth';
  import { affiliations } from '../../lib/stores/affiliations';
  import { supabase } from '../../lib/supabaseClient';
  import { sendWelcomeEmail } from '../../lib/volunteerSignup';
  import { push } from 'svelte-spa-router';
  import { format } from 'date-fns';
  import { formatTimeRange, isFlexibleTime } from '../../lib/utils/timeDisplay';

  let loading = true;
  let error = '';
  let searchQuery = '';
  let viewMode = 'table'; // 'cards' or 'table'
  let sortColumn = 'last_name';
  let sortDirection = 'asc';
  let showEditModal = false;
  let editingUser = null;
  let editForm = {
    first_name: '',
    last_name: '',
    phone: '',
    role: 'volunteer',
    team_club_affiliation_id: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: ''
  };
  let saving = false;
  let availableRoles = [];
  let userSignups = [];
  let loadingRoles = false;
  let selectedRoleId = '';
  let showAddVolunteerModal = false;
  let addVolunteerForm = {
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    team_club_affiliation_id: '',
    role_id: ''
  };
  let addingVolunteer = false;
  let addVolunteerSuggestions = [];
  let addVolunteerSuggestionLoading = false;
  let addVolunteerSuggestionTimer = null;
  let selectedAffiliationId = '';

  onMount(async () => {
    if (!$auth.isAdmin) {
      push('/volunteer');
      return;
    }

    try {
      await volunteers.fetchVolunteers();
      affiliations.fetchAffiliations().catch(() => {});
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  function sortVolunteers(volunteers) {
    return [...volunteers].sort((a, b) => {
      let aVal, bVal;
      
      switch (sortColumn) {
        case 'first_name':
          aVal = a.first_name || '';
          bVal = b.first_name || '';
          break;
        case 'last_name':
          aVal = a.last_name || '';
          bVal = b.last_name || '';
          break;
        case 'email':
          aVal = a.email;
          bVal = b.email;
          break;
        case 'role':
          aVal = a.role;
          bVal = b.role;
          break;
        case 'signups':
          aVal = a.totalSignups;
          bVal = b.totalSignups;
          break;
        case 'hours':
          aVal = a.totalHours;
          bVal = b.totalHours;
          break;
        default:
          aVal = a.last_name || '';
          bVal = b.last_name || '';
      }
      
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  function handleSort(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
  }

  // Make sorting reactive to sort column, direction, and affiliation filter
  $: filteredVolunteers = (() => {
    let filtered = $volunteers;
    if (selectedAffiliationId) {
      filtered = filtered.filter(v => (v.team_club_affiliation_id || '') === selectedAffiliationId);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(volunteer => {
        const name = `${volunteer.first_name || ''} ${volunteer.last_name || ''}`.toLowerCase();
        const email = volunteer.email.toLowerCase();
        return name.includes(query) || email.includes(query);
      });
    }
    return sortVolunteers(filtered);
  })();

  function exportToCSV() {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Total Signups', 'Total Hours', 'Waiver Signed'];
    const rows = $volunteers.map(v => [
      v.first_name || '',
      v.last_name || '',
      v.email,
      v.phone || '',
      v.totalSignups,
      v.totalHours,
      v.hasSignedWaiver ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volunteers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function openEditModal(user) {
    editingUser = user;
    editForm = {
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      phone: user.phone || '',
      role: user.role,
      team_club_affiliation_id: user.team_club_affiliation_id || '',
      emergency_contact_name: user.emergency_contact_name || '',
      emergency_contact_phone: user.emergency_contact_phone || '',
      emergency_contact_relationship: user.emergency_contact_relationship || ''
    };
    showEditModal = true;
    error = '';
    
    // Load available roles and user's current signups
    await loadRolesAndSignups(user.id);
  }

  async function loadRolesAndSignups(userId) {
    loadingRoles = true;
    
    try {
      // Fetch all upcoming roles; count only confirmed signups
      const { data: rolesData, error: rolesError } = await supabase
        .from('volunteer_roles')
        .select('*')
        .gte('event_date', new Date().toISOString().split('T')[0])
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (rolesError) throw rolesError;

      const roleIds = (rolesData || []).map((r) => r.id);
      let confirmedCountByRole = {};
      if (roleIds.length > 0) {
        const { data: signupRows } = await supabase
          .from('signups')
          .select('role_id')
          .eq('status', 'confirmed')
          .in('role_id', roleIds);
        confirmedCountByRole = (signupRows || []).reduce((acc, row) => {
          acc[row.role_id] = (acc[row.role_id] || 0) + 1;
          return acc;
        }, {});
      }
      const rolesWithCounts = (rolesData || []).map(role => ({
        ...role,
        positions_filled: confirmedCountByRole[role.id] ?? 0
      }));

      // Fetch user's current signups
      const { data: signupsData, error: signupsError } = await supabase
        .from('signups')
        .select(`
          *,
          role:volunteer_roles!role_id(*)
        `)
        .eq('volunteer_id', userId)
        .eq('status', 'confirmed');

      if (signupsError) throw signupsError;

      availableRoles = rolesWithCounts;
      userSignups = signupsData || [];
    } catch (err) {
      console.error('Error loading roles:', err);
      error = 'Failed to load roles: ' + err.message;
    } finally {
      loadingRoles = false;
    }
  }

  function closeEditModal() {
    showEditModal = false;
    editingUser = null;
    error = '';
    availableRoles = [];
    userSignups = [];
    selectedRoleId = '';
  }

  async function assignSelectedRole() {
    if (!editingUser || !selectedRoleId) return;
    
    await signUpUserForRole(selectedRoleId);
    selectedRoleId = ''; // Reset selection after assignment
  }

  async function signUpUserForRole(roleId) {
    if (!editingUser) return;

    try {
      const { data, error: signupError } = await supabase
        .from('signups')
        .insert({
          role_id: roleId,
          volunteer_id: editingUser.id,
          status: 'confirmed',
          phone: editingUser.phone || null
        })
        .select();

      if (signupError) throw signupError;

      // Refresh signups
      await loadRolesAndSignups(editingUser.id);
      
      // Show success message briefly
      const successMsg = error;
      error = '✅ User signed up successfully!';
      setTimeout(() => {
        if (error === '✅ User signed up successfully!') {
          error = successMsg || '';
        }
      }, 3000);
    } catch (err) {
      console.error('Signup error:', err);
      error = 'Failed to sign up user: ' + err.message;
    }
  }

  async function removeUserSignup(signupId) {
    if (!confirm('Remove this signup?')) return;

    try {
      const { error: deleteError } = await supabase
        .from('signups')
        .update({ status: 'cancelled' })
        .eq('id', signupId);

      if (deleteError) throw deleteError;

      // Refresh signups and volunteer list
      await loadRolesAndSignups(editingUser.id);
      await volunteers.fetchVolunteers();
      
      // Show success message briefly
      const successMsg = error;
      error = '✅ Signup removed successfully!';
      setTimeout(() => {
        if (error === '✅ Signup removed successfully!') {
          error = successMsg || '';
        }
      }, 3000);
    } catch (err) {
      console.error('Remove signup error:', err);
      error = 'Failed to remove signup: ' + err.message;
    }
  }

  async function saveUserChanges() {
    if (!editingUser) return;

    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      error = 'First name and last name are required';
      return;
    }

    saving = true;
    error = '';

    try {
      const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          phone: editForm.phone.trim() || null,
          role: editForm.role,
          team_club_affiliation_id: editForm.team_club_affiliation_id?.trim() || null,
          emergency_contact_name: editForm.emergency_contact_name.trim() || null,
          emergency_contact_phone: editForm.emergency_contact_phone.trim() || null,
          emergency_contact_relationship: editForm.emergency_contact_relationship.trim() || null
        })
        .eq('id', editingUser.id)
        .select();

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      if (!updateData || updateData.length === 0) {
        throw new Error('No rows updated - check permissions');
      }

      console.log('User updated successfully:', updateData);

      // Refresh volunteer list
      await volunteers.fetchVolunteers();
      
      closeEditModal();
      alert('User information updated successfully!');
    } catch (err) {
      console.error('Save user error:', err);
      error = 'Failed to update user: ' + err.message;
    } finally {
      saving = false;
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if (showEditModal) {
        closeEditModal();
      }
      if (showAddVolunteerModal) {
        closeAddVolunteerModal();
      }
    }
  }

  async function openAddVolunteerModal() {
    showAddVolunteerModal = true;
    error = '';
    
    // Load available roles; count only confirmed signups
    const { data: rolesData, error: rolesError } = await supabase
      .from('volunteer_roles')
      .select('*')
      .gte('event_date', new Date().toISOString().split('T')[0])
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (!rolesError && rolesData && rolesData.length > 0) {
      const roleIds = rolesData.map((r) => r.id);
      const { data: signupRows } = await supabase
        .from('signups')
        .select('role_id')
        .eq('status', 'confirmed')
        .in('role_id', roleIds);
      const confirmedCountByRole = (signupRows || []).reduce((acc, row) => {
        acc[row.role_id] = (acc[row.role_id] || 0) + 1;
        return acc;
      }, {});
      availableRoles = rolesData.map(role => ({
        ...role,
        positions_filled: confirmedCountByRole[role.id] ?? 0
      }));
    } else {
      availableRoles = rolesError ? [] : (rolesData || []).map(r => ({ ...r, positions_filled: 0 }));
    }
  }

  function closeAddVolunteerModal() {
    showAddVolunteerModal = false;
    addVolunteerForm = {
      email: '',
      first_name: '',
      last_name: '',
      phone: '',
      team_club_affiliation_id: '',
      role_id: ''
    };
    error = '';
    availableRoles = [];
    if (addVolunteerSuggestionTimer) {
      clearTimeout(addVolunteerSuggestionTimer);
      addVolunteerSuggestionTimer = null;
    }
    addVolunteerSuggestions = [];
  }

  function scheduleAddVolunteerSuggestions() {
    if (addVolunteerSuggestionTimer) clearTimeout(addVolunteerSuggestionTimer);
    const email = (addVolunteerForm.email || '').trim();
    const first = (addVolunteerForm.first_name || '').trim();
    const last = (addVolunteerForm.last_name || '').trim();
    if (!email && first.length < 2 && last.length < 2) {
      addVolunteerSuggestions = [];
      addVolunteerSuggestionLoading = false;
      return;
    }
    addVolunteerSuggestionLoading = true;
    addVolunteerSuggestionTimer = setTimeout(() => fetchAddVolunteerSuggestions(), 300);
  }

  async function fetchAddVolunteerSuggestions() {
    addVolunteerSuggestionTimer = null;
    try {
      const email = (addVolunteerForm.email || '').trim();
      const first = (addVolunteerForm.first_name || '').trim().replace(/[,%]/g, '');
      const last = (addVolunteerForm.last_name || '').trim().replace(/[,%]/g, '');

      let profilesQuery = supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, role')
        .in('role', ['volunteer', 'volunteer_leader', 'admin'])
        .limit(5)
        .order('first_name');
      if (email && email.includes('@')) {
        profilesQuery = profilesQuery.ilike('email', `%${email}%`);
      } else if (first || last) {
        const filters = [];
        if (first) {
          filters.push(`first_name.ilike.%${first}%`);
          filters.push(`last_name.ilike.%${first}%`);
        }
        if (last) {
          filters.push(`first_name.ilike.%${last}%`);
          filters.push(`last_name.ilike.%${last}%`);
        }
        if (first && last) filters.push(`and(first_name.ilike.%${first}%,last_name.ilike.%${last}%)`);
        if (filters.length) profilesQuery = profilesQuery.or(filters.join(','));
      }

      let contactsQuery = supabase
        .from('volunteer_contacts')
        .select('id, first_name, last_name, email, phone')
        .is('profile_id', null)
        .limit(5);
      if (email && email.includes('@')) {
        contactsQuery = contactsQuery.ilike('email', `%${email}%`);
      } else if (first || last) {
        const filters = [];
        if (first) {
          filters.push(`first_name.ilike.%${first}%`);
          filters.push(`last_name.ilike.%${last}%`);
        }
        if (last) {
          filters.push(`first_name.ilike.%${last}%`);
          filters.push(`last_name.ilike.%${last}%`);
        }
        if (first && last) filters.push(`and(first_name.ilike.%${first}%,last_name.ilike.%${last}%)`);
        if (filters.length) contactsQuery = contactsQuery.or(filters.join(','));
      } else {
        contactsQuery = contactsQuery.limit(0);
      }

      const [profilesRes, contactsRes] = await Promise.all([
        profilesQuery,
        email || first || last ? contactsQuery : { data: [] }
      ]);
      const profiles = (profilesRes.data || []).filter((p) => p.email).map((p) => ({ ...p, source: 'profile' }));
      const contacts = (contactsRes.data || []).filter((c) => c.email).map((c) => ({ ...c, source: 'contact' }));
      const byEmail = new Map();
      for (const p of profiles) byEmail.set((p.email || '').toLowerCase(), p);
      for (const c of contacts) {
        const key = (c.email || '').toLowerCase();
        if (!byEmail.has(key)) byEmail.set(key, c);
      }
      addVolunteerSuggestions = Array.from(byEmail.values()).slice(0, 8);
    } catch (err) {
      console.error('Add volunteer suggestions error:', err);
      addVolunteerSuggestions = [];
    } finally {
      addVolunteerSuggestionLoading = false;
    }
  }

  function applyAddVolunteerSuggestion(person) {
    addVolunteerForm = {
      ...addVolunteerForm,
      first_name: person.first_name || '',
      last_name: person.last_name || '',
      email: person.email || '',
      phone: person.phone || addVolunteerForm.phone
    };
    addVolunteerSuggestions = [];
  }

  async function createVolunteer() {
    if (!addVolunteerForm.email || !addVolunteerForm.first_name || !addVolunteerForm.last_name) {
      error = 'Email, first name, and last name are required';
      return;
    }
    if (!(addVolunteerForm.team_club_affiliation_id || '').trim()) {
      error = 'Please select a team or club affiliation.';
      return;
    }

    addingVolunteer = true;
    error = '';

    try {
      // Create user via edge function (service role) so the admin stays logged in; client signUp() would switch session to the new user.
      const body = {
        email: addVolunteerForm.email.trim(),
        first_name: addVolunteerForm.first_name.trim(),
        last_name: addVolunteerForm.last_name.trim(),
        phone: (addVolunteerForm.phone || '').trim() || null,
        team_club_affiliation_id: (addVolunteerForm.team_club_affiliation_id || '').trim() || null
      };
      if (addVolunteerForm.role_id) body.role_id = addVolunteerForm.role_id;

      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-volunteer-and-signup', { body });

      if (fnError) throw fnError;
      if (fnData?.error) throw new Error(typeof fnData.error === 'string' ? fnData.error : fnData.error?.message || 'Failed to create volunteer');
      const volunteerId = fnData?.volunteerId;
      if (!volunteerId) throw new Error('User creation failed');

      if (addVolunteerForm.role_id) {
        notifySlackSignup({
          role_id: addVolunteerForm.role_id,
          volunteer_id: volunteerId,
          volunteer_name: [addVolunteerForm.first_name, addVolunteerForm.last_name].filter(Boolean).join(' ').trim() || undefined,
          volunteer_email: addVolunteerForm.email
        }).catch(() => {});
      }

      // Send welcome email with magic link; prompt waiver + emergency contact since admin added them (they didn't use PII modal).
      await sendWelcomeEmail({
        to: addVolunteerForm.email,
        first_name: addVolunteerForm.first_name,
        promptWaiverAndEmergencyContact: true
      });

      // Refresh volunteers list
      await volunteers.fetchVolunteers();

      closeAddVolunteerModal();
      alert(`✅ Volunteer created successfully! A welcome email with sign-in link has been sent to ${addVolunteerForm.email}.`);
    } catch (err) {
      console.error('Create volunteer error:', err);
      error = 'Failed to create volunteer: ' + err.message;
    } finally {
      addingVolunteer = false;
    }
  }

  async function changeRole(userId, newRole) {
    const roleNames = {
      'admin': 'Admin',
      'volunteer_leader': 'Volunteer Leader',
      'volunteer': 'Volunteer'
    };

    const confirmMessages = {
      'admin': 'promote this user to Admin? They will have full administrative access.',
      'volunteer_leader': 'make this user a Volunteer Leader? They can manage assigned roles.',
      'volunteer': 'change this user to a regular Volunteer?'
    };

    if (!confirm(`Are you sure you want to ${confirmMessages[newRole]}`)) {
      return;
    }

    try {
      const { data: updateData, error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId)
        .select();

      if (updateError) {
        console.error('Update error:', updateError);
        throw updateError;
      }

      if (!updateData || updateData.length === 0) {
        throw new Error('No rows updated - check permissions');
      }

      console.log('Role updated successfully:', updateData);

      // Refresh volunteer list
      await volunteers.fetchVolunteers();
      
      alert(`User role changed to ${roleNames[newRole]} successfully! Changes take effect on their next login.`);
    } catch (err) {
      console.error('Change role error:', err);
      error = 'Failed to change role: ' + err.message;
      alert(`Error: ${err.message}`);
    }
  }

  function exportVolunteerRoster() {
    const headers = ['Volunteer Name', 'Email', 'Phone', 'Role', 'Event Date', 'Start Time', 'End Time'];
    const rows = [];

    $volunteers.forEach(volunteer => {
      volunteer.signups.forEach(signup => {
        const r = signup.role;
        const start = isFlexibleTime(r) ? 'Flexible' : (r.start_time || '');
        const end = isFlexibleTime(r) ? 'Flexible' : (r.end_time || '');
        rows.push([
          `${volunteer.first_name} ${volunteer.last_name}`,
          volunteer.email,
          volunteer.phone || signup.phone || '',
          signup.role.name,
          format(new Date(signup.role.event_date), 'yyyy-MM-dd'),
          start,
          end
        ]);
      });
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volunteer-roster-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="volunteers-page">
  <div class="header">
    <div>
      <h1>Users</h1>
      <p>Manage all registered users, their roles, and signups</p>
    </div>
    
    <div class="header-actions">
      <button class="btn btn-secondary" on:click={exportToCSV}>
        Export List
      </button>
      <button class="btn btn-secondary" on:click={exportVolunteerRoster}>
        Export Roster
      </button>
      <button class="btn btn-primary" on:click={openAddVolunteerModal}>
        + Add Volunteer
      </button>
    </div>
  </div>

  {#if error}
    <div class="alert alert-error">{error}</div>
  {/if}

  {#if loading}
    <div class="loading">Loading volunteers...</div>
  {:else if $volunteers.length === 0}
    <div class="empty">
      <h2>No volunteers yet</h2>
      <p>Volunteers will appear here once they sign up</p>
    </div>
  {:else}
    <div class="controls">
      <div class="search-box">
        <input
          type="text"
          placeholder="Search volunteers by name or email..."
          bind:value={searchQuery}
        />
      </div>

      <div class="filter-affiliation">
        <label for="filter-affiliation" class="filter-label">Affiliation</label>
        <select
          id="filter-affiliation"
          bind:value={selectedAffiliationId}
          title="Filter by team or club"
        >
          <option value="">All affiliations</option>
          {#each $affiliations as aff (aff.id)}
            <option value={aff.id}>{aff.name}</option>
          {/each}
        </select>
      </div>
      
      <div class="view-toggle">
        <button
          class="view-btn {viewMode === 'cards' ? 'active' : ''}"
          on:click={() => viewMode = 'cards'}
          title="Card view"
        >
          <span class="icon">▦</span> Cards
        </button>
        <button
          class="view-btn {viewMode === 'table' ? 'active' : ''}"
          on:click={() => viewMode = 'table'}
          title="Table view"
        >
          <span class="icon">☰</span> Table
        </button>
      </div>
    </div>

    {#if viewMode === 'table'}
      <div class="table-view">
        <table>
          <thead>
            <tr>
              <th on:click={() => handleSort('first_name')} class="sortable">
                First Name
                {#if sortColumn === 'first_name'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('last_name')} class="sortable">
                Last Name
                {#if sortColumn === 'last_name'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('email')} class="sortable">
                Email
                {#if sortColumn === 'email'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('role')} class="sortable">
                Role
                {#if sortColumn === 'role'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('signups')} class="sortable">
                Signups
                {#if sortColumn === 'signups'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th on:click={() => handleSort('hours')} class="sortable">
                Hours
                {#if sortColumn === 'hours'}
                  <span class="sort-arrow">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                {/if}
              </th>
              <th>Waiver</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredVolunteers as volunteer (volunteer.id)}
              <tr class="clickable-row" on:click={() => openEditModal(volunteer)}>
                <td>
                  {volunteer.first_name || '-'}
                  {#if volunteer.emergency_contact_name}
                    <span class="emergency-indicator" title="Has emergency contact">🆘</span>
                  {/if}
                </td>
                <td>{volunteer.last_name || '-'}</td>
                <td>
                  <a href="mailto:{volunteer.email}" class="email-link" on:click|stopPropagation>{volunteer.email}</a>
                  {#if volunteer.phone}
                    <div class="phone-display">📱 {volunteer.phone}</div>
                  {/if}
                </td>
                <td>
                  <span class="role-badge {volunteer.role}">
                    {#if volunteer.role === 'admin'}
                      👑 Admin
                    {:else if volunteer.role === 'volunteer_leader'}
                      ⭐ Leader
                    {:else}
                      👤 Volunteer
                    {/if}
                  </span>
                </td>
                <td class="text-center">{volunteer.totalSignups}</td>
                <td class="text-center">{volunteer.totalHours}h</td>
                <td class="text-center">
                  {#if volunteer.hasSignedWaiver}
                    <span class="waiver-badge signed">✓</span>
                  {:else}
                    <span class="waiver-badge unsigned">✗</span>
                  {/if}
                </td>
                <td on:click|stopPropagation>
                  <div class="table-actions">
                    {#if volunteer.role === 'volunteer'}
                      <button 
                        class="btn btn-xs btn-secondary"
                        on:click={() => changeRole(volunteer.id, 'volunteer_leader')}
                        title="Make Leader"
                      >
                        Leader
                      </button>
                      <button 
                        class="btn btn-xs btn-info"
                        on:click={() => changeRole(volunteer.id, 'admin')}
                        title="Make Admin"
                      >
                        Admin
                      </button>
                    {:else if volunteer.role === 'volunteer_leader'}
                      <button 
                        class="btn btn-xs btn-info"
                        on:click={() => changeRole(volunteer.id, 'admin')}
                        title="Promote to Admin"
                      >
                        → Admin
                      </button>
                      <button 
                        class="btn btn-xs btn-secondary"
                        on:click={() => changeRole(volunteer.id, 'volunteer')}
                        title="Demote"
                      >
                        → Volunteer
                      </button>
                    {:else}
                      <button 
                        class="btn btn-xs btn-warning"
                        on:click={() => changeRole(volunteer.id, 'volunteer')}
                        title="Demote"
                      >
                        → Volunteer
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <div class="volunteers-grid">
      {#each filteredVolunteers as volunteer (volunteer.id)}
        <div class="volunteer-card">
          <div class="volunteer-header">
            <div class="volunteer-info">
              <h3>
                {volunteer.first_name || 'No'} {volunteer.last_name || 'Name'}
                {#if volunteer.emergency_contact_name}
                  <span class="emergency-indicator" title="Has emergency contact info">🆘</span>
                {/if}
              </h3>
              <a href="mailto:{volunteer.email}" class="email-link">{volunteer.email}</a>
              {#if volunteer.phone}
                <a href="tel:{volunteer.phone}" class="phone-link">📱 {volunteer.phone}</a>
              {/if}
              {#if volunteer.emergency_contact_name}
                <div class="emergency-contact">
                  <strong>Emergency:</strong> {volunteer.emergency_contact_name}
                  {#if volunteer.emergency_contact_phone}
                    - <a href="tel:{volunteer.emergency_contact_phone}">{volunteer.emergency_contact_phone}</a>
                  {/if}
                  {#if volunteer.emergency_contact_relationship}
                    ({volunteer.emergency_contact_relationship})
                  {/if}
                </div>
              {/if}
            </div>
            
            <div class="volunteer-stats">
              <div class="stat-badge">
                <span class="stat-value">{volunteer.totalSignups}</span>
                <span class="stat-label">signups</span>
              </div>
              <div class="stat-badge">
                <span class="stat-value">{volunteer.totalHours}h</span>
                <span class="stat-label">total</span>
              </div>
            </div>
          </div>

          <div class="volunteer-details">
            <div class="detail">
              <span class="label">Role:</span>
              <span class="value role-badge {volunteer.role}">
                {#if volunteer.role === 'admin'}
                  👑 Admin
                {:else if volunteer.role === 'volunteer_leader'}
                  ⭐ Volunteer Leader
                {:else}
                  👤 Volunteer
                {/if}
              </span>
            </div>
            
            <div class="detail">
              <span class="label">Waiver:</span>
              <span class="value {volunteer.hasSignedWaiver ? 'success' : 'warning'}">
                {volunteer.hasSignedWaiver ? '✓ Signed' : '⚠ Not signed'}
              </span>
            </div>
            
            {#if volunteer.waivers && volunteer.waivers.length > 0}
              <div class="detail">
                <span class="label">Signed on:</span>
                <span class="value">
                  {format(new Date(volunteer.waivers[0].agreed_at), 'MMM d, yyyy')}
                </span>
              </div>
            {/if}
          </div>
          
          <div class="volunteer-actions">
            {#if volunteer.role === 'volunteer'}
              <button 
                class="btn btn-sm btn-secondary"
                on:click={() => changeRole(volunteer.id, 'volunteer_leader')}
              >
                Make Leader
              </button>
              <button 
                class="btn btn-sm btn-info"
                on:click={() => changeRole(volunteer.id, 'admin')}
              >
                Make Admin
              </button>
            {:else if volunteer.role === 'volunteer_leader'}
              <button 
                class="btn btn-sm btn-info"
                on:click={() => changeRole(volunteer.id, 'admin')}
              >
                Promote to Admin
              </button>
              <button 
                class="btn btn-sm btn-secondary"
                on:click={() => changeRole(volunteer.id, 'volunteer')}
              >
                Demote to Volunteer
              </button>
            {:else}
              <button 
                class="btn btn-sm btn-warning"
                on:click={() => changeRole(volunteer.id, 'volunteer')}
              >
                Demote to Volunteer
              </button>
            {/if}
          </div>

          {#if volunteer.signups && volunteer.signups.length > 0}
            <div class="signups-section">
              <h4>Signups ({volunteer.signups.length})</h4>
              <div class="signups-list">
                {#each volunteer.signups as signup}
                  <div class="signup-item">
                    <span class="signup-name">{signup.role.name}</span>
                    <span class="signup-date">
                      {format(new Date(signup.role.event_date), 'MMM d')}
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {/if}

    {#if filteredVolunteers.length === 0}
      <div class="empty">
        {#if selectedAffiliationId}
          <p>No volunteers with this affiliation.</p>
        {:else if searchQuery}
          <p>No volunteers found matching "{searchQuery}"</p>
        {:else}
          <p>No volunteers found.</p>
        {/if}
      </div>
    {/if}
  {/if}
</div>

{#if showEditModal && editingUser}
  <div class="modal-overlay" on:click={closeEditModal}>
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeEditModal} aria-label="Close">
        ✕
      </button>
      
      <div class="modal-header">
        <h2>Edit User Information</h2>
        <p class="modal-subtitle">{editingUser.email}</p>
      </div>

      <div class="modal-body">
        {#if error}
          <div class="alert alert-error">{error}</div>
        {/if}

        <div class="form-row">
          <div class="form-group">
            <label for="edit-first-name">First Name *</label>
            <input
              type="text"
              id="edit-first-name"
              bind:value={editForm.first_name}
              placeholder="First name"
              disabled={saving}
            />
          </div>

          <div class="form-group">
            <label for="edit-last-name">Last Name *</label>
            <input
              type="text"
              id="edit-last-name"
              bind:value={editForm.last_name}
              placeholder="Last name"
              disabled={saving}
            />
          </div>
        </div>

        <div class="form-group">
          <label for="edit-phone">Phone Number</label>
          <input
            type="tel"
            id="edit-phone"
            bind:value={editForm.phone}
            placeholder="(555) 123-4567"
            disabled={saving}
          />
        </div>

        <div class="form-group">
          <label for="edit-role">Role *</label>
          <select
            id="edit-role"
            bind:value={editForm.role}
            disabled={saving}
          >
            <option value="volunteer">👤 Volunteer</option>
            <option value="volunteer_leader">⭐ Volunteer Leader</option>
            <option value="admin">👑 Admin</option>
          </select>
        </div>

        <div class="form-group">
          <label for="edit-affiliation">Team / Club Affiliation</label>
          <select
            id="edit-affiliation"
            bind:value={editForm.team_club_affiliation_id}
            disabled={saving}
          >
            <option value="">— None selected —</option>
            {#each $affiliations as aff (aff.id)}
              <option value={aff.id}>{aff.name}</option>
            {/each}
          </select>
        </div>

        <div class="section-header">
          <h3>Emergency Contact (Optional)</h3>
        </div>

        <div class="form-group">
          <label for="edit-emergency-name">Emergency Contact Name</label>
          <input
            type="text"
            id="edit-emergency-name"
            bind:value={editForm.emergency_contact_name}
            placeholder="Contact name"
            disabled={saving}
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="edit-emergency-phone">Emergency Contact Phone</label>
            <input
              type="tel"
              id="edit-emergency-phone"
              bind:value={editForm.emergency_contact_phone}
              placeholder="(555) 123-4567"
              disabled={saving}
            />
          </div>

          <div class="form-group">
            <label for="edit-emergency-relationship">Relationship</label>
            <input
              type="text"
              id="edit-emergency-relationship"
              bind:value={editForm.emergency_contact_relationship}
              placeholder="e.g., Spouse, Parent"
              disabled={saving}
            />
          </div>
        </div>

        <div class="section-header">
          <h3>Volunteer Signups</h3>
        </div>

        {#if loadingRoles}
          <div class="loading-signups">Loading roles...</div>
        {:else}
          <!-- Current Signups -->
          {#if userSignups.length > 0}
            <div class="signups-section">
              <h4>Current Signups ({userSignups.length})</h4>
              <div class="signups-list-modal">
                {#each userSignups as signup (signup.id)}
                  <div class="signup-item-modal">
                    <div class="signup-info">
                      <strong>{signup.role.name}</strong>
                      <span class="signup-meta">
                        {format(new Date(signup.role.event_date), 'MMM d, yyyy')} • 
                        {formatTimeRange(signup.role)}
                      </span>
                    </div>
                    <button 
                      class="btn btn-xs btn-danger"
                      on:click={() => removeUserSignup(signup.id)}
                      title="Remove signup"
                    >
                      ✕ Remove
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <p class="no-signups">No current signups</p>
          {/if}

          <!-- Assign to Role -->
          <div class="assign-section">
            <h4>Assign to New Role</h4>
            {#if availableRoles.filter(r => !userSignups.some(s => s.role_id === r.id)).length > 0}
              <div class="role-selector">
                <div class="form-group" style="margin-bottom: 0;">
                  <label for="role-select">Select a role to assign</label>
                  <select
                    id="role-select"
                    bind:value={selectedRoleId}
                    disabled={saving}
                  >
                    <option value="">-- Select a role --</option>
                    {#each availableRoles.filter(r => !userSignups.some(s => s.role_id === r.id)) as role (role.id)}
                      {@const isFull = (role.positions_filled || 0) >= role.positions_total}
                      <option value={role.id} disabled={isFull}>
                        {role.name} ({role.positions_filled || 0}/{role.positions_total} filled) - {format(new Date(role.event_date), 'MMM d')}
                      </option>
                    {/each}
                  </select>
                </div>
                <button 
                  class="btn btn-primary btn-add-role"
                  on:click={assignSelectedRole}
                  disabled={!selectedRoleId || saving}
                >
                  + Add to Role
                </button>
              </div>
            {:else}
              <p class="no-roles">No available roles to assign (user is signed up for all upcoming roles or no roles exist)</p>
            {/if}
          </div>
        {/if}
      </div>

      <div class="modal-actions">
        <button
          type="button"
          class="btn btn-secondary"
          on:click={closeEditModal}
          disabled={saving}
        >
          Cancel
        </button>
        
        <button
          type="button"
          class="btn btn-primary"
          on:click={saveUserChanges}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if showAddVolunteerModal}
  <div class="modal-overlay" on:click={closeAddVolunteerModal}>
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeAddVolunteerModal} aria-label="Close">
        ✕
      </button>
      
      <div class="modal-header">
        <h2>Add New Volunteer</h2>
        <p class="modal-subtitle">Create a new volunteer user and optionally assign them to a role</p>
      </div>

      <div class="modal-body">
        {#if error}
          <div class="alert alert-error">{error}</div>
        {/if}

        <div class="form-row">
          <div class="form-group">
            <label for="add-first-name">First Name *</label>
            <input
              type="text"
              id="add-first-name"
              bind:value={addVolunteerForm.first_name}
              on:input={scheduleAddVolunteerSuggestions}
              placeholder="First name"
              disabled={addingVolunteer}
            />
          </div>

          <div class="form-group">
            <label for="add-last-name">Last Name *</label>
            <input
              type="text"
              id="add-last-name"
              bind:value={addVolunteerForm.last_name}
              on:input={scheduleAddVolunteerSuggestions}
              placeholder="Last name"
              disabled={addingVolunteer}
            />
          </div>
        </div>

        <div class="form-group">
          <label for="add-email">Email Address *</label>
          <input
            type="email"
            id="add-email"
            bind:value={addVolunteerForm.email}
            on:input={scheduleAddVolunteerSuggestions}
            placeholder="email@example.com"
            disabled={addingVolunteer}
          />
          <small>An invitation email will be sent to this address</small>
        </div>

        {#if addVolunteerSuggestionLoading}
          <div class="add-volunteer-suggestions add-volunteer-suggestions--loading">Searching…</div>
        {:else if addVolunteerSuggestions.length}
          <div class="add-volunteer-suggestions">
            <span class="add-volunteer-suggestions-intro">Select to fill form:</span>
            <div class="add-volunteer-suggestions-list">
              {#each addVolunteerSuggestions as person (person.id)}
                <button type="button" class="add-volunteer-suggestion-chip" on:click={() => applyAddVolunteerSuggestion(person)}>
                  <span class="name">{person.first_name || ''} {person.last_name || ''}</span>
                  <span class="email">{person.email}</span>
                  {#if person.source === 'contact'}
                    <span class="badge">Past volunteer</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        <div class="form-group">
          <label for="add-phone">Phone Number (Optional)</label>
          <input
            type="tel"
            id="add-phone"
            bind:value={addVolunteerForm.phone}
            placeholder="(555) 123-4567"
            disabled={addingVolunteer}
          />
        </div>

        <div class="form-group">
          <label for="add-affiliation">Team / Club Affiliation *</label>
          <select
            id="add-affiliation"
            bind:value={addVolunteerForm.team_club_affiliation_id}
            disabled={addingVolunteer}
            required
          >
            <option value="">-- Select team or club --</option>
            {#each $affiliations as aff (aff.id)}
              <option value={aff.id}>{aff.name}</option>
            {/each}
          </select>
        </div>

        <div class="section-header">
          <h3>Assign to Role (Optional)</h3>
        </div>

        <div class="form-group">
          <label for="add-role-select">Select a role</label>
          <select
            id="add-role-select"
            bind:value={addVolunteerForm.role_id}
            disabled={addingVolunteer}
          >
            <option value="">-- No role (assign later) --</option>
            {#each availableRoles as role (role.id)}
              {@const isFull = (role.positions_filled || 0) >= role.positions_total}
              <option value={role.id} disabled={isFull}>
                {role.name} ({role.positions_filled || 0}/{role.positions_total} filled) - {format(new Date(role.event_date), 'MMM d')}
              </option>
            {/each}
          </select>
          <small>You can also assign them to a role later from their profile</small>
        </div>
      </div>

      <div class="modal-actions">
        <button
          type="button"
          class="btn btn-secondary"
          on:click={closeAddVolunteerModal}
          disabled={addingVolunteer}
        >
          Cancel
        </button>
        
        <button
          type="button"
          class="btn btn-primary"
          on:click={createVolunteer}
          disabled={addingVolunteer}
        >
          {addingVolunteer ? 'Creating...' : 'Create Volunteer'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .volunteers-page {
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .header p {
    color: #6c757d;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 1rem;
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    background: #f8d7da;
    color: #721c24;
    border: 1px solid #f5c6cb;
  }

  .loading,
  .empty {
    text-align: center;
    padding: 3rem;
    color: #6c757d;
  }

  .empty h2 {
    color: #1a1a1a;
    margin-bottom: 0.5rem;
  }

  .controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
    flex-wrap: wrap;
  }

  .search-box {
    flex: 1;
    min-width: 300px;
  }

  .search-box input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
  }

  .search-box input:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  .filter-affiliation {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .filter-affiliation .filter-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #495057;
    white-space: nowrap;
  }

  .filter-affiliation select {
    min-width: 200px;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    background: white;
    height: 2.75rem;
    box-sizing: border-box;
  }

  .filter-affiliation select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  .view-toggle {
    display: flex;
    gap: 0.5rem;
    background: white;
    border-radius: 6px;
    padding: 0.25rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .view-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    color: #6c757d;
    transition: all 0.2s;
  }

  .view-btn:hover {
    background: #f8f9fa;
    color: #1a1a1a;
  }

  .view-btn.active {
    background: #007bff;
    color: white;
  }

  .view-btn .icon {
    font-size: 1.1rem;
  }

  .table-view {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .table-view table {
    width: 100%;
    border-collapse: collapse;
  }

  .table-view th {
    background: #f8f9fa;
    padding: 1rem 0.75rem;
    text-align: left;
    font-weight: 600;
    color: #495057;
    border-bottom: 2px solid #dee2e6;
    white-space: nowrap;
  }

  .table-view th.sortable {
    cursor: pointer;
    user-select: none;
    transition: background 0.2s;
  }

  .table-view th.sortable:hover {
    background: #e9ecef;
  }

  .sort-arrow {
    margin-left: 0.5rem;
    color: #007bff;
  }

  .table-view td {
    padding: 1rem 0.75rem;
    border-bottom: 1px solid #dee2e6;
  }

  .table-view tr.clickable-row {
    cursor: pointer;
    transition: background 0.2s;
  }

  .table-view tr.clickable-row:hover {
    background: #e9ecef;
  }

  .text-center {
    text-align: center;
  }

  .table-actions {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .btn-xs {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
  }

  .waiver-badge {
    display: inline-block;
    width: 24px;
    height: 24px;
    line-height: 24px;
    text-align: center;
    border-radius: 50%;
    font-weight: bold;
  }

  .waiver-badge.signed {
    background: #d4edda;
    color: #155724;
  }

  .waiver-badge.unsigned {
    background: #f8d7da;
    color: #721c24;
  }

  .volunteers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.5rem;
  }

  .volunteer-card {
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 12px;
    padding: 1.5rem;
    transition: box-shadow 0.2s;
  }

  .volunteer-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .volunteer-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .volunteer-info h3 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .email-link,
  .phone-link {
    display: block;
    color: #007bff;
    text-decoration: none;
    font-size: 0.9rem;
    margin-top: 0.25rem;
  }

  .email-link:hover,
  .phone-link:hover {
    text-decoration: underline;
  }

  .emergency-indicator {
    margin-left: 0.5rem;
    font-size: 0.9rem;
    cursor: help;
  }

  .emergency-contact {
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: #fff3cd;
    border-left: 3px solid #ffc107;
    border-radius: 4px;
    font-size: 0.85rem;
    color: #856404;
  }

  .emergency-contact a {
    color: #007bff;
    text-decoration: none;
  }

  .emergency-contact a:hover {
    text-decoration: underline;
  }

  .phone-display {
    font-size: 0.85rem;
    color: #6c757d;
    margin-top: 0.25rem;
  }

  .volunteer-stats {
    display: flex;
    gap: 0.75rem;
  }

  .stat-badge {
    text-align: center;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .stat-value {
    display: block;
    font-size: 1.25rem;
    font-weight: bold;
    color: #007bff;
  }

  .stat-label {
    display: block;
    font-size: 0.75rem;
    color: #6c757d;
  }

  .volunteer-details {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 0;
    border-top: 1px solid #dee2e6;
    border-bottom: 1px solid #dee2e6;
    margin-bottom: 1rem;
  }

  .detail {
    display: flex;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .label {
    font-weight: 600;
    color: #495057;
  }

  .value {
    color: #6c757d;
  }

  .value.success {
    color: #28a745;
  }

  .value.warning {
    color: #ffc107;
  }

  .role-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .role-badge.admin {
    background: #e7f3ff;
    color: #004085;
  }

  .role-badge.volunteer_leader {
    background: #fff3cd;
    color: #856404;
  }

  .role-badge.volunteer {
    background: #f8f9fa;
    color: #495057;
  }

  .signups-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: #495057;
  }

  .signups-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .signup-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background: #f8f9fa;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .signup-name {
    font-weight: 500;
  }

  .signup-date {
    color: #6c757d;
  }

  .volunteer-actions {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #dee2e6;
    display: flex;
    gap: 0.5rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-secondary {
    background: white;
    color: #007bff;
    border: 1px solid #007bff;
  }

  .btn-secondary:hover {
    background: #f8f9fa;
  }

  .btn-warning {
    background: white;
    color: #ffc107;
    border: 1px solid #ffc107;
  }

  .btn-warning:hover {
    background: #ffc107;
    color: white;
  }

  .btn-info {
    background: white;
    color: #17a2b8;
    border: 1px solid #17a2b8;
  }

  .btn-info:hover {
    background: #17a2b8;
    color: white;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: white;
    border-radius: 16px;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: #f8f9fa;
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6c757d;
    transition: background 0.2s, color 0.2s;
    z-index: 1;
  }

  .modal-close:hover {
    background: #e2e3e5;
    color: #1a1a1a;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    border-bottom: 1px solid #dee2e6;
    padding-right: 4rem;
  }

  .modal-header h2 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
    font-size: 1.5rem;
  }

  .modal-subtitle {
    margin: 0;
    color: #6c757d;
    font-size: 0.9rem;
  }

  .modal-body {
    padding: 2rem;
  }

  .section-header {
    margin: 1.5rem 0 1rem 0;
    padding-top: 1.5rem;
    border-top: 1px solid #dee2e6;
  }

  .section-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #495057;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #1a1a1a;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
  }

  .form-group input:disabled,
  .form-group select:disabled {
    background: #f8f9fa;
    cursor: not-allowed;
  }

  .form-group small {
    display: block;
    margin-top: 0.25rem;
    color: #6c757d;
    font-size: 0.875rem;
  }

  .add-volunteer-suggestions {
    margin-bottom: 1rem;
  }
  .add-volunteer-suggestions--loading {
    color: #6c757d;
    font-size: 0.9rem;
  }
  .add-volunteer-suggestions-intro {
    display: block;
    font-size: 0.85rem;
    color: #6c757d;
    margin-bottom: 0.5rem;
  }
  .add-volunteer-suggestions-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .add-volunteer-suggestion-chip {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.5rem 0.75rem;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    background: #f8f9fa;
    cursor: pointer;
    font-size: 0.9rem;
    text-align: left;
  }
  .add-volunteer-suggestion-chip:hover {
    border-color: #0d6efd;
    background: #e7f1ff;
  }
  .add-volunteer-suggestion-chip .name {
    font-weight: 600;
  }
  .add-volunteer-suggestion-chip .email {
    color: #0d6efd;
    font-size: 0.85rem;
  }
  .add-volunteer-suggestion-chip .badge {
    font-size: 0.7rem;
    color: #6c757d;
    margin-top: 2px;
  }

  .modal-actions {
    padding: 1.5rem 2rem 2rem 2rem;
    border-top: 1px solid #dee2e6;
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .btn-primary {
    background: #007bff;
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-weight: 600;
    border: none;
    cursor: pointer;
  }

  .btn-primary:hover:not(:disabled) {
    background: #0056b3;
  }

  .btn-primary:disabled {
    background: #6c757d;
    cursor: not-allowed;
    opacity: 0.6;
  }

  @media (max-width: 768px) {
    .controls {
      flex-direction: column;
      align-items: stretch;
    }

    .search-box {
      width: 100%;
    }

    .view-toggle {
      width: 100%;
    }

    .view-btn {
      flex: 1;
      justify-content: center;
    }

    .volunteers-grid {
      grid-template-columns: 1fr;
    }

    .table-view {
      overflow-x: auto;
    }

    .table-view table {
      min-width: 800px;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .modal-content {
      max-height: 95vh;
      margin: 0.5rem;
    }

    .modal-actions {
      flex-direction: column-reverse;
    }

    .modal-actions .btn {
      width: 100%;
    }
  }

  .loading-signups,
  .no-signups,
  .no-roles {
    padding: 1rem;
    text-align: center;
    color: #6c757d;
    font-size: 0.9rem;
  }

  .signups-section h4,
  .assign-section h4 {
    margin: 0 0 1rem 0;
    font-size: 0.95rem;
    color: #495057;
    font-weight: 600;
  }

  .signups-list-modal {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .signup-item-modal {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: #f8f9fa;
    border-radius: 8px;
    gap: 1rem;
  }

  .signup-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .signup-info strong {
    color: #1a1a1a;
    font-size: 0.95rem;
  }

  .signup-meta {
    font-size: 0.85rem;
    color: #6c757d;
  }

  .assign-section {
    margin-top: 1rem;
  }

  .role-selector {
    display: flex;
    gap: 1rem;
    align-items: flex-end;
  }

  .role-selector .form-group {
    flex: 1;
  }

  .btn-add-role {
    white-space: nowrap;
    padding: 0.75rem 1.5rem;
    height: fit-content;
  }

  .role-selector select {
    font-size: 0.95rem;
  }

  .role-selector select option:disabled {
    color: #dc3545;
    font-style: italic;
  }

  @media (max-width: 768px) {
    .role-selector {
      flex-direction: column;
      align-items: stretch;
    }

    .btn-add-role {
      width: 100%;
    }
  }
</style>

