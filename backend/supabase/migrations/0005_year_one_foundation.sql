-- Year-one foundation: protocol governance, append-only corrections,
-- multi-patient work queues, consent/retention, notifications, operational
-- telemetry, and export accountability. No table in this migration turns an
-- unapproved protocol into clinical guidance.

create type protocol_status as enum ('draft_unapproved', 'clinically_approved', 'retired');
create type assignment_status as enum ('active', 'completed', 'cancelled');
create type consent_kind as enum ('capture_processing', 'raw_evidence_storage', 'provider_processing', 'research_use');
create type consent_state as enum ('granted', 'declined', 'revoked');
create type notification_status as enum ('unread', 'read', 'acknowledged');
create type data_request_type as enum ('export', 'correction', 'deletion');
create type data_request_status as enum ('requested', 'reviewing', 'completed', 'declined');

alter table patients
  add column external_identifier text,
  add column date_of_birth date,
  add column retention_until date,
  add column archived_at timestamptz;

create unique index patients_external_identifier_unique
  on patients (external_identifier)
  where external_identifier is not null;

create table protocol_versions (
  id text primary key,
  protocol_id text not null,
  version text not null,
  name text not null,
  status protocol_status not null default 'draft_unapproved',
  source_uri text,
  source_title text,
  jurisdiction text,
  effective_at timestamptz,
  review_due_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  rules_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (protocol_id, version),
  check (
    status <> 'clinically_approved'
    or (approved_by is not null and approved_at is not null and source_uri is not null)
  )
);

alter table protocol_versions enable row level security;
create policy "authenticated users can read protocol versions"
  on protocol_versions for select
  using (auth.uid() is not null);

insert into protocol_versions (id, protocol_id, version, name, status, source_title, metadata)
values
  (
    'antenatal_ncd_v1',
    'antenatal_ncd',
    '1.0.0',
    'Antenatal / NCD Community Screening Protocol',
    'draft_unapproved',
    'Illustrative hackathon rule set; clinical localization required',
    '{"clinical_use_blocked":true,"owner_required":true}'::jsonb
  ),
  (
    'discharge_red_flags_v1',
    'discharge_red_flags',
    '1.0.0',
    'Hospital Discharge Review Protocol',
    'draft_unapproved',
    'Illustrative discharge continuity rule set; clinical localization required',
    '{"clinical_use_blocked":true,"owner_required":true}'::jsonb
  )
on conflict (id) do nothing;

alter table entries
  add column protocol_version_id text references protocol_versions(id),
  add column captured_offline_at timestamptz,
  add column synced_at timestamptz not null default now();

update entries
set protocol_version_id = protocol_id
where protocol_id in ('antenatal_ncd_v1', 'discharge_red_flags_v1');

