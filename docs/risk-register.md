# Initial risk register

Owners must assign likelihood, impact, treatment, evidence, target date, and
residual risk. Review weekly during a pilot.

| Risk | Current controls | Required next evidence |
|---|---|---|
| Incorrect extraction | Evidence snippets, human verification, correction ledger | Locked category/subgroup evaluation |
| Unsafe rule or localization | Deterministic IDs, draft protocol block | Signed rule-by-rule approval |
| Red item not acted on | Notifications and acknowledgement audit | Partner response-time test and out-of-hours process |
| Missing or stale data mistaken as stable | Plain-language limitations; no “all clear” claim | Comprehension testing and approved empty-state copy |
| Unauthorized access | Auth, relationship RLS, one-time invite claims | Threat model, access review, penetration test |
| Sensitive data sent to providers | Authenticated server proxy and no client secrets | Provider contracts/settings and data-flow approval |
| Offline loss or duplication | Encrypted native outbox and client IDs | Supported-device fault-injection report |
| Lost/stolen device | Keystore-bound outbox key | MDM/session-revocation/device-loss rehearsal |
| Unbounded retention | Retention review date and request queue | Approved retention schedule and execution job |
| Invalid FHIR import | Pilot tag and provenance | Target implementation-guide validation |
| Accessibility failure | 44px controls and accessible states in new flows | Independent WCAG 2.2 AA-oriented audit |
| Dependency vulnerability | CI build/typecheck; documented Expo advisories | Upgrade plan and release-time scan |
| Misleading validation/compliance claim | Draft statuses and blocked release gate | Evidence review of all public claims |
