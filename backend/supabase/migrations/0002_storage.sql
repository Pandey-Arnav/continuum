-- Storage bucket for raw evidence (voice note audio, discharge photos).
-- Private bucket; access follows the same relationship check as `entries`,
-- keyed off the folder convention: <patient_id>/<file>.

insert into storage.buckets (id, name, public)
values ('raw-evidence', 'raw-evidence', false)
on conflict (id) do nothing;

create policy "raw evidence readable by related users"
  on storage.objects for select
  using (
    bucket_id = 'raw-evidence'
    and exists (
      select 1 from patient_relationships pr
      where pr.user_id = auth.uid()
        and pr.patient_id::text = (storage.foldername(name))[1]
    )
  );

create policy "raw evidence uploadable by related users"
  on storage.objects for insert
  with check (
    bucket_id = 'raw-evidence'
    and exists (
      select 1 from patient_relationships pr
      where pr.user_id = auth.uid()
        and pr.patient_id::text = (storage.foldername(name))[1]
    )
  );
