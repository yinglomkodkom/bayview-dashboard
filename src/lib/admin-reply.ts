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

const LINK = /https?:\/\/[^\s<>"'`]+/g;

/** Links in the reply, which a card's text cannot make clickable, as buttons. */
export function replyLinks(reply: string): string[] {
  const links: string[] = [];
  for (const found of reply.match(LINK) || []) {
    const uri = found.replace(/[.,;:)\]]+$/, "");
    if (uri.length <= 1000 && !links.includes(uri)) links.push(uri);
  }
  return links.slice(0, 3);
}

/**
 * The same reply as a LINE Flex card, like the bot's own answers. A card
 * cannot quote the question (LINE allows quoteToken only on text), so the
 * question is always shown at the top of the card. The plain text from
 * buildAdminReplyText stays the fallback when LINE refuses the card.
 */
export function buildAdminReplyFlex(
  question: string | null | undefined,
  reply: string,
  admin: AdminProfile
): Record<string, unknown> {
  const q = String(question || "").replace(/^=+/, "").trim();
  const excerpt = q.length > 200 ? `${q.slice(0, 200)}…` : q;
  const who = admin.name_th?.trim() || admin.name?.trim();
  const answer = reply.trim();
  const contents: Record<string, unknown>[] = [
    { type: "text", text: "💬 คำตอบจากแอดมิน", weight: "bold", size: "md", color: "#0C645B" },
  ];
  if (excerpt) {
    contents.push({
      type: "box",
      layout: "vertical",
      backgroundColor: "#F2F4F3",
      cornerRadius: "md",
      paddingAll: "md",
      spacing: "xs",
      contents: [
        { type: "text", text: "คำถามของคุณ", size: "xs", color: "#777777" },
        { type: "text", text: excerpt, wrap: true, size: "sm", color: "#444444" },
      ],
    });
  }
  contents.push({ type: "separator", margin: "lg" });
  contents.push({ type: "text", text: answer, wrap: true, size: "md", margin: "lg" });
  for (const uri of replyLinks(answer)) {
    const host = uri.replace(/^https?:\/\//, "").split("/")[0];
    contents.push({
      type: "button",
      style: "link",
      height: "sm",
      action: { type: "uri", label: `เปิด ${host}`.slice(0, 40), uri },
    });
  }
  if (who) {
    contents.push(
      { type: "separator", margin: "lg" },
      { type: "text", text: `ตอบโดย คุณ${who}`, wrap: true, size: "sm", color: "#777777", margin: "md" }
    );
  }
  return {
    type: "flex",
    altText: `คำตอบจากแอดมิน: ${answer.replace(/\s+/g, " ")}`.slice(0, 400),
    contents: {
      type: "bubble",
      size: "giga",
      body: { type: "box", layout: "vertical", spacing: "md", contents },
    },
  };
}
