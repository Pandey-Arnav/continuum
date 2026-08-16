# Ten-week hackathon execution plan

## Week 1 — scope and baseline

- Obtain the judging rubric and lock a two-minute product story.
- Name one primary user and one measurable continuity failure.
- Record current task time and extraction-correction rate.

## Week 2 — secure backend

- Apply migration 0004, deploy `continuum-provider`, and move provider secrets.
- Verify unauthenticated function calls fail.

## Week 3 — accounts and access

- Disable demo mode in staging.
- Approve the first clinician/CHW profile through the admin path and create the
  first workspace through the role-checked onboarding action.
- Test separate CHW, clinician, patient, and caregiver accounts.
- Run invite creation/claim and cross-user RLS tests.

## Week 4 — evidence verification

- Test source matching and manual confirmation with real sample documents.
- Create a labeled set of at least 50 facts with expected categories/values.

## Week 5 — longitudinal story

- Tune recurring-category and medication-reconciliation rules with the clinical
  reviewer.
- Add only evidence-backed thresholds; do not add an interaction recommender.

## Week 6 — reliability

- Test slow/offline provider responses, duplicate saves, expired invites,
  corrupt photos, empty audio, and malformed model JSON.
- Decide the offline capture/queue policy for the target field environment.

## Week 7 — CI, security, accessibility

- Require CI before merging.
- Run database security invariants and keyboard/screen-reader checks.
- Review audit events and provider logs for accidental patient data.

## Week 8 — product polish

- Finish patient selection if the demo includes multiple patients.
- Validate dashboard search/filters, role-specific language, loading, empty,
  and error states.

## Week 9 — usability and pitch testing

- Run at least five moderated user sessions.
- Fix the top three observed failures, not the top three requested features.
- Rehearse with unreliable Wi-Fi and a fresh device/account.

## Week 10 — freeze

- Freeze features, run the release checklist, and seed deterministic demo data.
- Prepare a two-minute backup video and static screenshots.
- Rehearse the live path: capture -> verify -> longitudinal signal -> handoff.

## Do not spend the ten weeks on

- all three roadmap extensions;
- unvalidated medication-interaction claims;
- decorative dashboard modules that do not work;
- provider or model proliferation;
- compliance language without deployment-specific evidence.
