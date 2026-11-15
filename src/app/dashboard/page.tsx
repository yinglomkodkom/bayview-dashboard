import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEE_TABLE } from "@/lib/config";
import { DashboardClient } from "./dashboard-client";
import { normalizeStatusKey } from "@/components/dashboard/status-badge";
import type { DailyUsage, ChatLog, DailyMessageUsage, DeptMessageUsage, Employee } from "@/lib/types";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { LoadErrorBanner } from "@/components/dashboard/load-error-banner";

export const metadata: Metadata = { title: "ภาพรวม" };

export const dynamic = "force-dynamic";

// Clean string by stripping quotes, equal signs, and whitespace
function cleanId(id: string | null | undefined): string {
  if (!id) return "";
  return String(id)
    .replace(/^["'=]+/, "")
    .replace(/["'=]+$/, "")
    .replace(/=/g, "")
    .trim()
    .toLowerCase();
}

// Generate last 30 days date slots with actual per-status counts from chat
// logs (success/not_found/unauthorized) — the same statuses shown everywhere
// else (StatusBadge, StatusDot). Failed requests never reach here: they are
// excluded by the query below and would have no series to land in anyway.
function getDailyUsageFromLogs(logs: ChatLog[]): DailyUsage[] {
  const days = 30;
  const result: DailyUsage[] = [];
  const now = new Date();

  const emptyStats = () => ({ success: 0, not_found: 0, unauthorized: 0 });
  const countMap = new Map<string, ReturnType<typeof emptyStats>>();

  logs.forEach((log) => {
    const key = normalizeStatusKey(log.status);
    // normalizeStatusKey maps anything unrecognised to "timeout", which has no
    // bucket here — skip those rather than crashing on an undefined counter.
    if (key === "timeout") return;
    const logDate = new Date(log.created_at).toISOString().split("T")[0];
    const current = countMap.get(logDate) || emptyStats();
    current[key] += 1;
    countMap.set(logDate, current);
  });

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const stats = countMap.get(key) || emptyStats();

    result.push({
      date: d.toLocaleDateString("th-TH", { day: "2-digit", month: "short" }),
      ...stats,
    });
  }

  return result;
}

// Build daily message usage for last 30 days
function getDailyMessageUsage(
  logs: Array<{ created_at: string }>
): DailyMessageUsage[] {
  const days = 30;
  const result: DailyMessageUsage[] = [];
  const now = new Date();

  const countMap = new Map<string, number>();
  logs.forEach((log) => {
    const date = new Date(log.created_at).toISOString().split("T")[0];
    countMap.set(date, (countMap.get(date) || 0) + 1);
  });

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    result.push({
      date: d.toLocaleDateString("th-TH", { day: "2-digit", month: "short" }),
      messages: countMap.get(key) || 0,
    });
  }

  return result;
}

export default async function DashboardPage() {
  let stats = {
    totalUsers: 0,
    activeUsersToday: 0,
    totalMessages: 0,
    messagesToday: 0,
    answerSuccessRate: 0,
  };
  let dailyUsage: DailyUsage[] = [];
  let recentLogs: ChatLog[] = [];
  let dailyMessageUsage: DailyMessageUsage[] = [];
  let deptMessageUsage: DeptMessageUsage[] = [];
  let rawLogs: { created_at: string }[] = [];
  let loadError = false;

  try {
    const supabase = await createClient();
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch all data in parallel from employee_test and chat_logs
    // Timed-out requests stay in chat_logs for troubleshooting in Supabase, but
    // the dashboard never shows them — so every query below excludes them.
    // Leaving them in would inflate Total Messages and put a series on the
    // usage chart and rows in Recent Activity that nothing else displays.
    const [
      allLineIdsResult, // for distinct user count
      activeResult,
      messagesResult,
      messagesTodayResult,
      successResult,
      timeoutResult,
      logsResult,
      allLogsResult,
      employeeTestResult,
    ] = await Promise.all([
      // Unique users from chat_logs
      fetchAllRows((from, to) =>
        supabase.from("chat_logs").select("line_user_id").neq("status", "timeout").order("created_at").order("id")
          .range(from, to)
      ),
      // Active today from chat_logs
      fetchAllRows((from, to) =>
        supabase.from("chat_logs").select("line_user_id").gte("created_at", today).neq("status", "timeout").order("created_at").order("id")
          .range(from, to)
      ),
      // Total messages across all time
      supabase
        .from("chat_logs")
        .select("id", { count: "exact", head: true })
        .neq("status", "timeout"),
      // Messages today
      supabase
        .from("chat_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today)
        .neq("status", "timeout"),
      // Answer success rate: success measured against timeout only. not_found
      // (the SOP has nothing on the question) and unauthorized (the asker may
      // not see it) depend on what was asked, so they are left out. timeout is
      // a question that got no answer because the AI (Google Gemini) did not
      // reply in time.
      supabase
        .from("chat_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "success"),
      supabase
        .from("chat_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "timeout"),
      supabase
        .from("chat_logs")
        .select("*")
        .neq("status", "timeout")
        .order("created_at", { ascending: false })
        .limit(10),
      fetchAllRows((from, to) =>
        supabase.from("chat_logs").select("created_at, status, line_user_id, display_name").neq("status", "timeout").order("created_at", { ascending: true }).order("id")
          .range(from, to)
      ),
      // Fetch employee list directly from employee_test
      supabase.from(EMPLOYEE_TABLE).select("*"),
    ]);

    if (messagesResult.error) throw messagesResult.error;
    if (allLogsResult.error) throw allLogsResult.error;

    const allEmployees: Employee[] = (!employeeTestResult.error && employeeTestResult.data)
      ? (employeeTestResult.data as Employee[])
      : [];

    // Build lookup maps for employee matching
    const empLineIdMap = new Map<string, Employee>();
    const empLineNameMap = new Map<string, Employee>();

    allEmployees.forEach((emp) => {
      if (emp.line_user_id) {
        const idKey = cleanId(emp.line_user_id);
        if (idKey) empLineIdMap.set(idKey, emp);
      }
      if (emp.line_name) {
        const nameKey = cleanId(emp.line_name);
        if (nameKey) empLineNameMap.set(nameKey, emp);
      }
    });

    // COUNT(DISTINCT line_user_id) — accurate unique user count
    const totalUsers = new Set(
      (allLineIdsResult.data || [])
        .map((r: { line_user_id: string }) => cleanId(r.line_user_id))
        .filter(Boolean)
    ).size;

    // Active today: distinct users
    const activeUsersToday = new Set(
      (activeResult.data || [])
        .map((r: { line_user_id: string }) => cleanId(r.line_user_id))
        .filter(Boolean)
    ).size;

    const totalMessages = messagesResult.count || 0;
    const messagesToday = messagesTodayResult.count || 0;
    const successCount = successResult.count || 0;
    const timeoutCount = timeoutResult.count || 0;
    const attempted = successCount + timeoutCount;

    stats = {
      totalUsers,
      activeUsersToday,
      totalMessages,
      messagesToday,
      answerSuccessRate:
        attempted > 0 ? Number(((successCount / attempted) * 100).toFixed(1)) : 0,
    };

    // Enrich recent logs with matched employee from employee_test and clean messages
    const rawRecent = (logsResult.data as ChatLog[]) || [];
    recentLogs = rawRecent.map((log) => {
      const cleanLine = cleanId(log.line_user_id);
      // Try match by line_user_id, then by display_name if line_name matches
      let matchedEmp = empLineIdMap.get(cleanLine) || null;
      if (!matchedEmp && log.display_name) {
        matchedEmp = empLineNameMap.get(cleanId(log.display_name)) || null;
      }

      return {
        ...log,
        display_name: log.display_name || null,
        user_message: log.user_message ? String(log.user_message).replace(/^=+/, "").trim() : null,
        ai_response: log.ai_response ? String(log.ai_response).replace(/^=+/, "").trim() : null,
        employee: matchedEmp,
      };
    });

    const allLogs = (allLogsResult.data as ChatLog[]) || [];
    dailyUsage = getDailyUsageFromLogs(allLogs);
    dailyMessageUsage = getDailyMessageUsage(allLogs);

    // Build department message usage by joining employee_test with chat logs
    if (allEmployees.length > 0) {
      const deptMap = new Map<string, number>();
      const lineIdToDept = new Map<string, string>();
      const lineNameToDept = new Map<string, string>();
      allEmployees.forEach((e) => {
        if (e.line_user_id && e.department) {
          const idKey = cleanId(e.line_user_id);
          lineIdToDept.set(idKey, e.department);
        }
        if (e.line_name && e.department) {
          const nameKey = cleanId(e.line_name);
          lineNameToDept.set(nameKey, e.department);
        }
      });

      allLogs.forEach((log) => {
        const idKey = cleanId(log.line_user_id);
        let dept = lineIdToDept.get(idKey);
        if (!dept && log.display_name) {
          dept = lineNameToDept.get(cleanId(log.display_name));
        }
        if (dept) {
          deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
        }
      });

      deptMessageUsage = Array.from(deptMap.entries()).map(([department, messages]) => ({
        department,
        messages,
      }));
    }

    rawLogs = allLogs.map((l) => ({ created_at: l.created_at }));
  } catch (error) {
    console.error("Failed to fetch dashboard data from Supabase:", error);
    loadError = true;
    dailyUsage = getDailyUsageFromLogs([]);
    dailyMessageUsage = getDailyMessageUsage([]);
  }

  // Rendered once, outside the try: the try only guards the data fetch, and a
  // second copy of this element in the catch drifts out of step the first time
  // someone adds a prop to one and not the other.
  return (
    <div className="space-y-6">
      {loadError && (
        <div className="max-w-7xl mx-auto">
          <LoadErrorBanner what="ข้อมูลภาพรวม" />
        </div>
      )}
      <DashboardClient
        data={{
          stats,
          dailyUsage,
          recentLogs,
          dailyMessageUsage,
          deptMessageUsage,
          rawLogs,
        }}
      />
    </div>
  );
}
