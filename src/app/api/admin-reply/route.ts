import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMfa } from "@/lib/require-mfa";
import { createAdminClient } from "@/lib/supabase/admin";
import { correctStatus } from "@/lib/answer-status";
import {
  adminDisplayName,
  buildAdminReplyText,
  MAX_ADMIN_REPLY_LENGTH,
  type AdminProfile,
} from "@/lib/admin-reply";
import { rememberAnswer } from "@/lib/admin-answers";

// Where the n8n "admin-reply" webhook lives. N8N_ADMIN_REPLY_URL wins, except
// when it points at a host only this machine can reach (host.docker.internal,
// localhost) while running on Vercel — then, as when it is unset, it is built
// from N8N_WEBHOOK_URL (the public ngrok address the health check already uses).
function adminReplyUrl(): string {
  const explicit = (process.env.N8N_ADMIN_REPLY_URL || "").trim();
  const localOnly = /\/\/(host\.docker\.internal|localhost|127\.0\.0\.1)([:/]|$)/.test(explicit);
  if (explicit && !(localOnly && process.env.VERCEL)) return explicit;
  const base = (process.env.N8N_WEBHOOK_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}/admin-reply` : explicit;
}
const N8N_ADMIN_REPLY_URL = adminReplyUrl();

// LINE user ids are case-sensitive ("U…"), so unlike the display helpers this
// only strips the quote/equals junk some rows were stored with.
function cleanLineUserId(id: string | null | undefined): string {
  return String(id || "").replace(/["'=]/g, "").trim();
}

/**
 * Sends an admin's answer to a question the bot could not answer. The push
 * itself goes through the n8n "Admin Reply" workflow, which holds the LINE
 * credentials. n8n needs no secret of its own: it is handed the logged-in
 * admin's Supabase access token and checks it with Supabase (admin_users +
 * 2FA) before pushing. This route checks the same, delivers, then records the
 * reply on the chat_logs row.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("email, emp_id, name, name_th, position, department")
      .eq("user_id", user.id)
      .single();
    if (!adminUser) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const mfaBlocked = await requireMfa(supabase);
    if (mfaBlocked) return mfaBlocked;

    // The reply goes out under the logged-in admin's own name, so an admin
    // with no name on file cannot send.
    const admin = adminUser as AdminProfile;
    const adminName = adminDisplayName(admin);
    if (!adminName) {
      return NextResponse.json(
        { success: false, error: "บัญชีแอดมินนี้ยังไม่มีชื่อ กรุณาใส่ชื่อในหน้า Admin Accounts ก่อน" },
        { status: 400 }
      );
    }

    if (!N8N_ADMIN_REPLY_URL) {
      return NextResponse.json(
        { success: false, error: "ยังไม่ได้ตั้งค่า N8N_WEBHOOK_URL หรือ N8N_ADMIN_REPLY_URL" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const chatLogId = typeof body.chat_log_id === "string" ? body.chat_log_id : "";
    const reply = typeof body.reply === "string" ? body.reply.trim() : "";
    if (!chatLogId || !reply) {
      return NextResponse.json({ success: false, error: "กรุณาพิมพ์ข้อความตอบกลับ" }, { status: 400 });
    }
    if (reply.length > MAX_ADMIN_REPLY_LENGTH) {
      return NextResponse.json(
        { success: false, error: `ข้อความยาวเกิน ${MAX_ADMIN_REPLY_LENGTH} ตัวอักษร` },
        { status: 400 }
      );
    }

    const db = createAdminClient();
    const { data: log, error: fetchError } = await db
      .from("chat_logs")
      .select("id, line_user_id, user_message, ai_response, status, admin_replied_at, quote_token")
      .eq("id", chatLogId)
      .single();
    if (fetchError || !log) {
      return NextResponse.json({ success: false, error: "ไม่พบข้อความนี้" }, { status: 404 });
    }
    // Same rule the Pending Replies page and Users & Logs use to decide Not Found.
    if (correctStatus(log).status !== "not_found") {
      return NextResponse.json(
        { success: false, error: "ตอบกลับได้เฉพาะข้อความที่มีสถานะ Not Found" },
        { status: 400 }
      );
    }
    if (log.admin_replied_at) {
      return NextResponse.json({ success: false, error: "ข้อความนี้ตอบกลับไปแล้ว" }, { status: 409 });
    }

    const lineUserId = cleanLineUserId(log.line_user_id);
    if (!lineUserId) {
      return NextResponse.json({ success: false, error: "ไม่พบ LINE ID ของผู้ถาม" }, { status: 400 });
    }

    // n8n verifies this token with Supabase itself, so the push is tied to the
    // admin who is logged in here rather than to a shared secret.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const push = (quoteToken: string | null) =>
      fetch(N8N_ADMIN_REPLY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          line_user_id: lineUserId,
          text: buildAdminReplyText(log.user_message, reply, admin, !!quoteToken),
          quote_token: quoteToken,
        }),
        signal: AbortSignal.timeout(15000),
      });

    // Quote the employee's question when its quoteToken was logged. If LINE
    // refuses the quote (502 from the push node), send once more as plain text
    // with the question written out instead — the answer matters more than
    // the quote.
    const quoteToken = log.quote_token?.trim() || null;
    let pushRes: Response;
    try {
      pushRes = await push(quoteToken);
      if (quoteToken && pushRes.status === 502) pushRes = await push(null);
    } catch {
      return NextResponse.json(
        { success: false, error: `ติดต่อ n8n ไม่ได้ (${new URL(N8N_ADMIN_REPLY_URL).host}) ตรวจสอบว่า n8n และ ngrok เปิดอยู่ และ workflow ที่มี Admin Reply ถูก Activate แล้ว` },
        { status: 502 }
      );
    }
    if (!pushRes.ok) {
      const detail = await pushRes.json().catch(() => null);
      const reason =
        pushRes.status === 401 || pushRes.status === 403
          ? `n8n ไม่ยอมรับบัญชีนี้ (${detail?.error || pushRes.status}) ลองออกจากระบบแล้วล็อกอินใหม่`
          : pushRes.status === 404
            ? "ไม่พบ webhook admin-reply ใน n8n ตรวจสอบว่า workflow ถูก Activate แล้ว"
            : detail?.error || `ส่งข้อความไม่สำเร็จ (${pushRes.status})`;
      return NextResponse.json({ success: false, error: reason }, { status: 502 });
    }

    const repliedAt = new Date().toISOString();
    const repliedBy = adminName;
    const { error: updateError } = await db
      .from("chat_logs")
      .update({
        admin_reply: reply,
        admin_replied_at: repliedAt,
        admin_replied_by: repliedBy,
        admin_replied_by_user_id: user.id,
      })
      .eq("id", chatLogId);
    if (updateError) {
      // The message already reached the user, so report success but say the
      // record is missing rather than inviting a second send.
      console.error("Admin reply sent but not recorded:", updateError);
      return NextResponse.json({
        success: true,
        warning: "ส่งถึงผู้ใช้แล้ว แต่บันทึกลงฐานข้อมูลไม่สำเร็จ",
        admin_replied_at: repliedAt,
        admin_replied_by: repliedBy,
      });
    }

    // "Let the bot reuse this answer" (ticked unless the admin unticked it for a
    // personal answer). The reply has already gone out, so a failure here is
    // only a warning: the admin can save it again from the answered list.
    let remembered = false;
    let warning: string | undefined;
    if (body.remember !== false) {
      try {
        await rememberAnswer(db, {
          chatLogId,
          question: log.user_message,
          answer: reply,
          answeredBy: repliedBy,
          userId: user.id,
        });
        remembered = true;
      } catch (error) {
        console.error("Admin reply sent but not saved for the bot:", error);
        warning = "ส่งถึงผู้ใช้แล้ว แต่บันทึกให้บอทใช้ไม่สำเร็จ กด \"ให้บอทใช้คำตอบนี้\" ในแท็บตอบแล้วอีกครั้ง";
      }
    }

    const { logAdminActivity } = await import("@/lib/admin-audit");
    await logAdminActivity({
      action_type: "admin_reply",
      target: `LINE User (${lineUserId})`,
      details: `ตอบกลับคำถาม Not Found "${log.user_message.slice(0, 60)}${log.user_message.length > 60 ? "..." : ""}" ด้วยข้อความ: "${reply.slice(0, 80)}${reply.length > 80 ? "..." : ""}"${remembered ? " (ให้บอทใช้คำตอบนี้)" : ""}`,
      status: "success",
      email: admin.email,
      admin_name: adminName,
      user_id: user.id,
    });

    return NextResponse.json({
      success: true,
      admin_replied_at: repliedAt,
      admin_replied_by: repliedBy,
      remembered,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    console.error("Admin reply API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
