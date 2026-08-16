# Continuum

One deterministic, explainable care-continuity engine — `capture -> structure
-> compare -> flag -> handoff` — proven across two structurally unrelated
entry points: a community health worker's voice visit, and a photographed
hospital discharge sheet. Both flow through the exact same
`packages/engine/src/pipeline.ts#runPipeline()` and land in one Postgres
table, rendered on one realtime timeline.

Read [`docs/roadmap.md`](docs/roadmap.md) for the three named-but-not-built
extensions (diagnostic-odyssey timeline, postpartum drift monitor, medication
interaction guardian) and exactly which pieces of the engine each would reuse.

**What this does not do:** diagnose, stage disease, predict outcomes,
recommend medication changes, or replace a clinician/emergency service. It
structures information, compares it to a known baseline or protocol using
hand-written deterministic rules, and hands off a plain-language summary.
Nothing more. The only two LLM calls in the whole system are `structure()`
(extraction) and `handoff()` (phrasing) — `compare()`, which decides every
flag, is a pure function with no model involved, and every flag is traceable
to the exact rule (`ruleId`) that produced it.

## Repo structure

```
packages/engine/    Shared capture->structure->compare->flag->handoff engine.
                     Used unchanged by both scenarios — see src/pipeline.ts
                     and src/__tests__/smoke.ts (proves both scenarios run
                     through the same code with zero API keys).
backend/supabase/    Postgres schema + Row-Level Security policies.
app/                 Expo (React Native + TypeScript) client.
docs/roadmap.md      The three unbuilt extensions.
```

## Prerequisites

- Node 20+
- A [Supabase](https://supabase.com) project (free tier)
- Expo Go on an Android device/emulator (iOS/web also work, but this was
  built Android-first per the brief)

## Setup

### 1. Install dependencies (monorepo root)

```bash
npm install   # postinstall automatically builds packages/engine to dist/
```

(If you ever edit `packages/engine` while the app is running, re-run `npm run engine:build` to refresh `dist/` — Metro reads the compiled output, not the TypeScript source.)

### 2. Create the Supabase project and schema

1. Create a project at supabase.com (free tier).
2. In the SQL editor, run the four files in `backend/supabase/migrations/`
   **in order**: `0001_init.sql`, `0002_storage.sql`,
   `0003_fix_patients_readback.sql`, `0004_secure_workflows.sql`
   (0003 fixes a real bug: `INSERT ... RETURNING` on `patients` needs the new
   row to also pass the SELECT policy, which originally required a
   `patient_relationships` row that can't exist yet for a patient still being
   created — 0003 adds `created_by` so the creator can read back their own
   new patient immediately).
3. Go to Authentication → Providers and enable **Anonymous Sign-Ins** — the
   app signs in anonymously on first launch so RLS has a real `auth.uid()` to
   check against, with no login screen needed for the demo.
4. Copy your Project URL and anon public key from Settings → API.

### 3. Configure the app

```bash
cd app
cp .env.example .env
```

Edit `app/.env`:

| Variable | Required? | Effect if unset |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | **Yes** | App shows a setup screen |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | App shows a setup screen |
| `EXPO_PUBLIC_SECURE_PROVIDER_PROXY` | No | `false` keeps the zero-key mock demo; set `true` only after deploying the authenticated provider Edge Function |
| `EXPO_PUBLIC_DEMO_MODE` | No | `true` auto-seeds the hackathon demo; `false` enables email/password sign-in plus one-time patient access claims |

The app is **mock-first**: with only the two Supabase variables set, every
scenario runs end to end (sample voice note or sample discharge sheet →
structured → flagged → handed off → saved to the real Supabase-backed
timeline) with zero provider keys. Real audio/photo processing uses
`backend/supabase/functions/continuum-provider`; provider secrets never ship
in the Expo bundle.

### 4. Optional: deploy real providers securely

From `backend/supabase`, deploy `continuum-provider` and set at least
`GEMINI_API_KEY` as a Supabase function secret. Optional
`ANTHROPIC_API_KEY`, `SARVAM_API_KEY`, `ELEVENLABS_API_KEY`, and
`GOOGLE_VISION_API_KEY` secrets take priority for their role. Then set
`EXPO_PUBLIC_SECURE_PROVIDER_PROXY=true` in `app/.env`.

### 5. Run it

```bash
cd app
npm start
```

Scan the QR code with Expo Go (Android) or press `i`/`w` for iOS
simulator/web.

On first launch the app signs in anonymously, creates one demo patient, and
seeds 3 realistic entries per scenario (via the real mock pipeline, not
hand-authored JSON) so the timeline is never empty.

## What to manually verify per phase

**Core engine:** `cd packages/engine && npm test` runs two suites:
`rules.ts` checks every threshold in both protocols directly against
`compare()` (25 assertions — e.g. systolic BP 139 vs. 140 vs. 160), and
`smoke.ts` runs both scenarios through the identical `runPipeline()` with
mock providers end to end. The second is the literal proof of the
one-engine claim; the first is direct coverage of the part of the system
that's explicitly never allowed to be a model.

**Scenario A (CHW voice visit):** open the "CHW Visit" tab, pick a sample
note (or record real audio), run the pipeline, confirm structured
facts/flags appear with reasons, save, and confirm it lands on the Timeline
tab with a 🎙️ icon.

**Scenario B (discharge photo):** same, on the "Discharge" tab with a 📄
icon — confirm it lands in the *same* timeline, filterable alongside
scenario A entries, proving one engine handles both.

**Dashboard:** tap any entry to expand it — confirm the raw input, every
individual structured fact, and each fact's own flag/reason/rule ID are all
visible (this is the explainability requirement — nothing should be a flag
without a visible trigger).

**Realtime:** with two devices/simulators signed into the same Supabase
project seed, an entry saved on one should appear on the other's Timeline
without a manual refresh.

## Production-readiness notes

- Provider credentials are held by an authenticated Edge Function.
- Migration `0004_secure_workflows.sql` adds profiles, one-time patient
  invites, human review metadata, client-event idempotency, and audit events.
- `EXPO_PUBLIC_DEMO_MODE=false` enables separate accounts and invite claims;
  demo mode intentionally keeps the single-device seeded walkthrough.
- For the first production workspace, create the clinician/CHW account, set
  its `profiles.app_role` with the Supabase admin/SQL editor, then use the
  role-checked **Create approved workspace** action. Direct self-attachment
  to arbitrary patients is denied by migration 0004.
- Extracted source snippets are checked against raw evidence, and users must
  verify every fact before saving.
- See `docs/production-readiness.md` and `docs/safety-and-privacy.md` before
  handling real patient data or making compliance claims.
