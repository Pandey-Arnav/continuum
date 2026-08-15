-- Fixes a real bug in 0001: INSERT ... RETURNING on `patients` requires the
-- new row to pass the SELECT policy too, but that policy required an
-- existing patient_relationships row — which can't exist yet for a patient
-- that's still mid-creation. Adds `created_by` so the creator can read back
-- their own just-created patient before any relationship row exists.

alter table patients add column if not exists created_by uuid references auth.users(id);

drop policy if exists "patients readable by related users" on patients;
create policy "patients readable by related users"
  on patients for select
  using (
    created_by = auth.uid()
    or exists (
      select 1 from patient_relationships pr
      where pr.patient_id = patients.id and pr.user_id = auth.uid()
    )
  );

drop policy if exists "patients insertable by any signed-in user" on patients;
create policy "patients insertable by any signed-in user"
  on patients for insert
  with check (auth.uid() is not null and created_by = auth.uid());
