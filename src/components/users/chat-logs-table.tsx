"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ChatLog, Employee } from "@/lib/types";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { correctStatus } from "@/lib/answer-status";
import {
  Search,
  Eye,
  User,
  Bot,
  Briefcase,
  UserCircle,
  Calendar,
  MessageSquare,
  Database,
  Users,
  ShieldCheck,
  Crown,
  RotateCcw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Timer,
  Loader2,
} from "lucide-react";
import { DASHBOARD_DATA_REFRESH } from "@/lib/system-health-events";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { LOAD_FAILED_EMPTY_TEXT } from "@/components/dashboard/load-error-banner";

// Real Hotel Departments List
const DEPARTMENTS = [
  "All Departments",
  "Executive Office",
  "Accounting",
  "Front Office",
  "Front Office (Reservation)",
  "Housekeeping (Service)",
  "Housekeeping (Regular)",
  "Food & Beverage",
  "Main Kitchen",
  "Guest / Unregistered",
];

const STATUS_FILTER_LABELS: Record<string, string> = {
  all: "ทุกสถานะ (All)",
  success: "Success",
  not_found: "Not Found",
  unauthorized: "Unauthorized",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanText(str: string | null | undefined): string {
  if (!str) return "";
  return String(str).replace(/^=+/, "").trim();
}

function normalizeLineId(id: string | null | undefined): string {
  if (!id) return "";
  return String(id)
    .replace(/^["'=]+/, "")
    .replace(/["'=]+$/, "")
    .replace(/=/g, "")
    .trim()
    .toLowerCase();
}

function cleanDisplayId(id: string | null | undefined): string {
  if (!id) return "";
  return String(id)
    .replace(/^["'=]+/, "")
    .replace(/["'=]+$/, "")
    .replace(/=/g, "")
    .trim();
}

function shortId(id: string): string {
  const clean = cleanDisplayId(id);
  if (!clean) return "-";
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}

/** Label for someone with no employee record — never their LINE display name. */
function guestLabel(id: string | null | undefined): string {
  const short = shortId(String(id || ""));
  return short && short !== "-" ? `ไม่ระบุตัวตน (${short})` : "ไม่ระบุตัวตน";
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" }),
    time: d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
  };
}

function getResponseTime(log: ChatLog): { seconds: number | null; formatted: string } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAny = log as any;
  if (typeof rawAny.response_time_seconds === "number" && rawAny.response_time_seconds > 0) {
    const s = rawAny.response_time_seconds;
    return { seconds: s, formatted: `${s.toFixed(1)}s` };
  }
  if (typeof rawAny.response_time === "number" && rawAny.response_time > 0) {
    // n8n writes seconds (e.g. 4.37); only a value this large can be milliseconds.
    const s = rawAny.response_time > 1000 ? rawAny.response_time / 1000 : rawAny.response_time;
    return { seconds: s, formatted: `${s.toFixed(1)}s` };
  }
  if (typeof rawAny.response_time_ms === "number" && rawAny.response_time_ms > 0) {
    const s = rawAny.response_time_ms / 1000;
    return { seconds: s, formatted: `${s.toFixed(1)}s` };
  }

  // Real data only: if null or missing, do not simulate or mock
  return {
    seconds: null,
    formatted: "-",
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

// No "timeout": timed-out requests are kept in Supabase but filtered out of
// every dashboard view, so there is nothing for that option to show.
type StatusFilterType = "all" | "success" | "not_found" | "unauthorized";

interface EnrichedLog extends ChatLog {
  isStaff: boolean;
  resolvedName: string;
  resolvedNameTh: string;
  resolvedDept: string;
  roleLabel: string;
  roleType: "admin" | "manager" | "staff" | "guest";
  cleanLineUserId: string;
  cleanMessage: string;
  cleanResponse: string;
  responseTime: { seconds: number | null; formatted: string };
}

interface ChatLogsTableProps {
  chatLogs: ChatLog[];
  employees: Employee[];
  /** Preset filters, so a stat card elsewhere can deep-link into a filtered view. */
  initialStatus?: StatusFilterType;
  initialStartDate?: string;
  initialEndDate?: string;
  /** True row/user counts across all of chat_logs, so the summary cards can
   *  say when the table is only showing the newest slice of the history. */
  totalLogsInDb?: number;
  totalUsersInDb?: number;
  /** The logs failed to load: say so instead of "nothing matches". */
  loadFailed?: boolean;
}

// ─── Summary strip ────────────────────────────────────────────────────────────

// These three numbers describe the *current filter result*, not the system as a
// whole — they change with every filter change. Three page-sized hero cards
// oversold that and left most of their width empty, so they share one row now.
function SummaryMetric({
  icon,
  label,
  value,
  subtext,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  colorClass: string;
}) {
  // Same three-line shape and type scale as StatCard on the other pages:
  // uppercase English label, then the number, then the Thai explanation.
  return (
    <div className="flex items-start justify-between gap-3 px-5 py-4 flex-1 min-w-0">
      <div className="min-w-0 space-y-1.5">
        <p className="text-[0.6875rem] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          {label}
        </p>
        <p className="text-xl lg:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight tabular-nums leading-snug">
          {typeof value === "number" ? value.toLocaleString() : value}
        </p>
        {subtext && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium truncate">{subtext}</p>
        )}
      </div>
      <div className={`p-3 rounded-xl border shrink-0 ${colorClass}`}>{icon}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Cap the in-memory log list so a long-running open tab can't grow this
// unbounded — matches the server's initial fetch limit (see users/page.tsx).
const MAX_LOGS = 500;

export function ChatLogsTable({
  chatLogs,
  employees,
  initialStatus = "all",
  initialStartDate = "",
  initialEndDate = "",
  totalLogsInDb = 0,
  totalUsersInDb = 0,
  loadFailed = false,
}: ChatLogsTableProps) {
  // Filter States
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>(initialStatus);

  // Pagination States
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [selectedLog, setSelectedLog] = useState<EnrichedLog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // The realtime subscription below is set up once, so it cannot close over the
  // employee lookup directly — this ref hands it the current one.
  const empLineIdMapRef = useRef(new Map<string, Employee>());

  // Live logs: seeded from the server-rendered initial fetch, then kept
  // current via a Supabase Realtime subscription below and manual refresh
  const [logs, setLogs] = useState<ChatLog[]>(chatLogs);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const knownIds = useRef(new Set(chatLogs.map((l) => l.id)));

  // Sync state if server component revalidates and passes fresh chatLogs
  const [syncedChatLogs, setSyncedChatLogs] = useState(chatLogs);
  if (syncedChatLogs !== chatLogs) {
    setSyncedChatLogs(chatLogs);
    setLogs(chatLogs);
  }
  useEffect(() => {
    knownIds.current = new Set(chatLogs.map((l) => l.id));
  }, [chatLogs]);

  // Direct Supabase re-fetch handler when user triggers refresh button
  const fetchLatestLogs = async () => {
    setIsRefreshing(true);
    try {
      const supabase = createClient();
      const { data, error } = await fetchAllRows((from, to) =>
        supabase
          .from("chat_logs")
          .select("*")
          .neq("status", "timeout")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
      );

      if (error) throw error;
      if (data) {
        const corrected = (data as ChatLog[]).map(correctStatus);
        setLogs(corrected);
        knownIds.current = new Set(corrected.map((l) => l.id));
      }
    } catch (err) {
      console.error("Failed to re-fetch chat logs:", err);
      toast.error("โหลดประวัติการสนทนาล่าสุดไม่สำเร็จ ข้อมูลที่เห็นอาจไม่ใช่ล่าสุด กรุณาลองใหม่");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    const handleRefresh = () => {
      fetchLatestLogs();
    };
    window.addEventListener(DASHBOARD_DATA_REFRESH, handleRefresh);
    return () => {
      window.removeEventListener(DASHBOARD_DATA_REFRESH, handleRefresh);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("chat_logs_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_logs" },
        (payload) => {
          const newLog = correctStatus(payload.new as ChatLog);
          if (String(newLog.status).toLowerCase() === "timeout") return;
          if (knownIds.current.has(newLog.id)) return;
          knownIds.current.add(newLog.id);

          setLogs((prev) => [newLog, ...prev].slice(0, MAX_LOGS));

          const emp = empLineIdMapRef.current.get(normalizeLineId(newLog.line_user_id));
          const who = emp?.name?.trim() || guestLabel(newLog.line_user_id);
          const preview = String(newLog.user_message || "").replace(/^=+/, "").trim();
          toast.info(`ข้อความใหม่จาก ${who}`, {
            description: preview ? preview.slice(0, 80) : undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Build employee lookup maps for multi-strategy matching
  const { empLineIdMap, empLineNameMap } = useMemo(() => {
    const idMap = new Map<string, Employee>();
    const nameMap = new Map<string, Employee>();

    employees.forEach((emp) => {
      if (emp.line_user_id) {
        const key = normalizeLineId(emp.line_user_id);
        if (key) idMap.set(key, emp);
      }
      if (emp.line_name) {
        const key = normalizeLineId(emp.line_name);
        if (key) nameMap.set(key, emp);
      }
      if (emp.name) {
        const key = normalizeLineId(emp.name);
        if (key) nameMap.set(key, emp);
      }
      if (emp.name_th) {
        const key = normalizeLineId(emp.name_th);
        if (key) nameMap.set(key, emp);
      }
      if (emp.nickname_th) {
        const key = normalizeLineId(emp.nickname_th);
        if (key) nameMap.set(key, emp);
      }
    });

    return { empLineIdMap: idMap, empLineNameMap: nameMap };
  }, [employees]);

  useEffect(() => {
    empLineIdMapRef.current = empLineIdMap;
  }, [empLineIdMap]);

  // Enrich each log
  const enrichedLogs = useMemo<EnrichedLog[]>(() => {
    return logs.map((log) => {
      const normId = normalizeLineId(log.line_user_id);
      const displayId = cleanDisplayId(log.line_user_id);

      // Multi-strategy lookup
      let emp = normId ? empLineIdMap.get(normId) : undefined;
      if (!emp && log.display_name) {
        emp = empLineNameMap.get(normalizeLineId(log.display_name));
      }

      let resolvedName = "";
      let resolvedNameTh = "";
      let roleLabel = "Guest";
      let roleType: "admin" | "manager" | "staff" | "guest" = "guest";
      let resolvedDept = "Guest / Unregistered";
      const isStaff = Boolean(emp);

      if (emp) {
        resolvedName = emp.name || emp.name_th || "Employee";
        resolvedNameTh = emp.name_th || "";
        resolvedDept = emp.department || "General Staff";
        const level = String(emp.access_level || "").toLowerCase();
        const pos = String(emp.position || "").toLowerCase();

        if (emp.position) {
          roleLabel = emp.position;
        } else if (level === "admin") {
          roleLabel = "Admin";
        } else if (level === "manager") {
          roleLabel = "Manager";
        } else {
          roleLabel = "Staff";
        }

        if (level === "admin" || pos.includes("admin")) {
          roleType = "admin";
        } else if (
          level === "manager" ||
          pos.includes("manager") ||
          pos.includes("director") ||
          pos.includes("head")
        ) {
          roleType = "manager";
        } else {
          roleType = "staff";
        }
      } else {
        resolvedName = guestLabel(displayId);
        roleLabel = "Guest";
        roleType = "guest";
      }

      return {
        ...log,
        employee: emp || log.employee || null,
        isStaff,
        resolvedName,
        resolvedNameTh,
        resolvedDept,
        roleLabel,
        roleType,
        cleanLineUserId: displayId,
        cleanMessage: cleanText(log.user_message),
        cleanResponse: cleanText(log.ai_response),
        responseTime: getResponseTime(log),
      };
    });
  }, [logs, empLineIdMap, empLineNameMap]);

  // Apply all 4 filters simultaneously
  const filteredLogs = useMemo(() => {
    const q = search.toLowerCase().trim();

    return enrichedLogs.filter((log) => {
      // 1. Status Filter
      if (statusFilter !== "all" && log.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // 2. Department Filter
      if (deptFilter !== "All Departments") {
        if (deptFilter === "Guest / Unregistered") {
          if (log.isStaff) return false;
        } else {
          if (!log.isStaff || log.resolvedDept.toLowerCase() !== deptFilter.toLowerCase()) {
            return false;
          }
        }
      }

      // 3. Date Range Filter
      if (startDate) {
        const logDateStr = new Date(log.created_at).toISOString().split("T")[0];
        if (logDateStr < startDate) return false;
      }
      if (endDate) {
        const logDateStr = new Date(log.created_at).toISOString().split("T")[0];
        if (logDateStr > endDate) return false;
      }

      // 4. Universal Search Bar Filter (Question, AI Response, Thai Name, English Name)
      if (q) {
        const question = (log.cleanMessage || log.user_message || "").toLowerCase();
        const response = (log.cleanResponse || log.ai_response || "").toLowerCase();
        const nameEn = (log.resolvedName || log.employee?.name || "").toLowerCase();
        const nameTh = (log.resolvedNameTh || log.employee?.name_th || log.employee?.nickname_th || "").toLowerCase();
        const lineDisplayName = (log.display_name || "").toLowerCase();

        const matchesQuestion = question.includes(q);
        const matchesResponse = response.includes(q);
        const matchesNameTh = nameTh.includes(q);
        const matchesNameEn = nameEn.includes(q) || lineDisplayName.includes(q);

        if (!matchesQuestion && !matchesResponse && !matchesNameTh && !matchesNameEn) {
          return false;
        }
      }

      return true;
    });
  }, [enrichedLogs, search, deptFilter, startDate, endDate, statusFilter]);

  // Pagination computations
  const totalItems = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedLogs = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return filteredLogs.slice(startIndex, startIndex + pageSize);
  }, [filteredLogs, safePage, pageSize]);

  const paginationPages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safePage <= 4) {
      return [1, 2, 3, 4, 5, "...", totalPages];
    }
    if (safePage >= totalPages - 3) {
      return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "...", safePage - 1, safePage, safePage + 1, "...", totalPages];
  }, [safePage, totalPages]);

  // Dynamic Summary Metrics based on filtered results
  const dynamicMetrics = useMemo(() => {
    const total = filteredLogs.length;
    const uniqueUsers = new Set(filteredLogs.map((l) => l.cleanLineUserId).filter(Boolean)).size;
    const successCount = filteredLogs.filter((l) => l.status === "success").length;
    const resolvedRate = total > 0 ? (successCount / total) * 100 : 100;

    return {
      total,
      uniqueUsers,
      successCount,
      resolvedRate,
    };
  }, [filteredLogs]);

  // Reset all filters
  function handleResetFilters() {
    setSearch("");
    setDeptFilter("All Departments");
    setStartDate("");
    setEndDate("");
    setStatusFilter("all");
    setCurrentPage(1);
  }

  const isFiltered =
    Boolean(search) ||
    deptFilter !== "All Departments" ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    statusFilter !== "all";

  // The table only holds the newest PAGE_LIMIT rows, so logs.length is not the
  // size of the history. totalLogsInDb is counted on the server at page load;
  // live rows can push logs past it before the next reload, hence the max.
  const systemTotal = Math.max(totalLogsInDb, logs.length);
  const capped = systemTotal > logs.length;

  function openDetail(log: EnrichedLog) {
    setSelectedLog(log);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* ── Summary of whatever the filters currently match ── */}
      <Card className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 shadow-sm rounded-2xl overflow-hidden">
        <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-zinc-200 dark:divide-zinc-800">
          <SummaryMetric
            icon={<Database className="w-5 h-5 text-[#0C645B] dark:text-emerald-400" />}
            label="Total Logs"
            value={dynamicMetrics.total}
            subtext={
              isFiltered
                ? `จากผลการกรอง (${dynamicMetrics.total.toLocaleString()} / ${logs.length.toLocaleString()} รายการ)` +
                  (capped ? ` · ทั้งระบบมี ${systemTotal.toLocaleString()} รายการ` : "")
                : capped
                  ? `${logs.length.toLocaleString()} รายการล่าสุดที่โหลดมา · ทั้งระบบมี ${systemTotal.toLocaleString()} รายการ`
                  : `จากทั้งหมด ${logs.length.toLocaleString()} รายการในระบบ`
            }
            colorClass="bg-[#0C645B]/10 dark:bg-[#17A594]/20 border-[#0C645B]/20 dark:border-emerald-500/30"
          />
          <SummaryMetric
            icon={<Users className="w-5 h-5 text-[#8B5E3C] dark:text-[#D4A373]" />}
            label="Unique Users"
            value={dynamicMetrics.uniqueUsers}
            subtext={
              totalUsersInDb > dynamicMetrics.uniqueUsers
                ? `คนที่ทักเข้ามาในผลลัพธ์นี้ · ทั้งระบบมี ${totalUsersInDb.toLocaleString()} คน`
                : "จำนวนคนที่ทักเข้ามาในผลลัพธ์นี้"
            }
            colorClass="bg-[#8B5E3C]/10 dark:bg-[#8B5E3C]/20 border-[#8B5E3C]/20 dark:border-[#8B5E3C]/40"
          />
          <SummaryMetric
            icon={<ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />}
            label="Resolved Rate"
            value={`${dynamicMetrics.resolvedRate.toFixed(1)}%`}
            subtext={`ตอบได้จริง ${dynamicMetrics.successCount.toLocaleString()} จาก ${dynamicMetrics.total.toLocaleString()} ข้อความ`}
            colorClass="bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50"
          />
        </div>
      </Card>

      {/* ── Toolbar Filter Bar ── */}
      <Card className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 shadow-sm rounded-2xl p-4">
        <div className="flex flex-col space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-700 dark:text-zinc-200">
                <Filter className="w-3.5 h-3.5 text-[#0C645B] dark:text-emerald-400" />
                <span>ตัวกรองข้อมูลขั้นสูง (Advanced Filters)</span>
              </div>
              {isRefreshing && (
                <span className="flex items-center gap-1.5 text-xs text-[#0C645B] dark:text-emerald-400 font-semibold animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  กำลังอัปเดตข้อมูล...
                </span>
              )}
            </div>
            {isFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-7 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2 items-center gap-1 rounded-lg"
              >
                <RotateCcw className="w-3 h-3" />
                ล้างตัวกรอง (Reset)
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
            {/* 1. Real-time Search */}
            <div className="lg:col-span-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400 pointer-events-none" />
              <Input
                placeholder="ค้นหาคำถาม, คำตอบ, หรือชื่อผู้ใช้..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 bg-zinc-50/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 h-9 rounded-xl text-xs font-medium focus:bg-white dark:focus:bg-zinc-800 transition-colors"
              />
            </div>

            {/* 2. Department Dropdown */}
            <div className="lg:col-span-3">
              <Select value={deptFilter} onValueChange={(v) => {
                  setDeptFilter(v || "All Departments");
                  setCurrentPage(1);
                }}>
                <SelectTrigger className="w-full bg-zinc-50/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 h-9 rounded-xl text-xs font-medium focus:bg-white dark:focus:bg-zinc-800">
                  <SelectValue placeholder="เลือกแผนก" />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs">
                  {DEPARTMENTS.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 3. Date Range Picker (Start & End) */}
            <div className="lg:col-span-3 flex items-center gap-1.5">
              <DateInput
                value={startDate}
                onChange={(v) => {
                  setStartDate(v);
                  setCurrentPage(1);
                }}
              />
              <span className="text-zinc-500 dark:text-zinc-400 text-xs shrink-0">-</span>
              <DateInput
                value={endDate}
                onChange={(v) => {
                  setEndDate(v);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* 4. Status Dropdown */}
            <div className="lg:col-span-2">
              <Select value={statusFilter} onValueChange={(v) => {
                  setStatusFilter((v || "all") as StatusFilterType);
                  setCurrentPage(1);
                }}>
                <SelectTrigger className="w-full bg-zinc-50/70 dark:bg-zinc-800/60 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 h-9 rounded-xl text-xs font-medium focus:bg-white dark:focus:bg-zinc-800">
                  <SelectValue placeholder="สถานะ">
                    {(value: string) => STATUS_FILTER_LABELS[value] || value}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs">
                  <SelectItem value="all">ทุกสถานะ (All)</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="not_found">Not Found</SelectItem>
                  <SelectItem value="unauthorized">Unauthorized</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {/* ── Table ── */}
      <Card className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/80 shadow-sm rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-xs min-w-[1000px]">
            <colgroup>
              <col style={{ width: "115px" }} />
              <col style={{ width: "220px" }} />
              <col style={{ width: "25%" }} />
              <col />
              <col style={{ width: "110px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "44px" }} />
            </colgroup>

            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 font-bold">
                <th className="px-3.5 py-3 text-left whitespace-nowrap">วันที่และเวลา</th>
                <th className="px-3.5 py-3 text-left whitespace-nowrap">ชื่อผู้ใช้ / แผนก</th>
                <th className="px-3.5 py-3 text-left whitespace-nowrap">คำถามผู้ใช้</th>
                <th className="px-3.5 py-3 text-left whitespace-nowrap">คำตอบ AI</th>
                <th className="px-3 py-3 text-center whitespace-nowrap">เวลาตอบกลับ</th>
                <th className="px-3 py-3 text-center whitespace-nowrap">สถานะ</th>
                <th className="px-2 py-3 text-center"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-medium">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-zinc-500 dark:text-zinc-400 py-16">
                    <MessageSquare className="w-8 h-8 mx-auto mb-2 text-zinc-300 dark:text-zinc-400" />
                    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{loadFailed ? LOAD_FAILED_EMPTY_TEXT : "ไม่พบข้อมูลที่ตรงกับเงื่อนไข"}</p>
                    {!loadFailed && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">ลองปรับตัวกรองค้นหา หรือกด Reset ตัวกรอง</p>}
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const { date, time } = formatDateTime(log.created_at);

                  let badgeClass = "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800";
                  if (log.roleType === "admin") {
                    badgeClass = "border-purple-200 dark:border-purple-800/60 text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40";
                  } else if (log.roleType === "manager") {
                    badgeClass = "border-[#0C645B]/20 dark:border-emerald-500/40 text-[#0C645B] dark:text-emerald-300 bg-[#0C645B]/10 dark:bg-emerald-950/40";
                  } else if (log.roleType === "staff") {
                    badgeClass = "border-[#8B5E3C]/20 dark:border-[#8B5E3C]/40 text-[#8B5E3C] dark:text-[#D4A373] bg-[#8B5E3C]/10 dark:bg-[#8B5E3C]/20";
                  }

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer"
                      onClick={() => openDetail(log)}
                    >
                      {/* Date / Time */}
                      <td className="px-3.5 py-3 align-middle whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">{date}</span>
                          <span className="text-[0.6875rem] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">{time}</span>
                        </div>
                      </td>

                      {/* Sender + Role + Department */}
                      <td className="px-3.5 py-3 align-middle overflow-hidden">
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`text-[0.5625rem] px-1.5 py-0 gap-1 w-fit font-bold whitespace-nowrap ${badgeClass}`}
                            >
                              {log.roleType === "admin" ? (
                                <Crown className="w-2.5 h-2.5" />
                              ) : log.isStaff ? (
                                <Briefcase className="w-2.5 h-2.5" />
                              ) : (
                                <UserCircle className="w-2.5 h-2.5" />
                              )}
                              {log.roleLabel}
                            </Badge>
                          </div>

                          <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate block">
                            {log.resolvedName}
                          </span>

                          <span className="text-[0.6875rem] text-zinc-500 dark:text-zinc-400 font-medium truncate block">
                            {log.isStaff ? log.resolvedDept : shortId(log.cleanLineUserId)}
                          </span>
                        </div>
                      </td>

                      {/* User message — single line truncated */}
                      <td className="px-3.5 py-3 align-middle overflow-hidden">
                        <p className="text-zinc-800 dark:text-zinc-200 font-normal truncate whitespace-nowrap overflow-hidden text-ellipsis max-w-full" title={log.cleanMessage}>
                          {log.cleanMessage || <span className="text-zinc-500 dark:text-zinc-400 italic">— ไม่มีข้อความ —</span>}
                        </p>
                      </td>

                      {/* AI response — single line truncated */}
                      <td className="px-3.5 py-3 align-middle overflow-hidden">
                        <p className="text-zinc-600 dark:text-zinc-300 font-normal truncate whitespace-nowrap overflow-hidden text-ellipsis max-w-full" title={log.cleanResponse}>
                          {log.cleanResponse || <span className="text-zinc-500 dark:text-zinc-400 italic">— ไม่มีการตอบ —</span>}
                        </p>
                      </td>

                      {/* Response Time Badge */}
                      <td className="px-3 py-3 align-middle text-center whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          {log.responseTime.seconds !== null ? (
                            <span
                              className={`inline-flex items-center gap-1 font-mono text-[0.6875rem] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                                log.responseTime.seconds < 2.6
                                  ? "bg-[#DEEFEC]/80 text-[#0C645B] border-[#0C645B]/20 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-500/30"
                                  : log.responseTime.seconds <= 3.4
                                  ? "bg-[#EFE8DF]/80 text-[#8B5E3C] border-[#8B5E3C]/20 dark:bg-[#8B5E3C]/20 dark:text-[#D4A373] dark:border-[#8B5E3C]/40"
                                  : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40"
                              }`}
                            >
                              <Timer className="w-3 h-3 opacity-70" />
                              {log.responseTime.formatted}
                            </span>
                          ) : (
                            <span className="text-zinc-500 dark:text-zinc-400 font-mono text-xs">-</span>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-3 py-3 align-middle text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center">
                          <StatusBadge status={log.status} />
                        </div>
                      </td>

                      {/* Eye button */}
                      <td className="px-2 py-3 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetail(log)}
                            aria-label="ดูรายละเอียดการสนทนา"
                            title="ดูรายละเอียด"
                            className="h-10 w-10 lg:h-7 lg:w-7 p-0 text-zinc-500 dark:text-zinc-400 hover:text-[#0C645B] dark:hover:text-emerald-400 hover:bg-[#0C645B]/10 dark:hover:bg-zinc-800 rounded-lg"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination Bar ── */}
        <div className="border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-800/30 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          {/* Rows per page selector */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 dark:text-zinc-400 font-medium whitespace-nowrap">
              แสดงแถวต่อหน้า:
            </span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[5rem] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-[#0C645B]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs min-w-[5rem]">
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary text */}
          <div className="text-zinc-600 dark:text-zinc-400 font-medium text-center">
            {totalItems === 0 ? (
              "แสดง 0 รายการ"
            ) : (
              <>
                แสดง{" "}
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {((safePage - 1) * pageSize + 1).toLocaleString()}
                </span>{" "}
                -{" "}
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {Math.min(safePage * pageSize, totalItems).toLocaleString()}
                </span>{" "}
                จากทั้งหมด{" "}
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {totalItems.toLocaleString()}
                </span>{" "}
                รายการ
              </>
            )}
          </div>

          {/* Page navigation buttons */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-10 w-10 lg:h-8 lg:w-8 p-0 rounded-lg border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none"
              title="หน้าก่อนหน้า"
              aria-label="หน้าก่อนหน้า"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>

            {paginationPages.map((pageItem, idx) =>
              pageItem === "..." ? (
                <span
                  key={`dots-${idx}`}
                  className="px-1.5 py-1 text-zinc-500 dark:text-zinc-400 font-medium select-none text-xs"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={`page-${pageItem}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage(pageItem as number)}
                  className={`h-8 min-w-[2rem] px-2 text-xs font-bold rounded-lg transition-all ${
                    safePage === pageItem
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {pageItem}
                </Button>
              )
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="h-10 w-10 lg:h-8 lg:w-8 p-0 rounded-lg border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 disabled:opacity-30 disabled:pointer-events-none"
              title="หน้าถัดไป"
              aria-label="หน้าถัดไป"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Detail Dialog ── */}
      <ChatLogDetailDialog
        log={selectedLog}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

interface ChatLogDetailDialogProps {
  log: EnrichedLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ChatLogDetailDialog({ log, open, onOpenChange }: ChatLogDetailDialogProps) {
  if (!log) return null;
  const { date, time } = formatDateTime(log.created_at);

  let badgeClass = "border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800";
  if (log.roleType === "admin") {
    badgeClass = "border-purple-200 dark:border-purple-800/60 text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40";
  } else if (log.roleType === "manager") {
    badgeClass = "border-[#0C645B]/20 dark:border-emerald-500/40 text-[#0C645B] dark:text-emerald-300 bg-[#0C645B]/10 dark:bg-emerald-950/40";
  } else if (log.roleType === "staff") {
    badgeClass = "border-[#8B5E3C]/20 dark:border-[#8B5E3C]/40 text-[#8B5E3C] dark:text-[#D4A373] bg-[#8B5E3C]/10 dark:bg-[#8B5E3C]/20";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-[#27211C] border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 max-w-2xl max-h-[85vh] overflow-hidden flex flex-col gap-4 shadow-2xl rounded-2xl">
        <DialogHeader className="shrink-0 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-zinc-900 dark:text-zinc-100">
            <span className="p-1.5 rounded-lg bg-[#0C645B]/10 dark:bg-[#17A594]/20 text-[#0C645B] dark:text-emerald-400">
              <MessageSquare className="w-4 h-4" />
            </span>
            รายละเอียดการสนทนา (Conversation Log)
          </DialogTitle>
        </DialogHeader>

        {/* User Profile & Meta Info Bar */}
        <div className="shrink-0 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-xs space-y-2.5">
          {/* Top row: Profile & Names */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap min-w-0">
              <Badge variant="outline" className={`text-[0.625rem] gap-1 font-bold shrink-0 ${badgeClass}`}>
                {log.roleType === "admin" ? (
                  <Crown className="w-2.5 h-2.5" />
                ) : log.isStaff ? (
                  <Briefcase className="w-2.5 h-2.5" />
                ) : (
                  <UserCircle className="w-2.5 h-2.5" />
                )}
                {log.roleLabel}
              </Badge>

              <div className="flex items-baseline gap-2 flex-wrap min-w-0">
                <span className="font-extrabold text-sm text-zinc-900 dark:text-zinc-100">
                  {log.resolvedName}
                </span>
                {log.resolvedNameTh && log.resolvedNameTh !== log.resolvedName && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 font-normal">
                    {log.resolvedNameTh}
                  </span>
                )}
                {log.isStaff && (
                  <span className="text-xs text-[#0C645B] dark:text-emerald-400 font-semibold">
                    ({log.resolvedDept})
                  </span>
                )}
              </div>
            </div>

            <StatusBadge status={log.status} />
          </div>

          {/* Bottom row: Meta Information (User ID, Date/Time, Response Time) */}
          <div className="flex items-center gap-3 text-[0.6875rem] text-zinc-500 dark:text-zinc-400 font-medium flex-wrap pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60">
            <div className="flex items-center gap-1 font-mono">
              <span className="text-zinc-400 dark:text-zinc-500">ID:</span>
              <span className="text-zinc-600 dark:text-zinc-300 select-all">{log.cleanLineUserId}</span>
            </div>

            <span className="text-zinc-300 dark:text-zinc-600">|</span>

            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
              <span>
                {date} {time}
              </span>
            </div>

            {log.responseTime.seconds !== null && (
              <>
                <span className="text-zinc-300 dark:text-zinc-600">|</span>
                <div className="flex items-center gap-1 font-mono text-[#0C645B] dark:text-emerald-300 font-bold">
                  <Timer className="w-3.5 h-3.5" />
                  <span>{log.responseTime.formatted}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Conversation Stream */}
        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 custom-scrollbar pr-1">
          {/* User Message */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0C645B] dark:text-emerald-400">
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{log.resolvedName}</span>
            </div>
            <div className="rounded-xl border border-[#0C645B]/20 dark:border-emerald-500/30 bg-[#0C645B]/5 dark:bg-emerald-950/20 px-4 py-3">
              {log.cleanMessage ? (
                <p className="text-sm text-zinc-900 dark:text-zinc-100 leading-relaxed whitespace-pre-wrap break-words">
                  {log.cleanMessage}
                </p>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">— ไม่มีข้อความ —</p>
              )}
            </div>
          </div>

          {/* AI Response */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#8B5E3C] dark:text-[#D4A373]">
              <Bot className="w-3.5 h-3.5" />
              AI Assistant
            </div>
            <div className="rounded-xl border border-[#8B5E3C]/20 dark:border-[#8B5E3C]/40 bg-[#8B5E3C]/5 dark:bg-[#8B5E3C]/10 px-4 py-3">
              {log.cleanResponse ? (
                <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
                  {log.cleanResponse}
                </p>
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400 italic">— ไม่มีการตอบสนอง —</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
