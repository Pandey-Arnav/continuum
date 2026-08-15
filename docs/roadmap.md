# Roadmap: the same engine, new entry points

Continuum's technical claim is that `packages/engine`'s
`capture -> structure -> compare -> flag -> handoff` pipeline is a
general-purpose care-continuity engine, not a pair of point solutions. The
two built scenarios — a community health worker's voice visit and a
photographed hospital discharge sheet — prove that claim by sharing one
`runPipeline()` call, one `compare()` function, and one `entries` table
despite having nothing in common at the input layer (Hindi/Marathi audio vs.
a photographed English document) or the output layer (a supervising health
worker vs. the patient themselves).

The three extensions below are **not built**. Each is scoped here to show
exactly which pieces of the existing engine it reuses unchanged, and which
two things it would actually need to add — because that's the real test of
"one platform": can a new scenario be described as a diff against the engine,
rather than a new app.

## 1. Diagnostic-odyssey symptom timeline

**Problem:** A patient bouncing between specialists re-tells their history
from scratch at every visit, and the pattern connecting symptoms across
months gets lost.

**Reuses unchanged:** `capture()` (voice note per symptom log), `structure()`
(same LLM-extraction shape, new schema), the `entries` table and unified
dashboard, `handoff()` phrased for "the next doctor."

**New pieces:**
- A **baseline protocol** instead of a clinical screening protocol: `compare()`
  rules that flag *drift from the patient's own history* (a symptom
  recurring, a new symptom co-occurring with an existing one, a gap in
  reported check-ins) rather than fixed clinical thresholds. `compare()`
  stays deterministic — the rules just read from the patient's own prior
  `entries` instead of a fixed table.
- A longitudinal view on the dashboard (the existing timeline, sorted/grouped
  by symptom category instead of only by date).

## 2. Postpartum mental health drift monitor

**Problem:** Postpartum depression/anxiety often gets missed because it's
gradual — no single day looks alarming, but the trend does.

**Reuses unchanged:** `capture()` (daily voice check-in, same STT provider),
`structure()` → `compare()` → `flag()` → `handoff()` end to end, addressed to
"family member."

**New pieces:**
- A **sentiment/pattern-drift schema**: `structure()` extracts a small set
  of self-reported categories (sleep, mood, appetite, social withdrawal)
  instead of vitals.
- `compare()` rules that trigger on *trend*, not a single value — e.g. "mood
  category flagged amber or worse on 3 of the last 5 check-ins." Still a
  pure function over structured entries; it just windows over the patient's
  own recent `entries` rather than a single reading.

## 3. Medication interaction guardian

**Problem:** Patients on multiple prescriptions from different doctors have
no single place checking whether a new pill bottle interacts with what
they're already taking.

**Reuses unchanged:** `capturePhoto()` + OCR (same as the discharge-sheet
scenario, literally the same function), `structure()` extracting medication
name/dose, `handoff()` addressed to "patient."

**New pieces:**
- An **external interaction lookup** inside `compare()`'s data source: instead
  of hardcoded thresholds, rules query an open drug-interaction database
  (e.g. RxNorm/DrugBank open data) keyed by the patient's existing medication
  list (already sitting in `entries` from prior discharge-sheet or pharmacy
  captures). The *decision* stays deterministic and inspectable — it's a
  database lookup + rule, never a model guessing at interactions.
- A running "current medication list" view derived from filtering `entries`
  by `category = medication_change`.

## What stays constant across all five

- `compare()` never calls a model. Every flag remains traceable to one rule
  and its inputs.
- `structure()` and `handoff()` are the only two LLM calls, and they only
  extract/phrase — never judge.
- One `entries` table, one dashboard, one realtime subscription.

That constancy — not the number of scenarios — is the platform.
