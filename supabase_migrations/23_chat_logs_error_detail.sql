-- Why the bot gave no reply, for timeout rows in chat_logs. Written by the
-- n8n "Log Timeout (No Reply)" node (Main.liff-menu-29) and the "Bot Error
-- Log" error workflow, shown in Users & Chat Logs. Applied 2026-11-10.

alter table public.chat_logs add column if not exists error_detail text, add column if not exists n8n_execution_id text;
comment on column public.chat_logs.error_detail is 'Why the bot gave no reply (timeout rows): the n8n step that failed and its error message.';
comment on column public.chat_logs.n8n_execution_id is 'n8n execution id, to open the run in n8n (Executions).';
