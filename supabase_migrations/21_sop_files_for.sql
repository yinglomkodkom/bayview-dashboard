-- Manual files the LINE bot may hand over (n8n "sop_files" tool, and the
-- "Find SOP Files" check before a download link is signed). Every manual is
-- listed with can_open for the asker, by the same rule match_documents uses
-- for its text; path is given only when can_open. With file_ids, only those
-- manuals. Applied 2026-11-06.

create or replace function public.sop_files_for(asker_level text, asker_department text, file_ids text[] default null)
returns jsonb
language sql
stable
set search_path = public, storage
as $$
  with docs as (
    select distinct on (d.metadata->>'file_id')
      d.metadata->>'file_id' as file_id,
      d.metadata->>'title' as title,
      d.sop_group,
      (
        nullif(asker_level, '') is null
        or asker_level = 'manager'
        or coalesce(d.sop_access, 'all') = 'all'
        or split_part(coalesce(d.sop_group, ''), ' (', 1) = split_part(coalesce(asker_department, ''), ' (', 1)
      ) as can_open
    from public.documents1 d
    where d.metadata->>'file_id' is not null
      and (file_ids is null or d.metadata->>'file_id' = any(file_ids))
    order by d.metadata->>'file_id'
  )
  select jsonb_build_object('files', coalesce(jsonb_agg(jsonb_build_object(
    'file_id', docs.file_id, 'title', docs.title, 'sop_group', docs.sop_group,
    'can_open', docs.can_open, 'path', case when docs.can_open then f.name end)
    order by docs.title), '[]'::jsonb))
  from docs
  join lateral (
    select o.name from storage.objects o
    where o.bucket_id = 'sop-documents' and split_part(o.name, '/', 1) = docs.file_id
    order by o.created_at desc limit 1
  ) f on true;
$$;

revoke all on function public.sop_files_for(text, text, text[]) from public, anon, authenticated;
grant execute on function public.sop_files_for(text, text, text[]) to service_role;
