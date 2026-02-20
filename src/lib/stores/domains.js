import { writable } from 'svelte/store';
import { supabase } from '../supabaseClient';

function createDomainsStore() {
  const { subscribe, set, update } = writable([]);

  return {
    subscribe,
    
    fetchDomains: async (options = {}) => {
      const { leaderId } = options;

      let query = supabase
        .from('volunteer_leader_domains')
        .select(`
          *,
          leader:profiles!leader_id(
            id,
            first_name,
            last_name,
            email,
            phone
          ),
          roles:volunteer_roles(count)
        `)
        .order('name', { ascending: true });

      if (leaderId) {
        query = query.eq('leader_id', leaderId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const domainsWithCounts = data.map(domain => ({
        ...domain,
        role_count: domain.roles?.[0]?.count || 0
      }));

      set(domainsWithCounts);
      return domainsWithCounts;
    },

    fetchDomain: async (id) => {
      const { data, error } = await supabase
        .from('volunteer_leader_domains')
        .select(`
          *,
          leader:profiles!leader_id(
            id,
            first_name,
            last_name,
            email,
            phone
          ),
          roles:volunteer_roles!domain_id(
            id,
            name,
            description,
            location,
            event_date,
            start_time,
            end_time,
            positions_total,
            signups:signups(count)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      const roles = data.roles || [];
      let confirmedCountByRole = {};
      if (roles.length > 0) {
        const roleIds = roles.map((r) => r.id);
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
      return {
        ...data,
        roles: roles.map(role => ({
          ...role,
          positions_filled: confirmedCountByRole[role.id] ?? 0
        }))
      };
    },

    createDomain: async (domainData) => {
      const { data, error } = await supabase
        .from('volunteer_leader_domains')
        .insert(domainData)
        .select()
        .single();

      if (error) throw error;

      update(domains => [...domains, { ...data, role_count: 0 }]);
      return data;
    },

    updateDomain: async (id, updates) => {
      const { data, error } = await supabase
        .from('volunteer_leader_domains')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      update(domains => domains.map(d => d.id === id ? { ...d, ...data } : d));
      return data;
    },

    deleteDomain: async (id) => {
      // Check if there are roles in this domain
      const { data: roles } = await supabase
        .from('volunteer_roles')
        .select('id')
        .eq('domain_id', id);

      if (roles && roles.length > 0) {
        throw new Error(`Cannot delete domain with ${roles.length} assigned roles. Reassign roles first.`);
      }

      const { error } = await supabase
        .from('volunteer_leader_domains')
        .delete()
        .eq('id', id);

      if (error) throw error;

      update(domains => domains.filter(d => d.id !== id));
    },

    assignLeader: async (domainId, leaderId) => {
      const { data, error } = await supabase
        .from('volunteer_leader_domains')
        .update({ leader_id: leaderId })
        .eq('id', domainId)
        .select()
        .single();

      if (error) throw error;

      update(domains => domains.map(d => d.id === domainId ? { ...d, leader_id: leaderId } : d));
      return data;
    }
  };
}

export const domains = createDomainsStore();

