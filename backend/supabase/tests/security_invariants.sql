-- Run with psql after applying migrations. This intentionally uses native
-- assertions so it does not depend on pgTAP being installed.

begin;

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'entries' and rowsecurity
  ) then raise exception 'entries must have RLS enabled'; end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'entries' and cmd in ('UPDATE', 'DELETE', 'ALL')
  ) then raise exception 'entries must remain append-only'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'entries' and cmd = 'SELECT'
  ) then raise exception 'entries require a SELECT policy'; end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'entries' and cmd = 'INSERT'
  ) then raise exception 'entries require an INSERT policy'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'entries' and column_name = 'review_status'
  ) then raise exception 'human verification migration is missing'; end if;

  if not exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'claim_patient_access'
  ) then raise exception 'patient claim function is missing'; end if;

  if not exists (
    select 1 from information_schema.routines
    where routine_schema = 'public' and routine_name = 'create_care_workspace'
  ) then raise exception 'role-checked workspace bootstrap is missing'; end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patients'
      and policyname = 'patients insertable by any signed-in user'
  ) then raise exception 'permissive patient bootstrap policy must be removed'; end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_relationships'
      and policyname = 'relationships insertable for self only'
  ) then raise exception 'users must not self-attach to arbitrary patients'; end if;

  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'audit_events' and rowsecurity
  ) then raise exception 'audit_events must exist with RLS enabled'; end if;
end;
$$;

rollback;
