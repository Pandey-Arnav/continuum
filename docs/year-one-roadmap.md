# Continuum year-one execution plan

This plan converts the hackathon prototype into an evidence-producing pilot.
Code can prepare the controls; qualified people must approve the clinical,
privacy, security, and organizational decisions.

## Outcomes by month 12

- One sharply defined intended-use statement and one named clinical owner.
- Two localized protocol versions approved through the documented process—or
  one intentionally removed if it cannot be supported safely.
- A consented, de-identified evaluation set with at least 200 representative
  cases, stratified by source type, language, image/audio quality, and key
  categories.
- A six-to-eight-week partner pilot with measured task completion, correction,
  acknowledgement, latency, and safety-event results.
- A threat model, remediation log, recovery rehearsal, accessibility report,
  data-processing map, and incident-response tabletop.
- A validated FHIR profile for one named receiving system. The generic bundle
  in this repository is only a pilot export.

## Quarter 1 — narrow, govern, and measure

1. Freeze intended use, users, excluded uses, escalation ownership, and local
   emergency wording.
2. Appoint clinical, product, privacy, and security owners. Run the clinical
   approval template for every rule and source.
3. Apply migration 0005 in a non-production project and exercise consent,
   correction, assignment, retention, notification, and export events.
4. Build the evaluation dataset under an approved annotation protocol. Keep
   training/development cases separate from the locked acceptance set.
5. Establish baselines for extraction precision/recall, evidence matching,
   workflow completion, and time to verified handoff.

Exit evidence: signed intended-use record, protocol-review minutes, threat
model v1, dataset card, baseline report, and no unresolved critical security
finding.

## Quarter 2 — harden and integrate

1. Test offline capture on the actual supported Android devices: process
   termination, low storage, clock drift, reconnect, duplicate delivery, and
   lost-device response.
2. Validate account provisioning, access removal, backups, restore, audit
   review, and incident handling with the partner's owners.
3. Complete WCAG 2.2 AA-oriented keyboard, focus, screen-reader, contrast,
   zoom/reflow, target-size, error, and plain-language testing.
4. Select one FHIR implementation guide and receiving sandbox. Map identifiers,
   terminology, consent, provenance, and errors; add conformance tests.
5. Load-test expected concurrency and degraded provider conditions without
   logging health-content payloads.

Exit evidence: device matrix, recovery report, accessibility report, approved
data-flow diagram, FHIR conformance report, and remediated high findings.

## Quarter 3 — supervised partner pilot

1. Train a small, named cohort. Use synthetic data first, then consented pilot
   data only after the readiness review.
2. Run a shadow-mode period: Continuum outputs do not change care decisions;
   users compare them with the current workflow.
3. Move to limited assisted use only if safety criteria pass. A human remains
   responsible for verification and escalation.
4. Review red-item acknowledgement daily and safety/correction trends weekly.
5. Stop or roll back if a stop condition in `pilot-protocol.md` is reached.

Exit evidence: pilot log, deviations, user research notes, incident log,
metric report, and partner sign-off on interpretation.

## Quarter 4 — decide, document, and submit

1. Repeat the locked evaluation on the release candidate. Report subgroup
   results and confidence intervals; do not average away a weak subgroup.
2. Close or explicitly accept residual risks with named owners and expiry
   dates.
3. Package the architecture, model/provider inventory, protocol registry,
   evaluation, security, privacy, accessibility, pilot, and limitations
   evidence.
4. Produce a five-minute failure-aware demo: show provenance, a correction,
   offline queue, protocol block, red acknowledgement, and measured results.
5. Decide one of three states: production candidate, another limited pilot,
   or stop. Submission deadline pressure is not a reason to waive a gate.

## Weekly operating rhythm

- Monday: risks, incidents, data quality, and blocked release gates.
- Midweek: product/engineering delivery and test evidence.
- Friday: clinical review of rule/dataset changes and user-research findings.
- Monthly: partner steering review, access review, recovery check, dependency
  review, and roadmap reprioritization.
