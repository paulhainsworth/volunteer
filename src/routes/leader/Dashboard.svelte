<script>
  import { onMount, onDestroy } from 'svelte';
  import { auth } from '../../lib/stores/auth';
  import { supabase } from '../../lib/supabaseClient';
  import { push } from 'svelte-spa-router';
  import { format } from 'date-fns';

  let loading = true;
  let error = '';
  let myRoles = [];
let groupedDomains = [];
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

  onMount(async () => {
    const authState = await waitForAuthReady();

    if (!authState.user || authState.profile?.role !== 'volunteer_leader') {
      push('/volunteer');
      return;
    }

    if (!authState.profile?.emergency_contact_name) {
      push('/onboarding');
      return;
    }

    await loadRolesWithRetry();

    const handleNavigation = () => {
      loadRolesWithRetry();
    };

    window.addEventListener('hashchange', handleNavigation);
    window.addEventListener('popstate', handleNavigation);

    popstateUnsubscribe = () => {
      window.removeEventListener('hashchange', handleNavigation);
      window.removeEventListener('popstate', handleNavigation);
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
          leader_id
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

    groupedDomains = groupRolesByDomain(myRoles);
    initializeRoleForms(myRoles);
  }

  function formatTime(time) {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const displayHour = hour % 12 || 12;
    const ampm = hour >= 12 ? 'pm' : 'am';
    return `${displayHour}:${minutes}${ampm}`;
  }

  function formatShift(role) {
    const datePart = role.event_date ? format(new Date(role.event_date), 'EEE, MMM d') : '';
    const start = formatTime(role.start_time);
    const end = formatTime(role.end_time);
    const timePart = start && end ? `${start} – ${end}` : '';
    return [datePart, timePart].filter(Boolean).join(' • ') || '—';
  }

  function compareRoles(a, b) {
    const dateA = a.event_date ? new Date(a.event_date) : null;
    const dateB = b.event_date ? new Date(b.event_date) : null;
    if (dateA && dateB) {
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
    } else if (dateA) {
      return -1;
    } else if (dateB) {
      return 1;
    }

    const timeA = a.start_time || '';
    const timeB = b.start_time || '';
    if (timeA !== timeB) {
      return timeA.localeCompare(timeB);
    }

    return a.name.localeCompare(b.name);
  }

  function groupRolesByDomain(roles) {
    const groups = new Map();

    roles.forEach(role => {
      const domain = role.domain && role.domain.leader_id === $auth.user.id ? role.domain : null;
      const groupKey = domain?.id || 'direct';

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          name: domain ? domain.name : 'Direct Assignments',
          description: domain?.description || (domain ? '' : 'Roles assigned directly to you'),
          roles: []
        });
      }

      groups.get(groupKey).roles.push(role);
    });

    return Array.from(groups.values()).map(group => ({
      ...group,
      roles: group.roles.sort(compareRoles)
    })).sort((a, b) => a.name.localeCompare(b.name));
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
        phone: ''
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
      phone: ''
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

  function getInviteLink(domainId) {
    if (typeof window === 'undefined' || !domainId) return '';
    return `${window.location.origin}#/invite/${domainId}`;
  }

  function setShareMessage(domainId, message) {
    shareMessages = {
      ...shareMessages,
      [domainId]: message
    };

    if (shareTimers[domainId]) {
      clearTimeout(shareTimers[domainId]);
    }

    shareTimers[domainId] = setTimeout(() => {
      shareMessages = {
        ...shareMessages,
        [domainId]: ''
      };
      delete shareTimers[domainId];
    }, 4000);
  }

  async function shareDomainInvite(domain) {
    if (!domain?.id) return;

    const url = getInviteLink(domain.id);
    if (!url) return;

    const title = `${domain.name} Volunteer Opportunities`;
    const text = `Sign up to volunteer with the ${domain.name} team!`;

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, text, url });
        setShareMessage(domain.id, 'Invite ready to send!');
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareMessage(domain.id, 'Invite link copied to clipboard.');
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
          setShareMessage(domain.id, 'Invite link copied to clipboard.');
        }
      } catch (copyError) {
        console.error('Clipboard copy failed:', copyError);
        setShareMessage(domain.id, 'Unable to copy link. Please copy it manually.');
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

  async function fetchVolunteerSuggestions(roleId, form) {
    try {
      let query = supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, role')
        .neq('id', $auth.user.id)
        .limit(5)
        .order('first_name');

      const emailQuery = (form.email || '').trim();
      const firstRaw = (form.first_name || '').trim();
      const lastRaw = (form.last_name || '').trim();

      const sanitize = (value) => value.replace(/[,%]/g, '').trim();
      const first = sanitize(firstRaw);
      const last = sanitize(lastRaw);

      if (emailQuery && emailQuery.includes('@')) {
        query = query.ilike('email', `%${emailQuery}%`);
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

        if (filters.length) {
          query = query.or(filters.join(','));
        }
      }

      query = query.in('role', ['volunteer', 'volunteer_leader', 'admin']);

      const { data, error: suggestionsError } = await query;

      if (suggestionsError) throw suggestionsError;

      volunteerSuggestions = {
        ...volunteerSuggestions,
        [roleId]: (data || []).filter(profile => profile.email)
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

      await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject,
          html: `
            <h2>${subject}</h2>
            <p>Hi ${firstName || 'there'},</p>
            <p>You have been added to the volunteer role <strong>${role.name}</strong>.</p>
            <ul>
              <li><strong>Shift:</strong> ${shiftText}</li>
              ${role.location ? `<li><strong>Location:</strong> ${role.location}</li>` : ''}
              ${role.domain?.name ? `<li><strong>Domain:</strong> ${role.domain.name}</li>` : ''}
            </ul>
            <p>Please log in to the volunteer portal to review details, sign the waiver, and provide your emergency contact information.</p>
            <p><a href="${loginUrl}">Open the volunteer portal</a></p>
            <p>If you have scheduling conflicts, please contact your volunteer coordinator.</p>
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

    addStates = {
      ...addStates,
      [roleId]: { loading: true, error: '', success: '' }
    };

    try {
      let volunteerId;
      const { data: existingProfile, error: profileLookupError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone')
        .ilike('email', email)
        .maybeSingle();

      if (profileLookupError) throw profileLookupError;

      if (existingProfile) {
        volunteerId = existingProfile.id;
        const updates = {};
        if (!existingProfile.first_name && firstName) updates.first_name = firstName;
        if (!existingProfile.last_name && lastName) updates.last_name = lastName;
        if (phone && phone !== existingProfile.phone) updates.phone = phone;

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
              last_name: lastName
            },
            emailRedirectTo: `${window.location.origin}/auth/reset-password`
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
          role: 'volunteer'
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
          phone: ''
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
                This message was sent by your volunteer leader: ${$auth.profile.first_name} ${$auth.profile.last_name}
                ${$auth.profile.email ? ` (${$auth.profile.email})` : ''}
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
      <button class="btn btn-primary" on:click={toggleEmailForm}>
        📧 Email My Volunteers
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
    <div class="domains-container">
      {#if refreshing}
        <div class="refreshing">Refreshing assignments…</div>
      {/if}
      {#each groupedDomains as group (group.id)}
        <section class="domain-section">
          <div class="domain-header">
            <div class="domain-info">
              <h2>{group.name}</h2>
              {#if group.description}
                <p>{group.description}</p>
              {/if}
            </div>
            <div class="domain-actions">
              <button type="button" class="share-link-btn" on:click={() => shareDomainInvite(group)}>
                Share invite link
              </button>
              {#if shareMessages[group.id]}
                <span class="share-message">{shareMessages[group.id]}</span>
              {/if}
            </div>
          </div>

          <div class="table-wrapper">
            <table class="volunteer-table">
              <thead>
                <tr>
                  <th class="position-col">Position</th>
                  <th>First</th>
                  <th>Last</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each group.roles as role (role.id)}
                  {@const volunteers = role.confirmedSignups}
                  {@const rowSpan = volunteers.length > 0 ? volunteers.length + 1 : 2}

                  {#if volunteers.length > 0}
                    {#each volunteers as signup, index (signup.id)}
                      <tr class="volunteer-row">
                        {#if index === 0}
                          <td class="position-cell" rowspan={rowSpan}>
                            <div class="role-name">{role.name}</div>
                            <div class="role-meta">
                              <span>{formatShift(role)}</span>
                              <span class="capacity">{role.positions_filled}/{role.positions_total} filled</span>
                            </div>
                          </td>
                        {/if}
                        {#if (editingStates[role.id] && editingStates[role.id][signup.id])}
                          {@const editForm = editForms[role.id][signup.id]}
                          <td>
                            <input
                              type="text"
                              value={editForm.first_name}
                              on:input={(event) => updateEditForm(role.id, signup.id, 'first_name', event.target.value)}
                              aria-label={`Edit first name for ${signup.volunteer?.email || ''}`}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              value={editForm.last_name}
                              on:input={(event) => updateEditForm(role.id, signup.id, 'last_name', event.target.value)}
                              aria-label={`Edit last name for ${signup.volunteer?.email || ''}`}
                            />
                          </td>
                          <td>
                            <input
                              type="email"
                              value={editForm.email}
                              on:input={(event) => updateEditForm(role.id, signup.id, 'email', event.target.value)}
                              aria-label={`Edit email for ${signup.volunteer?.email || ''}`}
                            />
                          </td>
                          <td>
                            <input
                              type="tel"
                              value={editForm.phone}
                              on:input={(event) => updateEditForm(role.id, signup.id, 'phone', event.target.value)}
                              aria-label={`Edit phone for ${signup.volunteer?.email || ''}`}
                            />
                          </td>
                          <td class="actions-cell actions-editing">
                            <button class="btn btn-sm" on:click={() => saveEditedVolunteer(role, signup)}>Save</button>
                            <button class="btn btn-secondary btn-sm" on:click={() => cancelEditing(role.id, signup.id)}>Cancel</button>
                          </td>
                        {:else}
                          <td>{signup.volunteer?.first_name || '—'}</td>
                          <td>{signup.volunteer?.last_name || '—'}</td>
                          <td>
                            {#if signup.volunteer?.email}
                              <a href="mailto:{signup.volunteer.email}">{signup.volunteer.email}</a>
                            {:else}
                              —
                            {/if}
                          </td>
                          <td>{signup.phone || signup.volunteer?.phone || '—'}</td>
                          <td class="actions-cell">
                            <button class="btn btn-secondary btn-sm" on:click={() => startEditing(role.id, signup)}>Edit</button>
                            <button class="btn btn-danger btn-sm" on:click={() => deleteVolunteerFromRole(role, signup)}>Delete</button>
                          </td>
                        {/if}
                      </tr>
                    {/each}
                  {:else}
                    <tr class="volunteer-row empty">
                      <td class="position-cell" rowspan="2">
                        <div class="role-name">{role.name}</div>
                        <div class="role-meta">
                          <span>{formatShift(role)}</span>
                          <span class="capacity">0/{role.positions_total} filled</span>
                        </div>
                      </td>
                      <td class="no-volunteers" colspan="4">No volunteers yet</td>
                      <td class="actions-cell">
                        <span class="muted">—</span>
                      </td>
                    </tr>
                  {/if}

                  {@const form = volunteerForms[role.id] || { first_name: '', last_name: '', email: '', phone: '' }}
                  {@const state = addStates[role.id] || { loading: false, error: '', success: '' }}

                  <tr class="add-row">
                    <td>
                      <input
                        type="text"
                        placeholder="First name"
                        value={form.first_name}
                        on:input={(event) => updateVolunteerForm(role.id, 'first_name', event.target.value)}
                        on:keydown={(event) => handleAddKeydown(event, role)}
                        aria-label={`First name for ${role.name}`}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="Last name"
                        value={form.last_name}
                        on:input={(event) => updateVolunteerForm(role.id, 'last_name', event.target.value)}
                        on:keydown={(event) => handleAddKeydown(event, role)}
                        aria-label={`Last name for ${role.name}`}
                      />
                    </td>
                    <td>
                      <input
                        type="email"
                        placeholder="Email address"
                        value={form.email}
                        on:input={(event) => updateVolunteerForm(role.id, 'email', event.target.value)}
                        on:keydown={(event) => handleAddKeydown(event, role)}
                        aria-label={`Email for ${role.name}`}
                      />
                    </td>
                    <td>
                      <input
                        type="tel"
                        placeholder="Phone (optional)"
                        value={form.phone}
                        on:input={(event) => updateVolunteerForm(role.id, 'phone', event.target.value)}
                        on:keydown={(event) => handleAddKeydown(event, role)}
                        aria-label={`Phone for ${role.name}`}
                      />
                    </td>
                    <td class="actions-cell">
                      <button
                        class="btn btn-primary btn-sm"
                        on:click={() => addVolunteerToRole(role)}
                        disabled={state.loading}
                      >
                        {state.loading ? 'Adding...' : 'Add'}
                      </button>
                    </td>
                  </tr>

                  {#if suggestionLoading[role.id]}
                    <tr class="suggestions-row loading">
                      <td colspan="5">Searching existing volunteers…</td>
                      <td class="actions-cell"><span class="muted">—</span></td>
                    </tr>
                  {:else if volunteerSuggestions[role.id]?.length}
                    <tr class="suggestions-row">
                      <td colspan="5">
                        <div class="suggestions-intro">Select an existing volunteer:</div>
                        <div class="suggestions-list">
                          {#each volunteerSuggestions[role.id] as profile (profile.id)}
                            <button type="button" class="suggestion-chip" on:click={() => applyVolunteerSuggestion(role.id, profile)}>
                              <span class="name">{profile.first_name || 'No'} {profile.last_name || 'Name'}</span>
                              <span class="email">{profile.email}</span>
                              {#if profile.phone}
                                <span class="phone">{profile.phone}</span>
                              {/if}
                            </button>
                          {/each}
                        </div>
                      </td>
                      <td class="actions-cell"><span class="muted">Pick existing</span></td>
                    </tr>
                  {/if}

                  {#if state.error}
                    <tr class="message-row error">
                      <td colspan="4">{state.error}</td>
                      <td class="actions-cell"><span class="muted">—</span></td>
                    </tr>
                  {/if}

                  {#if state.success}
                    <tr class="message-row success">
                      <td colspan="4">{state.success}</td>
                      <td class="actions-cell"><span class="muted">—</span></td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
            </table>
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

  .domains-container {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .domain-section {
    background: white;
    border-radius: 14px;
    border: 1px solid #dee2e6;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);
    overflow: hidden;
  }

  .domain-header {
    background: #f4f8ff;
    padding: 1.1rem 1.5rem;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .domain-header .domain-info {
    flex-grow: 1;
  }

  .domain-header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: #1a1a1a;
  }

  .domain-header p {
    margin: 0.4rem 0 0;
    color: #495057;
    font-size: 0.95rem;
  }

  .domain-header .domain-actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .share-link-btn {
    padding: 0.5rem 1rem;
    border: 1px solid #007bff;
    border-radius: 8px;
    background: white;
    color: #007bff;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }

  .share-link-btn:hover:not(:disabled) {
    background: #f0f4ff;
    border-color: #0056b3;
    color: #0056b3;
  }

  .share-link-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .share-message {
    font-size: 0.85rem;
    color: #007bff;
    font-weight: 600;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .volunteer-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 960px;
  }

  .volunteer-table th,
  .volunteer-table td {
    border: 1px solid #dee2e6;
    padding: 0.75rem 0.9rem;
    text-align: left;
    vertical-align: top;
    font-size: 0.95rem;
  }

  .volunteer-table th {
    background: #e9ecef;
    font-weight: 600;
    color: #495057;
    white-space: nowrap;
  }

  .position-col {
    width: 240px;
  }

  .actions-col {
    width: 160px;
    text-align: center;
  }

  .position-cell {
    background: #fffce8;
  }

  .position-cell .role-name {
    margin: 0 0 0.35rem 0;
    font-weight: 600;
    color: #1a1a1a;
  }

  .position-cell .role-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #6c757d;
  }

  .position-cell .capacity {
    font-weight: 600;
    color: #495057;
  }

  .volunteer-row:nth-child(even) td:not(.position-cell):not(.notes-cell) {
    background: #fafbff;
  }

  .volunteer-row.empty td {
    background: #fff9e5;
  }

  .no-volunteers {
    text-align: center;
    color: #6c757d;
    font-style: italic;
    font-size: 0.9rem;
  }

  .notes-cell {
    background: #f8f9fa;
    color: #495057;
    min-width: 200px;
    font-size: 0.9rem;
  }

  .actions-cell {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.4rem;
  }

  .actions-cell .muted {
    color: #adb5bd;
    font-size: 0.85rem;
  }

  .add-row td {
    background: #f5f9ff;
    vertical-align: middle;
  }

  .add-row .add-row-content {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
  }

  .add-row input {
    width: 160px;
    padding: 0.45rem 0.6rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 0.95rem;
  }

  .add-row input[type="email"] {
    width: 220px;
  }

  .add-row input[type="tel"] {
    width: 180px;
  }

  .notes-cell.muted {
    color: #adb5bd;
    font-style: italic;
  }

  .suggestions-row td {
    background: #fdfcff;
    border-top: none;
  }

  .suggestions-row.loading td {
    color: #6c757d;
    font-style: italic;
  }

  .suggestions-intro {
    font-size: 0.85rem;
    color: #6c757d;
    margin-bottom: 0.5rem;
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
    background: white;
    cursor: pointer;
    font-size: 0.85rem;
    min-width: 180px;
    transition: border 0.2s, box-shadow 0.2s, transform 0.2s;
  }

  .suggestion-chip:hover {
    border-color: #007bff;
    box-shadow: 0 4px 12px rgba(0, 123, 255, 0.12);
    transform: translateY(-1px);
  }

  .suggestion-chip .name {
    font-weight: 600;
    color: #1a1a1a;
  }

  .suggestion-chip .email {
    color: #007bff;
  }

  .suggestion-chip .phone {
    color: #6c757d;
    font-size: 0.8rem;
  }

  .muted {
    color: #adb5bd;
    font-size: 0.85rem;
  }

  .btn-sm {
    padding: 0.45rem 0.9rem;
    font-size: 0.9rem;
  }

  .message-row td {
    border-top: none;
    font-size: 0.9rem;
  }

  .message-row.error td {
    background: #fdecea;
    color: #b02a37;
    font-weight: 500;
  }

  .message-row.success td {
    background: #e6f4ea;
    color: #1d7530;
    font-weight: 500;
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
    .domain-section {
      border-radius: 12px;
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
  }
</style>

