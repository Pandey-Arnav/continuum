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
2. In the SQL editor, run the two files in `backend/supabase/migrations/` **in
   order**: `0001_init.sql`, then `0002_storage.sql`.
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
| `EXPO_PUBLIC_ANTHROPIC_API_KEY` | No | `structure()`/`handoff()` use a heuristic mock extractor instead of Claude |
| `EXPO_PUBLIC_SARVAM_API_KEY` | No | Voice capture uses a canned sample transcript instead of real Hindi/Marathi STT |
| `EXPO_PUBLIC_GOOGLE_VISION_API_KEY` | No | Photo capture uses a canned sample discharge-sheet text instead of real OCR |

The app is **mock-first**: with only the two Supabase variables set, every
scenario runs end to end (sample voice note or sample discharge sheet →
structured → flagged → handed off → saved to the real Supabase-backed
timeline) with zero other API keys. Each of the three optional providers
upgrades independently — add one key at a time with no code changes.

### 4. Run it

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

## Known simplifications (hackathon scope, not production-ready)

- **Client-side LLM/OCR/STT calls.** `EXPO_PUBLIC_*` env vars are bundled
  into the client, so any configured API key is visible to anyone who
  inspects the app bundle. Production would proxy `structure()`/`handoff()`/
  provider calls through a Supabase Edge Function holding the key
  server-side — the engine functions are provider-agnostic by design, so
  this is a wiring change, not a rewrite.
- **Single demo account, four roles.** The seeded demo user is attached to
  the demo patient under all four `recipient_role`s at once so one device
  can see the whole dashboard. A real deployment would have distinct
  accounts per role with an invite/claim flow instead of open self-registration.
- **No patient-claim flow.** Any signed-in user can currently create a
  `patients` row and attach themselves to it (see RLS policies in
  `0001_init.sql`) — fine for a single-patient demo, not for multi-tenant use.
