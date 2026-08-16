-- Production-readiness layer: explicit user roles, patient invite/claim flow,
-- human verification metadata, and an append-only audit trail.

create type app_role as enum ('chw', 'patient', 'clinician', 'caregiver', 'admin');
create type review_status as enum ('unreviewed', 'human_verified', 'demo_seeded');

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  app_role app_role not null default 'patient',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
create policy "profiles readable by owner"
  on profiles for select using (user_id = auth.uid());

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, app_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', 'Continuum user'),
    case when coalesce(new.is_anonymous, false) then 'chw'::app_role else 'patient'::app_role end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into profiles (user_id, display_name, app_role)
select
  id,
  coalesce(raw_user_meta_data ->> 'display_name', 'Continuum user'),
  case when coalesce(is_anonymous, false) then 'chw'::app_role else 'patient'::app_role end
from auth.users
on conflict (user_id) do nothing;

update profiles p
set app_role = 'chw'
from auth.users u
where p.user_id = u.id and coalesce(u.is_anonymous, false);

-- Remove the permissive demo bootstrap paths from migration 0001. Workspace
-- creation is now performed only by the role-checked function below.
drop policy if exists "patients insertable by any signed-in user" on patients;
drop policy if exists "relationships insertable for self only" on patient_relationships;

create or replace function public.create_care_workspace(patient_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role app_role;
  new_patient_id uuid;
  relationship_role recipient_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select app_role into current_role
  from profiles
  where user_id = auth.uid();

  if current_role is null or current_role not in ('chw', 'clinician', 'admin') then
    raise exception 'Only an approved clinician or CHW can create a workspace';
  end if;

  if length(trim(coalesce(patient_display_name, ''))) < 2 then
    raise exception 'Patient display name is required';
  end if;

  relationship_role := case
    when current_role = 'chw' then 'supervising_health_worker'::recipient_role
    else 'doctor'::recipient_role
  end;

  insert into patients (display_name, created_by)
  values (trim(patient_display_name), auth.uid())
  returning id into new_patient_id;

  insert into patient_relationships (patient_id, user_id, role)
  values (new_patient_id, auth.uid(), relationship_role);

  return new_patient_id;
end;
$$;

revoke all on function public.create_care_workspace(text) from public;
grant execute on function public.create_care_workspace(text) to authenticated;

alter table entries
  add column client_event_id uuid unique,
  add column review_status review_status not null default 'unreviewed',
  add column reviewed_by uuid references auth.users(id),
  add column reviewed_at timestamptz,
  add column extraction_provider text;

alter table entries add constraint entries_human_review_consistent check (
  review_status <> 'human_verified'
  or (reviewed_by is not null and reviewed_at is not null)
);

update entries
set review_status = 'demo_seeded', extraction_provider = 'mock'
where review_status = 'unreviewed';

create table patient_access_invites (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  token_hash text not null unique,
  role recipient_role not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid not null references auth.users(id),
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table patient_access_invites enable row level security;

create policy "care team can read patient invites"
  on patient_access_invites for select
  using (
    exists (
      select 1 from patient_relationships pr
      where pr.patient_id = patient_access_invites.patient_id
        and pr.user_id = auth.uid()
        and pr.role in ('supervising_health_worker', 'doctor')
    )
  );

create policy "care team can create patient invites"
  on patient_access_invites for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from patient_relationships pr
      where pr.patient_id = patient_access_invites.patient_id
        and pr.user_id = auth.uid()
        and pr.role in ('supervising_health_worker', 'doctor')
    )
  );

create or replace function public.create_patient_invite(
  target_patient_id uuid,
  granted_role recipient_role,
  valid_for interval default interval '7 days'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_token text := encode(gen_random_bytes(18), 'hex');
begin
  if valid_for < interval '1 hour' or valid_for > interval '30 days' then
    raise exception 'Invite validity must be between one hour and 30 days';
  end if;

  if not exists (
    select 1 from patient_relationships pr
    where pr.patient_id = target_patient_id
      and pr.user_id = auth.uid()
      and pr.role in ('supervising_health_worker', 'doctor')
  ) then
    raise exception 'Only the related care team can invite users';
  end if;

  insert into patient_access_invites (patient_id, token_hash, role, expires_at, created_by)
  values (
    target_patient_id,
    encode(digest(raw_token, 'sha256'), 'hex'),
    granted_role,
    now() + valid_for,
    auth.uid()
  );

  return raw_token;
end;
$$;

revoke all on function public.create_patient_invite(uuid, recipient_role, interval) from public;
grant execute on function public.create_patient_invite(uuid, recipient_role, interval) to authenticated;

create or replace function public.claim_patient_access(invite_token text)
returns table (patient_id uuid, granted_role recipient_role)
language plpgsql
security definer
set search_path = public
as $$
declare
  matched patient_access_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into matched
  from patient_access_invites
  where token_hash = encode(digest(invite_token, 'sha256'), 'hex')
    and claimed_at is null
    and expires_at > now()
  for update;

  if matched.id is null then
    raise exception 'Invite is invalid, expired, or already claimed';
  end if;

  insert into patient_relationships (patient_id, user_id, role)
  values (matched.patient_id, auth.uid(), matched.role)
  on conflict (patient_id, user_id, role) do nothing;

  update patient_access_invites
  set claimed_by = auth.uid(), claimed_at = now()
  where id = matched.id;

  return query select matched.patient_id, matched.role;
end;
$$;

revoke all on function public.claim_patient_access(text) from public;
grant execute on function public.claim_patient_access(text) to authenticated;

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  entry_id uuid references entries(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_patient_created_idx on audit_events (patient_id, created_at desc);
alter table audit_events enable row level security;

create policy "audit readable by related users"
  on audit_events for select
  using (
    exists (
      select 1 from patient_relationships pr
      where pr.patient_id = audit_events.patient_id and pr.user_id = auth.uid()
    )
  );

create or replace function public.audit_entry_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_events (patient_id, entry_id, actor_id, action, metadata)
  values (
    new.patient_id,
    new.id,
    new.created_by,
    'entry.created',
    jsonb_build_object(
      'source_type', new.source_type,
      'flag_level', new.flag_level,
      'review_status', new.review_status,
      'protocol_id', new.protocol_id
    )
  );
  return new;
end;
$$;

create trigger entries_create_audit_event
  after insert on entries
  for each row execute function public.audit_entry_insert();
