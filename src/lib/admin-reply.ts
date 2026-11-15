// Shared by the Pending Replies page (preview) and /api/admin-reply (the text
// actually pushed), so what the admin sees is exactly what the employee gets.

export const MAX_ADMIN_REPLY_LENGTH = 4000;

/** The admin_users profile of whoever is logged in to the dashboard. */
export interface AdminProfile {
  email: string;
  emp_id: string | null;
  name: string | null;
  name_th: string | null;
  position: string | null;
  department: string | null;
}

/** "ศุภณัฐ พรหมวงษ์ (Suphanat Phromwong)", or null while the profile has no name. */
export function adminDisplayName(admin: AdminProfile | null): string | null {
  if (!admin) return null;
  const th = admin.name_th?.trim();
  const en = admin.name?.trim();
  if (th && en) return `${th} (${en})`;
  return th || en || null;
}

/**
 * `quoted`: the message goes out as a LINE quote of the question (quoteToken),
 * so LINE already shows the question above it and the text leaves it out.
 * Without a quote (older logs, or LINE refused the token) the question is
 * repeated in the text so the employee still knows what is being answered.
 */
export function buildAdminReplyText(
  question: string | null | undefined,
  reply: string,
  admin: AdminProfile,
  quoted = false
): string {
  const q = String(question || "").replace(/^=+/, "").trim();
  const excerpt = q.length > 200 ? `${q.slice(0, 200)}…` : q;
  // Name only: position and department are left out on purpose.
  const who = admin.name_th?.trim() || admin.name?.trim();
  // A plain LINE text, laid out as a header, the answer between two rules,
  // and who answered underneath.
  const RULE = "━━━━━━━━━━━━";
  return [
    "💬 คำตอบจากแอดมิน",
    !quoted && excerpt ? `คำถามของคุณ: "${excerpt}"` : null,
    RULE,
    reply.trim(),
    RULE,
    who ? `ตอบโดย คุณ${who}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
}
