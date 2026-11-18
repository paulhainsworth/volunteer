import { supabase } from './supabaseClient';

export async function createOrganizerSignup(body, headers) {
  const { data, error } = await supabase.functions.invoke('create-volunteer-and-signup', {
    body,
    headers
  });

  if (error) throw error;
  if (data?.error) {
    throw new Error(typeof data.error === 'string' ? data.error : data.error.message || 'Failed to create volunteer');
  }
  if (!data?.volunteerId) throw new Error('Volunteer creation failed.');
  return data.volunteerId;
}

export async function assignVolunteerAsLeader({ roleId, email, firstName, lastName, phone, affiliationId }) {
  const { data: existingProfile, error: profileLookupError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, phone, team_club_affiliation_id')
    .ilike('email', email)
    .maybeSingle();

  if (profileLookupError) throw profileLookupError;

  if (existingProfile) {
    const volunteerId = existingProfile.id;
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
    return;
  }

  await createOrganizerSignup({
    role_id: roleId,
    email,
    first_name: firstName,
    last_name: lastName,
    phone: phone || null,
    team_club_affiliation_id: affiliationId || null
  });
}
