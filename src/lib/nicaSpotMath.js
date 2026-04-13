/**
 * Canonical NICA beneficiary spot math (matches admin NICA Beneficiary Summary).
 * Used by VolunteersList, NICA PDF export, and should stay in sync with send-nica-coach-digest.
 */

export const NICA_BENEFICIARY_SPOT_GOAL = 10;

const NICA_WEIGHTED_SPOT_ROLES = new Set([
  'BSC Medic - Afternoon Shift',
  'BSC Medic - Morning Shift',
]);
const NICA_WEIGHTED_SPOT_VALUE = 2.5;

/**
 * @param {{ role?: { name?: string } | null } | null } | undefined} signup
 * @returns {number}
 */
export function nicaSpotWeightForSignup(signup) {
  const roleName = signup?.role?.name || '';
  if (NICA_WEIGHTED_SPOT_ROLES.has(roleName)) return NICA_WEIGHTED_SPOT_VALUE;
  return 1;
}

/**
 * Weighted spots for one profile (confirmed signups only — matches `volunteers` store shape).
 * @param {{ signups?: Array<{ status?: string, role?: { name?: string } | null }> }} volunteer
 * @returns {number}
 */
export function nicaVolunteerSpots(volunteer) {
  const signups = (volunteer.signups || []).filter((s) => s.status === 'confirmed');
  return signups.reduce((sum, signup) => sum + nicaSpotWeightForSignup(signup), 0);
}

/**
 * @param {number} num
 * @returns {string}
 */
export function formatNicaNumber(num) {
  const x = Number(num);
  if (!Number.isFinite(x)) return '0';
  if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
  return x.toFixed(1);
}

/**
 * @param {{ affiliationNames: string[] }} beneficiary
 * @param {Array<{ id: string, name: string }>} affiliationsList
 * @returns {Set<string>}
 */
export function getMatchingAffiliationIds(beneficiary, affiliationsList) {
  return new Set(
    affiliationsList
      .filter((entry) => beneficiary.affiliationNames.includes(entry.name))
      .map((entry) => entry.id),
  );
}

/**
 * Total weighted volunteer spots for a beneficiary (same formula as the NICA table).
 * @param {{ affiliationNames: string[] }} beneficiary
 * @param {Array<{ id: string, name: string }>} affiliationsList
 * @param {Array<{ team_club_affiliation_id?: string | null, signups?: unknown[] }>} volunteersList
 * @returns {number}
 */
export function volunteerSpotsForBeneficiary(beneficiary, affiliationsList, volunteersList) {
  const matchingAffiliationIds = getMatchingAffiliationIds(beneficiary, affiliationsList);
  return volunteersList
    .filter((volunteer) => matchingAffiliationIds.has(volunteer.team_club_affiliation_id || ''))
    .reduce((sum, volunteer) => sum + nicaVolunteerSpots(volunteer), 0);
}

/**
 * Remaining spots toward the 10-spot goal (0 when complete).
 * @param {number} volunteerSpots
 * @returns {number}
 */
export function remainingNicaSpots(volunteerSpots) {
  return Math.max(NICA_BENEFICIARY_SPOT_GOAL - volunteerSpots, 0);
}

/**
 * Same remaining label as the admin table (includes emoji when complete).
 * @param {number} volunteerSpots
 * @returns {string}
 */
export function nicaRemainingLabel(volunteerSpots) {
  const remaining = remainingNicaSpots(volunteerSpots);
  return remaining === 0 ? 'Complete 🎉' : formatNicaNumber(remaining);
}

/**
 * PDF / plain-text line (no emoji).
 * @param {number} volunteerSpots
 * @returns {string}
 */
export function nicaRemainingLabelPlain(volunteerSpots) {
  const remaining = remainingNicaSpots(volunteerSpots);
  return remaining === 0 ? 'Complete' : formatNicaNumber(remaining);
}
