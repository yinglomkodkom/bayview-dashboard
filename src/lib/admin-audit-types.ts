export interface AdminAuditLog {
  id: string;
  created_at: string;
  admin_name: string;
  email: string;
  action_type: string;
  target?: string | null;
  details?: string | null;
  ip_address?: string | null;
  status: "success" | "failed" | string;
}

export interface LogAdminActivityParams {
  action_type: string;
  target?: string | null;
  details?: string | null;
  status?: "success" | "failed" | string;
  admin_name?: string | null;
  email?: string | null;
  ip_address?: string | null;
  user_id?: string | null;
}

/**
 * Action type visual styling and display labels (Client & Server safe).
 */
export function getActionMeta(actionType: string) {
  switch (actionType) {
    case "login":
      return {
        label: "เข้าสู่ระบบ (Login)",
        category: "auth",
        badgeColor:
          "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/60",
      };
    case "verify_2fa":
      return {
        label: "ยืนยัน 2FA (TOTP)",
        category: "auth",
        badgeColor:
          "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/60",
      };
    case "change_password":
      return {
        label: "เปลี่ยนรหัสผ่าน",
        category: "auth",
        badgeColor:
          "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60",
      };
    case "upload_sop":
      return {
        label: "อัปโหลดไฟล์ SOP",
        category: "sop",
        badgeColor:
          "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
      };
    case "download_sop":
      return {
        label: "ดาวน์โหลดไฟล์ SOP",
        category: "sop",
        badgeColor:
          "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60",
      };
    case "delete_sop":
      return {
        label: "ลบไฟล์ SOP",
        category: "sop",
        badgeColor:
          "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",
      };
    case "update_settings":
      return {
        label: "บันทึกการตั้งค่า",
        category: "settings",
        badgeColor:
          "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
      };
    case "create_admin":
      return {
        label: "เพิ่มแอดมิน",
        category: "admin",
        badgeColor:
          "bg-teal-50 dark:bg-teal-950/40 text-[#0C645B] dark:text-emerald-300 border-teal-200 dark:border-teal-800/60",
      };
    case "reset_password":
      return {
        label: "รีเซ็ตรหัสผ่าน",
        category: "admin",
        badgeColor:
          "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60",
      };
    case "reset_mfa":
      return {
        label: "ล้างค่า 2FA",
        category: "admin",
        badgeColor:
          "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60",
      };
    case "toggle_admin_status":
      return {
        label: "เปิด/ปิดการใช้งานแอดมิน",
        category: "admin",
        badgeColor:
          "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",
      };
    case "update_admin":
      return {
        label: "แก้ไขข้อมูลแอดมิน",
        category: "admin",
        badgeColor:
          "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800/60",
      };
    case "employee_update":
    case "update_employee":
      return {
        label: "แก้ไขข้อมูลพนักงาน",
        category: "employee",
        badgeColor:
          "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800/60",
      };
    case "toggle_employee_status":
      return {
        label: "เปิด/ปิดใช้งานพนักงาน",
        category: "employee",
        badgeColor:
          "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
      };
    case "create_employee":
      return {
        label: "เพิ่มพนักงาน",
        category: "employee",
        badgeColor:
          "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
      };
    case "approve_link_request":
      return {
        label: "อนุมัติคำขอยืนยันตัวตน",
        category: "employee",
        badgeColor:
          "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
      };
    case "reject_link_request":
      return {
        label: "ปฏิเสธคำขอยืนยันตัวตน",
        category: "employee",
        badgeColor:
          "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",
      };
    case "admin_reply":
      return {
        label: "ตอบกลับข้อความ (Pending Reply)",
        category: "reply",
        badgeColor:
          "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/60",
      };
    default:
      return {
        label: actionType,
        category: "other",
        badgeColor:
          "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700",
      };
  }
}
