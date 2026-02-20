<script>
  import { onMount, onDestroy } from 'svelte';
  import { auth } from '../../lib/stores/auth';
  import { affiliations } from '../../lib/stores/affiliations';
  import { supabase } from '../../lib/supabaseClient';
  import { push } from 'svelte-spa-router';
  import { formatTimeRange, isFlexibleTime, formatEventDateInPacific, parseEventDate } from '../../lib/utils/timeDisplay';

  let loading = true;
  let error = '';
  let myRoles = [];
  let sortedRoles = [];
let volunteerForms = {};
let addStates = {};
let volunteerSuggestions = {};
let suggestionLoading = {};
const suggestionTimers = {};
let editingStates = {};
let editForms = {};
let shareMessages = {};
const shareTimers = {};
  let showEmailForm = false;
  let emailSubject = '';
  let emailBody = '';
  let sendingEmail = false;
  let emailSuccess = '';

  function waitForAuthReady() {
    return new Promise(resolve => {
      let unsubscribe = () => {};
      unsubscribe = auth.subscribe(value => {
        if (!value.loading) {
          unsubscribe();
          resolve(value);
        }
      });
    });
  }

  let popstateUnsubscribe = null;
  let refreshing = false;
  let openActionMenu = { roleId: null, signupId: null };

  onMount(async () => {
    const authState = await waitForAuthReady();

    const isLeader = authState.profile?.role === 'volunteer_leader';
    if (!authState.user || !isLeader) {
      if (authState.profile?.role === 'admin') {
        push('/admin/roles');
      } else {
        push('/volunteer');
      }
      return;
    }

    if (!authState.profile?.emergency_contact_name) {
      push('/onboarding');
      return;
    }

    affiliations.fetchAffiliations().catch(() => {});
    await loadRolesWithRetry();

    const handleNavigation = () => {
      loadRolesWithRetry();
    };

    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);

    const handleGlobalClick = () => {
      closeActionMenu();
    };

    window.addEventListener('click', handleGlobalClick);

    popstateUnsubscribe = () => {
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('click', handleGlobalClick);
    };
  });

  async function loadRolesWithRetry(retries = 1) {
    if (myRoles.length === 0) {
      loading = true;
    } else {
      refreshing = true;
    }
    error = '';

    try {
      await fetchMyRoles();
    } catch (err) {
      console.error('Failed to load leader dashboard roles:', err);
      error = err.message || 'Unable to load your assignments.';

      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return loadRolesWithRetry(retries - 1);
      }
    } finally {
      loading = false;
      refreshing = false;
    }
  }

  async function fetchMyRoles() {
    const selectFields = `
        *,
        domain:volunteer_leader_domains!domain_id(
          id,
          name,
          description,
          leader_id,
          leader:profiles!leader_id(first_name, last_name, email, phone)
        ),
        signups:signups!role_id(
          id,
          volunteer:profiles!volunteer_id(
            id,
            first_name,
            last_name,
            email,
            phone
          ),
          phone,
          status,
          signed_up_at
        )
      `;

    const { data: leaderDomains, error: domainsError } = await supabase
      .from('volunteer_leader_domains')
      .select('id, name, description, leader_id')
      .eq('leader_id', $auth.user.id);

    if (domainsError) throw domainsError;

    const domainIds = (leaderDomains || []).map(domain => domain.id);

    const { data: directRoles, error: directError } = await supabase
      .from('volunteer_roles')
      .select(selectFields)
      .eq('leader_id', $auth.user.id)
      .order('event_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (directError) throw directError;

    let domainRoles = [];

    if (domainIds.length > 0) {
      const { data: domainRoleData, error: domainRolesError } = await supabase
        .from('volunteer_roles')
        .select(selectFields)
        .in('domain_id', domainIds)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (domainRolesError) throw domainRolesError;
      domainRoles = domainRoleData || [];
    }

    const combinedRoles = [...(directRoles || [])];
    domainRoles.forEach(role => {
      if (!combinedRoles.find(existing => existing.id === role.id)) {
        combinedRoles.push(role);
      }
    });

    myRoles = combinedRoles.map(role => {
      const confirmedSignups = role.signups?.filter(s => s.status === 'confirmed') || [];
      return {
        ...role,
        confirmedSignups,
        positions_filled: confirmedSignups.length || 0
      };
    });

    sortedRoles = [...myRoles].sort(compareRoles);
    initializeRoleForms(myRoles);
  }

  function formatShift(role) {
    const datePart = role.event_date ? formatEventDateInPacific(role.event_date, 'short') : 'TBD';
    const timePart = formatTimeRange(role);
    return [datePart, timePart].filter(Boolean).join(' • ') || '—';
  }

  function formatVolunteerName(signup) {
    const first = signup.volunteer?.first_name?.trim();
    const last = signup.volunteer?.last_name?.trim();
    const email = signup.volunteer?.email;
    return [first, last].filter(Boolean).join(' ') || email || 'Volunteer';
  }

  function compareRoles(a, b) {
    const dateA = parseEventDate(a.event_date);
    const dateB = parseEventDate(b.event_date);
    if (dateA && dateB) {
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
    } else if (dateA) {
      return -1;
    } else if (dateB) {
      return 1;
    }

    if (isFlexibleTime(a) && !isFlexibleTime(b)) return 1;
    if (!isFlexibleTime(a) && isFlexibleTime(b)) return -1;
    const timeA = a.start_time || '';
    const timeB = b.start_time || '';
    if (timeA !== timeB) {
      return timeA.localeCompare(timeB);
    }

    return a.name.localeCompare(b.name);
  }

  function initializeRoleForms(roles) {
    const forms = {};
    const states = {};
    const suggestions = {};
    const loadingMap = {};
    const editMap = {};
    const editFormMap = {};

    roles.forEach(role => {
      forms[role.id] = volunteerForms[role.id] || {
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        team_club_affiliation_id: ''
      };

      states[role.id] = addStates[role.id] || {
        loading: false,
        error: '',
        success: ''
      };

      suggestions[role.id] = volunteerSuggestions[role.id] || [];
      loadingMap[role.id] = suggestionLoading[role.id] || false;
      editMap[role.id] = editingStates[role.id] || {};
      editFormMap[role.id] = editForms[role.id] || {};
    });

    volunteerForms = forms;
    addStates = states;
    volunteerSuggestions = suggestions;
    suggestionLoading = loadingMap;
    editingStates = editMap;
    editForms = editFormMap;
  }

  function updateVolunteerForm(roleId, field, value) {
    const current = volunteerForms[roleId] || {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      team_club_affiliation_id: ''
    };

    volunteerForms = {
      ...volunteerForms,
      [roleId]: {
        ...current,
        [field]: value
      }
    };

    if (addStates[roleId]?.error) {
      addStates = {
        ...addStates,
        [roleId]: {
          ...addStates[roleId],
          error: ''
        }
      };
    }

    scheduleSuggestionFetch(roleId);
  }

  function scheduleSuggestionFetch(roleId) {
    const form = volunteerForms[roleId];
    if (!form) return;

    const emailQuery = (form.email || '').trim();
    const nameQuery = `${form.first_name || ''} ${form.last_name || ''}`.trim();

    if (!emailQuery && nameQuery.length < 2) {
      volunteerSuggestions = { ...volunteerSuggestions, [roleId]: [] };
      suggestionLoading = { ...suggestionLoading, [roleId]: false };
      if (suggestionTimers[roleId]) {
        clearTimeout(suggestionTimers[roleId]);
        delete suggestionTimers[roleId];
      }
      return;
    }

    suggestionLoading = { ...suggestionLoading, [roleId]: true };

    if (suggestionTimers[roleId]) {
      clearTimeout(suggestionTimers[roleId]);
    }

    suggestionTimers[roleId] = setTimeout(() => {
      fetchVolunteerSuggestions(roleId, form);
    }, 300);
  }

  function getInviteLink(role) {
    if (typeof window === 'undefined' || !role?.id) return '';
    return `${window.location.origin}#/signup/${role.id}`;
  }

  function setShareMessage(roleId, message) {
    shareMessages = {
      ...shareMessages,
      [roleId]: message
    };

    if (shareTimers[roleId]) {
      clearTimeout(shareTimers[roleId]);
    }

    shareTimers[roleId] = setTimeout(() => {
      shareMessages = {
        ...shareMessages,
        [roleId]: ''
      };
      delete shareTimers[roleId];
    }, 4000);
  }

  async function shareRoleInvite(role) {
    if (!role?.id) return;

    const url = getInviteLink(role);
    if (!url) return;

    const title = `${role.name} Volunteer Opportunity`;
    const text = `Join the ${role.name} team!`;

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text, url });
        setShareMessage(role.id, 'Invite ready to send!');
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareMessage(role.id, 'Invite link copied to clipboard.');
        return;
      }

      if (typeof window !== 'undefined') {
        window.prompt('Copy this invite link:', url);
      }
    } catch (err) {
      console.error('Share invite error:', err);
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(url);
          setShareMessage(role.id, 'Invite link copied to clipboard.');
        }
      } catch (copyError) {
        console.error('Clipboard copy failed:', copyError);
        setShareMessage(role.id, 'Unable to copy link. Please copy it manually.');
      }
    }
  }

  onDestroy(() => {
    Object.values(suggestionTimers).forEach(timer => clearTimeout(timer));
    Object.values(shareTimers).forEach(timer => clearTimeout(timer));
    if (popstateUnsubscribe) {
      popstateUnsubscribe();
    }
  });

  function toggleActionMenu(event, roleId, signupId) {
    event?.stopPropagation();

    if (openActionMenu.roleId === roleId && openActionMenu.signupId === signupId) {
      openActionMenu = { roleId: null, signupId: null };
      return;
    }

    openActionMenu = { roleId, signupId };
  }

  function closeActionMenu() {
    if (openActionMenu.roleId !== null || openActionMenu.signupId !== null) {
      openActionMenu = { roleId: null, signupId: null };
    }
  }

  async function fetchVolunteerSuggestions(roleId, form) {
    try {
      const emailQuery = (form.email || '').trim();
      const firstRaw = (form.first_name || '').trim();
      const lastRaw = (form.last_name || '').trim();
      const sanitize = (value) => value.replace(/[,%]/g, '').trim();
      const first = sanitize(firstRaw);
      const last = sanitize(lastRaw);

      let profilesQuery = supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, role')
        .neq('id', $auth.user.id)
        .limit(5)
        .order('first_name');

      if (emailQuery && emailQuery.includes('@')) {
        profilesQuery = profilesQuery.ilike('email', `%${emailQuery}%`);
      } else {
        const filters = [];
        if (first) {
          filters.push(`first_name.ilike.%${first}%`);
          filters.push(`last_name.ilike.%${first}%`);
        }
        if (last) {
          filters.push(`first_name.ilike.%${last}%`);
          filters.push(`last_name.ilike.%${last}%`);
        }
        if (first && last) {
          filters.push(`and(first_name.ilike.%${first}%,last_name.ilike.%${last}%)`);
        }
        if (filters.length) profilesQuery = profilesQuery.or(filters.join(','));
      }
      profilesQuery = profilesQuery.in('role', ['volunteer', 'volunteer_leader', 'admin']);

      let contactsQuery = supabase
        .from('volunteer_contacts')
        .select('id, first_name, last_name, email, phone')
        .is('profile_id', null)
        .limit(5);

      if (emailQuery && emailQuery.includes('@')) {
        contactsQuery = contactsQuery.ilike('email', `%${emailQuery}%`);
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
        if (filters.length) contactsQuery = contactsQuery.or(filters.join(','));
      } else {
        contactsQuery = contactsQuery.limit(0);
      }

      const [profilesRes, contactsRes] = await Promise.all([
        profilesQuery,
        emailQuery || first || last ? contactsQuery : { data: [] }
      ]);

      const profiles = (profilesRes.data || []).filter((p) => p.email).map((p) => ({ ...p, source: 'profile' }));
      const contacts = (contactsRes.data || []).filter((c) => c.email).map((c) => ({ ...c, source: 'contact' }));

      const byEmail = new Map();
      for (const p of profiles) byEmail.set((p.email || '').toLowerCase(), p);
      for (const c of contacts) {
        const key = (c.email || '').toLowerCase();
        if (!byEmail.has(key)) byEmail.set(key, c);
      }
      const merged = Array.from(byEmail.values()).slice(0, 8);

      volunteerSuggestions = {
        ...volunteerSuggestions,
        [roleId]: merged
      };
    } catch (err) {
      console.error('Suggestion lookup error:', err);
      volunteerSuggestions = { ...volunteerSuggestions, [roleId]: [] };
    } finally {
      suggestionLoading = { ...suggestionLoading, [roleId]: false };
    }
  }

  function applyVolunteerSuggestion(roleId, profile) {
    volunteerForms = {
      ...volunteerForms,
      [roleId]: {
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email || '',
        phone: profile.phone || ''
      }
    };

    volunteerSuggestions = { ...volunteerSuggestions, [roleId]: [] };
    suggestionLoading = { ...suggestionLoading, [roleId]: false };
    if (suggestionTimers[roleId]) {
      clearTimeout(suggestionTimers[roleId]);
      delete suggestionTimers[roleId];
    }
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function clearRoleMessage(roleId, type = 'success') {
    setTimeout(() => {
      const existing = addStates[roleId];
      if (!existing) return;
      addStates = {
        ...addStates,
        [roleId]: {
          ...existing,
          [type]: ''
        }
      };
    }, 4000);
  }

  async function sendRoleInviteEmail({ email, firstName, role }) {
    try {
      const shiftText = formatShift(role);
      const subject = `You are scheduled for ${role.name}`;
      const loginUrl = `${window.location.origin}/#/auth/login`;

      const leader = role.domain?.leader;
      const leaderName = leader
        ? [leader.first_name, leader.last_name].filter(Boolean).join(' ').trim() || 'Your volunteer leader'
        : null;
      const leaderContact = leader
        ? [leader.email, leader.phone].filter(Boolean).join(leader.email && leader.phone ? ' • ' : '')
        : '';

      await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject,
          html: `
            <h2>${subject}</h2>
            <p>Hi ${firstName || 'there'},</p>
            <p>You have been added to the volunteer role <strong>${role.name}</strong>.</p>
            ${role.description ? `<p>${role.description}</p>` : ''}
            <ul>
              <li><strong>Shift:</strong> ${shiftText}</li>
              ${role.location ? `<li><strong>Location:</strong> ${role.location}</li>` : ''}
              ${role.domain?.name ? `<li><strong>Domain:</strong> ${role.domain.name}</li>` : ''}
            </ul>
            ${leaderName ? `<p><strong>Volunteer leader${role.domain?.name ? ` for ${role.domain.name}` : ''}:</strong> ${leaderName}${leaderContact ? ` — ${leaderContact}` : (leader?.email ? ` — ${leader.email}` : '')}</p>` : ''}
            <p>Please log in to the volunteer portal to review details, sign the waiver, and provide your emergency contact information.</p>
            <p><a href="${loginUrl}">Open the volunteer portal</a></p>
            <p>If you have scheduling conflicts, please contact your volunteer coordinator${leader?.email ? ` or ${leaderName} at ${leader.email}` : ''}.</p>
          `
        }
      });
    } catch (err) {
      console.error('Invite email error:', err);
      throw new Error('Volunteer added, but email notification could not be sent automatically.');
    }
  }

  async function addVolunteerToRole(role) {
    const roleId = role.id;
    const form = volunteerForms[roleId];

    if (!form) return;

    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!firstName || !lastName) {
      addStates = {
        ...addStates,
        [roleId]: { loading: false, error: 'First and last name are required.', success: '' }
      };
      return;
    }

    if (!email || !validateEmail(email)) {
      addStates = {
        ...addStates,
        [roleId]: { loading: false, error: 'Please enter a valid email address.', success: '' }
      };
      return;
    }

    const affiliationId = (form.team_club_affiliation_id || '').trim();
    if (!affiliationId) {
      addStates = {
        ...addStates,
        [roleId]: { loading: false, error: 'Please select a team or club affiliation.', success: '' }
      };
      return;
    }

    addStates = {
      ...addStates,
      [roleId]: { loading: true, error: '', success: '' }
    };

    try {
      let volunteerId;
      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, team_club_affiliation_id')
        .ilike('email', email)
        .maybeSingle();

      if (profileLookupError) throw profileLookupError;

      if (existingProfile) {
        volunteerId = existingProfile.id;
        const updates = {};
        if (!existingProfile.first_name && firstName) updates.first_name = firstName;
        if (!existingProfile.last_name && lastName) updates.last_name = lastName;
        if (phone && phone !== existingProfile.phone) updates.phone = phone;

        if (affiliationId && existingProfile.team_club_affiliation_id !== affiliationId) {
          updates.team_club_affiliation_id = affiliationId;
        }
        if (Object.keys(updates).length > 0) {
          const { error: updateProfileError } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', volunteerId);

          if (updateProfileError) throw updateProfileError;
        }
      } else {
        const tempPassword =
          Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password: tempPassword,
          options: {
            data: {
              first_name: firstName,
              last_name: lastName,
              team_club_affiliation_id: affiliationId
            },
            emailRedirectTo: `${window.location.origin}/#/volunteer`
          }
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error('User creation failed.');

        volunteerId = authData.user.id;

        const { error: profileError } = await supabase.from('profiles').upsert({
          id: volunteerId,
          email,
          first_name: firstName,
          last_name: lastName,
          phone: phone || null,
          role: 'volunteer',
          team_club_affiliation_id: affiliationId || null
        });

        if (profileError) throw profileError;
      }

      const { data: existingSignup, error: existingSignupError } = await supabase
        .from('signups')
        .select('id, status')
        .eq('volunteer_id', volunteerId)
        .eq('role_id', roleId)
        .maybeSingle();

      if (existingSignupError) throw existingSignupError;

      if (existingSignup) {
        if (existingSignup.status === 'cancelled') {
          const { error: reactivateError } = await supabase
            .from('signups')
            .update({
              status: 'confirmed',
              phone: phone || null,
              waiver_signed: false
            })
            .eq('id', existingSignup.id);

          if (reactivateError) throw reactivateError;
        } else {
          throw new Error('This volunteer is already signed up for this role.');
        }
      } else {
        const { error: signupError } = await supabase.from('signups').insert({
          role_id: roleId,
          volunteer_id: volunteerId,
          status: 'confirmed',
          phone: phone || null,
          waiver_signed: false
        });

        if (signupError) throw signupError;
      }

      try {
        await sendRoleInviteEmail({ email, firstName, role });
        addStates = {
          ...addStates,
          [roleId]: {
            loading: false,
            error: '',
            success: `Added ${firstName} ${lastName} and sent a welcome email.`
          }
        };
      } catch (emailErr) {
        addStates = {
          ...addStates,
          [roleId]: {
            loading: false,
            error: '',
            success: `Added ${firstName} ${lastName}. Please notify them manually (email sending failed).`
          }
        };
      }

      volunteerForms = {
        ...volunteerForms,
        [roleId]: {
          first_name: '',
          last_name: '',
          email: '',
          phone: '',
          team_club_affiliation_id: ''
        }
      };

      volunteerSuggestions = { ...volunteerSuggestions, [roleId]: [] };
      suggestionLoading = { ...suggestionLoading, [roleId]: false };
      if (suggestionTimers[roleId]) {
        clearTimeout(suggestionTimers[roleId]);
        delete suggestionTimers[roleId];
      }

      await fetchMyRoles();
      clearRoleMessage(roleId, 'success');
    } catch (err) {
      console.error('Add volunteer error:', err);
      addStates = {
        ...addStates,
        [roleId]: {
          loading: false,
          error: err.message || 'Failed to add volunteer.',
          success: ''
        }
      };
      clearRoleMessage(roleId, 'error');
      suggestionLoading = { ...suggestionLoading, [roleId]: false };
    }
  }

  function handleAddKeydown(event, role) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addVolunteerToRole(role);
    }
  }

  async function deleteVolunteerFromRole(role, signup) {
    closeActionMenu();
    if (!confirm(`Remove ${signup.volunteer?.first_name || 'this volunteer'} from ${role.name}?`)) {
      return;
    }

    const roleId = role.id;
    addStates = {
      ...addStates,
      [roleId]: {
        loading: true,
        error: '',
        success: ''
      }
    };

    try {
      const { error: deleteError } = await supabase
        .from('signups')
        .delete()
        .eq('id', signup.id);

      if (deleteError) throw deleteError;

      await fetchMyRoles();
      addStates = {
        ...addStates,
        [roleId]: {
          loading: false,
          error: '',
          success: 'Volunteer removed.'
        }
      };
      clearRoleMessage(roleId, 'success');
    } catch (err) {
      console.error('Delete volunteer error:', err);
      addStates = {
        ...addStates,
        [roleId]: {
          loading: false,
          error: err.message || 'Failed to delete volunteer.',
          success: ''
        }
      };
      clearRoleMessage(roleId, 'error');
    }
  }

  function toggleEmailForm() {
    showEmailForm = !showEmailForm;
    if (!showEmailForm) {
      emailSubject = '';
      emailBody = '';
      emailSuccess = '';
      error = '';
    }
  }

  async function sendEmailToVolunteers() {
    if (!emailSubject.trim() || !emailBody.trim()) {
      error = 'Please enter both subject and message';
      return;
    }

    sendingEmail = true;
    error = '';
    emailSuccess = '';

    try {
      // Get all unique volunteers across all roles
      const uniqueVolunteers = new Map();
      myRoles.forEach(role => {
        role.confirmedSignups.forEach(signup => {
          if (!uniqueVolunteers.has(signup.volunteer.id)) {
            uniqueVolunteers.set(signup.volunteer.id, signup.volunteer);
          }
        });
      });

      const volunteers = Array.from(uniqueVolunteers.values());

      if (volunteers.length === 0) {
        error = 'No volunteers to email';
        return;
      }

      // Send email to each volunteer
      const emailPromises = volunteers.map(volunteer => 
        supabase.functions.invoke('send-email', {
          body: {
            to: volunteer.email,
            subject: emailSubject,
            html: `
              <h2>${emailSubject}</h2>
              <p>Hello ${volunteer.first_name},</p>
              ${emailBody.split('\n').map(line => `<p>${line}</p>`).join('')}
              <hr style="margin: 2rem 0; border: none; border-top: 1px solid #dee2e6;">
              <p style="color: #6c757d; font-size: 0.9rem;">
                This message was sent by your volunteer leader: ${$auth.profile?.first_name || ''} ${$auth.profile?.last_name || ''}
                ${$auth.profile?.email ? ` (${$auth.profile.email})` : ''}
              </p>
            `
          }
        })
      );

      await Promise.all(emailPromises);

      emailSuccess = `✅ Email sent successfully to ${volunteers.length} volunteer${volunteers.length > 1 ? 's' : ''}!`;
      
      // Clear form after successful send
      setTimeout(() => {
        emailSubject = '';
        emailBody = '';
        showEmailForm = false;
        emailSuccess = '';
      }, 3000);

    } catch (err) {
      console.error('Email error:', err);
      error = `Failed to send email: ${err.message}`;
    } finally {
      sendingEmail = false;
    }
  }

  function startEditing(roleId, signup) {
    closeActionMenu();
    const roleEdits = editingStates[roleId] || {};
    const roleForms = editForms[roleId] || {};

    editingStates = {
      ...editingStates,
      [roleId]: {
        ...roleEdits,
        [signup.id]: true
      }
    };

    editForms = {
      ...editForms,
      [roleId]: {
        ...roleForms,
        [signup.id]: {
          first_name: signup.volunteer?.first_name || '',
          last_name: signup.volunteer?.last_name || '',
          email: signup.volunteer?.email || '',
          phone: signup.phone || signup.volunteer?.phone || ''
        }
      }
    };
  }

  function cancelEditing(roleId, signupId) {
    const roleEdits = { ...(editingStates[roleId] || {}) };
    const roleForms = { ...(editForms[roleId] || {}) };
    delete roleEdits[signupId];
    delete roleForms[signupId];

    editingStates = {
      ...editingStates,
      [roleId]: roleEdits
    };

    editForms = {
      ...editForms,
      [roleId]: roleForms
    };
  }

  function updateEditForm(roleId, signupId, field, value) {
    const roleForms = editForms[roleId] || {};
    const current = roleForms[signupId] || {
      first_name: '',
      last_name: '',
      email: '',
      phone: ''
    };

    editForms = {
      ...editForms,
      [roleId]: {
        ...roleForms,
        [signupId]: {
          ...current,
          [field]: value
        }
      }
    };
  }

  async function saveEditedVolunteer(role, signup) {
    const roleId = role.id;
    const signupId = signup.id;
    const form = editForms[roleId]?.[signupId];

    if (!form) return;

    const { first_name, last_name, email, phone } = form;

    if (!first_name.trim() || !last_name.trim()) {
      addStates = {
        ...addStates,
        [roleId]: {
          ...(addStates[roleId] || {}),
          error: 'First and last name are required to save.'
        }
      };
      clearRoleMessage(roleId, 'error');
      return;
    }

    if (!validateEmail(email.trim())) {
      addStates = {
        ...addStates,
        [roleId]: {
          ...(addStates[roleId] || {}),
          error: 'Please enter a valid email address.'
        }
      };
      clearRoleMessage(roleId, 'error');
      return;
    }

    addStates = {
      ...addStates,
      [roleId]: {
        loading: true,
        error: '',
        success: ''
      }
    };

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          email: email.trim(),
          phone: phone.trim() || null
        })
        .eq('id', signup.volunteer.id);

      if (profileError) throw profileError;

      const { error: signupError } = await supabase
        .from('signups')
        .update({ phone: phone.trim() || null })
        .eq('id', signupId);

      if (signupError) throw signupError;

      cancelEditing(roleId, signupId);
      await fetchMyRoles();

      addStates = {
        ...addStates,
        [roleId]: {
          loading: false,
          error: '',
          success: 'Volunteer updated.'
        }
      };
      clearRoleMessage(roleId, 'success');
    } catch (err) {
      console.error('Edit volunteer error:', err);
      addStates = {
        ...addStates,
        [roleId]: {
          loading: false,
          error: err.message || 'Failed to update volunteer.',
          success: ''
        }
      };
      clearRoleMessage(roleId, 'error');
    }
  }

  $: totalVolunteers = new Set(
    myRoles.flatMap(r => r.confirmedSignups.map(s => s.volunteer.id))
  ).size;
