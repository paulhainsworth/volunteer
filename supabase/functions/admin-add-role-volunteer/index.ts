import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type RequestBody = {
  role_id?: string
  existing_profile_id?: string | null
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  team_club_affiliation_id?: string | null
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeString(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeEmail(value: unknown) {
  const normalized = normalizeString(value)
  return normalized ? normalized.toLowerCase() : null
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401)
    }

    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    const {
      data: { user: authUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (authError || !authUser?.id) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401)
    }

    const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (callerProfileError || callerProfile?.role !== 'admin') {
      return jsonResponse({ error: 'Admin role required' }, 403)
    }

    const body: RequestBody = await req.json()
    const roleId = normalizeString(body.role_id)
    const existingProfileId = normalizeString(body.existing_profile_id)
    const email = normalizeEmail(body.email)
    const firstName = normalizeString(body.first_name)
    const lastName = normalizeString(body.last_name)
    const phone = normalizeString(body.phone)
    const affiliationId = normalizeString(body.team_club_affiliation_id)

    if (!roleId) {
      return jsonResponse({ error: 'Missing required field: role_id' }, 400)
    }

    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from('volunteer_roles')
      .select('id, name, positions_total')
      .eq('id', roleId)
      .single()

    if (roleError || !roleRow) {
      return jsonResponse({ error: 'Role not found' }, 404)
    }

    let volunteerProfile:
      | {
          id: string
          email: string
          first_name: string | null
          last_name: string | null
          phone: string | null
          role: string | null
          team_club_affiliation_id: string | null
        }
      | null = null
    let createdNewProfile = false

    if (existingProfileId) {
      const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, first_name, last_name, phone, role, team_club_affiliation_id')
        .eq('id', existingProfileId)
        .maybeSingle()

      if (existingProfileError) {
        return jsonResponse({ error: 'Failed to load selected volunteer profile' }, 500)
      }

      if (!existingProfile) {
        return jsonResponse({ error: 'Selected volunteer profile no longer exists' }, 404)
      }

      volunteerProfile = existingProfile
    } else {
      if (!email || !isValidEmail(email)) {
        return jsonResponse({ error: 'A valid email address is required' }, 400)
      }

      const { data: existingProfile, error: lookupError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, first_name, last_name, phone, role, team_club_affiliation_id')
        .ilike('email', email)
        .maybeSingle()

      if (lookupError) {
        return jsonResponse({ error: 'Failed to look up existing volunteer' }, 500)
      }

      if (existingProfile) {
        volunteerProfile = existingProfile
      } else {
        if (!firstName || !lastName) {
          return jsonResponse({ error: 'First and last name are required for a new volunteer' }, 400)
        }

        const password = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '')
        const { data: createUserData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            team_club_affiliation_id: affiliationId,
          },
        })

        if (createUserError || !createUserData.user?.id) {
          return jsonResponse(
            { error: createUserError?.message || 'Failed to create volunteer auth account' },
            500
          )
        }

        const volunteerId = createUserData.user.id
        const { error: profileUpsertError } = await supabaseAdmin.from('profiles').upsert({
          id: volunteerId,
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          role: 'volunteer',
          team_club_affiliation_id: affiliationId,
        })

        if (profileUpsertError) {
          return jsonResponse({ error: 'Failed to create volunteer profile' }, 500)
        }

        volunteerProfile = {
          id: volunteerId,
          email,
          first_name: firstName,
          last_name: lastName,
          phone,
          role: 'volunteer',
          team_club_affiliation_id: affiliationId,
        }
        createdNewProfile = true
      }
    }

    if (!volunteerProfile) {
      return jsonResponse({ error: 'Volunteer profile could not be resolved' }, 500)
    }

    const profileUpdates: Record<string, unknown> = {}

    if (!volunteerProfile.first_name && firstName) profileUpdates.first_name = firstName
    if (!volunteerProfile.last_name && lastName) profileUpdates.last_name = lastName
    if (!volunteerProfile.phone && phone) profileUpdates.phone = phone
    if (!volunteerProfile.role) profileUpdates.role = 'volunteer'
    if (!volunteerProfile.team_club_affiliation_id && affiliationId) {
      profileUpdates.team_club_affiliation_id = affiliationId
    }

    if (Object.keys(profileUpdates).length > 0) {
      const { error: updateProfileError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdates)
        .eq('id', volunteerProfile.id)

      if (updateProfileError) {
        return jsonResponse({ error: 'Failed to update volunteer profile' }, 500)
      }

      volunteerProfile = {
        ...volunteerProfile,
        ...profileUpdates,
      }
    }

    const { count: confirmedSignupCount, error: countError } = await supabaseAdmin
      .from('signups')
      .select('id', { count: 'exact', head: true })
      .eq('role_id', roleId)
      .eq('status', 'confirmed')

    if (countError) {
      return jsonResponse({ error: 'Failed to check role capacity' }, 500)
    }

    const { data: existingSignup, error: existingSignupError } = await supabaseAdmin
      .from('signups')
      .select('id, status')
      .eq('role_id', roleId)
      .eq('volunteer_id', volunteerProfile.id)
      .maybeSingle()

    if (existingSignupError) {
      return jsonResponse({ error: 'Failed to check existing signup' }, 500)
    }

    if (existingSignup?.status === 'confirmed') {
      return jsonResponse({ error: 'This volunteer is already signed up for this role' }, 409)
    }

    if ((confirmedSignupCount || 0) >= Number(roleRow.positions_total || 0)) {
      return jsonResponse({ error: 'This role is already full' }, 409)
    }

    let signupId = existingSignup?.id ?? null

    if (existingSignup?.status === 'cancelled') {
      const { error: reactivateError } = await supabaseAdmin
        .from('signups')
        .update({
          status: 'confirmed',
          phone,
          waiver_signed: false,
          signed_up_at: new Date().toISOString(),
        })
        .eq('id', existingSignup.id)

      if (reactivateError) {
        return jsonResponse({ error: 'Failed to reactivate volunteer signup' }, 500)
      }
    } else {
      const { data: insertedSignup, error: insertSignupError } = await supabaseAdmin
        .from('signups')
        .insert({
          role_id: roleId,
          volunteer_id: volunteerProfile.id,
          status: 'confirmed',
          phone,
          waiver_signed: false,
        })
        .select('id')
        .single()

      if (insertSignupError) {
        return jsonResponse({ error: 'Failed to add volunteer to role' }, 500)
      }

      signupId = insertedSignup?.id ?? null
    }

    const displayName = [volunteerProfile.first_name, volunteerProfile.last_name].filter(Boolean).join(' ').trim()

    return jsonResponse({
      success: true,
      volunteerId: volunteerProfile.id,
      signupId,
      createdNewProfile,
      roleName: roleRow.name,
      volunteer: {
        id: volunteerProfile.id,
        email: volunteerProfile.email,
        first_name: volunteerProfile.first_name,
        last_name: volunteerProfile.last_name,
        phone: volunteerProfile.phone,
        display_name: displayName || volunteerProfile.email,
      },
    })
  } catch (error) {
    console.error('admin-add-role-volunteer error:', error)
    return jsonResponse({ error: error?.message || 'Internal server error' }, 500)
  }
})
