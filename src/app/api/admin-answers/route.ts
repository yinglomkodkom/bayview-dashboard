import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMfa } from "@/lib/require-mfa";
import { adminDisplayName, type AdminProfile } from "@/lib/admin-reply";
import { cleanQuestion, forgetAnswer, MAX_SAVED_ANSWER_LENGTH, rememberAnswer } from "@/lib/admin-answers";

async function signedInAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("email, emp_id, name, name_th, position, department")
    .eq("user_id", user.id)
    .single();
  if (!adminUser) return { response: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  const mfaBlocked = await requireMfa(supabase);
  if (mfaBlocked) return { response: mfaBlocked };
  const admin = adminUser as AdminProfile;
  return { user, admin, adminName: adminDisplayName(admin) || admin.email };
}

async function audit(
  who: { user: { id: string }; admin: AdminProfile; adminName: string },
  details: string,
  status: "success" | "failed" = "success"
) {
  const { logAdminActivity } = await import("@/lib/admin-audit");
  await logAdminActivity({
    action_type: "admin_answer_memory",
    target: "คำตอบที่บอทใช้ซ้ำ",
    details,
    status,
    email: who.admin.email,
    admin_name: who.adminName,
    user_id: who.user.id,
  });
}

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}...` : s);

/**
 * Lets the bot reuse an answer an admin already sent (or changes the text it
 * reuses). Only questions an admin has replied to can be saved.
 */
export async function POST(request: NextRequest) {
  const who = await signedInAdmin();
  if ("response" in who) return who.response;

  const body = await request.json().catch(() => ({}));
  const chatLogId = typeof body.chat_log_id === "string" ? body.chat_log_id : "";
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!chatLogId || !answer) {
    return NextResponse.json({ success: false, error: "กรุณาพิมพ์คำตอบที่ให้บอทใช้" }, { status: 400 });
  }
  if (answer.length > MAX_SAVED_ANSWER_LENGTH) {
    return NextResponse.json(
      { success: false, error: `ข้อความยาวเกิน ${MAX_SAVED_ANSWER_LENGTH} ตัวอักษร` },
      { status: 400 }
    );
  }

  const db = createAdminClient();
  const { data: log } = await db
    .from("chat_logs")
    .select("id, user_message, admin_reply, admin_replied_by")
    .eq("id", chatLogId)
    .maybeSingle();
  if (!log) return NextResponse.json({ success: false, error: "ไม่พบข้อความนี้" }, { status: 404 });
  if (!log.admin_reply) {
    return NextResponse.json({ success: false, error: "ต้องตอบคำถามนี้ก่อน จึงจะให้บอทใช้คำตอบได้" }, { status: 400 });
  }

  const question = cleanQuestion(log.user_message);
  try {
    const saved = await rememberAnswer(db, {
      chatLogId,
      question,
      answer,
      answeredBy: log.admin_replied_by || who.adminName,
      userId: who.user.id,
    });
    await audit(who, `ให้บอทใช้คำตอบของคำถาม "${short(question, 60)}": "${short(answer, 80)}"`);
    return NextResponse.json({ success: true, answer, updated_at: saved.updated_at });
  } catch (error) {
    console.error("Saving admin answer failed:", error);
    await audit(who, `บันทึกคำตอบให้บอทใช้ไม่สำเร็จ "${short(question, 60)}"`, "failed");
    return NextResponse.json({ success: false, error: "บันทึกให้บอทใช้ไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

/** The bot stops reusing this answer. */
export async function DELETE(request: NextRequest) {
  const who = await signedInAdmin();
  if ("response" in who) return who.response;

  const body = await request.json().catch(() => ({}));
  const chatLogId = typeof body.chat_log_id === "string" ? body.chat_log_id : "";
  if (!chatLogId) return NextResponse.json({ success: false, error: "ไม่พบข้อความนี้" }, { status: 400 });

  const db = createAdminClient();
  try {
    const { data: row } = await db.from("admin_answers").select("question").eq("chat_log_id", chatLogId).maybeSingle();
    await forgetAnswer(db, chatLogId);
    await audit(who, `เลิกให้บอทใช้คำตอบของคำถาม "${short(row?.question || chatLogId, 60)}"`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Removing admin answer failed:", error);
    return NextResponse.json({ success: false, error: "เลิกใช้คำตอบไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}
