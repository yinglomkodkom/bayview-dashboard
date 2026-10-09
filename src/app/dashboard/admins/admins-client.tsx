"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Pencil,
  UserPlus,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldOff,
  History,
  Search,
  CheckCircle2,
  XCircle,
  Ban,
  RotateCcw,
  UserCheck,
  UserX,
  ChevronLeft,
  ChevronRight,
  Globe,
  User,
  Users,
  AlertTriangle,
  Filter,
  Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getActionMeta, type AdminAuditLog } from "@/lib/admin-audit-types";
import { LOAD_FAILED_EMPTY_TEXT } from "@/components/dashboard/load-error-banner";

export interface AdminRow {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  name_th: string | null;
  created_at: string;
  is_active?: boolean | null;
  status?: "active" | "suspended";
}

export interface EmployeeOption {
  emp_id: number;
  name: string;
  name_th: string | null;
  email: string | null;
}

interface ProfileForm {
  email: string;
  name: string;
  name_th: string;
  password: string;
}

const MIN_PASSWORD = 8;
const selectClass =
  "w-full h-9 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-[#0C645B]";
const blankForm = (): ProfileForm => ({ email: "", name: "", name_th: "", password: "" });

const CATEGORY_FILTER_LABELS: Record<string, string> = {
  all: "ทุกประเภทกิจกรรม (All)",
  auth: "🔐 เข้าสู่ระบบ & ยืนยัน 2FA",
  sop: "📄 จัดการเอกสาร SOP",
  settings: "⚙️ ตั้งค่าระบบ AI",
  admin: "👥 จัดการบัญชีแอดมิน",
  employee: "👔 จัดการข้อมูลพนักงาน",
  reply: "💬 ตอบกลับข้อความผู้ใช้",
};

const STATUS_FILTER_LABELS: Record<string, string> = {
  all: "ทุกสถานะ (All)",
  success: "สำเร็จ (Success)",
  failed: "ไม่สำเร็จ (Failed)",
};

async function callApi(payload: Record<string, unknown>) {
  const res = await fetch("/api/admin-accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || "ทำรายการไม่สำเร็จ");
  return data;
}

function formatThaiDateTime(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" }),
      time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: dateStr, time: "" };
  }
}

function getFailedActionLabel(actionType: string, defaultLabel: string) {
  switch (actionType) {
    case "login":
      return "เข้าสู่ระบบไม่สำเร็จ";
    case "verify_2fa":
      return "ยืนยัน 2FA ไม่สำเร็จ";
    case "change_password":
      return "เปลี่ยนรหัสผ่านไม่สำเร็จ";
    case "upload_sop":
      return "อัปโหลด SOP ไม่สำเร็จ";
    case "delete_sop":
      return "ลบ SOP ไม่สำเร็จ";
    case "update_settings":
      return "บันทึกการตั้งค่าไม่สำเร็จ";
    case "create_admin":
      return "เพิ่มแอดมินไม่สำเร็จ";
    case "reset_password":
      return "รีเซ็ตรหัสผ่านไม่สำเร็จ";
    case "reset_mfa":
      return "ล้างค่า 2FA ไม่สำเร็จ";
    case "toggle_admin_status":
      return "ปรับสถานะแอดมินไม่สำเร็จ";
    case "update_admin":
      return "แก้ไขข้อมูลแอดมินไม่สำเร็จ";
    case "employee_update":
    case "update_employee":
      return "แก้ไขข้อมูลพนักงานไม่สำเร็จ";
    case "toggle_employee_status":
      return "ปรับสถานะพนักงานไม่สำเร็จ";
    case "create_employee":
      return "เพิ่มพนักงานไม่สำเร็จ";
    case "admin_reply":
      return "ตอบกลับข้อความไม่สำเร็จ";
    default:
      return `${defaultLabel} (ไม่สำเร็จ)`;
  }
}