</script>

<div class="leader-dashboard">
  <div class="header">
    <div>
      <h1>Volunteer Leader Dashboard</h1>
      <p>Manage the roles assigned to you</p>
    </div>
    {#if !loading && myRoles.length > 0 && totalVolunteers > 0}
      <button class="btn btn-primary with-icon" on:click={toggleEmailForm}>
        <span class="btn-icon">📧</span>
        <span>Email My Volunteers</span>
      </button>
    {/if}
  </div>

  {#if showEmailForm}
    <div class="email-form-card">
      <h3>Send Email to All Your Volunteers</h3>
      <p class="email-info">This will send an email to {totalVolunteers} volunteer{totalVolunteers > 1 ? 's' : ''} across all your assigned roles.</p>
      
      {#if error}
        <div class="alert alert-error">{error}</div>
      {/if}
      
      {#if emailSuccess}
        <div class="alert alert-success">{emailSuccess}</div>
      {/if}

      <div class="form-group">
        <label for="email-subject">Subject *</label>
        <input
          type="text"
          id="email-subject"
          bind:value={emailSubject}
          placeholder="e.g., Important Update About Your Volunteer Shift"
          disabled={sendingEmail}
        />
      </div>

      <div class="form-group">
        <label for="email-body">Message *</label>
        <textarea
          id="email-body"
          bind:value={emailBody}
          rows="8"
          placeholder="Enter your message here...

Examples:
- Event time changes
- Important reminders
- Thank you messages
- Updates about the event"
          disabled={sendingEmail}
        ></textarea>
      </div>

      <div class="form-actions">
        <button
          type="button"
          class="btn btn-secondary"
          on:click={toggleEmailForm}
          disabled={sendingEmail}
        >
          Cancel
        </button>
        
        <button
          type="button"
          class="btn btn-primary"
          on:click={sendEmailToVolunteers}
          disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
        >
          {sendingEmail ? 'Sending...' : `Send Email to ${totalVolunteers} Volunteer${totalVolunteers > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading your assignments...</div>
  {:else if error && !showEmailForm}
    <div class="error">{error}</div>
  {:else if myRoles.length === 0}
    <div class="empty">
      <h2>No Roles Assigned Yet</h2>
      <p>You haven't been assigned to lead any volunteer roles yet.</p>
      <p>Contact an administrator to get assigned roles.</p>
    </div>
  {:else}
    <div class="roles-container">
      {#if refreshing}
        <div class="refreshing">Refreshing assignments…</div>
      {/if}
      {#each sortedRoles as role (role.id)}
        {@const shiftText = formatShift(role)}
        {@const totalSlots = role.positions_total ?? '—'}
        {@const addForm = volunteerForms[role.id] || { first_name: '', last_name: '', email: '', phone: '', team_club_affiliation_id: '' }}
        {@const addState = addStates[role.id] || { loading: false, error: '', success: '' }}
        <section class="role-card">
          <header class="role-card__header">
            <div class="role-card__info">
              <div class="role-card__title-row">
                <h2>{role.name}</h2>
                <span class="filled-pill">{role.positions_filled}/{totalSlots} filled</span>
              </div>
              <p class="role-subtitle">
                {#if role.domain?.name}
                  <span>{role.domain.name}</span>
                  {#if role.description || shiftText}
                    <span class="separator">•</span>
                  {/if}
                {/if}
                {#if role.description}
                  <span>{role.description}</span>
                  {#if shiftText}
                    <span class="separator">•</span>
                  {/if}
                {/if}
                {#if shiftText}
                  <span>{shiftText}</span>
                {/if}
              </p>
            </div>
            <div class="role-header-actions">
              <button type="button" class="share-link-btn" on:click={() => shareRoleInvite(role)}>
                Share invite link
              </button>
              {#if shareMessages[role.id]}
                <span class="share-message">{shareMessages[role.id]}</span>
              {/if}
            </div>
          </header>

          <div class="table-wrapper">
            <table class="volunteer-table compact">
              <thead>
                <tr>
                  <th class="name-col">Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#if role.confirmedSignups.length === 0}
                  <tr class="empty-row">
                    <td colspan="4">No volunteers yet</td>
                  </tr>
                {:else}
                  {#each role.confirmedSignups as signup (signup.id)}
                    {@const isEditing = editingStates[role.id]?.[signup.id]}
                    {@const menuOpen = openActionMenu.roleId === role.id && openActionMenu.signupId === signup.id}

                    {#if isEditing}
                      {@const editForm = editForms[role.id][signup.id]}
                      <tr class="volunteer-row editing">
                        <td>
                          <div class="name-inputs">
                            <input
                              type="text"
                              class="input"
                              value={editForm.first_name || ''}
                              on:input={(event) => updateEditForm(role.id, signup.id, 'first_name', event.target.value)}
                              aria-label={`Edit first name for ${signup.volunteer?.email || ''}`}
                            />
                            <input
                              type="text"
                              class="input"
                              value={editForm.last_name || ''}
                              on:input={(event) => updateEditForm(role.id, signup.id, 'last_name', event.target.value)}
                              aria-label={`Edit last name for ${signup.volunteer?.email || ''}`}
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            type="email"
                            class="input"
                            value={editForm.email || ''}
                            on:input={(event) => updateEditForm(role.id, signup.id, 'email', event.target.value)}
                            aria-label={`Edit email for ${signup.volunteer?.email || ''}`}
                          />
                        </td>
                        <td>
                          <input
                            type="tel"
                            class="input"
                            value={editForm.phone || ''}
                            on:input={(event) => updateEditForm(role.id, signup.id, 'phone', event.target.value)}
                            aria-label={`Edit phone for ${signup.volunteer?.email || ''}`}
                          />
                        </td>
                        <td class="actions-cell editing-actions">
                          <button class="btn btn-primary btn-sm" on:click={() => saveEditedVolunteer(role, signup)}>Save</button>
                          <button class="btn btn-secondary btn-sm" on:click={() => cancelEditing(role.id, signup.id)}>Cancel</button>
                        </td>
                      </tr>
                    {:else}
                      <tr class="volunteer-row">
                        <td>
                          <div class="volunteer-name">
                            <span class="volunteer-name__text">{formatVolunteerName(signup)}</span>
                          </div>
                        </td>
                        <td>
                          {#if signup.volunteer?.email}
                            <a href="mailto:{signup.volunteer.email}">{signup.volunteer.email}</a>
                          {:else}
                            —
                          {/if}
                        </td>
                        <td>{signup.phone || signup.volunteer?.phone || '—'}</td>
                        <td class="actions-cell">
                          <div class="actions-menu-wrapper">
                            <button
                              type="button"
                              class="icon-button"
                              on:click={(event) => toggleActionMenu(event, role.id, signup.id)}
                              aria-label="Open volunteer actions"
                              aria-expanded={menuOpen}
                            >
                              ⋮
                            </button>
                            {#if menuOpen}
                              <div class="actions-menu" on:click|stopPropagation>
                                <button type="button" on:click={() => startEditing(role.id, signup)}>Edit volunteer</button>
                                <button type="button" class="danger" on:click={() => deleteVolunteerFromRole(role, signup)}>Remove volunteer</button>
                              </div>
                            {/if}
                          </div>
                        </td>
                      </tr>
                    {/if}
                  {/each}
                {/if}
              </tbody>
            </table>
          </div>

          <div class="role-footer">
            <div class="add-volunteer">
              <div class="add-volunteer__grid">
                <input
                  type="text"
                  class="input"
                  placeholder="First name"
                  value={addForm.first_name}
                  on:input={(event) => updateVolunteerForm(role.id, 'first_name', event.target.value)}
                  on:keydown={(event) => handleAddKeydown(event, role)}
                  aria-label={`First name for ${role.name}`}
                />
                <input
                  type="text"
                  class="input"
                  placeholder="Last name"
                  value={addForm.last_name}
                  on:input={(event) => updateVolunteerForm(role.id, 'last_name', event.target.value)}
                  on:keydown={(event) => handleAddKeydown(event, role)}
                  aria-label={`Last name for ${role.name}`}
                />
                <input
                  type="email"
                  class="input"
                  placeholder="Email address"
                  value={addForm.email}
                  on:input={(event) => updateVolunteerForm(role.id, 'email', event.target.value)}
                  on:keydown={(event) => handleAddKeydown(event, role)}
                  aria-label={`Email for ${role.name}`}
                />
                <input
                  type="tel"
                  class="input"
                  placeholder="Phone (optional)"
                  value={addForm.phone}
                  on:input={(event) => updateVolunteerForm(role.id, 'phone', event.target.value)}
                  on:keydown={(event) => handleAddKeydown(event, role)}
                  aria-label={`Phone for ${role.name}`}
                />
                <select
                  class="input"
                  value={addForm.team_club_affiliation_id}
                  on:change={(event) => updateVolunteerForm(role.id, 'team_club_affiliation_id', event.target.value)}
                  disabled={addState.loading}
                  aria-label={`Team/club for ${role.name}`}
                  title="Team / Club Affiliation"
                >
                  <option value="">Team/Club *</option>
                  {#each $affiliations as aff (aff.id)}
                    <option value={aff.id}>{aff.name}</option>
                  {/each}
                </select>
                <button
                  class="btn btn-primary add-btn"
                  on:click={() => addVolunteerToRole(role)}
                  disabled={addState.loading}
                >
                  {addState.loading ? 'Adding…' : '+ Add'}
                </button>
              </div>

              {#if suggestionLoading[role.id]}
                <div class="suggestions suggestions--loading">Searching existing volunteers…</div>
              {:else if volunteerSuggestions[role.id]?.length}
                <div class="suggestions">
                  <span class="suggestions-intro">Select an existing volunteer:</span>
                  <div class="suggestions-list">
                    {#each volunteerSuggestions[role.id] as profile (profile.id)}
                      <button type="button" class="suggestion-chip" on:click={() => applyVolunteerSuggestion(role.id, profile)}>
                        <span class="name">{profile.first_name || 'No'} {profile.last_name || 'Name'}</span>
                        <span class="email">{profile.email}</span>
                        {#if profile.phone}
                          <span class="phone">{profile.phone}</span>
                        {/if}
                        {#if profile.source === 'contact'}
                          <span class="suggestion-badge">Past volunteer</span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if addState.error}
                <div class="inline-alert error">{addState.error}</div>
              {/if}

              {#if addState.success}
                <div class="inline-alert success">{addState.success}</div>
              {/if}
            </div>
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>

<style>
  .leader-dashboard {
    max-width: 1400px;
    margin: 0 auto;
    padding-bottom: 4rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .header h1 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .header p {
    color: #6c757d;
    margin: 0;
  }

  .email-form-card {
    background: white;
    padding: 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    margin-bottom: 2rem;
    border: 1px solid #007bff;
  }

  .email-form-card h3 {
    margin: 0 0 0.5rem 0;
    color: #1a1a1a;
  }

  .email-info {
    color: #6c757d;
    margin-bottom: 1.25rem;
    font-size: 0.95rem;
  }

  .form-group {
    margin-bottom: 1.25rem;
  }

  .form-group label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 8px;
    font-size: 1rem;
    transition: border 0.2s, box-shadow 0.2s;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.15);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
  }

  .roles-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .role-card {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 22px 40px -25px rgba(15, 23, 42, 0.35);
    overflow: hidden;
  }

  .role-card__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.5rem;
    padding: 1.75rem 1.5rem 1.5rem;
    background: linear-gradient(135deg, rgba(13, 110, 253, 0.09), rgba(13, 110, 253, 0.02));
    flex-wrap: wrap;
  }

  .role-card__info {
    flex: 1;
    min-width: 240px;
  }

  .role-card__title-row {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    flex-wrap: wrap;
  }

  .role-card__title-row h2 {
    margin: 0;
    font-size: 1.3rem;
    color: #16213e;
  }

  .filled-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    background: rgba(13, 110, 253, 0.12);
    color: #0b4ba5;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .role-subtitle {
    margin: 0.45rem 0 0;
    color: #4b5b76;
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .role-subtitle .separator {
    color: #a0aec0;
  }

  .role-header-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .share-link-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 1.25rem;
    border-radius: 12px;
    background: #fff;
    border: 1px solid #0d6efd;
    color: #0d6efd;
    font-weight: 600;
    font-size: 0.92rem;
    cursor: pointer;
    transition: background 0.2s, box-shadow 0.2s, transform 0.2s;
  }

  .share-link-btn:hover:not(:disabled) {
    background: #edf4ff;
    box-shadow: 0 10px 20px -12px rgba(13, 110, 253, 0.45);
    transform: translateY(-1px);
  }

  .share-link-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .share-message {
    font-size: 0.85rem;
    color: #0d6efd;
    font-weight: 600;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .volunteer-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 720px;
  }

  .volunteer-table.compact th,
  .volunteer-table.compact td {
    border-bottom: 1px solid #e2e8f0;
    padding: 0.85rem 1rem;
  }

  .volunteer-table.compact thead th {
    background: #f8fafc;
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: #64748b;
    text-align: left;
  }

  .volunteer-table .name-col {
    width: 32%;
  }

  .actions-col {
    width: 120px;
    text-align: center;
  }

  .volunteer-row:nth-child(even) td {
    background: #fbfdff;
  }

  .volunteer-row.editing td {
    background: #f2f7ff;
  }

  .volunteer-name__text {
    font-weight: 600;
    color: #1b1f3b;
  }

  .actions-cell {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
  }

  .editing-actions {
    gap: 0.6rem;
  }

  .name-inputs {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .input {
    width: 100%;
    min-width: 130px;
    padding: 0.55rem 0.65rem;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    font-size: 0.95rem;
    transition: border 0.2s, box-shadow 0.2s;
  }

  .input:focus {
    outline: none;
    border-color: #0d6efd;
    box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.18);
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: #eef2ff;
    color: #334155;
    font-size: 1.2rem;
    cursor: pointer;
    transition: background 0.2s, transform 0.2s;
  }

  .icon-button:hover,
  .icon-button[aria-expanded="true"] {
    background: #dbe4ff;
    transform: translateY(-1px);
  }

  .actions-menu-wrapper {
    position: relative;
  }

  .actions-menu {
    position: absolute;
    top: 110%;
    right: 0;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 18px 40px -20px rgba(15, 23, 42, 0.4);
    border: 1px solid #e2e8f0;
    padding: 0.5rem 0;
    min-width: 180px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .actions-menu button {
    background: none;
    border: none;
    padding: 0.6rem 1rem;
    text-align: left;
    font-size: 0.92rem;
    color: #1f2937;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }

  .actions-menu button:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  .actions-menu button.danger {
    color: #dc3545;
  }

  .empty-row td {
    text-align: center;
    color: #64748b;
    font-style: italic;
    padding: 1.75rem 1rem;
    background: #f8fbff;
  }

  .role-footer {
    padding: 1.5rem;
    border-top: 1px solid #edf2f7;
    background: #fefeff;
  }

  .add-volunteer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .add-volunteer__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 0.75rem;
    align-items: center;
  }

  .add-btn {
    justify-self: flex-start;
    padding: 0.6rem 1.4rem;
    border-radius: 12px;
    font-weight: 600;
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

  .suggestions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .suggestions--loading {
    color: #6c757d;
    font-style: italic;
  }

  .suggestions-intro {
    font-size: 0.85rem;
    color: #6c757d;
  }

  .suggestions-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .suggestion-chip {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    border: 1px solid #ced4da;
    background: #fff;
    cursor: pointer;
    font-size: 0.85rem;
    min-width: 190px;
    transition: border 0.2s, box-shadow 0.2s, transform 0.2s;
  }

  .suggestion-chip:hover {
    border-color: #0d6efd;
    box-shadow: 0 4px 12px rgba(13, 110, 253, 0.12);
    transform: translateY(-1px);
  }

  .suggestion-chip .name {
    font-weight: 600;
    color: #1a1a1a;
  }

  .suggestion-chip .email {
    color: #0d6efd;
  }

  .suggestion-chip .phone {
    color: #6c757d;
    font-size: 0.8rem;
  }

  .suggestion-chip .suggestion-badge {
    font-size: 0.7rem;
    color: #6c757d;
    margin-top: 2px;
  }

  .btn-sm {
    padding: 0.45rem 0.9rem;
    font-size: 0.9rem;
  }

  .loading {
    text-align: center;
    padding: 3rem 0;
    color: #6c757d;
    font-size: 1.05rem;
  }

  .error {
    background: #fdecea;
    border: 1px solid #f5c2c7;
    color: #b02a37;
    padding: 1rem;
    border-radius: 10px;
    text-align: center;
    font-weight: 500;
  }

  .empty {
    background: white;
    padding: 3rem;
    border-radius: 14px;
    text-align: center;
    box-shadow: 0 2px 12px rgba(15, 23, 42, 0.05);
    color: #6c757d;
  }

  .empty h2 {
    margin: 0 0 1rem 0;
    color: #1a1a1a;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 999px;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
  }

  .btn.with-icon {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
  }

  .btn-icon {
    font-size: 1.1rem;
    line-height: 1;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 20px rgba(0, 123, 255, 0.18);
  }

  .btn-secondary {
    background: white;
    color: #007bff;
    border: 1px solid #007bff;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #f0f4ff;
  }

  .volunteer-row td {
    padding: 0.45rem 0.7rem;
  }

  .volunteer-row input {
    width: 100%;
    min-width: 140px;
    padding: 0.35rem 0.55rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 0.88rem;
  }

  .actions-editing {
    display: flex;
    gap: 0.4rem;
    justify-content: center;
    align-items: center;
  }

  .btn-secondary.btn-sm {
    background: white;
    color: #007bff;
    border: 1px solid #007bff;
  }

  .btn-secondary.btn-sm:hover {
    background: #f0f4ff;
  }

  .btn-danger {
    background: #dc3545;
    color: white;
    border: 1px solid #dc3545;
  }

  .btn-danger:hover:not(:disabled) {
    background: #c82333;
    border-color: #bd2130;
  }

  .refreshing {
    padding: 0.75rem 1rem;
    margin: 0 1.5rem 0.5rem 1.5rem;
    border-radius: 10px;
    background: rgba(0, 123, 255, 0.08);
    color: #0056b3;
    font-weight: 600;
    text-align: center;
  }

  @media (max-width: 1024px) {
    .role-card {
      border-radius: 14px;
    }
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
    }

    .form-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .role-card__header {
      flex-direction: column;
      align-items: stretch;
    }

    .role-card__title-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .actions-col {
      width: auto;
    }

    .add-volunteer__grid {
      grid-template-columns: 1fr;
    }
  }
</style>

