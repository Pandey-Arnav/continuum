-- Continuum core schema: one `entries` table holds output from BOTH
-- scenarios (community health worker voice visits and discharge photos).
-- That's the point — one shape, one engine, two entry points.

create extension if not exists "pgcrypto";

create type source_type as enum ('chw_voice_visit', 'discharge_photo');
create type flag_level as enum ('green', 'amber', 'red');
create type recipient_role as enum ('supervising_health_worker', 'patient', 'doctor', 'family_member');

-- A patient/family unit. Every entry belongs to one. Relationships to this
-- table are what RLS checks to decide who can read an entry.
create table patients (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- Who may see a given patient's entries, and in what capacity. A CHW visiting
-- a family, a family member, and a supervising health worker are all rows
-- here — this is intentionally the single source of truth RLS reads from.
create table patient_relationships (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role recipient_role not null,
  created_at timestamptz not null default now(),
  unique (patient_id, user_id, role)
);

-- One row per capture event (one voice note, one photographed document).
-- `structured_data` / `flagged_data` hold the FULL extraction for that
-- capture, so the dashboard's expandable detail view can trace every
-- individual fact back to its own rule — `category` / `flag_level` /
-- `flag_reason` / `rule_id` are the headline (highest-severity) fact, used
-- for the timeline row's flag color and one-line summary.
create table entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  source_type source_type not null,
  raw_input_ref text,               -- storage path to the original audio/photo, for the evidence trail
  raw_text text not null,           -- transcript (translated) or OCR text
  structured_data jsonb not null,   -- StructuredEntry[] from packages/engine — every fact extracted
  flagged_data jsonb not null,      -- FlaggedEntry[] from packages/engine — every fact + its own flag/reason/ruleId
  category text not null,           -- category of the headline (highest-severity) fact
  flag_level flag_level not null,   -- highest severity across flagged_data
  flag_reason text not null,        -- reason for the headline fact
  rule_id text not null,            -- exact Rule.id in packages/engine that produced the headline flag
  recipient recipient_role not null,
  handoff_summary text not null,
  protocol_id text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index entries_patient_id_idx on entries (patient_id);
create index entries_created_at_idx on entries (created_at desc);
create index entries_source_type_idx on entries (source_type);
create index entries_flag_level_idx on entries (flag_level);

alter table patients enable row level security;
alter table patient_relationships enable row level security;
alter table entries enable row level security;

-- A user may see a patient row if they have a relationship to it, OR if they
-- created it themselves. The `created_by` clause exists specifically so a
-- freshly-inserted patient is readable via INSERT...RETURNING before any
-- patient_relationships row exists for it yet (that row is always created in
-- a second statement right after) — without it, INSERT...RETURNING fails
-- RLS because Postgres checks the SELECT policy to return the new row.
create policy "patients readable by related users"
  on patients for select
  using (
    created_by = auth.uid()
    or exists (
      select 1 from patient_relationships pr
      where pr.patient_id = patients.id and pr.user_id = auth.uid()
    )
  );

-- Any signed-in user may create a patient record, only attributed to
-- themselves. There is no invite/claim flow in this demo — the app
-- auto-creates one demo patient per device on first launch. A real
-- deployment would gate this behind CHW/clinic onboarding.
create policy "patients insertable by any signed-in user"
  on patients for insert
  with check (auth.uid() is not null and created_by = auth.uid());

-- Users can see their own relationship rows (not everyone else's, to avoid
-- leaking who else has access to a given patient).
create policy "relationships readable by the user themselves"
  on patient_relationships for select
  using (user_id = auth.uid());

-- A user may only create relationship rows that attach THEMSELVES to a
-- patient (never on behalf of another user_id).
create policy "relationships insertable for self only"
  on patient_relationships for insert
  with check (user_id = auth.uid());

-- Entries are only readable by users with an active relationship to the patient.
create policy "entries readable by related users"
  on entries for select
  using (
    exists (
      select 1 from patient_relationships pr
      where pr.patient_id = entries.patient_id and pr.user_id = auth.uid()
    )
  );

-- Entries may only be inserted by a user who has a relationship to that patient
-- (i.e. a CHW or family member actually attached to the case, not an arbitrary user).
create policy "entries insertable by related users"
  on entries for insert
  with check (
    exists (
      select 1 from patient_relationships pr
      where pr.patient_id = entries.patient_id and pr.user_id = auth.uid()
    )
    and created_by = auth.uid()
  );

-- Entries are an append-only evidence trail: no update, no delete policy is
-- defined, so both are denied by default under RLS.

-- Realtime: let clients subscribe to new entries landing in the dashboard.
alter publication supabase_realtime add table entries;
