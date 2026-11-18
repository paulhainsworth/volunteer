# Bootstrap a disposable volunteer database

Use [the bootstrap script](../scripts/bootstrap-local-db.sh) on a blank local database that already has Supabase Auth objects and database roles. It applies the base schema, required leader and affiliation patches, and public signup counts before the timestamped migrations. A failure rolls back the transaction.

With approved local database connection variables set, run:

```sh
sh scripts/bootstrap-local-db.sh
```

The script checks for Auth dependencies and refuses a database with existing volunteer tables. It accepts local connections only. Use a disposable database that you can recreate.

## Hosted setup and upgrades

For a new staging project, use the [prerequisite SQL order](../supabase/README.md#bootstrap-exercised-in-tests), then apply the timestamped migrations with [migration tracking](../supabase/migrations/README.md). Confirm the project target before using the SQL Editor or migration tools. Rehearse login, role availability, and waiver signing with synthetic accounts.

For an existing environment, confirm its migration history, applied manual patches, and effective access policies before choosing an upgrade path. Keep hosted migration history under the [Supabase migration workflow](../supabase/migrations/README.md). The local bootstrap script does not write hosted migration history. Confirm deployed functions, configuration names, and the active scheduler separately before promotion. See [issue #6](https://github.com/paulhainsworth/volunteer/issues/6).
