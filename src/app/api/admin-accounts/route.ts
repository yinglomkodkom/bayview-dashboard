import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const text = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function passwordError(password: string): string | null {
  return password.length < MIN_PASSWORD ? `รหัสผ่านต้องยาวอย่างน้อย ${MIN_PASSWORD} ตัวอักษร` : null;
}

/**
 * Admin Accounts page actions. Only an admin (past 2FA) can call these; there
 * is no self-registration.
 *   create          — new login + admin_users row with the password the admin
 *                     typed. The new admin replaces it at first login
 *                     (app_metadata.must_change_password), then sets up 2FA.
 *   reset_password  — typed password for another admin, same first-login rule.
 *   reset_mfa       — remove another admin's 2FA (lost phone); they set it up
 *                     again at their next login.
 *   update          — edit the name replies from Pending Replies are signed with.
 */
export async function POST(request: NextRequest) {
  try {
    const check = await requireAdminApi();
    if (!check.ok) return check.response;

    const body = await request.json();
    const db = createAdminClient();
    const password = typeof body.password === "string" ? body.password : "";

    if (body.action === "create") {
      const email = text(body.email).toLowerCase();
      const name = text(body.name);
      if (!EMAIL.test(email)) {
        return NextResponse.json({ success: false, error: "รูปแบบอีเมลไม่ถูกต้อง" }, { status: 400 });
      }
      if (!name) {
        return NextResponse.json({ success: false, error: "กรุณากรอกชื่อ-นามสกุล (อังกฤษ)" }, { status: 400 });
      }
      const badPassword = passwordError(password);
      if (badPassword) {
        return NextResponse.json({ success: false, error: badPassword }, { status: 400 });
      }

      const { data: created, error: createError } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { must_change_password: true },
      });
      if (createError || !created.user) {
        const msg = createError?.message?.toLowerCase() || "";
        const taken = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
        return NextResponse.json(
          { success: false, error: taken ? "อีเมลนี้มีบัญชีอยู่แล้ว" : "สร้างบัญชีไม่สำเร็จ" },
          { status: taken ? 409 : 500 }
        );
      }

      const { data: added, error: insertError } = await db
        .from("admin_users")
        .insert({ user_id: created.user.id, email, name, name_th: text(body.name_th) || null })
        .select("id, user_id, email, name, name_th, created_at")
        .single();
      if (insertError) {
        // Never leave a login behind that is not an admin.
        await db.auth.admin.deleteUser(created.user.id);
        throw insertError;
      }

      const { logAdminActivity } = await import("@/lib/admin-audit");
      await logAdminActivity({
        action_type: "create_admin",
        target: email,
        details: `เพิ่มแอดมินใหม่: ${name}${body.name_th ? ` (${text(body.name_th)})` : ""}`,
        status: "success",
      });

      return NextResponse.json({ success: true, admin: added });
    }

    if (body.action === "reset_password") {
      const badPassword = passwordError(password);
      if (badPassword) {
        return NextResponse.json({ success: false, error: badPassword }, { status: 400 });
      }
      const { data: target } = await db
        .from("admin_users")
        .select("user_id, email, name, name_th")
        .eq("id", text(body.admin_id, 64))
        .maybeSingle();
      if (!target) {
        return NextResponse.json({ success: false, error: "ไม่พบแอดมินคนนี้" }, { status: 404 });
      }
      const isSelf = target.user_id === check.user.id;
      const { error } = await db.auth.admin.updateUserById(target.user_id, {
        password,
        app_metadata: isSelf ? { must_change_password: false } : { must_change_password: true },
      });
      if (error) throw error;

      const { logAdminActivity } = await import("@/lib/admin-audit");
      await logAdminActivity({
        action_type: "reset_password",
        target: target.email || target.name_th || target.name || "Admin",
        details: `รีเซ็ตรหัสผ่านแอดมิน: ${target.email}${isSelf ? " (บัญชีตนเอง)" : ""}`,
        status: "success",
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === "reset_mfa") {
      const { data: target } = await db
        .from("admin_users")
        .select("user_id, email, name, name_th")
        .eq("id", text(body.admin_id, 64))
        .maybeSingle();
      if (!target) {
        return NextResponse.json({ success: false, error: "ไม่พบแอดมินคนนี้" }, { status: 404 });
      }
      // Someone who can still sign in has their own app; a lost phone is the
      // case this exists for, and another admin has to confirm it.
      if (target.user_id === check.user.id) {
        return NextResponse.json(
          { success: false, error: "ล้างค่า 2FA ของบัญชีตนเองไม่ได้ ให้แอดมินคนอื่นทำให้" },
          { status: 400 }
        );
      }

      const { data: listed, error: listError } = await db.auth.admin.mfa.listFactors({ userId: target.user_id });
      if (listError) throw listError;
      const factors = listed?.factors ?? [];
      if (factors.length === 0) {
        return NextResponse.json(
          { success: false, error: "แอดมินคนนี้ยังไม่ได้ตั้งค่า 2FA ไม่มีอะไรต้องล้าง" },
          { status: 409 }
        );
      }
      // Deleting a verified factor also signs the user out everywhere, so
      // their next login goes to /mfa/enroll to set up a new authenticator.
      for (const factor of factors) {
        const { error } = await db.auth.admin.mfa.deleteFactor({ id: factor.id, userId: target.user_id });
        if (error) throw error;
      }

      const { logAdminActivity } = await import("@/lib/admin-audit");
      await logAdminActivity({
        action_type: "reset_mfa",
        target: target.email || target.name_th || target.name || "Admin",
        details: `ล้างค่า 2FA ของแอดมิน: ${target.email} (ต้องตั้งค่าแอป Authenticator ใหม่ตอนเข้าสู่ระบบครั้งถัดไป)`,
        status: "success",
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === "update") {
      const name = text(body.name);
      if (!name) {
        return NextResponse.json({ success: false, error: "กรุณากรอกชื่อ-นามสกุล (อังกฤษ)" }, { status: 400 });
      }
      const { data: targetAdmin } = await db
        .from("admin_users")
        .select("email, name, name_th")
        .eq("id", text(body.admin_id, 64))
        .maybeSingle();

      const { error } = await db
        .from("admin_users")
        .update({ name, name_th: text(body.name_th) || null })
        .eq("id", text(body.admin_id, 64));
      if (error) throw error;

      const { logAdminActivity } = await import("@/lib/admin-audit");
      await logAdminActivity({
        action_type: "update_admin",
        target: targetAdmin?.email || name,
        details: `แก้ไขข้อมูลชื่อแอดมิน: ${name}${body.name_th ? ` (${text(body.name_th)})` : ""}`,
        status: "success",
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === "toggle_status") {
      const adminId = text(body.admin_id, 64);
      const newStatus = body.status === "suspended" ? "suspended" : "active";
      const isActiveBool = newStatus === "active";

      const { data: target } = await db
        .from("admin_users")
        .select("id, user_id, email, name, name_th")
        .eq("id", adminId)
        .maybeSingle();

      if (!target) {
        return NextResponse.json({ success: false, error: "ไม่พบแอดมินคนนี้" }, { status: 404 });
      }

      if (target.user_id === check.user.id && newStatus === "suspended") {
        return NextResponse.json(
          { success: false, error: "ไม่สามารถปิดการใช้งานบัญชีของตนเองได้" },
          { status: 400 }
        );
      }

      // 1. Update is_active in admin_users table
      const { error: updateErr } = await db
        .from("admin_users")
        .update({ is_active: isActiveBool })
        .eq("id", target.id);

      if (updateErr) {
        console.error("Error updating is_active in admin_users:", updateErr);
      }

      // 2. Sync with system_settings and Supabase Auth
      const { setAdminStatus } = await import("@/lib/admin-manage");
      await setAdminStatus(target.id, target.user_id, newStatus);

      const { logAdminActivity } = await import("@/lib/admin-audit");
      await logAdminActivity({
        action_type: "toggle_admin_status",
        target: target.email,
        details:
          newStatus === "suspended"
            ? `ปิดการใช้งานบัญชีแอดมิน (Suspended): ${target.email} (${target.name_th || target.name || "-"})`
            : `เปิดใช้งานบัญชีแอดมิน (Active): ${target.email} (${target.name_th || target.name || "-"})`,
        status: "success",
      });

      return NextResponse.json({ success: true, status: newStatus, is_active: isActiveBool });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Admin accounts API error:", error);
    return NextResponse.json({ success: false, error: "ทำรายการไม่สำเร็จ" }, { status: 500 });
  }
}