create table entry_corrections (
  id uuid primary key default gen_random_uuid(),
  client_correction_id uuid not null unique,
  entry_id uuid not null references entries(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  fact_index integer not null check (fact_index >= 0),
  original_fact jsonb not null,
  corrected_fact jsonb not null,
  reason text not null check (length(trim(reason)) >= 3),
  corrected_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index entry_corrections_entry_idx on entry_corrections (entry_id, created_at);
alter table entry_corrections enable row level security;
create policy "corrections readable by related users"
  on entry_corrections for select
  using (
    exists (
      select 1 from patient_relationships pr
      where pr.patient_id = entry_corrections.patient_id
        and pr.user_id = auth.uid()
    )
  );
create policy "care team can append corrections"
  on entry_corrections for insert
  with check (
    corrected_by = auth.uid()
    and exists (
      select 1 from patient_relationships pr
      where pr.patient_id = entry_corrections.patient_id
        and pr.user_id = auth.uid()
        and pr.role in ('supervising_health_worker', 'doctor')
    )
  );

create table patient_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  assignee_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  status assignment_status not null default 'active',
  priority flag_level not null default 'green',
  due_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index patient_assignments_assignee_idx
  on patient_assignments (assignee_id, status, due_at);
alter table patient_assignments enable row level security;
create policy "assignments readable by assignee or related care team"
  on patient_assignments for select
  using (
    assignee_id = auth.uid()
    or exists (
      select 1 from patient_relationships pr
      where pr.patient_id = patient_assignments.patient_id
        and pr.user_id = auth.uid()
        and pr.role in ('supervising_health_worker', 'doctor')
    )
  );
create policy "care team can create assignments"
  on patient_assignments for insert
  with check (
    assigned_by = auth.uid()
    and exists (
      select 1 from patient_relationships pr
      where pr.patient_id = patient_assignments.patient_id
        and pr.user_id = auth.uid()
        and pr.role in ('supervising_health_worker', 'doctor')
    )
  );

create or replace function public.set_patient_assignment_status(
  target_assignment_id uuid,
  assignment_status_value assignment_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_patient_id uuid;
begin
  select patient_id into target_patient_id
  from patient_assignments
  where id = target_assignment_id
    and (
      assignee_id = auth.uid()
      or exists (
        select 1 from patient_relationships pr
        where pr.patient_id = patient_assignments.patient_id
          and pr.user_id = auth.uid()
          and pr.role in ('supervising_health_worker', 'doctor')
      )
    );
  if target_patient_id is null then raise exception 'Assignment not found'; end if;

  update patient_assignments
  set status = assignment_status_value, updated_at = now()
  where id = target_assignment_id;

  insert into audit_events (patient_id, actor_id, action, metadata)
  values (
    target_patient_id,
    auth.uid(),
    'assignment.status_changed',
    jsonb_build_object('assignment_id', target_assignment_id, 'status', assignment_status_value)
  );
end;
$$;

revoke all on function public.set_patient_assignment_status(uuid, assignment_status) from public;
grant execute on function public.set_patient_assignment_status(uuid, assignment_status) to authenticated;

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  subject_user_id uuid references auth.users(id),
  kind consent_kind not null,
  state consent_state not null,
  policy_version text not null,
  recorded_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  notes text
);

create index consent_records_latest_idx
  on consent_records (patient_id, kind, recorded_at desc);
alter table consent_records enable row level security;
create policy "consent readable by related users"
  on consent_records for select
  using (
    exists (
      select 1 from patient_relationships pr
      where pr.patient_id = consent_records.patient_id
        and pr.user_id = auth.uid()
    )
  );

create or replace function public.record_patient_consent(
  target_patient_id uuid,
  consent_kind_value consent_kind,
  consent_state_value consent_state,
  policy_version_value text,
  consent_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  result_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(policy_version_value, ''))) < 1 then
    raise exception 'Policy version is required';
  end if;
  if not exists (
    select 1 from patient_relationships pr
    where pr.patient_id = target_patient_id and pr.user_id = auth.uid()
  ) then raise exception 'Patient access is required'; end if;

  insert into consent_records (
    patient_id, subject_user_id, kind, state, policy_version, recorded_by, notes
  ) values (
    target_patient_id, auth.uid(), consent_kind_value, consent_state_value,
    trim(policy_version_value), auth.uid(), consent_notes
  ) returning id into result_id;
  return result_id;
end;
$$;

revoke all on function public.record_patient_consent(uuid, consent_kind, consent_state, text, text) from public;
grant execute on function public.record_patient_consent(uuid, consent_kind, consent_state, text, text) to authenticated;

create table data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  request_type data_request_type not null,
  status data_request_status not null default 'requested',
  detail text,
  resolution text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table data_subject_requests enable row level security;
create policy "requester and related care team can read data requests"
  on data_subject_requests for select
  using (
    requested_by = auth.uid()
    or exists (
      select 1 from patient_relationships pr
      where pr.patient_id = data_subject_requests.patient_id
        and pr.user_id = auth.uid()
        and pr.role in ('supervising_health_worker', 'doctor')
    )
  );
create policy "related users can create their own data requests"
  on data_subject_requests for insert
  with check (
    requested_by = auth.uid()
    and exists (
      select 1 from patient_relationships pr
      where pr.patient_id = data_subject_requests.patient_id
        and pr.user_id = auth.uid()
    )
  );

create or replace function public.set_patient_retention(
  target_patient_id uuid,
  retention_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if retention_date is not null and retention_date < current_date then
    raise exception 'Retention date cannot be in the past';
  end if;
  if not exists (
    select 1 from patient_relationships pr
    where pr.patient_id = target_patient_id
      and pr.user_id = auth.uid()
      and pr.role in ('supervising_health_worker', 'doctor')
  ) then raise exception 'Only the related care team can set retention'; end if;
  update patients set retention_until = retention_date where id = target_patient_id;
end;
$$;

revoke all on function public.set_patient_retention(uuid, date) from public;
grant execute on function public.set_patient_retention(uuid, date) to authenticated;

create table care_notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  entry_id uuid references entries(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  message text not null,
  status notification_status not null default 'unread',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  acknowledged_at timestamptz,
  unique (entry_id, recipient_id, kind)
);

create index care_notifications_recipient_idx
  on care_notifications (recipient_id, status, created_at desc);
alter table care_notifications enable row level security;
create policy "users can read their notifications"
  on care_notifications for select using (recipient_id = auth.uid());

create or replace function public.acknowledge_care_notification(target_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_patient_id uuid;
  target_entry_id uuid;
begin
  update care_notifications
  set status = 'acknowledged',
      read_at = coalesce(read_at, now()),
      acknowledged_at = coalesce(acknowledged_at, now())
  where id = target_notification_id
    and recipient_id = auth.uid()
  returning patient_id, entry_id into target_patient_id, target_entry_id;

  if target_patient_id is null then raise exception 'Notification not found'; end if;
  insert into audit_events (patient_id, entry_id, actor_id, action, metadata)
  values (target_patient_id, target_entry_id, auth.uid(), 'notification.acknowledged', jsonb_build_object('notification_id', target_notification_id));
end;
$$;

revoke all on function public.acknowledge_care_notification(uuid) from public;
grant execute on function public.acknowledge_care_notification(uuid) to authenticated;

create or replace function public.create_red_entry_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.flag_level <> 'red' then return new; end if;
  insert into care_notifications (
    patient_id, entry_id, recipient_id, kind, title, message
  )
  select
    new.patient_id,
    new.id,
    pr.user_id,
    'red_entry',
    'New continuity item needs attention',
    new.flag_reason
  from patient_relationships pr
  where pr.patient_id = new.patient_id
    and pr.role in ('supervising_health_worker', 'doctor')
  on conflict (entry_id, recipient_id, kind) do nothing;
  return new;
end;
$$;

create trigger entries_create_red_notifications
  after insert on entries
  for each row execute function public.create_red_entry_notifications();

create table workflow_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  event_name text not null,
  success boolean not null,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  client_event_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workflow_events_patient_created_idx
  on workflow_events (patient_id, created_at desc);
alter table workflow_events enable row level security;
create policy "related users can insert workflow events"
  on workflow_events for insert
  with check (
    actor_id = auth.uid()
    and (
      patient_id is null
      or exists (
        select 1 from patient_relationships pr
        where pr.patient_id = workflow_events.patient_id
          and pr.user_id = auth.uid()
      )
    )
  );
create policy "care team can read workflow events"
  on workflow_events for select
  using (
    patient_id is not null
    and exists (
      select 1 from patient_relationships pr
      where pr.patient_id = workflow_events.patient_id
        and pr.user_id = auth.uid()
        and pr.role in ('supervising_health_worker', 'doctor')
    )
  );

create table fhir_export_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  exported_by uuid not null references auth.users(id),
  resource_count integer not null check (resource_count >= 0),
  fhir_version text not null,
  destination text,
  created_at timestamptz not null default now()
);

alter table fhir_export_events enable row level security;
create policy "related users can record exports"
  on fhir_export_events for insert
  with check (
    exported_by = auth.uid()
    and exists (
      select 1 from patient_relationships pr
      where pr.patient_id = fhir_export_events.patient_id
        and pr.user_id = auth.uid()
    )
  );
create policy "related care team can read export events"
  on fhir_export_events for select
  using (
    exists (
      select 1 from patient_relationships pr
      where pr.patient_id = fhir_export_events.patient_id
        and pr.user_id = auth.uid()
        and pr.role in ('supervising_health_worker', 'doctor')
    )
  );

create or replace function public.audit_entry_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_events (patient_id, entry_id, actor_id, action, metadata)
  values (
    new.patient_id,
    new.entry_id,
    new.corrected_by,
    'entry.corrected',
    jsonb_build_object(
      'correction_id', new.id,
      'fact_index', new.fact_index,
      'reason', new.reason,
      'original_fact', new.original_fact,
      'corrected_fact', new.corrected_fact
    )
  );
  return new;
end;
$$;

create trigger entry_corrections_create_audit_event
  after insert on entry_corrections
  for each row execute function public.audit_entry_correction();

alter publication supabase_realtime add table care_notifications;
alter publication supabase_realtime add table patient_assignments;
