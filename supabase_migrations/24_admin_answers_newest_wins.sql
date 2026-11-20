-- When admins have answered the same question more than once (e.g. a price
-- that changed), the bot must use the newest answer. Before this, both rows
-- had the same similarity and the older one could come first.
--
-- A saved answer is left out of the matches when a newer saved answer exists
-- for practically the same question (question embeddings >= 0.97 similar;
-- different questions such as "ขี่ม้า" vs "ขี่จรวด" score about 0.90).
-- The older row is kept, so it reappears if the newer one is removed.
-- Ties in similarity are broken by the newest answer.

create or replace function public.match_admin_answers(
  query_embedding vector,
  match_count integer default null,
  filter jsonb default '{}'::jsonb,
  match_threshold double precision default 0.77
)
returns table(id uuid, content text, metadata jsonb, similarity double precision)
language sql
stable
set search_path to 'public'
as $function$
  select
    a.id,
    'คำถามที่เคยมีพนักงานถาม: ' || a.question || E'\n'
      || 'คำตอบจากแอดมิน' || coalesce(' (' || a.answered_by || ')', '') || ': ' || a.answer,
    jsonb_build_object('source', 'admin_answer', 'chat_log_id', a.chat_log_id, 'answered_at', a.updated_at,
      'question', a.question, 'answer', a.answer, 'answered_by', a.answered_by),
    1 - (a.embedding <=> query_embedding)
  from public.admin_answers a
  where 1 - (a.embedding <=> query_embedding) > match_threshold
    and not exists (
      select 1
      from public.admin_answers newer
      where newer.id <> a.id
        and newer.updated_at > a.updated_at
        and 1 - (newer.embedding <=> a.embedding) >= 0.97
    )
  order by a.embedding <=> query_embedding, a.updated_at desc
  limit coalesce(match_count, 3);
$function$;
