# Production readiness

## Security boundary

The Expo bundle contains only the Supabase URL, publishable/anon key, and
feature flags. `continuum-provider` receives an authenticated user JWT and
holds all third-party provider secrets server-side.

```text
Expo client -> Supabase Auth/JWT -> continuum-provider -> Gemini/Anthropic/STT/OCR
           -> RLS-scoped Data API -> entries/storage/audit_events
```

The provider function retries remain client-side and idempotent. Entry writes
carry `client_event_id`, which is unique after migration 0004, so a save retry
cannot create a duplicate event. Migration 0005 adds an encrypted device
outbox on native platforms; the web build keeps queued health data only in
memory and never persists it to browser storage.

## Deploy the database and provider

1. Install and authenticate the Supabase CLI.
2. From `backend/supabase`, link the project and apply migrations through
   `0005_year_one_foundation.sql`.
3. Deploy `continuum-provider` with JWT verification enabled.
4. Set at least `GEMINI_API_KEY` as a function secret. Optionally set
   `ANTHROPIC_API_KEY`, `SARVAM_API_KEY`, `ELEVENLABS_API_KEY`, or
   `GOOGLE_VISION_API_KEY`.
5. Set `EXPO_PUBLIC_SECURE_PROVIDER_PROXY=true` and restart Expo.

Example commands (replace the project reference):

```bash
cd backend/supabase
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set GEMINI_API_KEY=YOUR_VALUE
supabase functions deploy continuum-provider
```

## Production authentication

Set `EXPO_PUBLIC_DEMO_MODE=false`. New users sign in with email/password and
must claim a one-time patient code. Only a related doctor or supervising
health worker can call `create_patient_invite`; the database hashes the code,
expires it after seven days, and allows a single claim.

Bootstrap the first approved care-team account once, through the Supabase SQL
editor or another service-role-only administrative path:

```sql
update public.profiles
set app_role = 'clinician'
where user_id = (select id from auth.users where email = 'LEAD_EMAIL');
```

That user can then sign in and select **Create approved workspace**. The
`create_care_workspace` RPC checks the profile role and atomically creates the
patient plus the first relationship. Migration 0004 removes the earlier demo
policies that allowed direct patient creation or arbitrary self-attachment.
Assign CHW/clinician/admin roles only through a trusted administrative path.

## Verification and provenance

- `structure()` rejects invalid categories and empty/non-finite values.
- Invalid timestamps are repaired to the current time.
- Exact evidence snippets are normalized and matched against the raw capture.
- Unmatched snippets are labeled `review`, never assigned artificial model
  confidence.
- Every fact must be manually checked before it can be saved.
- A changed fact requires a reason and is appended to `entry_corrections`;
  the original entry remains immutable.
- Saved rows record review status, reviewer, review time, provider mode,
  protocol version, raw evidence, deterministic rule ID, and an audit event.

## Tests and operations

- GitHub Actions runs install, engine tests, engine build, and app typecheck.
- `backend/supabase/tests/security_invariants.sql` verifies append-only/RLS
  invariants after migrations.
- Provider calls have a 45-second timeout and one retry.
- The dashboard exposes deterministic longitudinal signals, source/severity
  filters, and evidence/rule search.
- The operations view exposes measured workflow success/duration, correction
  count, evidence-match rate, offline backlog, protocol state, and red-item
  acknowledgement. Empty metrics stay empty; the app does not invent pilot
  evidence.

## Non-software release gates

The repository cannot complete clinical approval, informed consent,
organizational contracting, target-EHR validation, or field evaluation by
itself. `docs/release-gates.md` keeps those items blocked until signed evidence
is attached. Never change a protocol to `clinically_approved` merely to make a
demo look complete.

## Dependency risk

The current npm audit reports 19 Expo/Metro-tree advisories and no critical
advisories. npm's suggested automatic resolution is a breaking downgrade from
Expo 57 to Expo 53, so `npm audit fix --force` must not be used. Track an
upstream Expo/Metro release that resolves `image-size` and `uuid`, then upgrade
the Expo SDK as a tested unit. The CI build is the regression gate.
