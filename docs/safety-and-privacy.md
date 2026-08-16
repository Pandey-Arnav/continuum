# Safety and privacy operating rules

Continuum is a care-continuity and handoff tool. It is not a diagnostic,
treatment, medication-change, emergency-response, or autonomous monitoring
system.

## Before using real patient information

- Obtain review from a qualified clinical lead, privacy/security lead, and
  applicable legal/compliance counsel.
- Complete and document a security risk assessment for the deployment.
- Define the organization responsible for the data and its approved users.
- Publish consent, retention, correction, export, and deletion-request rules.
- Use separate development, staging, and production Supabase projects.
- Disable anonymous sign-ins outside demo mode.
- Confirm backups, incident response, log retention, and provider data-use
  settings before enabling real capture.

Do not describe the application as HIPAA compliant, FDA cleared, clinically
validated, or production ready without an evidence-backed review for the
specific deployment and intended use.

## Clinical safety controls

- `compare()` remains deterministic and cannot call an LLM.
- Model output is limited to extraction and phrasing.
- A user must inspect source evidence and confirm every fact before saving.
- Longitudinal signals summarize previous rule outcomes; they do not introduce
  new clinical thresholds or interaction claims.
- Red flags must link to raw evidence, reason, protocol, and rule ID.
- Never represent a missing check-in as a medical event without confirming the
  data-collection expectation and context.
- Any emergency wording must direct users to the organization's approved local
  emergency workflow; Continuum must not promise continuous monitoring.

## Data minimization

- Collect the minimum raw audio/photo/text needed for the defined workflow.
- Keep provider keys and privileged database credentials off client devices.
- Avoid provider request/response bodies in logs.
- Use private evidence storage and relationship-based RLS.
- Prefer deletion requests and an auditable administrative process over giving
  every client direct destructive access to the evidence trail.

## Human testing

Run moderated tests with at least:

- two community health workers or nurses;
- one supervising clinician;
- two patient/caregiver participants;
- one privacy or security reviewer.

Record task completion, incorrect interpretations, missed evidence, time to
handoff, and whether users understand that flags are not diagnoses.
