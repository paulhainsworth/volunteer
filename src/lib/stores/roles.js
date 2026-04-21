import { writable, derived } from 'svelte/store';
import { supabase } from '../supabaseClient';
import { supabasePublic } from '../supabasePublic';
import {
  getCriticalOpenSpots,
  getCriticalPositionsFilled,
  getCriticalPositionsRequired,
  getNiceToHaveOpenSpots,
  hasCriticalRequirement
} from '../utils/criticalSpots';
import { withSupabaseReadTimeout } from '../utils/withTimeout';
import {
  getApproxDaysUntilScheduleEnd,
  isRoleScheduleInPast
} from '../utils/timeDisplay';

function createRolesStore() {
  const { subscribe, set, update } = writable([]);

  const fetchRole = async (id) => withSupabaseReadTimeout(async () => {
    const { data, error } = await supabasePublic
      .from('volunteer_roles')
      .select(`
        *,
        signups:signups!role_id(
          id,
          volunteer:profiles!volunteer_id(
            id,
            first_name,
            last_name,
            email,
            phone
          ),
          signed_up_at,
          phone,
          status
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Filter out cancelled signups (visible when RLS allows, e.g. signed-in staff)
    const confirmedSignups = data.signups?.filter(s => s.status === 'confirmed') || [];

    // Same as fetchRoles: use RPC for fill count so anonymous visitors see correct numbers.
    // RLS hides signups from the public; nested select returns [] and would show 0 filled.
    let positions_filled = confirmedSignups.length;
    const { data: countRows } = await supabasePublic.rpc('get_confirmed_signup_counts', {
      role_ids: [id]
    });
    const countRow = (countRows || []).find((r) => r.role_id === id);
    if (countRow != null) {
      positions_filled = Number(countRow.cnt) || 0;
    }

    return {
      ...data,
      signups: confirmedSignups,
      positions_filled
    };
  }, 'roles.fetchRole');

  return {
    subscribe,
    
    fetchRoles: async (filters = {}) => {
      try {
        const rolesWithCounts = await withSupabaseReadTimeout(async () => {
          let query = supabasePublic
            .from('volunteer_roles')
            .select(`
              *,
              signups:signups(count),
              created_by:profiles!created_by(first_name, last_name, email),
              direct_leader:profiles!leader_id(id, first_name, last_name),
              domain:volunteer_leader_domains!domain_id(
                id,
                name,
                leader:profiles!leader_id(id, first_name, last_name)
              )
            `)
            .order('event_date', { ascending: true, nullsFirst: false })
            .order('start_time', { ascending: true, nullsFirst: false });

          if (filters.startDate) query = query.gte('event_date', filters.startDate);
          if (filters.endDate) query = query.lte('event_date', filters.endDate);

          const { data, error } = await query;
          if (error) throw error;

          // Use RPC for counts so unauthenticated users get correct fill (RLS blocks direct signups read)
          const roleIds = (data || []).map((r) => r.id);
          let confirmedCountByRole = {};
          if (roleIds.length > 0) {
            const { data: countRows } = await supabasePublic.rpc('get_confirmed_signup_counts', {
              role_ids: roleIds
            });
            (countRows || []).forEach((row) => {
              confirmedCountByRole[row.role_id] = Number(row.cnt) || 0;
            });
          }

          return (data || []).map(role => ({
            ...role,
            positions_filled: confirmedCountByRole[role.id] ?? 0
          }));
        }, 'roles.fetchRoles');

        set(rolesWithCounts);
        return rolesWithCounts;
      } catch (e) {
        set([]);
        throw e;
      }
    },

    /** Fetch up to 6 featured roles for the homepage. Returns [] if none featured. */
    fetchFeaturedRoles: async () => withSupabaseReadTimeout(async () => {
      const select = `
        *,
        signups:signups(count),
        domain:volunteer_leader_domains!domain_id(id, name, leader:profiles!leader_id(id, first_name, last_name))
      `;
      const { data, error } = await supabasePublic
        .from('volunteer_roles')
        .select(select)
        .eq('featured', true)
        .order('event_date', { ascending: true, nullsFirst: false })
        .order('start_time', { ascending: true, nullsFirst: false })
        .limit(6);
      if (error) throw error;
      const roleIds = (data || []).map((r) => r.id);
      let confirmedCountByRole = {};
      if (roleIds.length > 0) {
        const { data: countRows } = await supabasePublic.rpc('get_confirmed_signup_counts', {
          role_ids: roleIds
        });
        (countRows || []).forEach((row) => {
          confirmedCountByRole[row.role_id] = Number(row.cnt) || 0;
        });
      }
      return (data || []).map(role => ({
        ...role,
        positions_filled: confirmedCountByRole[role.id] ?? 0
      }));
    }, 'roles.fetchFeaturedRoles'),

    fetchRole,

    createRole: async (roleData) => {
      const { data, error } = await supabase
        .from('volunteer_roles')
        .insert(roleData)
        .select()
        .single();

      if (error) throw error;

      update(roles => [...roles, { ...data, positions_filled: 0 }]);
      return data;
    },

    updateRole: async (id, updates) => {
      const { data, error } = await supabase
        .from('volunteer_roles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      update(roles => roles.map(r => r.id === id ? { ...r, ...data } : r));
      return data;
    },

    deleteRole: async (id) => {
      // Check if there are any confirmed signups
      const { data: signups } = await supabase
        .from('signups')
        .select('id')
        .eq('role_id', id)
        .eq('status', 'confirmed');

      if (signups && signups.length > 0) {
        throw new Error('Cannot delete role with confirmed signups. Please cancel all signups first.');
      }

      const { error } = await supabase
        .from('volunteer_roles')
        .delete()
        .eq('id', id);

      if (error) throw error;

      update(roles => roles.filter(r => r.id !== id));
    },

    duplicateRole: async (id) => {
      const role = await fetchRole(id);
      const { id: _, created_at, updated_at, signups, positions_filled, created_by, ...roleData } = role;

      // Create role using the createRole method from the returned object
      const { data, error } = await supabase
        .from('volunteer_roles')
        .insert(roleData)
        .select()
        .single();

      if (error) throw error;

      update(rolesArray => [...rolesArray, { ...data, positions_filled: 0 }]);
      return data;
    }
  };
}

export const roles = createRolesStore();

// Derived store for dashboard stats
export const dashboardStats = derived(roles, $roles => {
  const totalPositions = $roles.reduce((sum, role) => sum + role.positions_total, 0);
  const filledPositions = $roles.reduce((sum, role) => sum + role.positions_filled, 0);
  const totalRoles = $roles.length;
  
  const upcomingRoles = $roles.filter((role) => !isRoleScheduleInPast(role));

  // Time-based "needs attention" (legacy): <50% filled, within 7 days
  const needsAttentionRoles = upcomingRoles.filter((role) => {
    const fillPercentage = (role.positions_filled / role.positions_total) * 100;
    const daysUntil = getApproxDaysUntilScheduleEnd(role);
    return fillPercentage < 50 && daysUntil <= 7 && daysUntil >= 0;
  });

  const criticalFlaggedRoles = $roles.filter((role) => hasCriticalRequirement(role));
  const criticalUnfulfilled = criticalFlaggedRoles.filter((role) => getCriticalOpenSpots(role) > 0);
  const criticalPositionsTotal = criticalFlaggedRoles.reduce((sum, role) => sum + getCriticalPositionsRequired(role), 0);
  const criticalPositionsFilled = criticalFlaggedRoles.reduce((sum, role) => sum + getCriticalPositionsFilled(role), 0);
  const criticalOpenSpots = criticalFlaggedRoles.reduce((sum, role) => sum + getCriticalOpenSpots(role), 0);
  const niceToHaveUnfulfilled = $roles.filter((role) => getNiceToHaveOpenSpots(role) > 0);
  const niceToHaveOpenSpots = $roles.reduce((sum, role) => sum + getNiceToHaveOpenSpots(role), 0);

  return {
    totalPositions,
    filledPositions,
    fillPercentage: totalPositions > 0 ? (filledPositions / totalPositions) * 100 : 0,
    totalRoles,
    upcomingRoles: upcomingRoles.length,
    criticalRoles: needsAttentionRoles.length,
    criticalFlaggedCount: criticalFlaggedRoles.length,
    criticalUnfulfilledCount: criticalUnfulfilled.length,
    criticalOpenSpots,
    criticalFillPercentage: criticalPositionsTotal > 0 ? (criticalPositionsFilled / criticalPositionsTotal) * 100 : 0,
    niceToHaveUnfulfilledCount: niceToHaveUnfulfilled.length,
    niceToHaveOpenSpots
  };
});

