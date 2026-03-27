<script>
import { onMount } from 'svelte';
import { roles } from '../../lib/stores/roles';
import { domains } from '../../lib/stores/domains';
import { affiliations } from '../../lib/stores/affiliations';
import { auth } from '../../lib/stores/auth';
import { supabase } from '../../lib/supabaseClient';
import { sendWelcomeEmail } from '../../lib/volunteerSignup';
import { notifySlackSignup } from '../../lib/notifySlackSignup';
import { getEdgeInvokeErrorMessage } from '../../lib/edgeFunctionError';
import { push } from 'svelte-spa-router';
import RoleForm from '../../lib/components/RoleForm.svelte';
import BulkUpload from '../../lib/components/BulkUpload.svelte';
import { format } from 'date-fns';
import { flexibleSentinel, isFlexibleTime } from '../../lib/utils/timeDisplay';

  export let params = {};

  let loading = true;
  let error = '';
  let showForm = false;
  let showBulkUpload = false;
  let editingRole = null;
  let submitting = false;
  let expandedRoles = new Set(); // Track which roles are expanded
  let roleVolunteers = {}; // Store volunteers for each role
  let showAllVolunteers = false; // Track if all volunteers are shown
  let showDomainLeaderModal = false;
  let selectedDomain = null;
  let availableLeaders = [];
  let selectedLeaderId = '';
  let loadingLeaders = false;
  let assigningLeader = false;
  let domainModalError = '';
  let groupedRoles = [];
  let leaderFormValues = {};
  let creatingLeaderFor = null;
  let leaderAddSuccess = null;
  let leaderAddSuccessTimeout = null;
  let leaderSuggestions = {};
  let leaderSuggestionLoading = {};
  let leaderSuggestionTimers = {};
  let pendingDomainForNewLeader = null;
  let showAddVolunteerModal = false;
  let addVolunteerForm = {
    email: '',
    first_name: '',
    last_name: '',
    phone: ''
  };
  let addingVolunteer = false;
  let addVolunteerError = '';
  let addVolunteerSuggestions = [];
  let addVolunteerSuggestionLoading = false;
  let addVolunteerSuggestionTimer = null;
  let defaultDomainId = null;
  let returnToPath = '';
  let returnDomainId = '';
  let emailModalGroup = null;
  let emailSubject = '';
  let emailBody = '';
  let sendingEmail = false;
  let emailError = '';
  let emailSuccess = '';
  let domainVolunteers = [];
  let loadingDomainVolunteers = false;
  let inlineVolunteerForms = {};
  let inlineAddStates = {};
  let inlineVolunteerSuggestions = {};
  let inlineSuggestionLoading = {};
  let inlineSuggestionTimers = {};

  onMount(async () => {
    if (!$auth.isAdmin) {
      push('/volunteer');
      return;
    }

    const hash = window.location.hash || '';
    const queryIndex = hash.indexOf('?');
    if (queryIndex !== -1) {
      const queryString = hash.slice(queryIndex + 1);
      const searchParams = new URLSearchParams(queryString);
      const domainParam = searchParams.get('domainId');
      defaultDomainId = domainParam && domainParam !== 'null' ? domainParam : null;
      const returnParam = searchParams.get('returnTo');
      returnToPath = returnParam ? returnParam : '';
      const returnDomainParam = searchParams.get('returnDomainId');
      returnDomainId = returnDomainParam && returnDomainParam !== 'null' ? returnDomainParam : '';
    } else {
      defaultDomainId = null;
      returnToPath = '';
      returnDomainId = '';
    }

    if (params.id === 'new') {
      showForm = true;
      loading = false;
      try {
        await domains.fetchDomains();
      } catch (err) {
        console.error('Failed to load domains:', err);
      }
    } else if (params.id) {
      try {
        const [roleData] = await Promise.all([
          roles.fetchRole(params.id),
          domains.fetchDomains()
        ]);
        editingRole = roleData;
        showForm = true;
      } catch (err) {
        error = err.message;
      } finally {
        loading = false;
      }
    } else {
      try {
        await Promise.all([roles.fetchRoles(), domains.fetchDomains()]);
        affiliations.fetchAffiliations().catch(() => {});
      } catch (err) {
        error = err.message;
      } finally {
        loading = false;
      }
    }
  });

  async function toggleRoleExpansion(roleId) {
    if (expandedRoles.has(roleId)) {
      // Collapse - remove from set
      expandedRoles.delete(roleId);
      expandedRoles = new Set(expandedRoles); // Trigger reactivity
    } else {
      // Expand - add to set and fetch volunteers if not already loaded
      expandedRoles.add(roleId);
      expandedRoles = new Set(expandedRoles); // Trigger reactivity
      
      if (!roleVolunteers[roleId]) {
        await fetchRoleVolunteers(roleId);
      }
    }
  }

  async function fetchRoleVolunteers(roleId) {
    try {
      const { data, error: fetchError } = await supabase
        .from('signups')
        .select(`
          id,
          signed_up_at,
          phone,
          volunteer:profiles!volunteer_id(
            id,
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .eq('role_id', roleId)
        .eq('status', 'confirmed')
        .order('signed_up_at', { ascending: true });

      if (fetchError) throw fetchError;

      roleVolunteers[roleId] = data || [];
      roleVolunteers = { ...roleVolunteers }; // Trigger reactivity
    } catch (err) {
      console.error('Error fetching volunteers:', err);
      error = 'Failed to load volunteers: ' + err.message;
    }
  }

  function emptyInlineVolunteerForm() {
    return {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      team_club_affiliation_id: ''
    };
  }

  function emptyInlineAddState() {
    return {
      loading: false,
      error: '',
      success: ''
    };
  }

  function updateInlineVolunteerForm(roleId, field, value) {
    const existing = inlineVolunteerForms[roleId] || emptyInlineVolunteerForm();
    const updatedForm = { ...existing, [field]: value };
    inlineVolunteerForms = {
      ...inlineVolunteerForms,
      [roleId]: updatedForm
    };
    scheduleInlineVolunteerSuggestions(roleId, updatedForm);
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function scheduleInlineVolunteerSuggestions(roleId, formSnapshot) {
    if (inlineSuggestionTimers[roleId]) clearTimeout(inlineSuggestionTimers[roleId]);
    const form = formSnapshot ?? inlineVolunteerForms[roleId] ?? emptyInlineVolunteerForm();
    const email = (form.email || '').trim();
    const first = (form.first_name || '').trim();
    const last = (form.last_name || '').trim();
    if (!email && first.length < 2 && last.length < 2) {
      inlineVolunteerSuggestions = { ...inlineVolunteerSuggestions, [roleId]: [] };
      inlineSuggestionLoading = { ...inlineSuggestionLoading, [roleId]: false };
      return;
    }
    inlineSuggestionLoading = { ...inlineSuggestionLoading, [roleId]: true };
    inlineSuggestionTimers[roleId] = setTimeout(() => fetchInlineVolunteerSuggestions(roleId, formSnapshot), 300);
  }

  async function fetchInlineVolunteerSuggestions(roleId, formSnapshot) {
    inlineSuggestionTimers[roleId] = null;
    const form = formSnapshot ?? inlineVolunteerForms[roleId] ?? emptyInlineVolunteerForm();
    try {
      const email = (form.email || '').trim();
      const first = (form.first_name || '').trim().replace(/[,%]/g, '');
      const last = (form.last_name || '').trim().replace(/[,%]/g, '');

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
          filters.push(`last_name.ilike.%${first}%`);
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
      for (const profile of profiles) byEmail.set((profile.email || '').toLowerCase(), profile);
      for (const contact of contacts) {
        const key = (contact.email || '').toLowerCase();
        if (!byEmail.has(key)) byEmail.set(key, contact);
      }

      inlineVolunteerSuggestions = {
        ...inlineVolunteerSuggestions,
        [roleId]: Array.from(byEmail.values()).slice(0, 8)
      };
    } catch (err) {
      console.error('Inline volunteer suggestion lookup error:', err);
      inlineVolunteerSuggestions = { ...inlineVolunteerSuggestions, [roleId]: [] };
    } finally {
      inlineSuggestionLoading = { ...inlineSuggestionLoading, [roleId]: false };
    }
  }

  function applyInlineVolunteerSuggestion(roleId, person) {
    inlineVolunteerForms = {
      ...inlineVolunteerForms,
      [roleId]: {
        ...emptyInlineVolunteerForm(),
        first_name: person.first_name || '',
        last_name: person.last_name || '',
        email: person.email || '',
        phone: person.phone || ''
      }
    };
    inlineVolunteerSuggestions = { ...inlineVolunteerSuggestions, [roleId]: [] };
    inlineSuggestionLoading = { ...inlineSuggestionLoading, [roleId]: false };
  }

  function clearInlineRoleMessage(roleId, type = 'success') {
    setTimeout(() => {
      const existing = inlineAddStates[roleId];
      if (!existing) return;
      inlineAddStates = {
        ...inlineAddStates,
        [roleId]: {
          ...existing,
          [type]: ''
        }
      };
    }, 4000);
  }

  function handleInlineAddKeydown(event, role) {
    if (event.key === 'Enter') {
      event.preventDefault();
      addVolunteerToExpandedRole(role);
    }
  }

  async function addVolunteerToExpandedRole(role) {
    const roleId = role.id;
    const form = inlineVolunteerForms[roleId] || emptyInlineVolunteerForm();
    const firstName = form.first_name.trim();
    const lastName = form.last_name.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const affiliationId = (form.team_club_affiliation_id || '').trim();
    const isRoleFull = Number(role.positions_filled || 0) >= Number(role.positions_total || 0);

    if (isRoleFull) {
      inlineAddStates = {
        ...inlineAddStates,
        [roleId]: { loading: false, error: 'This role is already full.', success: '' }
      };
      return;
    }

    if (!firstName || !lastName) {
      inlineAddStates = {
        ...inlineAddStates,
        [roleId]: { loading: false, error: 'First and last name are required.', success: '' }
      };
      return;
    }

    if (!email || !validateEmail(email)) {
      inlineAddStates = {
        ...inlineAddStates,
        [roleId]: { loading: false, error: 'Please enter a valid email address.', success: '' }
      };
      return;
    }

    if (!affiliationId) {
      inlineAddStates = {
        ...inlineAddStates,
        [roleId]: { loading: false, error: 'Please select a team or club affiliation.', success: '' }
      };
      return;
    }

    inlineAddStates = {
      ...inlineAddStates,
      [roleId]: { loading: true, error: '', success: '' }
    };

    try {
      const body = {
        role_id: roleId,
        email,
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        team_club_affiliation_id: affiliationId
      };

      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-volunteer-and-signup', { body });
      if (fnError) throw fnError;
      if (fnData?.error) {
        throw new Error(typeof fnData.error === 'string' ? fnData.error : fnData.error?.message || 'Failed to create volunteer');
      }

      const volunteerId = fnData?.volunteerId;
      if (!volunteerId) throw new Error('Volunteer creation failed.');

      notifySlackSignup({
        role_id: roleId,
        volunteer_id: volunteerId,
        volunteer_name: [firstName, lastName].filter(Boolean).join(' ').trim() || undefined,
        volunteer_email: email
      }).catch(() => {});

      await sendWelcomeEmail({
        to: email,
        first_name: firstName,
        promptWaiverAndEmergencyContact: true
      });

      inlineAddStates = {
        ...inlineAddStates,
        [roleId]: {
          loading: false,
          error: '',
          success: `Added ${firstName} ${lastName} and sent a welcome email.`
        }
      };

      inlineVolunteerForms = {
        ...inlineVolunteerForms,
        [roleId]: emptyInlineVolunteerForm()
      };
      inlineVolunteerSuggestions = { ...inlineVolunteerSuggestions, [roleId]: [] };
      inlineSuggestionLoading = { ...inlineSuggestionLoading, [roleId]: false };

      await Promise.all([
        roles.fetchRoles(),
        fetchRoleVolunteers(roleId)
      ]);
      clearInlineRoleMessage(roleId, 'success');
    } catch (err) {
      console.error('Inline add volunteer error:', err);
      const friendlyMessage = err?.message?.includes('non-2xx')
        ? 'Your admin session is not active in this tab. Please refresh this page or sign in again, then retry.'
        : (err.message || 'Failed to add volunteer.');
      inlineAddStates = {
        ...inlineAddStates,
        [roleId]: {
          loading: false,
          error: friendlyMessage,
          success: ''
        }
      };
      clearInlineRoleMessage(roleId, 'error');
    }
  }

  async function fetchVolunteersForRoleIds(roleIds) {
    if (!roleIds?.length) return [];
    const { data, error: fetchError } = await supabase
      .from('signups')
      .select(`
        volunteer:profiles!volunteer_id(id, first_name, last_name, email)
      `)
      .in('role_id', roleIds)
      .eq('status', 'confirmed');
    if (fetchError) throw fetchError;
    const byId = new Map();
    (data || []).forEach((row) => {
      const v = Array.isArray(row.volunteer) ? row.volunteer[0] : row.volunteer;
      if (v && v.id && !byId.has(v.id)) byId.set(v.id, v);
    });
    return Array.from(byId.values());
  }

  async function openEmailModal(group) {
    emailModalGroup = group;
    emailSubject = '';
    emailBody = '';
    emailError = '';
    emailSuccess = '';
    domainVolunteers = [];
    loadingDomainVolunteers = true;
    try {
      const roleIds = (group.roles || []).map((r) => r.id);
      domainVolunteers = await fetchVolunteersForRoleIds(roleIds);
    } catch (err) {
      console.error('Failed to load domain volunteers:', err);
      emailError = err.message || 'Failed to load volunteers.';
    } finally {
      loadingDomainVolunteers = false;
    }
  }

  function closeEmailModal() {
    emailModalGroup = null;
    emailSubject = '';
    emailBody = '';
    emailError = '';
    emailSuccess = '';
    domainVolunteers = [];
  }

  async function sendEmailToDomainVolunteers() {
    if (!emailSubject.trim() || !emailBody.trim()) {
      emailError = 'Please enter both subject and message';
      return;
    }
    if (domainVolunteers.length === 0) {
      emailError = 'No volunteers to email in this domain.';
      return;
    }
    sendingEmail = true;
    emailError = '';
    emailSuccess = '';
    try {
      const emailPromises = domainVolunteers.map((volunteer) =>
        supabase.functions.invoke('send-email', {
          body: {
            to: volunteer.email,
            subject: emailSubject,
            html: `
              <h2>${emailSubject}</h2>
              <p>Hello ${volunteer.first_name || 'there'},</p>
              ${emailBody.split('\n').map((line) => `<p>${line}</p>`).join('')}
              <hr style="margin: 2rem 0; border: none; border-top: 1px solid #dee2e6;">
              <p style="color: #6c757d; font-size: 0.9rem;">
                This message was sent by an administrator: ${$auth.profile?.first_name || ''} ${$auth.profile?.last_name || ''}
                ${$auth.profile?.email ? ` (${$auth.profile.email})` : ''}
              </p>
            `
          }
        })
      );
      await Promise.all(emailPromises);
      emailSuccess = `Email sent to ${domainVolunteers.length} volunteer${domainVolunteers.length !== 1 ? 's' : ''}.`;
      setTimeout(() => {
        closeEmailModal();
      }, 2500);
    } catch (err) {
      console.error('Email error:', err);
      emailError = err.message || 'Failed to send email.';
    } finally {
      sendingEmail = false;
    }
  }

  async function toggleAllVolunteers() {
    showAllVolunteers = !showAllVolunteers;
    
    if (showAllVolunteers) {
      // Expand all roles
      const allRoleIds = $roles.map(r => r.id);
      expandedRoles = new Set(allRoleIds);
      
      // Fetch volunteers for all roles that haven't been loaded yet
      const fetchPromises = allRoleIds
        .filter(id => !roleVolunteers[id])
        .map(id => fetchRoleVolunteers(id));
      
      await Promise.all(fetchPromises);
    } else {
      // Collapse all roles
      expandedRoles = new Set();
    }
  }

  function navigateAfterForm() {
    if (returnToPath) {
      let target = returnToPath;
      if (returnDomainId) {
        const separator = target.includes('?') ? '&' : '?';
        target = `${target}${separator}manageDomain=${returnDomainId}`;
      }
      push(target);
    } else {
      push('/admin/roles');
    }
  }

  function normalizeRoleFormData(formData) {
    const sanitizeSelect = (value) => {
      if (value === undefined || value === null || value === '' || value === 'null') {
        return null;
      }
      return value;
    };

    return {
      ...formData,
      positions_total: Number(formData.positions_total) || 0,
      domain_id: sanitizeSelect(formData.domain_id),
      leader_id: sanitizeSelect(formData.leader_id),
      critical: !!formData.critical
    };
  }

  async function handleSubmit(event) {
    const rawFormData = event.detail;
    const formData = normalizeRoleFormData(rawFormData);
    submitting = true;
    error = '';

    try {
      if (editingRole) {
        await roles.updateRole(editingRole.id, {
          ...formData,
          created_by: $auth.user.id
        });
      } else {
        await roles.createRole({
          ...formData,
          created_by: $auth.user.id
        });
      }

      navigateAfterForm();
    } catch (err) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }

  function handleCancel() {
    navigateAfterForm();
  }

  function showBulkUploadDialog() {
    showBulkUpload = true;
    showForm = false;
  }

  async function handleBulkImport(event) {
    const rolesToImport = event.detail.roles;
    submitting = true;
    error = '';

    try {
      let successCount = 0;
      let failCount = 0;
      const errors = [];
      /** Cache domain name -> id so we create each new domain only once per import */
      const domainNameToId = new Map();

      for (const roleData of rolesToImport) {
        try {
          // Resolve domain_id from domain_name: use cache, existing, or create missing
          let domainId = null;
          if (roleData.domain_name) {
            const name = String(roleData.domain_name).trim();
            if (domainNameToId.has(name)) {
              domainId = domainNameToId.get(name);
            } else {
              const { data: domainData } = await supabase
                .from('volunteer_leader_domains')
                .select('id')
                .eq('name', name)
                .maybeSingle();

              if (domainData) {
                domainId = domainData.id;
                domainNameToId.set(name, domainId);
              } else {
                const created = await domains.createDomain({ name, description: null, leader_id: null });
                domainId = created.id;
                domainNameToId.set(name, domainId);
              }
            }
          }

          // Look up leader_id from email if provided (only if no domain)
          let leaderId = null;
          if (roleData.leader_email && !domainId) {
            const { data: leaderData } = await supabase
              .from('profiles')
              .select('id')
              .eq('email', roleData.leader_email)
              .eq('role', 'volunteer_leader')
              .single();
            
            if (leaderData) {
              leaderId = leaderData.id;
            } else {
              // Leader not found - warn but continue
              errors.push(`${roleData.name}: Leader "${roleData.leader_email}" not found - role created without leader`);
            }
          }

          // Remove non-column fields from data (leader_email, domain_name are resolved; critical stays)
          const { leader_email, domain_name, ...roleDataClean } = roleData;
          const sentinel = flexibleSentinel();
          const startTime = roleDataClean.start_time === 'flexible' ? sentinel.start_time : roleDataClean.start_time;
          const endTime = roleDataClean.end_time === 'flexible' ? sentinel.end_time : roleDataClean.end_time;

          const { critical = false, ...rest } = roleDataClean;
          await roles.createRole({
            ...rest,
            start_time: startTime,
            end_time: endTime,
            domain_id: domainId,
            leader_id: leaderId,
            critical: !!critical,
            created_by: $auth.user.id
          });
          successCount++;
        } catch (err) {
          failCount++;
          errors.push(`${roleData.name}: ${err.message}`);
        }
      }

      if (successCount > 0) {
        alert(`Successfully imported ${successCount} roles!${failCount > 0 ? `\n\n${failCount} roles failed.` : ''}`);
      }

      if (errors.length > 0) {
        error = `Import errors:\n${errors.join('\n')}`;
      }

      showBulkUpload = false;
      
      await Promise.all([roles.fetchRoles(), domains.fetchDomains()]);
    } catch (err) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }

  function handleBulkCancel() {
    showBulkUpload = false;
  }

  async function handleDelete(roleId) {
    if (!confirm('Are you sure you want to delete this role? This action cannot be undone.')) {
      return;
    }

    try {
      await roles.deleteRole(roleId);
      if (editingRole?.id === roleId) {
        editingRole = null;
        showForm = false;
        push('/admin/roles');
      }
    } catch (err) {
      error = err.message;
    }
  }

  async function handleDuplicate(roleId) {
    try {
      const newRole = await roles.duplicateRole(roleId);
      if (editingRole?.id === roleId) {
        editingRole = newRole;
        push(`/admin/roles/${newRole.id}`);
      }
    } catch (err) {
      error = err.message;
    }
  }

  async function toggleFeatured(role) {
    try {
      await roles.updateRole(role.id, { featured: !role.featured });
    } catch (err) {
      error = err.message;
    }
  }

  async function toggleCritical(role) {
    try {
      await roles.updateRole(role.id, { critical: !role.critical });
    } catch (err) {
      error = err.message;
    }
  }

  function exportToCSV() {
    const headers = ['Role Name', 'Event Date', 'Start Time', 'End Time', 'Location', 'Total Positions', 'Filled Positions', 'Fill %'];
    const rows = $roles.map(role => {
      const start = isFlexibleTime(role) ? 'Flexible' : (role.start_time || '');
      const end = isFlexibleTime(role) ? 'Flexible' : (role.end_time || '');
      return [
        role.name,
        format(new Date(role.event_date), 'yyyy-MM-dd'),
        start,
        end,
        role.location || '',
        role.positions_total,
        role.positions_filled,
        Math.round((role.positions_filled / role.positions_total) * 100)
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `volunteer-roles-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadLeaderOptions() {
    loadingLeaders = true;
    try {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true });

      if (profilesError) throw profilesError;

      availableLeaders = data || [];
    } catch (err) {
      console.error('Error loading users:', err);
      domainModalError = 'Failed to load users: ' + err.message;
    } finally {
      loadingLeaders = false;
    }
  }

  async function openDomainLeaderModal(domain) {
    if (!domain) return;

    const fullDomain = domain.id ? ($domains.find(d => d.id === domain.id) || domain) : domain;

    selectedDomain = fullDomain;
    selectedLeaderId = fullDomain.leader?.id || '';
    domainModalError = '';
    showDomainLeaderModal = true;

    if (availableLeaders.length === 0) {
      await loadLeaderOptions();
    }
  }

  function closeDomainLeaderModal() {
    showDomainLeaderModal = false;
    selectedDomain = null;
    selectedLeaderId = '';
    assigningLeader = false;
    domainModalError = '';
    pendingDomainForNewLeader = null;
  }

  async function assignDomainLeader() {
    if (!selectedDomain || !selectedLeaderId) {
      domainModalError = 'Please select a leader.';
      return;
    }

    assigningLeader = true;
    domainModalError = '';

    try {
      await updateDomainLeader(selectedDomain.id, selectedLeaderId);
      closeDomainLeaderModal();
    } catch (err) {
      console.error('Error assigning leader:', err);
      domainModalError = 'Failed to assign leader: ' + err.message;
    } finally {
      assigningLeader = false;
    }
  }

  function handleLeaderSelectChange(event) {
    const value = /** @type {HTMLSelectElement} */ (event.currentTarget).value;

    if (value === '__add_new__') {
      pendingDomainForNewLeader = selectedDomain;
      addVolunteerForm = {
        email: '',
        first_name: '',
        last_name: '',
        phone: ''
      };
      addVolunteerError = '';
      showAddVolunteerModal = true;
      selectedLeaderId = '';
      /** @type {HTMLSelectElement} */ (event.currentTarget).value = '';
      return;
    }

    selectedLeaderId = value;
  }

  function getUserDisplay(user) {
    if (!user) return 'Unnamed user';
    const parts = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    if (parts) {
      return user.email ? `${parts} (${user.email})` : parts;
    }
    return user.email || 'Unnamed user';
  }

  function groupRolesList(rolesList) {
    const domainMap = new Map();

    rolesList.forEach(role => {
      const domainId = role.domain?.id || 'no-domain';
      if (!domainMap.has(domainId)) {
        domainMap.set(domainId, {
          id: domainId,
          name: role.domain?.name || 'No Domain',
          leader: role.domain?.leader || null,
          domain: role.domain || null,
          roles: []
        });
      }

      domainMap.get(domainId).roles.push(role);
    });

    return Array.from(domainMap.values());
  }

  $: groupedRoles = groupRolesList($roles);

  function setLeaderForm(domainId, updates) {
    const existing = leaderFormValues[domainId] || {
      first_name: '',
      last_name: '',
      email: '',
      error: '',
      success: ''
    };

    leaderFormValues = {
      ...leaderFormValues,
      [domainId]: {
        ...existing,
        ...updates
      }
    };
  }

  function handleLeaderFormInput(domainId, field, value) {
    const existing = leaderFormValues[domainId] || {};
    const updatedForm = { ...existing, [field]: value };
    setLeaderForm(domainId, { [field]: value });
    scheduleLeaderSuggestions(domainId, updatedForm);
  }

  function scheduleLeaderSuggestions(domainId, formSnapshot) {
    if (leaderSuggestionTimers[domainId]) clearTimeout(leaderSuggestionTimers[domainId]);
    const form = formSnapshot ?? leaderFormValues[domainId] ?? {};
    const email = (form.email || '').trim();
    const first = (form.first_name || '').trim();
    const last = (form.last_name || '').trim();
    if (!email && first.length < 2 && last.length < 2) {
      leaderSuggestions = { ...leaderSuggestions, [domainId]: [] };
      leaderSuggestionLoading = { ...leaderSuggestionLoading, [domainId]: false };
      return;
    }
    leaderSuggestionLoading = { ...leaderSuggestionLoading, [domainId]: true };
    leaderSuggestionTimers[domainId] = setTimeout(() => fetchLeaderSuggestions(domainId, formSnapshot), 300);
  }

  async function fetchLeaderSuggestions(domainId, formSnapshot) {
    leaderSuggestionTimers[domainId] = null;
    const form = formSnapshot ?? leaderFormValues[domainId] ?? {};
    try {
      const email = (form.email || '').trim();
      const first = (form.first_name || '').trim().replace(/[,%]/g, '');
      const last = (form.last_name || '').trim().replace(/[,%]/g, '');

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
      leaderSuggestions = { ...leaderSuggestions, [domainId]: Array.from(byEmail.values()).slice(0, 8) };
    } catch (err) {
      console.error('Leader suggestions error:', err);
      leaderSuggestions = { ...leaderSuggestions, [domainId]: [] };
    } finally {
      leaderSuggestionLoading = { ...leaderSuggestionLoading, [domainId]: false };
    }
  }

  function applyLeaderSuggestion(domainId, person) {
    setLeaderForm(domainId, {
      first_name: person.first_name || '',
      last_name: person.last_name || '',
      email: person.email || '',
      phone: person.phone || (leaderFormValues[domainId] || {}).phone || ''
    });
    leaderSuggestions = { ...leaderSuggestions, [domainId]: [] };
  }

  async function createLeaderAccount({ first_name, last_name, email, phone = null }) {
    // Check if user already exists (signUp returns fake user when email exists + confirmations on)
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      await supabase
        .from('profiles')
        .update({
          first_name,
          last_name,
          phone,
          role: 'volunteer_leader'
        })
        .eq('id', existingProfile.id);
      return existingProfile.id;
    }

    const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password: tempPassword,
      options: {
        data: {
          first_name,
          last_name,
          role: 'volunteer_leader'
        },
        emailRedirectTo: `${window.location.origin}/#/volunteer`
      }
    });

    if (authError) throw authError;
    if (!authData?.user?.id) {
      throw new Error('User creation failed.');
    }

    const userId = authData.user.id;

    // Wait for handle_new_user trigger to create profile
    let profileReady = false;
    for (let i = 0; i < 10; i++) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      if (profile) {
        profileReady = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!profileReady) {
      throw new Error('Profile creation is taking longer than expected. Please try again in a moment.');
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        first_name,
        last_name,
        phone,
        role: 'volunteer_leader'
      })
      .eq('id', userId);

    if (profileError) {
      console.warn('Profile update warning:', profileError.message);
    }

    return userId;
  }

  async function sendLeaderInviteEmail({ email, first_name, domainName }) {
    try {
      const loginUrl = `${window.location.origin}/#/auth/login`;

      await supabase.functions.invoke('send-email', {
        body: {
          to: email,
          subject: `You're now the volunteer leader for ${domainName}`,
          html: `
            <h2>Welcome aboard!</h2>
            <p>Hi ${first_name || 'there'},</p>
            <p>You've been added as the volunteer leader for <strong>${domainName}</strong>.</p>
            <p>Please follow these steps to finish setting up:</p>
            <ol>
              <li>Visit <a href="${loginUrl}">${loginUrl}</a> and sign in with this email address.</li>
              <li>Check your email for a sign-in link. No password needed.</li>
              <li>Complete any missing profile details and fill out the emergency contact form.</li>
              <li>Once finished, you'll see your Volunteer Leader dashboard with all the roles you manage.</li>
            </ol>
            <p>If you have any questions or need help getting started, just reply to this email.</p>
            <p>Thank you for leading our volunteers!</p>
          `
        }
      });
    } catch (err) {
      console.error('Failed to send leader invite email:', err);
      throw new Error('Leader assigned, but the notification email could not be sent. Please contact them manually.');
    }
  }

  async function updateDomainLeader(domainId, leaderId) {
    const { data, error: updateError } = await supabase
      .from('volunteer_leader_domains')
      .update({ leader_id: leaderId })
      .eq('id', domainId)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    if (!data) {
      throw new Error('Failed to assign leader — update returned no rows. You may need admin permissions.');
    }

    await Promise.all([roles.fetchRoles(), domains.fetchDomains()]);
  }

  function closeAddVolunteerModal() {
    showAddVolunteerModal = false;
    addingVolunteer = false;
    addVolunteerError = '';
    pendingDomainForNewLeader = null;
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
      console.error('Add leader suggestions error:', err);
      addVolunteerSuggestions = [];
    } finally {
      addVolunteerSuggestionLoading = false;
    }
  }

  function applyAddVolunteerSuggestion(person) {
    addVolunteerForm = {
      first_name: person.first_name || '',
      last_name: person.last_name || '',
      email: person.email || '',
      phone: person.phone || addVolunteerForm.phone
    };
    addVolunteerSuggestions = [];
  }

  async function createVolunteerLeader() {
    if (!pendingDomainForNewLeader) {
      addVolunteerError = 'No domain selected.';
      return;
    }

    if (!addVolunteerForm.email.trim() || !addVolunteerForm.first_name.trim() || !addVolunteerForm.last_name.trim()) {
      addVolunteerError = 'Email, first name, and last name are required.';
      return;
    }

    addingVolunteer = true;
    addVolunteerError = '';

    const domainId = pendingDomainForNewLeader.id;
    const domainName = pendingDomainForNewLeader.name;
    const newLeaderDetails = {
      first_name: addVolunteerForm.first_name.trim(),
      last_name: addVolunteerForm.last_name.trim(),
      email: addVolunteerForm.email.trim(),
      phone: addVolunteerForm.phone?.trim() || null
    };

    try {
      const { data, error } = await supabase.functions.invoke('create-leader', {
        body: {
          domainId,
          first_name: newLeaderDetails.first_name,
          last_name: newLeaderDetails.last_name,
          email: newLeaderDetails.email,
          phone: newLeaderDetails.phone
        }
      });
      if (error || data?.error) throw new Error(await getEdgeInvokeErrorMessage(data, error, 'Failed to create leader'));
      const userId = data?.userId;
      if (!userId) throw new Error('No user ID returned');

      await Promise.all([roles.fetchRoles(), domains.fetchDomains()]);

      availableLeaders = [...availableLeaders, {
        id: userId,
        ...newLeaderDetails
      }].sort((a, b) => {
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });

      selectedLeaderId = userId;

      showAddVolunteerModal = false;
      addVolunteerForm = {
        email: '',
        first_name: '',
        last_name: '',
        phone: ''
      };
      pendingDomainForNewLeader = null;

      alert(`✅ ${newLeaderDetails.first_name} ${newLeaderDetails.last_name} is now the volunteer leader for ${domainName}.`);

      sendLeaderInviteEmail({
        email: newLeaderDetails.email,
        first_name: newLeaderDetails.first_name,
        domainName
      }).then(() => {
        console.info(`Invite email sent to ${newLeaderDetails.email}`);
      }).catch(emailErr => {
        console.error('Leader invite email failed:', emailErr);
        alert(`Leader created, but we couldn't send the invite email automatically. Please contact ${newLeaderDetails.email} manually.`);
      });
    } catch (err) {
      console.error('Create volunteer leader error:', err);
      addVolunteerError = 'Failed to create volunteer: ' + err.message;
    } finally {
      addingVolunteer = false;
    }
  }

  async function handleInlineLeaderSubmit(domain) {
    const form = leaderFormValues[domain.id] || {};
    const firstName = form.first_name?.trim() || '';
    const lastName = form.last_name?.trim() || '';
    const email = form.email?.trim() || '';
    const phone = form.phone?.trim() || null;

    if (!firstName || !lastName || !email) {
      setLeaderForm(domain.id, { error: 'First name, last name, and email are required.' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setLeaderForm(domain.id, { error: 'Please enter a valid email address.' });
      return;
    }

    creatingLeaderFor = domain.id;
    setLeaderForm(domain.id, { error: '', success: '' });

    try {
      const { data, error } = await supabase.functions.invoke('create-leader', {
        body: { domainId: domain.id, first_name: firstName, last_name: lastName, email, phone }
      });
      if (error || data?.error) throw new Error(await getEdgeInvokeErrorMessage(data, error, 'Failed to create leader'));
      const userId = data?.userId;
      if (!userId) throw new Error('No user ID returned');

      await Promise.all([roles.fetchRoles(), domains.fetchDomains()]);

      availableLeaders = [...availableLeaders, {
        id: userId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: null
      }].sort((a, b) => {
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setLeaderForm(domain.id, {
        first_name: '',
        last_name: '',
        email: '',
        error: ''
      });

      sendLeaderInviteEmail({
        email,
        first_name: firstName,
        domainName: domain.name
      }).then(() => {
        console.info(`Invite email sent to ${email}`);
        leaderAddSuccess = { domainName: domain.name, leaderName: `${firstName} ${lastName}`.trim(), email };
        if (leaderAddSuccessTimeout) clearTimeout(leaderAddSuccessTimeout);
        leaderAddSuccessTimeout = setTimeout(() => {
          leaderAddSuccess = null;
          leaderAddSuccessTimeout = null;
        }, 6000);
      }).catch(emailErr => {
        console.error('Email invite error:', emailErr);
        leaderAddSuccess = { domainName: domain.name, leaderName: `${firstName} ${lastName}`.trim(), email, emailFailed: true };
        if (leaderAddSuccessTimeout) clearTimeout(leaderAddSuccessTimeout);
        leaderAddSuccessTimeout = setTimeout(() => {
          leaderAddSuccess = null;
          leaderAddSuccessTimeout = null;
        }, 8000);
      });
    } catch (err) {
      console.error('Inline leader creation error:', err);
      setLeaderForm(domain.id, { error: err.message || 'Failed to create leader.' });
    } finally {
      creatingLeaderFor = null;
    }
  }

  function handleLeaderFormKeydown(event, domain) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleInlineLeaderSubmit(domain);
    }
  }
</script>

<div class="roles-page">
  {#if showBulkUpload}
    <div class="form-container">
      <BulkUpload
        on:import={handleBulkImport}
        on:cancel={handleBulkCancel}
      />
    </div>
  {:else if showForm}
    <div class="form-container">
      <h1>{editingRole ? 'Edit Role' : 'Create New Role'}</h1>
      
      {#if error}
        <div class="alert alert-error">{error}</div>
      {/if}

      {#key editingRole?.id}
        <RoleForm
          role={editingRole}
          loading={submitting}
          on:submit={handleSubmit}
          on:cancel={handleCancel}
          defaultDomainId={defaultDomainId}
        />
      {/key}
      {#if editingRole}
        <div class="form-actions form-actions--edit-footer">
          <button
            type="button"
            class="btn btn-secondary"
            on:click={() => handleDuplicate(editingRole.id)}
            disabled={submitting}
          >
            Duplicate role
          </button>
          <button
            type="button"
            class="btn btn-danger"
            on:click={() => handleDelete(editingRole.id)}
            disabled={submitting}
          >
            Delete role
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <div class="header">
      <div>
        <h1>Volunteer Roles</h1>
        <p>Manage all volunteer opportunities</p>
      </div>
      
      <div class="header-actions">
        <button class="btn btn-secondary" on:click={toggleAllVolunteers}>
          {showAllVolunteers ? '📋 Hide All Volunteers' : '📋 Show All Volunteers'}
        </button>
        <button class="btn btn-secondary" on:click={exportToCSV}>
          Export CSV
        </button>
        <button class="btn btn-info" on:click={showBulkUploadDialog}>
          📤 Bulk Upload
        </button>
        <a href="#/admin/roles/new" class="btn btn-primary">+ Create Role</a>
      </div>
    </div>

    {#if error}
      <div class="alert alert-error">{error}</div>
    {/if}

    {#if loading}
      <div class="loading">Loading roles...</div>
    {:else if $roles.length === 0}
      <div class="empty">
        <h2>No roles yet</h2>
        <p>Create your first volunteer role to get started</p>
        <a href="#/admin/roles/new" class="btn btn-primary">Create Role</a>
      </div>
    {:else}
      <div class="roles-table">
        <section class="leaders-summary">
          <div class="leaders-summary-header">
            <div>
              <h2>Volunteer Leaders</h2>
              <p>Review domain assignments and contact information</p>
            </div>
          </div>

          {#if leaderAddSuccess}
            <div class="leader-add-success-banner" class:leader-add-success-banner--warn={leaderAddSuccess.emailFailed} role="status">
              <span>
                {#if leaderAddSuccess.emailFailed}
                  Leader added. Email could not be sent to {leaderAddSuccess.email}. Please contact them manually.
                {:else}
                  Email sent to {leaderAddSuccess.email} for {leaderAddSuccess.domainName}.
                {/if}
              </span>
              <button type="button" class="leader-add-success-dismiss" on:click={() => { leaderAddSuccess = null; if (leaderAddSuccessTimeout) clearTimeout(leaderAddSuccessTimeout); leaderAddSuccessTimeout = null; }} aria-label="Dismiss">×</button>
            </div>
          {/if}

          {#if $domains.length === 0}
            <div class="empty-state">No domains configured yet.</div>
          {:else}
            <div class="leaders-table-wrapper">
              <table class="leaders-table">
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Leader</th>
                    <th>Contact</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {#each $domains as domain (domain.id)}
                    {@const form = leaderFormValues[domain.id] || {
                      first_name: '',
                      last_name: '',
                      email: '',
                      error: '',
                      success: ''
                    }}
                    {@const isCreating = creatingLeaderFor === domain.id}
                    <tr>
                      <td>
                        <strong>{domain.name}</strong>
                      </td>
                      <td>
                        {#if domain.leader}
                          {domain.leader.first_name} {domain.leader.last_name}
                        {:else}
                          <div class="inline-leader-inputs">
                            <input
                              class="input-sm"
                              type="text"
                              placeholder="First name"
                              value={form.first_name}
                              on:input={(e) => handleLeaderFormInput(domain.id, 'first_name', /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                              on:keydown={(e) => handleLeaderFormKeydown(e, domain)}
                              disabled={isCreating}
                            />
                            <input
                              class="input-sm"
                              type="text"
                              placeholder="Last name"
                              value={form.last_name}
                              on:input={(e) => handleLeaderFormInput(domain.id, 'last_name', /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                              on:keydown={(e) => handleLeaderFormKeydown(e, domain)}
                              disabled={isCreating}
                            />
                          </div>
                          {#if leaderSuggestionLoading[domain.id]}
                            <div class="leader-suggestions leader-suggestions--loading">Searching…</div>
                          {:else if leaderSuggestions[domain.id]?.length}
                            <div class="leader-suggestions">
                              {#each leaderSuggestions[domain.id] as person (person.id)}
                                <button
                                  type="button"
                                  class="leader-suggestion-chip"
                                  on:click={() => applyLeaderSuggestion(domain.id, person)}
                                >
                                  <span class="name">{person.first_name || ''} {person.last_name || ''}</span>
                                  <span class="email">{person.email}</span>
                                  {#if person.source === 'contact'}
                                    <span class="badge">Past volunteer</span>
                                  {/if}
                                </button>
                              {/each}
                            </div>
                          {/if}
                        {/if}
                      </td>
                      <td>
                        {#if domain.leader}
                          <div class="leader-contact">
                            <a href="mailto:{domain.leader.email}">{domain.leader.email}</a>
                            {#if domain.leader.phone}
                              <div class="leader-phone">📱 {domain.leader.phone}</div>
                            {/if}
                          </div>
                        {:else}
                          <div class="inline-email-input">
                            <input
                              class="input-sm"
                              type="email"
                              placeholder="Email address"
                              value={form.email}
                              on:input={(e) => handleLeaderFormInput(domain.id, 'email', /** @type {HTMLInputElement} */ (e.currentTarget).value)}
                              on:keydown={(e) => handleLeaderFormKeydown(e, domain)}
                              disabled={isCreating}
                            />
                          </div>
                        {/if}
                      </td>
                      <td class="leader-actions">
                        {#if domain.leader}
                          <button
                            class="btn btn-sm btn-secondary"
                            type="button"
                            on:click={() => openDomainLeaderModal(domain)}
                          >
                            Change leader
                          </button>
                        {:else}
                          <div class="inline-actions">
                            <button
                              class="btn btn-sm btn-primary"
                              type="button"
                              on:click={() => handleInlineLeaderSubmit(domain)}
                              disabled={isCreating}
                            >
                              {isCreating ? 'Adding…' : 'Add'}
                            </button>
                            {#if form.error}
                              <div class="form-error-text">{form.error}</div>
                            {/if}
                          </div>
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </section>

        {#each groupedRoles as group (group.id)}
          <div class="domain-group">
            <div class="domain-header">
              <div class="domain-header-info">
                <h3>{group.name}</h3>
                {#if group.domain}
                  {#if group.leader}
                    <div class="domain-leader-text">Leader: {group.leader.first_name} {group.leader.last_name}</div>
                  {:else}
                    <div class="domain-leader-text no-leader">
                      Leader: —
                      <button
                        class="btn btn-sm btn-secondary add-leader-btn"
                        type="button"
                        on:click={() => openDomainLeaderModal(group.domain)}
                      >
                        Add leader
                      </button>
                    </div>
                  {/if}
                {:else}
                  <div class="domain-leader-text no-leader">No domain leader</div>
                {/if}
              </div>
              <div class="domain-header-actions">
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  on:click={() => openEmailModal(group)}
                  title="Send email to all volunteers in this domain"
                >
                  Email this domain's volunteers
                </button>
              </div>
            </div>

            <div class="roles-group-table">
              <table>
                <thead>
                  <tr>
                    <th class="th-featured" title="Show on homepage">Featured</th>
                    <th class="th-critical" title="Must-fill for event">Critical</th>
                    <th>Role Name</th>
                    <th>Volunteer Leader</th>
                    <th>Fill Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each group.roles as role (role.id)}
                    {@const fillPercent = Math.round((role.positions_filled / role.positions_total) * 100)}
                    {@const isExpanded = expandedRoles.has(role.id)}
                    {@const volunteers = roleVolunteers[role.id] || []}
                    {@const inlineForm = inlineVolunteerForms[role.id] || emptyInlineVolunteerForm()}
                    {@const inlineAddState = inlineAddStates[role.id] || emptyInlineAddState()}
                    {@const isRoleFull = Number(role.positions_filled || 0) >= Number(role.positions_total || 0)}

                    <tr>
                      <td class="td-featured">
                        <button
                          type="button"
                          class="featured-toggle {role.featured ? 'featured' : ''}"
                          title={role.featured ? 'Remove from homepage' : 'Show on homepage'}
                          on:click={() => toggleFeatured(role)}
                        >
                          ★
                        </button>
                      </td>
                      <td class="td-critical">
                        <button
                          type="button"
                          class="critical-toggle {role.critical ? 'critical' : ''}"
                          title={role.critical ? 'Mark as nice-to-have' : 'Mark as critical (must-fill)'}
                          on:click={() => toggleCritical(role)}
                        >
                          ⚠
                        </button>
                      </td>
                      <td>
                        <div class="role-name-cell" on:click={() => toggleRoleExpansion(role.id)}>
                          <span class="expand-arrow {isExpanded ? 'expanded' : ''}">{isExpanded ? '▼' : '▶'}</span>
                          <div class="role-name-content">
                            <strong>{role.name}</strong>
                            {#if role.description}
                              <div class="role-desc">{role.description.substring(0, 100)}{role.description.length > 100 ? '...' : ''}</div>
                            {/if}
                          </div>
                        </div>
                      </td>
                      <td>
                        {#if role.direct_leader}
                          {role.direct_leader.first_name} {role.direct_leader.last_name}
                        {:else if role.domain?.leader}
                          {role.domain.leader.first_name} {role.domain.leader.last_name}
                        {:else}
                          <span class="no-leader">-</span>
                        {/if}
                      </td>
                      <td>
                        <div class="fill-indicator">
                          <div class="fill-bar">
                            <div class="fill-progress" style="width: {fillPercent}%"></div>
                          </div>
                          <span class="fill-text">{role.positions_filled}/{role.positions_total} ({fillPercent}%)</span>
                        </div>
                      </td>
                      <td>
                        <div class="action-buttons">
                          <a href="#/admin/roles/{role.id}" class="btn btn-sm btn-secondary">Edit</a>
                        </div>
                      </td>
                    </tr>

                    {#if isExpanded}
                      <tr class="volunteers-row">
                        <td colspan="6">
                          <div class="volunteers-container">
                            {#if volunteers.length > 0}
                              <h4>Volunteers ({volunteers.length})</h4>
                              <div class="volunteers-list">
                                {#each volunteers as signup (signup.id)}
                                  <div class="volunteer-item">
                                    <div class="volunteer-info">
                                      <strong>{signup.volunteer.first_name} {signup.volunteer.last_name}</strong>
                                      <a href="mailto:{signup.volunteer.email}" class="volunteer-email">{signup.volunteer.email}</a>
                                      {#if signup.phone || signup.volunteer.phone}
                                        <span class="volunteer-phone">📱 {signup.phone || signup.volunteer.phone}</span>
                                      {/if}
                                    </div>
                                    <div class="signup-date">
                                      Signed up: {format(new Date(signup.signed_up_at), 'MMM d, h:mm a')}
                                    </div>
                                  </div>
                                {/each}
                              </div>
                            {:else}
                              <p class="no-volunteers">No volunteers signed up yet</p>
                            {/if}

                            <div class="inline-add-volunteer">
                              <div class="inline-add-volunteer__header">
                                <h4>Add volunteer directly to this role</h4>
                                {#if isRoleFull}
                                  <span class="inline-add-volunteer__status">Role is full</span>
                                {/if}
                              </div>

                              <div class="inline-add-volunteer__grid">
                                <input
                                  type="text"
                                  class="input"
                                  placeholder="First name"
                                  value={inlineForm.first_name}
                                  on:input={(event) => updateInlineVolunteerForm(role.id, 'first_name', /** @type {HTMLInputElement} */ (event.currentTarget).value)}
                                  on:keydown={(event) => handleInlineAddKeydown(event, role)}
                                  aria-label={`First name for ${role.name}`}
                                />
                                <input
                                  type="text"
                                  class="input"
                                  placeholder="Last name"
                                  value={inlineForm.last_name}
                                  on:input={(event) => updateInlineVolunteerForm(role.id, 'last_name', /** @type {HTMLInputElement} */ (event.currentTarget).value)}
                                  on:keydown={(event) => handleInlineAddKeydown(event, role)}
                                  aria-label={`Last name for ${role.name}`}
                                />
                                <input
                                  type="email"
                                  class="input"
                                  placeholder="Email address"
                                  value={inlineForm.email}
                                  on:input={(event) => updateInlineVolunteerForm(role.id, 'email', /** @type {HTMLInputElement} */ (event.currentTarget).value)}
                                  on:keydown={(event) => handleInlineAddKeydown(event, role)}
                                  aria-label={`Email for ${role.name}`}
                                />
                                <input
                                  type="tel"
                                  class="input"
                                  placeholder="Phone (optional)"
                                  value={inlineForm.phone}
                                  on:input={(event) => updateInlineVolunteerForm(role.id, 'phone', /** @type {HTMLInputElement} */ (event.currentTarget).value)}
                                  on:keydown={(event) => handleInlineAddKeydown(event, role)}
                                  aria-label={`Phone for ${role.name}`}
                                />
                                <select
                                  class="input"
                                  value={inlineForm.team_club_affiliation_id}
                                  on:change={(event) => updateInlineVolunteerForm(role.id, 'team_club_affiliation_id', /** @type {HTMLSelectElement} */ (event.currentTarget).value)}
                                  disabled={inlineAddState.loading}
                                  aria-label={`Team or club affiliation for ${role.name}`}
                                >
                                  <option value="">Team/Club *</option>
                                  {#each $affiliations as aff (aff.id)}
                                    <option value={aff.id}>{aff.name}</option>
                                  {/each}
                                </select>
                                <button
                                  type="button"
                                  class="btn btn-primary inline-add-volunteer__button"
                                  on:click={() => addVolunteerToExpandedRole(role)}
                                  disabled={inlineAddState.loading || isRoleFull}
                                >
                                  {inlineAddState.loading ? 'Adding…' : '+ Add'}
                                </button>
                              </div>

                              {#if inlineSuggestionLoading[role.id]}
                                <div class="inline-volunteer-suggestions inline-volunteer-suggestions--loading">Searching existing volunteers…</div>
                              {:else if inlineVolunteerSuggestions[role.id]?.length}
                                <div class="inline-volunteer-suggestions">
                                  <span class="inline-volunteer-suggestions__intro">Select an existing volunteer:</span>
                                  <div class="inline-volunteer-suggestions__list">
                                    {#each inlineVolunteerSuggestions[role.id] as person (person.id)}
                                      <button
                                        type="button"
                                        class="inline-volunteer-suggestion-chip"
                                        on:click={() => applyInlineVolunteerSuggestion(role.id, person)}
                                      >
                                        <span class="name">{person.first_name || 'No'} {person.last_name || 'Name'}</span>
                                        <span class="email">{person.email}</span>
                                        {#if person.phone}
                                          <span class="phone">{person.phone}</span>
                                        {/if}
                                        {#if person.source === 'contact'}
                                          <span class="badge">Past volunteer</span>
                                        {/if}
                                      </button>
                                    {/each}
                                  </div>
                                </div>
                              {/if}

                              {#if inlineAddState.error}
                                <div class="inline-alert error">{inlineAddState.error}</div>
                              {/if}

                              {#if inlineAddState.success}
                                <div class="inline-alert success">{inlineAddState.success}</div>
                              {/if}
                            </div>
                          </div>
                        </td>
                      </tr>
                    {/if}
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if showDomainLeaderModal && selectedDomain}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Assign Domain Leader</h2>
        <button class="modal-close" on:click={closeDomainLeaderModal} aria-label="Close">
          ×
        </button>
      </div>
      <div class="modal-body">
        <p class="modal-domain-name">{selectedDomain.name}</p>
        {#if selectedDomain.description}
          <p class="modal-domain-description">{selectedDomain.description}</p>
        {/if}

        {#if domainModalError}
          <div class="alert alert-error">{domainModalError}</div>
        {/if}

        {#if loadingLeaders}
          <div class="loading">Loading users...</div>
        {:else if availableLeaders.length === 0}
          <p>No users available to assign.</p>
        {:else}
          <div class="form-group">
            <label for="domain-leader-select">Select a leader</label>
            <select
              id="domain-leader-select"
              bind:value={selectedLeaderId}
              on:change={handleLeaderSelectChange}
              disabled={assigningLeader}
            >
              <option value="">-- Choose a leader --</option>
              {#each availableLeaders as user (user.id)}
                <option value={user.id}>{getUserDisplay(user)}</option>
              {/each}
              <option value="__add_new__">+ Add new volunteer leader…</option>
            </select>
          </div>
        {/if}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={closeDomainLeaderModal} disabled={assigningLeader}>Cancel</button>
        <button class="btn btn-primary" on:click={assignDomainLeader} disabled={assigningLeader || !selectedLeaderId}>
          {assigningLeader ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if emailModalGroup}
  <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="email-domain-modal-title">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="email-domain-modal-title">Send Email to This Domain's Volunteers</h2>
        <button class="modal-close" on:click={closeEmailModal} aria-label="Close" disabled={sendingEmail}>×</button>
      </div>
      <div class="modal-body">
        {#if loadingDomainVolunteers}
          <p>Loading volunteers…</p>
        {:else}
          <p class="email-domain-info">
            This will send an email to {domainVolunteers.length} volunteer{domainVolunteers.length !== 1 ? 's' : ''} across the selected domain's roles.
          </p>
          {#if emailError}
            <div class="alert alert-error">{emailError}</div>
          {/if}
          {#if emailSuccess}
            <div class="alert alert-success">{emailSuccess}</div>
          {:else}
            <div class="form-group">
              <label for="email-domain-subject">Subject *</label>
              <input
                id="email-domain-subject"
                type="text"
                bind:value={emailSubject}
                placeholder="e.g., Important Update About Your Volunteer Shift"
                disabled={sendingEmail}
              />
            </div>
            <div class="form-group">
              <label for="email-domain-body">Message *</label>
              <textarea
                id="email-domain-body"
                bind:value={emailBody}
                rows="6"
                placeholder="Enter your message here..."
                disabled={sendingEmail}
              ></textarea>
            </div>
          {/if}
        {/if}
      </div>
      {#if !loadingDomainVolunteers && !emailSuccess}
        <div class="modal-footer">
          <button class="btn btn-secondary" on:click={closeEmailModal} disabled={sendingEmail}>Cancel</button>
          <button
            class="btn btn-primary"
            on:click={sendEmailToDomainVolunteers}
            disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim() || domainVolunteers.length === 0}
          >
            {sendingEmail ? 'Sending…' : `Send Email to ${domainVolunteers.length} Volunteer${domainVolunteers.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if showAddVolunteerModal}
  <div class="modal-overlay add-volunteer-modal" role="dialog" aria-modal="true">
    <div class="modal-content large">
      <div class="modal-header">
        <h2>Add Volunteer Leader</h2>
        <button class="modal-close" on:click={closeAddVolunteerModal} aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        {#if pendingDomainForNewLeader}
          <div class="domain-summary">
            <h3>{pendingDomainForNewLeader.name}</h3>
            <p>{pendingDomainForNewLeader.description || 'No description provided for this domain.'}</p>
          </div>
        {/if}

        {#if addVolunteerError}
          <div class="alert alert-error">{addVolunteerError}</div>
        {/if}

        <div class="form-grid">
          <div class="form-group">
            <label for="new-leader-first-name">First name</label>
            <input
              id="new-leader-first-name"
              type="text"
              bind:value={addVolunteerForm.first_name}
              on:input={scheduleAddVolunteerSuggestions}
              placeholder="Jane"
              required
            />
          </div>
          <div class="form-group">
            <label for="new-leader-last-name">Last name</label>
            <input
              id="new-leader-last-name"
              type="text"
              bind:value={addVolunteerForm.last_name}
              on:input={scheduleAddVolunteerSuggestions}
              placeholder="Doe"
              required
            />
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label for="new-leader-email">Email</label>
            <input
              id="new-leader-email"
              on:input={scheduleAddVolunteerSuggestions}
              type="email"
              bind:value={addVolunteerForm.email}
              placeholder="leader@example.com"
              required
            />
          </div>
          <div class="form-group">
            <label for="new-leader-phone">Phone (optional)</label>
            <input
              id="new-leader-phone"
              type="tel"
              bind:value={addVolunteerForm.phone}
              placeholder="(555) 123-4567"
            />
          </div>
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

        <p class="helper-text">
          We’ll email them a sign-in link. They’ll be added as volunteer leader for this domain automatically.
        </p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={closeAddVolunteerModal} disabled={addingVolunteer}>Cancel</button>
        <button class="btn btn-primary" on:click={createVolunteerLeader} disabled={addingVolunteer}>
          {addingVolunteer ? 'Creating...' : 'Create Leader'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .roles-page {
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

  .form-container {
    max-width: 800px;
    margin: 0 auto;
  }

  .form-container h1 {
    margin-bottom: 2rem;
    color: #1a1a1a;
  }

  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
  }

  .alert-error {
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

  .roles-table {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .leaders-summary {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
  }

  .leaders-summary-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .leaders-summary h2 {
    margin: 0 0 0.25rem 0;
  }

  .leaders-summary p {
    margin: 0;
    color: #6c757d;
  }

  .leaders-table-wrapper {
    overflow-x: auto;
  }

  .leaders-table {
    width: 100%;
    border-collapse: collapse;
  }

  .leaders-table th,
  .leaders-table td {
    padding: 0.85rem 1rem;
    border-bottom: 1px solid #dee2e6;
    vertical-align: top;
  }

  .leaders-table th {
    background: #f8f9fa;
    font-weight: 600;
    color: #495057;
    text-align: left;
  }

  .leaders-table tbody tr:hover {
    background: #f8f9fa;
  }

  .leader-contact {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .inline-leader-inputs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .leader-suggestions {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .leader-suggestions--loading {
    color: #6c757d;
    font-size: 0.85rem;
  }
  .leader-suggestion-chip {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0.4rem 0.6rem;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    background: #f8f9fa;
    cursor: pointer;
    font-size: 0.85rem;
    text-align: left;
  }
  .leader-suggestion-chip:hover {
    border-color: #0d6efd;
    background: #e7f1ff;
  }
  .leader-suggestion-chip .name {
    font-weight: 600;
  }
  .leader-suggestion-chip .email {
    color: #0d6efd;
    font-size: 0.8rem;
  }
  .leader-suggestion-chip .badge {
    font-size: 0.65rem;
    color: #6c757d;
    margin-top: 2px;
  }

  .inline-email-input {
    max-width: 260px;
  }

  .input-sm {
    width: 120px;
    padding: 0.5rem 0.6rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 0.9rem;
    color: #495057;
  }

  .inline-email-input .input-sm {
    width: 220px;
  }

  .inline-actions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    align-items: flex-start;
  }

  .form-error-text {
    color: #dc3545;
    font-size: 0.85rem;
  }

  .leader-contact a {
    color: #007bff;
    text-decoration: none;
  }

  .leader-contact a:hover {
    text-decoration: underline;
  }

  .leader-phone {
    font-size: 0.85rem;
    color: #6c757d;
  }

  .leader-actions {
    white-space: nowrap;
  }

  .leader-add-success-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-radius: 8px;
    color: #155724;
    font-size: 0.95rem;
  }
  .leader-add-success-dismiss {
    background: none;
    border: none;
    color: #155724;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 0.25rem;
    opacity: 0.8;
  }
  .leader-add-success-dismiss:hover {
    opacity: 1;
  }
  .leader-add-success-banner--warn {
    background: #fff3cd;
    border-color: #ffeaa7;
    color: #856404;
  }
  .leader-add-success-banner--warn .leader-add-success-dismiss {
    color: #856404;
  }

  .leaders-summary .empty-state {
    padding: 1rem;
    color: #6c757d;
  }

  .domain-group {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .domain-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #dee2e6;
    background: #f8f9fa;
  }

  .domain-header-actions {
    flex-shrink: 0;
  }

  .domain-header-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .domain-header-info h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #1a1a1a;
  }

  .domain-leader-text {
    font-size: 0.9rem;
    color: #495057;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .domain-leader-text.no-leader {
    color: #adb5bd;
  }

  .roles-group-table {
    overflow-x: auto;
  }

  .roles-group-table table {
    width: 100%;
    border-collapse: collapse;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th {
    text-align: left;
    padding: 1rem;
    background: #f8f9fa;
    font-weight: 600;
    color: #495057;
    border-bottom: 2px solid #dee2e6;
  }

  td {
    padding: 1rem;
    border-bottom: 1px solid #dee2e6;
  }

  tr:hover {
    background: #f8f9fa;
  }

  .role-desc {
    font-size: 0.85rem;
    color: #6c757d;
    margin-top: 0.25rem;
  }

  .role-name-cell {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    cursor: pointer;
    padding: 0.25rem 0;
    user-select: none;
  }

  .role-name-cell:hover {
    opacity: 0.8;
  }

  .expand-arrow {
    flex-shrink: 0;
    font-size: 0.85rem;
    color: #007bff;
    transition: transform 0.2s;
    margin-top: 0.2rem;
  }

  .expand-arrow.expanded {
    color: #28a745;
  }

  .role-name-content {
    flex: 1;
  }

  .volunteers-row {
    background: #f8f9fa;
  }

  .volunteers-container {
    padding: 1.5rem 2rem;
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .volunteers-container h4 {
    margin: 0 0 1rem 0;
    color: #495057;
    font-size: 1rem;
  }

  .inline-add-volunteer {
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px solid #dee2e6;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .inline-add-volunteer__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .inline-add-volunteer__header h4 {
    margin: 0;
  }

  .inline-add-volunteer__status {
    color: #856404;
    background: #fff3cd;
    border: 1px solid #ffeaa7;
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    font-size: 0.8rem;
    font-weight: 600;
  }

  .inline-add-volunteer__grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.75rem;
    align-items: center;
  }

  .inline-add-volunteer__button {
    width: 100%;
    min-width: 0;
  }

  .inline-volunteer-suggestions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .inline-volunteer-suggestions--loading {
    color: #6c757d;
    font-size: 0.9rem;
  }

  .inline-volunteer-suggestions__intro {
    color: #495057;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .inline-volunteer-suggestions__list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .inline-volunteer-suggestion-chip {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.1rem;
    padding: 0.45rem 0.65rem;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
    text-align: left;
  }

  .inline-volunteer-suggestion-chip:hover {
    border-color: #0d6efd;
    background: #e7f1ff;
  }

  .inline-volunteer-suggestion-chip .name {
    font-weight: 600;
    color: #212529;
  }

  .inline-volunteer-suggestion-chip .email {
    color: #0d6efd;
    font-size: 0.85rem;
  }

  .inline-volunteer-suggestion-chip .phone,
  .inline-volunteer-suggestion-chip .badge {
    color: #6c757d;
    font-size: 0.75rem;
  }

  .inline-alert {
    border-radius: 8px;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
  }

  .inline-alert.error {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    color: #721c24;
  }

  .inline-alert.success {
    background: #d4edda;
    border: 1px solid #c3e6cb;
    color: #155724;
  }

  .volunteers-list {
    display: grid;
    gap: 0.75rem;
  }

  .volunteer-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: white;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    gap: 1rem;
  }

  .volunteer-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .volunteer-info strong {
    color: #1a1a1a;
    font-size: 0.95rem;
  }

  .volunteer-email {
    color: #007bff;
    text-decoration: none;
    font-size: 0.85rem;
  }

  .volunteer-email:hover {
    text-decoration: underline;
  }

  .volunteer-phone {
    font-size: 0.85rem;
    color: #6c757d;
  }

  .signup-date {
    font-size: 0.85rem;
    color: #6c757d;
    white-space: nowrap;
  }

  .no-volunteers {
    text-align: center;
    padding: 2rem;
    color: #6c757d;
    font-style: italic;
  }

  .no-leader {
    color: #adb5bd;
    font-style: italic;
  }

  .add-leader-btn {
    margin-left: 0;
  }

  .fill-indicator {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .fill-bar {
    height: 8px;
    background: #e9ecef;
    border-radius: 4px;
    overflow: hidden;
  }

  .fill-progress {
    height: 100%;
    background: linear-gradient(90deg, #28a745, #20c997);
    transition: width 0.3s;
  }

  .fill-text {
    font-size: 0.85rem;
    color: #495057;
  }

  .th-featured,
  .td-featured {
    width: 1%;
    white-space: nowrap;
    text-align: center;
    vertical-align: middle;
  }

  .featured-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.25rem;
    padding: 0.25rem;
    color: #dee2e6;
    transition: color 0.15s;
  }

  .featured-toggle:hover {
    color: #ffc107;
  }

  .featured-toggle.featured {
    color: #ffc107;
  }

  .th-critical,
  .td-critical {
    width: 1%;
    white-space: nowrap;
    text-align: center;
    vertical-align: middle;
  }

  .critical-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.25rem;
    padding: 0.25rem;
    color: #dee2e6;
    transition: color 0.15s;
  }

  .critical-toggle:hover {
    color: #dc3545;
  }

  .critical-toggle.critical {
    color: #dc3545;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    display: inline-block;
    transition: background 0.2s;
  }

  .btn-sm {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }

  .btn-primary {
    background: #007bff;
    color: white;
  }

  .btn-primary:hover {
    background: #0056b3;
  }

  .btn-secondary {
    background: white;
    color: #007bff;
    border: 1px solid #007bff;
  }

  .btn-secondary:hover {
    background: #f8f9fa;
  }

  .btn-info {
    background: #17a2b8;
    color: white;
  }

  .btn-info:hover {
    background: #138496;
  }

  .btn-danger {
    background: white;
    color: #dc3545;
    border: 1px solid #dc3545;
  }

  .btn-danger:hover {
    background: #dc3545;
    color: white;
  }

  .form-actions--edit-footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #dee2e6;
    display: flex;
    gap: 0.75rem;
  }

  .btn-link {
    background: none;
    color: #007bff;
    border: none;
    text-decoration: underline;
    padding: 0.5rem;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1.5rem;
  }

  .modal-overlay.add-volunteer-modal {
    z-index: 1100;
  }

  .modal-content {
    background: #fff;
    border-radius: 12px;
    max-width: 480px;
    width: 100%;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .modal-content.large {
    max-width: 620px;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid #dee2e6;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #1a1a1a;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    color: #6c757d;
    padding: 0;
  }

  .modal-close:hover {
    color: #1a1a1a;
  }

  .email-domain-info {
    color: #6c757d;
    margin-bottom: 1rem;
  }

  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .modal-domain-name {
    font-weight: 600;
    margin: 0;
    color: #495057;
  }

  .modal-domain-description {
    margin: 0;
    color: #6c757d;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem 1.5rem;
    border-top: 1px solid #dee2e6;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #495057;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    color: #495057;
  }

  .form-group input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1rem;
    color: #495057;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
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

  .helper-text {
    margin: 0;
    font-size: 0.9rem;
    color: #6c757d;
  }

  .domain-summary {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
  }

  .domain-summary h3 {
    margin: 0 0 0.5rem 0;
  }

  .domain-summary p {
    margin: 0;
    color: #495057;
  }

  @media (max-width: 768px) {
    .header {
      flex-direction: column;
    }

    .roles-table {
      overflow-x: auto;
    }

    table {
      min-width: 800px;
    }

    .leaders-summary {
      padding: 1rem;
    }

    .leaders-table th,
    .leaders-table td {
      padding: 0.75rem;
    }

    .inline-leader-inputs {
      flex-direction: column;
      align-items: stretch;
    }

    .input-sm,
    .inline-email-input .input-sm {
      width: 100%;
    }

    .inline-add-volunteer__grid {
      grid-template-columns: 1fr;
    }
  }
</style>