/** Password input with a show/hide toggle. Visible only while being typed. */
function PasswordField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`อย่างน้อย ${MIN_PASSWORD} ตัวอักษร`}
        autoComplete="new-password"
        disabled={disabled}
        className="pr-10 rounded-xl text-xs h-9"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export function AdminsClient({
  admins: initialAdmins,
  employees,
  activityLogs: initialLogs,
  currentUserId,
  loadFailed = false,
}: {
  admins: AdminRow[];
  employees: EmployeeOption[];
  activityLogs: AdminAuditLog[];
  currentUserId: string | null;
  /** The admin list failed to load: say so instead of "no match". */
  loadFailed?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"admins" | "logs">("admins");
  const [admins, setAdmins] = useState<AdminRow[]>(initialAdmins);
  const [activityLogs, setActivityLogs] = useState<AdminAuditLog[]>(initialLogs);

  const [syncedAdmins, setSyncedAdmins] = useState(initialAdmins);
  if (syncedAdmins !== initialAdmins) {
    setSyncedAdmins(initialAdmins);
    setAdmins(initialAdmins);
  }
  const [syncedLogs, setSyncedLogs] = useState(initialLogs);
  if (syncedLogs !== initialLogs) {
    setSyncedLogs(initialLogs);
    setActivityLogs(initialLogs);
  }

  // Tab 1: Admins Search & Filter
  const [adminSearch, setAdminSearch] = useState("");

  // Add or edit share one dialog: `editing` null means "add".
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminRow | null>(null);
  const [form, setForm] = useState<ProfileForm>(blankForm());
  const [pickedEmp, setPickedEmp] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset Password Dialog
  const [resetting, setResetting] = useState<AdminRow | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  // Suspend / Restore Confirmation Dialog
  const [confirmToggleAdmin, setConfirmToggleAdmin] = useState<AdminRow | null>(null);
  // Lost phone: another admin removes the 2FA so the owner can set it up again.
  const [confirmResetMfa, setConfirmResetMfa] = useState<AdminRow | null>(null);
  const [resettingMfa, setResettingMfa] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Tab 2: Activity Logs Filters & Pagination
  const [logsSearch, setLogsSearch] = useState("");
  const [logsStartDate, setLogsStartDate] = useState("");
  const [logsEndDate, setLogsEndDate] = useState("");
  const [logsCategoryFilter, setLogsCategoryFilter] = useState<
    "all" | "auth" | "sop" | "settings" | "admin" | "employee" | "reply"
  >("all");
  const [logsStatusFilter, setLogsStatusFilter] = useState<"all" | "success" | "failed">("all");
  const [logsPageSize, setLogsPageSize] = useState<number>(25);
  const [logsCurrentPage, setLogsCurrentPage] = useState<number>(1);

  const adminEmails = new Set(admins.map((a) => a.email.toLowerCase()));

  // Map admin email -> display name (name_th or name)
  const adminNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of admins) {
      if (a.email) {
        const displayName = a.name_th || a.name;
        if (displayName) {
          map.set(a.email.toLowerCase().trim(), displayName);
        }
      }
    }
    return map;
  }, [admins]);

  // Filtered Admins
  const filteredAdmins = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter(
      (a) =>
        a.email.toLowerCase().includes(q) ||
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.name_th && a.name_th.toLowerCase().includes(q))
    );
  }, [admins, adminSearch]);

  // Filtered Activity Logs
  const filteredLogs = useMemo(() => {
    const q = logsSearch.trim().toLowerCase();
    return activityLogs.filter((log) => {
      const meta = getActionMeta(log.action_type);

      // 1. Category Filter
      if (logsCategoryFilter !== "all" && meta.category !== logsCategoryFilter) {
        return false;
      }

      // 2. Status Filter
      if (logsStatusFilter !== "all" && log.status !== logsStatusFilter) {
        return false;
      }

      // 3. Date Range Filter
      const timeString = log.created_at || "";
      if (logsStartDate && timeString) {
        const logDateStr = new Date(timeString).toISOString().split("T")[0];
        if (logDateStr < logsStartDate) return false;
      }
      if (logsEndDate && timeString) {
        const logDateStr = new Date(timeString).toISOString().split("T")[0];
        if (logDateStr > logsEndDate) return false;
      }

      // 4. Search Filter
      if (!q) return true;
      const cleanEmail = (log.email || "").toLowerCase().trim();
      const name = adminNameMap.get(cleanEmail) || log.admin_name || (cleanEmail ? cleanEmail.split("@")[0] : "");
      const email = log.email || "";
      const actionLabel = meta.label || "";
      const actionType = log.action_type || "";
      const target = log.target || "";
      const details = log.details || "";
      const ip = log.ip_address || "";

      return (
        email.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        actionLabel.toLowerCase().includes(q) ||
        actionType.toLowerCase().includes(q) ||
        target.toLowerCase().includes(q) ||
        details.toLowerCase().includes(q) ||
        ip.toLowerCase().includes(q)
      );
    });
  }, [activityLogs, logsSearch, logsStartDate, logsEndDate, logsCategoryFilter, logsStatusFilter, adminNameMap]);

  function handleResetLogsFilters() {
    setLogsSearch("");
    setLogsStartDate("");
    setLogsEndDate("");
    setLogsCategoryFilter("all");
    setLogsStatusFilter("all");
    setLogsCurrentPage(1);
  }

  const isLogsFiltered =
    Boolean(logsSearch) ||
    Boolean(logsStartDate) ||
    Boolean(logsEndDate) ||
    logsCategoryFilter !== "all" ||
    logsStatusFilter !== "all";

  // Paginated Activity Logs
  const totalLogsPages = Math.max(1, Math.ceil(filteredLogs.length / logsPageSize));
  const safeLogsPage = Math.min(Math.max(1, logsCurrentPage), totalLogsPages);
  const paginatedLogs = useMemo(() => {
    const start = (safeLogsPage - 1) * logsPageSize;
    return filteredLogs.slice(start, start + logsPageSize);
  }, [filteredLogs, safeLogsPage, logsPageSize]);

  function openAdd() {
    setEditing(null);
    setForm(blankForm());
    setPickedEmp("");
    setDialogOpen(true);
  }

  function openEdit(a: AdminRow) {
    setEditing(a);
    setForm({ email: a.email, name: a.name || "", name_th: a.name_th || "", password: "" });
    setDialogOpen(true);
  }

  // Closing never drops typed input silently and is ignored mid-save.
  function closeDialog() {
    if (saving) return;
    const dirty = editing
      ? form.name !== (editing.name || "") || form.name_th !== (editing.name_th || "")
      : [form.email, form.name, form.name_th, form.password].some((v) => v.trim());
    if (dirty && !window.confirm("ยังไม่ได้บันทึกสิ่งที่แก้ไว้ ต้องการปิดและทิ้งการแก้ไขหรือไม่")) return;
    setDialogOpen(false);
    setForm(blankForm());
  }

  function pickEmployee(empId: string) {
    setPickedEmp(empId);
    const emp = employees.find((e) => String(e.emp_id) === empId);
    if (!emp) return;
    setForm((f) => ({ ...f, email: emp.email || "", name: emp.name || "", name_th: emp.name_th || "" }));
  }

  async function save() {
    setSaving(true);
    try {
      if (editing) {
        await callApi({ action: "update", admin_id: editing.id, name: form.name, name_th: form.name_th });
        setAdmins((prev) =>
          prev.map((a) => (a.id === editing.id ? { ...a, name: form.name.trim(), name_th: form.name_th.trim() || null } : a))
        );
        toast.success("บันทึกข้อมูลเรียบร้อย");
      } else {
        const data = await callApi({ action: "create", ...form });
        const newAdmin: AdminRow = {
          ...(data.admin as AdminRow),
          status: "active",
        };
        setAdmins((prev) => [...prev, newAdmin]);
        toast.success(`เพิ่มแอดมิน ${form.email.trim()} สำเร็จ`);
      }
      setForm(blankForm());
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function saveReset() {
    if (!resetting) return;
    setSaving(true);
    try {
      await callApi({ action: "reset_password", admin_id: resetting.id, password: resetPassword });
      toast.success(`ตั้งรหัสผ่านใหม่ให้ ${resetting.email} สำเร็จ`);
      setResetting(null);
      setResetPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetMfa() {
    if (!confirmResetMfa) return;
    setResettingMfa(true);
    try {
      await callApi({ action: "reset_mfa", admin_id: confirmResetMfa.id });
      toast.success(`ล้างค่า 2FA ของ ${confirmResetMfa.email} แล้ว`, {
        description: "เข้าสู่ระบบครั้งถัดไปจะต้องตั้งค่าแอป Authenticator ใหม่",
      });
      setConfirmResetMfa(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setResettingMfa(false);
    }
  }

  async function handleToggleStatus() {
    if (!confirmToggleAdmin) return;
    setTogglingStatus(true);
    const isCurrentlyActive = (confirmToggleAdmin.status ?? "active") === "active";
    const nextStatus = isCurrentlyActive ? "suspended" : "active";

    try {
      await callApi({
        action: "toggle_status",
        admin_id: confirmToggleAdmin.id,
        status: nextStatus,
      });

      setAdmins((prev) =>
        prev.map((a) =>
          a.id === confirmToggleAdmin.id
            ? { ...a, is_active: nextStatus === "active", status: nextStatus }
            : a
        )
      );

      toast.success(
        nextStatus === "suspended"
          ? `ปิดการใช้งานบัญชี ${confirmToggleAdmin.email} แล้ว`
          : `เปิดใช้งานบัญชี ${confirmToggleAdmin.email} เรียบร้อย`
      );
      setConfirmToggleAdmin(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setTogglingStatus(false);
    }
  }

  const canSave = !!form.name.trim() && (editing ? true : !!form.email.trim() && form.password.length >= MIN_PASSWORD);
  const missingFields = [
    !editing && !form.email.trim() ? "Email" : null,
    !form.name.trim() ? "ชื่อ-นามสกุล (อังกฤษ)" : null,
    !editing && form.password.length < MIN_PASSWORD ? `รหัสผ่านอย่างน้อย ${MIN_PASSWORD} ตัวอักษร` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {/* ── Tabs Navigation ── */}
      <div className="flex items-center gap-1 p-1 bg-white dark:bg-zinc-900/50 rounded-xl w-fit border border-zinc-200 dark:border-zinc-800/50">
        <button
          type="button"
          onClick={() => setActiveTab("admins")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "admins"
              ? "bg-blue-500/10 text-blue-400 shadow-sm shadow-blue-500/5"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
          }`}
        >
          <Users className="w-4 h-4" strokeWidth={2} />
          <span>รายชื่อแอดมิน (Admin List)</span>
          <span
            className={`text-[0.6875rem] px-2 py-0.5 rounded-full font-medium ${
              activeTab === "admins"
                ? "bg-blue-500/15 text-blue-400"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {admins.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "logs"
              ? "bg-blue-500/10 text-blue-400 shadow-sm shadow-blue-500/5"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
          }`}
        >
          <History className="w-4 h-4" strokeWidth={2} />
          <span>บันทึกกิจกรรมระบบ (Activity Logs)</span>
          <span
            className={`text-[0.6875rem] px-2 py-0.5 rounded-full font-medium ${
              activeTab === "logs"
                ? "bg-blue-500/15 text-blue-400"
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {activityLogs.length}
          </span>
        </button>
      </div>

      {/* ── TAB 1: ADMIN LIST ── */}
      {activeTab === "admins" && (
        <div className="space-y-4">
          <Card className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 shadow-sm rounded-2xl overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                  บัญชีผู้ดูแลระบบ ({filteredAdmins.length})
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                  <Input
                    placeholder="ค้นหาชื่อ หรือ อีเมล..."
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                    className="pl-8 h-9 text-xs rounded-xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 focus:bg-white dark:focus:bg-zinc-800"
                  />
                </div>
                <Button size="sm" onClick={openAdd} className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shrink-0">
                  <UserPlus className="w-4 h-4" />
                  เพิ่มแอดมิน
                </Button>
              </div>
            </div>

            {/* List */}
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredAdmins.length === 0 ? (
                <li className="p-12 text-center text-zinc-500 dark:text-zinc-400">
                  <UserX className="w-8 h-8 mx-auto mb-2 text-zinc-500 dark:text-zinc-400 opacity-60" />
                  <p className="text-sm font-bold">{loadFailed ? LOAD_FAILED_EMPTY_TEXT : "ไม่พบบัญชีแอดมินที่ตรงกับเงื่อนไข"}</p>
                </li>
              ) : (
                filteredAdmins.map((a) => {
                  const missingName = !a.name && !a.name_th;
                  const isMe = a.user_id === currentUserId;
                  const isActive = a.is_active !== false && (a.status ?? "active") === "active";
                  const { date, time } = formatThaiDateTime(a.created_at);

                  return (
                    <li
                      key={a.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-4.5 transition-colors ${
                        !isActive ? "bg-zinc-50/60 dark:bg-zinc-900/30 opacity-75" : "hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                            {missingName ? (
                              <span className="italic text-zinc-500 dark:text-zinc-400">ยังไม่ได้ระบุชื่อ</span>
                            ) : (
                              a.name_th || a.name
                            )}
                          </span>

                          {isMe && (
                            <Badge
                              variant="outline"
                              className="text-[0.625rem] bg-[#0C645B]/10 text-[#0C645B] border-[#0C645B]/30 dark:text-emerald-300 font-bold"
                            >
                              คุณ (You)
                            </Badge>
                          )}

                          {/* Status Badge */}
                          {isActive ? (
                            <Badge
                              variant="outline"
                              className="text-[0.625rem] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50 gap-1 font-bold"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Active
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[0.625rem] bg-amber-500/10 text-amber-700 border-amber-300/60 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50 gap-1 font-bold"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              Suspended
                            </Badge>
                          )}

                          {missingName && (
                            <Badge
                              variant="outline"
                              className="text-[0.625rem] border-amber-500/40 text-amber-600 dark:text-amber-400"
                            >
                              ตอบข้อความไม่ได้จนกว่าจะใส่ชื่อ
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 font-medium">
                          <span className="font-mono text-zinc-600 dark:text-zinc-300">{a.email}</span>
                          <span>•</span>
                          <span>สร้างเมื่อ {date} {time}</span>
                        </div>
                      </div>

                      {/* Action Buttons with fixed alignment */}
                      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(a)}
                          className="h-10 sm:h-8 sm:w-[72px] justify-center text-xs font-semibold gap-1 text-zinc-600 dark:text-zinc-300 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-xl"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          แก้ไข
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setResetPassword("");
                            setResetting(a);
                          }}
                          className="h-10 sm:h-8 sm:w-[112px] justify-center text-xs font-semibold gap-1 text-zinc-600 dark:text-zinc-300 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-xl"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          รีเซ็ตรหัสผ่าน
                        </Button>

                        {/* Reset 2FA: never for your own account (slot keeps rows aligned) */}
                        <div className="sm:w-[100px] flex sm:justify-end">
                          {!isMe && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmResetMfa(a)}
                              className="w-full h-10 sm:h-8 text-xs font-semibold gap-1 text-zinc-600 dark:text-zinc-300 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 rounded-xl justify-center"
                              title="ใช้เมื่อแอดมินคนนี้ทำมือถือหายหรือลบแอป Authenticator"
                            >
                              <ShieldOff className="w-3.5 h-3.5" />
                              ล้างค่า 2FA
                            </Button>
                          )}
                        </div>

                        {/* Soft Delete / Suspend & Restore Button Slot (fixed width keeps grid aligned) */}
                        <div className="sm:w-[104px] flex sm:justify-end">
                          {!isMe && (
                            isActive ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmToggleAdmin(a)}
                                className="w-full h-10 sm:h-8 text-xs font-semibold gap-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-700 rounded-xl justify-center"
                                title="ปิดการใช้งานบัญชีแอดมินนี้"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                ปิดการใช้งาน
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmToggleAdmin(a)}
                                className="w-full h-10 sm:h-8 text-xs font-semibold gap-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-700 rounded-xl justify-center"
                                title="เปิดใช้งานบัญชีแอดมินนี้"
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                เปิดใช้งาน
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </Card>
        </div>
      )}

      {/* ── TAB 2: ACTIVITY LOGS ── */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <Card className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 shadow-sm rounded-2xl p-4">
            <div className="flex flex-col space-y-3">
              {/* Header: Title with Filter Icon + Reset Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-200">
                  <Filter className="w-3.5 h-3.5 text-[#0C645B] dark:text-emerald-400" />
                  <span>ตัวกรองข้อมูลขั้นสูง (Advanced Filters)</span>
                </div>

                {isLogsFiltered && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetLogsFilters}
                    className="h-7 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2 items-center gap-1 rounded-lg"
                  >
                    <RotateCcw className="w-3 h-3" />
                    ล้างตัวกรอง (Reset)
                  </Button>
                )}
              </div>

              {/* Controls Row: Search, Date Range, Category Filter, Status Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
                {/* 1. Real-time Search */}
                <div className="lg:col-span-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400 pointer-events-none" />
                  <Input
                    placeholder="ค้นหาชื่อ, อีเมล, กิจกรรม, หรือ IP..."
                    value={logsSearch}
                    onChange={(e) => {
                      setLogsSearch(e.target.value);
                      setLogsCurrentPage(1);
                    }}
                    className="pl-9 bg-zinc-50/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 h-9 rounded-xl text-xs font-medium focus:bg-white dark:focus:bg-zinc-800 transition-colors"
                  />
                </div>

                {/* 2. Date Range Picker (Start & End) */}
                <div className="lg:col-span-3 flex items-center gap-1.5">
                  <DateInput
                    value={logsStartDate}
                    onChange={(v) => {
                      setLogsStartDate(v);
                      setLogsCurrentPage(1);
                    }}
                    placeholder="dd/mm/yyyy"
                  />
                  <span className="text-zinc-500 dark:text-zinc-400 text-xs shrink-0">-</span>
                  <DateInput
                    value={logsEndDate}
                    onChange={(v) => {
                      setLogsEndDate(v);
                      setLogsCurrentPage(1);
                    }}
                    placeholder="dd/mm/yyyy"
                  />
                </div>

                {/* 3. Action Category Filter */}
                <div className="lg:col-span-3">
                  <Select
                    value={logsCategoryFilter}
                    onValueChange={(v) => {
                      setLogsCategoryFilter(
                        (v || "all") as "all" | "auth" | "sop" | "settings" | "admin" | "employee" | "reply"
                      );
                      setLogsCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full bg-zinc-50/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 h-9 rounded-xl text-xs font-medium focus:bg-white dark:focus:bg-zinc-800">
                      <SelectValue placeholder="ประเภทกิจกรรม">
                        {(value: string) => CATEGORY_FILTER_LABELS[value] || value}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs">
                      <SelectItem value="all">ทุกประเภทกิจกรรม (All)</SelectItem>
                      <SelectItem value="auth">🔐 เข้าสู่ระบบ & ยืนยัน 2FA</SelectItem>
                      <SelectItem value="sop">📄 จัดการเอกสาร SOP</SelectItem>
                      <SelectItem value="settings">⚙️ ตั้งค่าระบบ AI</SelectItem>
                      <SelectItem value="admin">👥 จัดการบัญชีแอดมิน</SelectItem>
                      <SelectItem value="employee">👔 จัดการข้อมูลพนักงาน</SelectItem>
                      <SelectItem value="reply">💬 ตอบกลับข้อความผู้ใช้</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 4. Status Filter */}
                <div className="lg:col-span-2">
                  <Select
                    value={logsStatusFilter}
                    onValueChange={(v) => {
                      setLogsStatusFilter((v || "all") as "all" | "success" | "failed");
                      setLogsCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full bg-zinc-50/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 h-9 rounded-xl text-xs font-medium focus:bg-white dark:focus:bg-zinc-800">
                      <SelectValue placeholder="สถานะ">
                        {(value: string) => STATUS_FILTER_LABELS[value] || value}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs">
                      {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Card>

          {/* Activity Logs Table */}
          <Card className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 shadow-sm rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 font-bold">
                    <th className="px-4 py-3.5 text-left whitespace-nowrap">วันที่และเวลา</th>
                    <th className="px-4 py-3.5 text-left whitespace-nowrap">ผู้ดำเนินการ</th>
                    <th className="px-4 py-3.5 text-left whitespace-nowrap">กิจกรรม</th>
                    <th className="px-4 py-3.5 text-left w-full min-w-[240px]">เป้าหมาย / รายละเอียด</th>
                    <th className="px-4 py-3.5 text-left whitespace-nowrap">IP Address</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
                  {paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-zinc-500 dark:text-zinc-400 py-16">
                        <History className="w-8 h-8 mx-auto mb-2 text-zinc-300 dark:text-zinc-400" />
                        <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
                          ไม่พบบันทึกกิจกรรมระบบ
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log) => {
                      const { date, time } = formatThaiDateTime(log.created_at);
                      const isSuccess = log.status === "success";
                      const cleanEmail = (log.email || "").toLowerCase().trim();
                      const adminName =
                        adminNameMap.get(cleanEmail) ||
                        log.admin_name ||
                        (cleanEmail ? cleanEmail.split("@")[0] : "-");
                      const ipAddr = log.ip_address || "-";
                      const meta = getActionMeta(log.action_type);

                      return (
                        <tr key={log.id} className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors">
                          {/* Date / Time */}
                          <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-zinc-900 dark:text-zinc-100">{date}</span>
                              <span className="text-[0.625rem] text-zinc-500 dark:text-zinc-400">{time} น.</span>
                            </div>
                          </td>

                          {/* Admin Actor */}
                          <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 shrink-0">
                                <User className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-zinc-900 dark:text-zinc-100 text-xs">
                                  {adminName}
                                </span>
                                <span className="font-mono text-[0.625rem] text-zinc-500 dark:text-zinc-400">
                                  {log.email}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Action Badge & Status */}
                          <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                            {isSuccess ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[0.6875rem] font-bold shadow-2xs ${meta.badgeColor}`}
                              >
                                {meta.label}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[0.6875rem] font-bold shadow-2xs bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60">
                                <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                                {getFailedActionLabel(log.action_type, meta.label)}
                              </span>
                            )}
                          </td>

                          {/* Target & Details */}
                          <td className="px-4 py-3.5 align-middle">
                            <div className="space-y-0.5 max-w-xl">
                              {log.target && (
                                <div className="font-bold text-zinc-800 dark:text-zinc-200 text-xs">
                                  {log.target}
                                </div>
                              )}
                              <div className="text-zinc-600 dark:text-zinc-400 text-xs break-words">
                                {log.details || "-"}
                              </div>
                            </div>
                          </td>

                          {/* IP Address */}
                          <td className="px-4 py-3.5 align-middle whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100/90 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 font-mono text-[0.6875rem] text-zinc-600 dark:text-zinc-300 shadow-2xs">
                              <Globe className="w-2.5 h-2.5 text-zinc-500 dark:text-zinc-400 shrink-0" />
                              {ipAddr}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/30 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap">
                  แสดงแถวต่อหน้า:
                </span>
                <Select
                  value={String(logsPageSize)}
                  onValueChange={(v) => {
                    setLogsPageSize(Number(v));
                    setLogsCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-[5rem] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-[#27211C] text-xs min-w-[5rem]">
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                  หน้า {safeLogsPage} จาก {totalLogsPages} (ทั้งหมด {filteredLogs.length} รายการ)
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safeLogsPage <= 1}
                    onClick={() => setLogsCurrentPage((p) => Math.max(1, p - 1))}
                    className="h-8 w-8 p-0 rounded-xl border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safeLogsPage >= totalLogsPages}
                    onClick={() => setLogsCurrentPage((p) => Math.min(totalLogsPages, p + 1))}
                    className="h-8 w-8 p-0 rounded-xl border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Add / Edit Admin Dialog ── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent className="sm:max-w-lg rounded-2xl bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {editing ? "แก้ไขข้อมูลแอดมิน" : "เพิ่มแอดมินใหม่"}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              {editing
                ? editing.email
                : "แอดมินคนใหม่ต้องตั้งรหัสผ่านของตนเองและตั้งค่า 2FA ในการล็อกอินครั้งแรก"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {!editing && (
              <div className="space-y-1.5">
                <Label htmlFor="admin-pick" className="text-xs font-semibold">เลือกจากรายชื่อพนักงาน</Label>
                <select id="admin-pick" className={selectClass} value={pickedEmp} onChange={(e) => pickEmployee(e.target.value)}>
                  <option value="">— กรอกเอง (Manual) —</option>
                  {employees.map((e) => {
                    const already = !!e.email && adminEmails.has(e.email.toLowerCase());
                    return (
                      <option key={e.emp_id} value={String(e.emp_id)} disabled={already}>
                        {e.name_th || e.name}
                        {already ? " (เป็นแอดมินแล้ว)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            {!editing && (
              <div className="space-y-1.5">
                <Label htmlFor="admin-email" className="text-xs font-semibold">Email (สำหรับใช้ล็อกอิน)</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="เช่น admin@hotel.com"
                  className="rounded-xl text-xs h-9"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="admin-name" className="text-xs font-semibold">ชื่อ-นามสกุล (อังกฤษ)</Label>
              <Input
                id="admin-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="เช่น Somchai Jaidee"
                className="rounded-xl text-xs h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-name-th" className="text-xs font-semibold">ชื่อ-นามสกุล (ไทย)</Label>
              <Input
                id="admin-name-th"
                value={form.name_th}
                onChange={(e) => setForm({ ...form, name_th: e.target.value })}
                placeholder="เช่น สมชาย ใจดี"
                className="rounded-xl text-xs h-9"
              />
            </div>
            {!editing && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">รหัสผ่านเริ่มต้น</Label>
                <PasswordField value={form.password} onChange={(v) => setForm({ ...form, password: v })} disabled={saving} />
              </div>
            )}
          </div>

          {!canSave && !saving && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400" aria-live="polite">
              ยังขาด: {missingFields.join(", ")}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={closeDialog}
              disabled={saving}
              className="rounded-xl text-xs h-9"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={save}
              disabled={saving || !canSave}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs h-9 font-semibold"
            >
              {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "เพิ่มแอดมิน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset Password Dialog ── */}
      <Dialog
        open={!!resetting}
        onOpenChange={(o) => {
          if (!o && !saving) {
            setResetting(null);
            setResetPassword("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-500" />
              รีเซ็ตรหัสผ่านแอดมิน
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              {resetting?.email} · รหัสผ่านเดิมจะถูกยกเลิกทันที และเจ้าของบัญชีต้องตั้งรหัสผ่านใหม่ในการล็อกอินครั้งถัดไป
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label className="text-xs font-semibold">รหัสผ่านใหม่</Label>
            <PasswordField value={resetPassword} onChange={setResetPassword} disabled={saving} />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setResetting(null)}
              disabled={saving}
              className="rounded-xl text-xs h-9"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={saveReset}
              disabled={saving || resetPassword.length < MIN_PASSWORD}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs h-9 font-semibold"
            >
              {saving ? "กำลังบันทึก..." : "ยืนยันตั้งรหัสผ่าน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reset 2FA Confirmation Dialog ── */}
      <Dialog
        open={!!confirmResetMfa}
        onOpenChange={(o) => {
          if (!o && !resettingMfa) setConfirmResetMfa(null);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <ShieldOff className="w-5 h-5 text-orange-500" />
              ยืนยันการล้างค่า 2FA
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed pt-1">
              ล้างค่า 2FA ของบัญชี{" "}
              <strong className="text-zinc-800 dark:text-zinc-200 font-mono">{confirmResetMfa?.email}</strong>{" "}
              ({confirmResetMfa?.name_th || confirmResetMfa?.name})
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
            <li>ใช้เมื่อเจ้าของบัญชีทำมือถือหายหรือลบแอป Authenticator ไปแล้วเท่านั้น</li>
            <li>ก่อนกด ให้ยืนยันกับเจ้าของบัญชีโดยตรง (เจอตัวหรือโทรหา) ว่าเป็นคนขอจริง</li>
            <li>บัญชีนี้จะถูกออกจากระบบทุกเครื่อง และต้องตั้งค่าแอป Authenticator ใหม่ตอนเข้าสู่ระบบครั้งถัดไป</li>
          </ul>
          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmResetMfa(null)}
              disabled={resettingMfa}
              className="rounded-xl text-xs h-9"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleResetMfa}
              disabled={resettingMfa}
              className="rounded-xl text-xs h-9 font-semibold text-white bg-orange-600 hover:bg-orange-700"
            >
              {resettingMfa ? "กำลังทำรายการ..." : "ยืนยันล้างค่า 2FA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Suspend / Restore Confirmation Dialog ── */}
      <Dialog
        open={!!confirmToggleAdmin}
        onOpenChange={(o) => {
          if (!o) setConfirmToggleAdmin(null);
        }}
      >
        <DialogContent className="sm:max-w-md rounded-2xl bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              {(confirmToggleAdmin?.status ?? "active") === "active" ? (
                <>
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                  ยืนยันการปิดใช้งานบัญชีแอดมิน
                </>
              ) : (
                <>
                  <UserCheck className="w-5 h-5 text-emerald-500" />
                  ยืนยันการเปิดใช้งานบัญชีแอดมิน
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed pt-1">
              {(confirmToggleAdmin?.status ?? "active") === "active" ? (
                <>
                  คุณกำลังจะปิดการใช้งานบัญชี{" "}
                  <strong className="text-zinc-800 dark:text-zinc-200 font-mono">
                    {confirmToggleAdmin?.email}
                  </strong>{" "}
                  ({confirmToggleAdmin?.name_th || confirmToggleAdmin?.name})
                  <br />
                  <span className="text-rose-600 dark:text-rose-400 font-medium block mt-1">
                    บัญชีนี้จะไม่สามารถล็อกอินเข้าสู่ระบบได้อีกจนกว่าจะถูกเปิดใช้งานใหม่ (Soft Delete)
                  </span>
                </>
              ) : (
                <>
                  คุณต้องการเปิดใช้งานบัญชี{" "}
                  <strong className="text-zinc-800 dark:text-zinc-200 font-mono">
                    {confirmToggleAdmin?.email}
                  </strong>{" "}
                  ({confirmToggleAdmin?.name_th || confirmToggleAdmin?.name}) อีกครั้งใช่หรือไม่?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => setConfirmToggleAdmin(null)}
              disabled={togglingStatus}
              className="rounded-xl text-xs h-9"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleToggleStatus}
              disabled={togglingStatus}
              className={`rounded-xl text-xs h-9 font-semibold text-white ${
                (confirmToggleAdmin?.status ?? "active") === "active"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {togglingStatus
                ? "กำลังทำรายการ..."
                : (confirmToggleAdmin?.status ?? "active") === "active"
                ? "ยืนยันปิดการใช้งาน"
                : "ยืนยันเปิดใช้งาน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
