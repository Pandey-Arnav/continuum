-- Fixes a real bug in 0004's create_care_workspace(): it declared a local
-- variable named `current_role`, which collides with CURRENT_ROLE — a
-- reserved SQL keyword/built-in (returns the database role executing the
-- function, not an application value). Inside the IF condition, Postgres
-- resolved `current_role` to that keyword instead of the local variable, so
-- the role check never actually read profiles.app_role at all — it always
-- failed, even for a correctly-provisioned 'chw' profile. Verified live:
-- profiles.app_role was confirmed 'chw' immediately before the RPC call,
-- and the RPC still raised "Only an approved clinician or CHW can create a
-- workspace" every time. Renaming the variable to `caller_role` fixes it.

create or replace function public.create_care_workspace(patient_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role app_role;
  new_patient_id uuid;
  relationship_role recipient_role;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select app_role into caller_role
  from profiles
  where user_id = auth.uid();

  if caller_role is null or caller_role not in ('chw', 'clinician', 'admin') then
    raise exception 'Only an approved clinician or CHW can create a workspace';
  end if;

  if length(trim(coalesce(patient_display_name, ''))) < 2 then
    raise exception 'Patient display name is required';
  end if;

  relationship_role := case
    when caller_role = 'chw' then 'supervising_health_worker'::recipient_role
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
