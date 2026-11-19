import { supabase } from './supabaseClient';
import { withSupabaseReadTimeout } from './utils/withTimeout';

export async function fetchNicaBeneficiaries() {
  const { data, error } = await withSupabaseReadTimeout(
    () => supabase
      .from('nica_beneficiaries')
      .select('id, label, nica_beneficiary_affiliations(affiliation_id)')
      .order('label'),
    'nicaBeneficiaries.fetch'
  );
  if (error) throw error;

  return (data || []).map(({ id, label, nica_beneficiary_affiliations }) => ({
    id,
    label,
    affiliationIds: nica_beneficiary_affiliations.map(({ affiliation_id }) => affiliation_id)
  }));
}

export async function saveNicaBeneficiary({ id, label, affiliationIds }) {
  const { data, error } = await supabase.rpc('save_nica_beneficiary', {
    p_id: id,
    p_label: label,
    p_affiliation_ids: affiliationIds
  });
  if (error) throw error;
  return { id: data, label, affiliationIds };
}
