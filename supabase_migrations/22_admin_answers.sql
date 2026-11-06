-- Answers admins gave on Pending Replies that the bot may reuse. When someone
-- later asks a question like one an admin already answered, the bot finds it
-- with match_admin_answers (the n8n "Find Admin Answer" node) instead of waiting
-- for an admin again.
--
-- One row per answered chat_logs row. Only answers the admin chose to share
-- are stored: a personal answer ("your room 512 is ready") is left out.
-- The embedding is of the question alone, since a new question is compared
-- with old questions. Same model as documents1 (gemini-embedding-001).
-- 0.77: in tests a reworded question scored 0.78-0.87 and a different
-- question at most 0.75. Applied 2026-11-06.

create table if not exists public.admin_answers (
  id uuid primary key default gen_random_uuid(),
  chat_log_id uuid not null unique references public.chat_logs(id) on delete cascade,
  question text not null,
  answer text not null,
  embedding vector(3072) not null,
  answered_by text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_answers enable row level security;

create policy "Admins can read admin_answers" on public.admin_answers
  for select to authenticated using (is_admin());
-- Writes go through the dashboard API with the service role.

create or replace function public.match_admin_answers(
  query_embedding vector,
  match_count integer default null,
  filter jsonb default '{}'::jsonb,
  match_threshold double precision default 0.77
)
returns table(id uuid, content text, metadata jsonb, similarity double precision)
language sql
stable
set search_path = public
as $$
  select
    a.id,
    'คำถามที่เคยมีพนักงานถาม: ' || a.question || E'\n'
      || 'คำตอบจากแอดมิน' || coalesce(' (' || a.answered_by || ')', '') || ': ' || a.answer,
    jsonb_build_object('source', 'admin_answer', 'chat_log_id', a.chat_log_id, 'answered_at', a.updated_at,
      'question', a.question, 'answer', a.answer, 'answered_by', a.answered_by),
    1 - (a.embedding <=> query_embedding)
  from public.admin_answers a
  where 1 - (a.embedding <=> query_embedding) > match_threshold
  order by a.embedding <=> query_embedding
  limit coalesce(match_count, 3);
$$;

revoke all on function public.match_admin_answers(vector, integer, jsonb, double precision) from public, anon, authenticated;
grant execute on function public.match_admin_answers(vector, integer, jsonb, double precision) to service_role;
