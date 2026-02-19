import { writable, derived } from 'svelte/store';
import { supabase } from '../supabaseClient';

function createRolesStore() {
  const { subscribe, set, update } = writable([]);

  const fetchRole = async (id) => {
    const { data, error } = await supabase
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

    // Filter out cancelled signups
    const confirmedSignups = data.signups?.filter(s => s.status === 'confirmed') || [];
    
    return {
      ...data,
      signups: confirmedSignups,
      positions_filled: confirmedSignups.length
    };
  };

  return {
    subscribe,
    
    fetchRoles: async (filters = {}) => {
      try {
        let query = supabase
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

        const rolesWithCounts = (data || []).map(role => ({
          ...role,
          positions_filled: role.signups?.[0]?.count ?? 0
        }));
        set(rolesWithCounts);
        return rolesWithCounts;
      } catch (e) {
        set([]);
        throw e;
      }
    },

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
  
  const upcomingRoles = $roles.filter(role => 
    new Date(role.event_date) >= new Date()
  );
  
  const criticalRoles = upcomingRoles.filter(role => {
    const fillPercentage = (role.positions_filled / role.positions_total) * 100;
    const daysUntil = Math.ceil(
      (new Date(role.event_date) - new Date()) / (1000 * 60 * 60 * 24)
    );
    return fillPercentage < 50 && daysUntil <= 7;
  });

  return {
    totalPositions,
    filledPositions,
    fillPercentage: totalPositions > 0 ? (filledPositions / totalPositions) * 100 : 0,
    totalRoles,
    upcomingRoles: upcomingRoles.length,
    criticalRoles: criticalRoles.length
  };
});

