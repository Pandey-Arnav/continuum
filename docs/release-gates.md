# Release gates

Status values are `blocked`, `in review`, or `accepted`. Attach evidence and
the approving person/date. Repository tests alone cannot satisfy gates marked
external.

| Gate | Current status | Acceptance evidence |
|---|---|---|
| Intended use and exclusions | Blocked · external | Signed scope and approved claims |
| Protocol clinical approval | Blocked · external | Completed approval records and governed DB metadata |
| Consented evaluation ≥200 cases | Blocked · external | Dataset card, annotation/adjudication, locked report |
| Security risk assessment | Blocked · external | Threat model, test report, remediation/acceptance |
| Privacy/data governance | Blocked · external | Approved data map, terms, retention, request process |
| Accessibility | In review | WCAG 2.2 AA-oriented report and accepted residuals |
| Offline reliability | In review | Supported-device fault-injection report with zero loss/duplicates |
| FHIR interoperability | In review | Named profile/system conformance and error-handling report |
| Recovery and incident response | Blocked · external | Successful restore drill and incident tabletop |
| Limited partner pilot | Blocked · external | Signed protocol, consent, metric/deviation/incident report |
| Software verification | In review | Green CI, dependency review, database invariant results |

## Allowed states

- Demo: synthetic data, mock or approved test providers, visible limitations.
- Evaluation: approved data handling, no care decisions, supervised access.
- Limited pilot: every pre-pilot gate accepted and stop conditions active.
- Production candidate: all gates accepted for the named organization,
  population, protocol, device, language, and receiving system.

No broad claim such as “clinically validated,” “compliant,” “safe,” or
“production ready” is permitted from an incomplete gate table.
