# Database and SQL layout

| Location | Purpose |
| --- | --- |
| [bootstrap/](bootstrap/) | Base schema and prerequisite SQL used by the database regression tests |
| [migrations/](migrations/) | Timestamped migrations applied in order and tracked by Supabase |
| [manual/](manual/) | Historical patches and manual repairs. Verify applicability and overlap before using one. |
| [scripts/sql/](../scripts/sql/) | Operator-run cleanup, diagnostics, schema maintenance, and scheduler setup |
| [functions/](functions/) | TypeScript Edge Functions |

## Bootstrap exercised in tests

The [disposable PostgreSQL test](../tests/database/migrations.spec.js) uses a synthetic Auth schema, then applies these files in order before the timestamped migrations.

1. [Base schema](bootstrap/SUPABASE_SCHEMA.sql)
2. [Emergency contact columns](bootstrap/ADD_EMERGENCY_CONTACT.sql)
3. [Volunteer leader role](bootstrap/ADD_VOLUNTEER_LEADER_ROLE.sql)
4. [Leader domains](bootstrap/ADD_LEADER_DOMAINS_SAFE.sql)
5. [Team and club affiliations](bootstrap/ADD_TEAM_CLUB_AFFILIATION.sql)

The test covers prerequisite relationships and preservation of seeded data. A production baseline still requires verification against the target project's migration history and effective policies. See [issue #6](https://github.com/paulhainsworth/volunteer/issues/6) and the [migration guide](migrations/README.md).
