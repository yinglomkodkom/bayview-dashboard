import type { SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "@/lib/documents";

// Answers admins gave on Pending Replies that the LINE bot may reuse for a
// question like the one answered (see supabase_migrations/22_admin_answers.sql
// and the "admin_answers" tool in the n8n flow).

export const MAX_SAVED_ANSWER_LENGTH = 4000;

/** Clean the "=" some older chat_logs rows were stored with. */
export function cleanQuestion(text: string | null | undefined): string {
  return String(text || "").replace(/^=+/, "").trim();
}

/**
 * Saves (or replaces) the answer the bot may reuse for this chat_logs row.
 * The question is embedded, since a new question is compared with old ones.
 */
export async function rememberAnswer(
  db: SupabaseClient,
  row: { chatLogId: string; question: string; answer: string; answeredBy: string | null; userId: string | null }
): Promise<{ updated_at: string }> {
  const question = cleanQuestion(row.question);
  const answer = row.answer.trim();
  if (!question || !answer) throw new Error("ต้องมีทั้งคำถามและคำตอบ");
  const [embedding] = await embedTexts([question]);
  const updatedAt = new Date().toISOString();
  const { error } = await db.from("admin_answers").upsert(
    {
      chat_log_id: row.chatLogId,
      question,
      answer,
      embedding,
      answered_by: row.answeredBy,
      created_by_user_id: row.userId,
      updated_at: updatedAt,
    },
    { onConflict: "chat_log_id" }
  );
  if (error) throw error;
  return { updated_at: updatedAt };
}

/** The bot stops using this answer. The reply already sent stays in chat_logs. */
export async function forgetAnswer(db: SupabaseClient, chatLogId: string): Promise<void> {
  const { error } = await db.from("admin_answers").delete().eq("chat_log_id", chatLogId);
  if (error) throw error;
}
