# Manual data cleanup

Use [the cleanup runner](../scripts/run-sql-cleanup.sh) for the volunteer and role cleanup scripts. The default run executes the cleanup in a transaction and rolls it back. Review the script’s selection and the command output before requesting an authorized apply.

1. Obtain approval for the exact Supabase project and record the intended selection. Confirm a usable backup and the restore owner before proceeding. Check expected cascades to assignments and waivers.
2. Set `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER` from the approved connection settings. For a pooled connection, include the project-qualified database user. Supply authentication through your approved credential mechanism. Verify TLS for hosted connections.
3. Independently copy the approved target into the following command. The target string is checked against the connection settings before the tool connects.

```sh
bash scripts/run-sql-cleanup.sh REMOVE_CLOWN_ROLES.sql \
  --target 'localhost:5432/fixture_db@fixture_user'
```

4. Review the affected rows, cascades, and rollback output. If scope and recovery are approved, repeat the same command with `--apply`. An error terminates the run and disconnects with the transaction uncommitted.
5. Verify the post-apply roster. After a commit, use the separately approved database recovery procedure to restore affected records.

The runner accepts the exact cleanup filenames in its allowlist. If a script has a commented deletion block, review and enable the intended block before previewing so preview and apply execute the same SQL. Keep any edited list of real volunteer emails outside Git.
