# Extraction and workflow evaluation plan

## Dataset

Target at least 200 consented, de-identified cases before a production claim.
Predefine strata for CHW/discharge source, language, device, environment,
capture quality, category, severity, and common edge cases. Synthetic cases
are useful for unit tests but do not count as clinical validation.

Two trained annotators label the same initial subset. Resolve disagreements
through a third qualified reviewer and record the adjudication. Freeze a
locked acceptance set before final tuning. Publish a dataset card covering
source, consent, transformations, exclusions, missingness, subgroup sizes,
known biases, and permitted uses.

## Metrics

- Exact and clinically acceptable extraction precision, recall, and F1 by
  category and subgroup.
- Evidence-match rate and unsupported-fact rate.
- Deterministic rule agreement with the approved protocol test oracle.
- Red-item false-negative and false-positive counts, reported separately.
- Correction rate and correction reason distribution.
- Verified-handoff completion, abandonment, median duration, and p95 duration.
- Notification delivery and acknowledgement time.
- Duplicate, loss, and order errors during offline/reconnect testing.
- User comprehension of limitations and escalation instructions.

## Proposed gates

The clinical owner must set thresholds before the locked test. A starting
discussion—not an approval—is: no known critical false negative, at least 95%
evidence match, category-level recall targets for red-relevant facts, no
subgroup hidden by an overall average, 100% offline idempotency in the device
matrix, and all safety-critical usability tasks completed without assistance.

Every report must include numerator/denominator, confidence interval where
appropriate, missing data, deviations, failed cases, software/protocol/model
versions, evaluator names, and the date. Do not publish only a single accuracy
percentage.

## Repository support

`evaluateExtractions()` calculates exact-match precision, recall, F1,
evidence-match rate, and category breakdowns. Unit tests verify the metric
implementation. A partner evaluation must supply the reviewed cases and an
approved clinically acceptable-match policy.
