# Data governance baseline

## Data map

Document controller/owner, users, Supabase region/project, provider, storage,
backup, log, export destination, legal/organizational basis, retention, and
deletion process for every data class: account, relationship, raw evidence,
transcript/OCR, structured fact, flag, handoff, correction, consent,
notification, audit, telemetry, and FHIR export event.

## Enforced design choices

- Patient access is relationship-scoped under RLS.
- Original entries, corrections, consent decisions, and audit history are
  append-only from clients.
- Notification content cannot be directly edited; acknowledgement uses a
  narrow RPC and creates an audit event.
- Third-party credentials remain in an authenticated server function.
- Native offline records are encrypted with a key protected by the device
  keystore; web offline records are volatile and disappear with the tab.
- Provider payloads and raw clinical content must not be written to logs.
- FHIR exports are recorded and labeled pilot.

## Operational controls still required

- Approved retention schedule and a reviewed archival/deletion job.
- Backup/restore objectives and a tested restore.
- Access review and prompt removal procedure.
- Key/secret rotation, environment separation, and production change control.
- Provider data-processing terms and settings.
- Incident classification, notification, evidence preservation, and tabletop.
- Data-subject request verification, decision, completion, and appeal process.

The `retention_until` field records a governance date; it intentionally does
not auto-delete health records. Destructive retention execution requires the
responsible organization's approved policy and a recoverable, audited job.
