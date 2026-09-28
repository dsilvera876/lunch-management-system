# User account lifecycle

## Deactivate (normal HR lifecycle)

HR uses **Deactivate / Reactivate** on the Users workspace for staff who should no longer sign in while preserving operational history.

- Preserves lunch orders, financial history, late-order participation, and delivery audit trails.
- Keeps the authentication identity and profile linked to historical records.
- Intended for employment or access changes, not for removing test or mistaken accounts.

## Permanent delete (Admin / Owner cleanup)

Admin and Owner can **Delete account permanently** from User Management (role directory) for **clean accounts only**.

- Irreversible: removes the application profile and Supabase Auth identity.
- Blocked when the user has lunch or other business history (orders, late-order workflow, dispatch reviews, delivery audit participation).
- Blocked for the current Owner (transfer ownership first) and for self-deletion.
- HR, Accounts, and Staff do not have this action.
- After deletion, signup/setup records and queued invite mail for that identity are cleared in the database immediately.
- The email address becomes reusable only after **Auth cleanup succeeds** (`auth.admin.deleteUser`). If that step fails, a durable audit record stays `pending` and the `worker:auth-deletion-cleanup` task retries automatically.

Choose a deletion reason (test account, duplicate/error, other) when confirming. Confirmation requires typing the user's email address.
