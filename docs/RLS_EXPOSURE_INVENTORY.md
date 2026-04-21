# RLS / browser exposure inventory (living document)

**Purpose:** Track every **PostgREST table/view** (and notable **RPC**) hit from the **browser anon client** or **Edge Functions** so Phase 5 RLS audit can be complete. **Update as code changes.**

**Related:** [AUTH_DATA_ACCESS_MIGRATION.md](./AUTH_DATA_ACCESS_MIGRATION.md) §8 Phase 5, [SECURITY.md](../SECURITY.md).

---

## Conventions

| Column | Meaning |
|--------|--------|
| **Resource** | Table or view name |
| **From** | Typical code path / client (`supabase`, `supabasePublic`, `getUserPostgrestClient`) |
| **RLS reviewed** | Checkbox when policies verified for intended anon/authenticated behavior |

---

## Tables / views referenced from `src/` (browser)

| Resource | From (approx.) | RLS reviewed |
|----------|----------------|--------------|
| `profiles` | auth store, Profile, Onboarding, admin/leader screens, stores | [ ] |
| `volunteer_roles` | `roles` store, BrowseRoles, admin, leader | [ ] |
| `signups` | signups store, MySignups, admin, leader | [ ] |
| `volunteer_leader_domains` | `domains` store, Domains, leader, RolesList | [ ] |
| `volunteer_contacts` | Domains, RolesList, leader | [ ] |
| `team_club_affiliations` | `affiliations.js` | [ ] |
| `waivers` / `waiver_settings` | `waiver.js` | [ ] |
| `email_digest_settings` | Communications, NicaCoachesPanel | [ ] |
| `nica_coaches` | NicaCoachesPanel | [ ] |

---

## Edge Functions (server)

Maintain a separate subsection per function that touches the DB via service role or user JWT; note **RLS context** (`Authorization: Bearer` user JWT vs service role).

| Function | Notes | RLS / access reviewed |
|----------|-------|-------------------------|
| `send-magic-link` | Auth redirect only | [ ] |
| _(add as audited)_ | | [ ] |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-04-20 | Initial inventory from `.from(` grep across `src/`. |
