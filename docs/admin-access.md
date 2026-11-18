# Administrator access

1. In the approved Supabase project, open Authentication → Users and send an invitation to the administrator's individual email address.
2. Have the recipient accept the invitation. Confirm the verified Auth user ID and matching volunteer profile in that project.
3. For the first administrator, have a project owner promote that specific profile through the project's administrative database connection. Use the verified user ID and confirm the update affects exactly one profile.

   ```sql
   UPDATE public.profiles
   SET role = 'admin'
   WHERE id = '<verified-auth-user-id>'::uuid
   RETURNING id, role;
   ```

4. Have the administrator sign in and confirm they can open the organizer dashboard. Use the organizer user-management screen for subsequent role changes once named access is working.

For an existing deployment, have the project owner look for accounts created from the former shared administrator recipe. After confirming named administrator access, remove administrative access from any shared account, revoke its sessions, and retire it through the project’s account-management process. Historical credentials must be treated as disclosed.
