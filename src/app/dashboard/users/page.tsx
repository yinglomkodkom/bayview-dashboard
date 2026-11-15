import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYEE_TABLE } from "@/lib/config";
import { ChatLogsTable } from "@/components/users/chat-logs-table";
import type { ChatLog, Employee } from "@/lib/types";
import { correctStatus } from "@/lib/answer-status";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { LoadErrorBanner } from "@/components/dashboard/load-error-banner";

export const metadata: Metadata = { title: "ประวัติการสนทนา" };

export const dynamic = "force-dynamic";

// "timeout" is absent on purpose — timed-out requests stay in chat_logs for
// troubleshooting in Supabase but are never shown in the dashboard, so
// ?status=timeout falls back to "all" rather than rendering an empty table.
const STATUS_VALUES = ["all", "success", "not_found", "unauthorized"] as const;
type StatusFilterType = (typeof STATUS_VALUES)[number];

/** Today in Bangkok as YYYY-MM-DD — the format the log table compares against. */
function bangkokToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface UsersPageProps {
  // Stat cards on other pages deep-link here with the view already narrowed,
  // e.g. Active Today -> ?range=today.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const params = await searchParams;
  const one = (k: string) => (Array.isArray(params[k]) ? params[k][0] : params[k]) || "";

  const rawStatus = one("status");
  const initialStatus: StatusFilterType = (STATUS_VALUES as readonly string[]).includes(rawStatus)
    ? (rawStatus as StatusFilterType)
    : "all";

  const today = one("range") === "today" ? bangkokToday() : "";
  const initialStartDate = today || (ISO_DATE.test(one("from")) ? one("from") : "");
  const initialEndDate = today || (ISO_DATE.test(one("to")) ? one("to") : "");

  let chatLogs: ChatLog[] = [];
  let employees: Employee[] = [];
  let totalLogsInDb = 0;
  let totalUsersInDb = 0;
  let loadError = false;

  try {
    const supabase = await createClient();

    const [logsResult, allIdsResult, employeeTestResult] = await Promise.all([
      // Fetch all chat logs without limit, failed requests excluded
      fetchAllRows((from, to) =>
        supabase.from("chat_logs").select("*").neq("status", "timeout").order("created_at", { ascending: false }).order("id", { ascending: false })
          .range(from, to)
      ),
      // Ids only, no cap — just enough to state the true totals honestly
      fetchAllRows((from, to) =>
        supabase.from("chat_logs").select("line_user_id").neq("status", "timeout").order("created_at").order("id")
          .range(from, to)
      ),
      // Employee list directly from employee_test
      supabase
        .from(EMPLOYEE_TABLE)
        .select("emp_id, name, name_th, nickname_th, department, position, line_user_id, access_level, line_name, status"),
    ]);

    if (logsResult.error) throw logsResult.error;
    if (logsResult.data) {
      chatLogs = (logsResult.data as ChatLog[]).map(correctStatus);
      totalLogsInDb = chatLogs.length;
    }

    // True totals
    if (!allIdsResult.error && allIdsResult.data) {
      const ids = allIdsResult.data as { line_user_id: string | null }[];
      totalLogsInDb = Math.max(totalLogsInDb, ids.length);
      totalUsersInDb = new Set(
        ids.map((r) => String(r.line_user_id || "").replace(/["'=]/g, "").trim().toLowerCase()).filter(Boolean)
      ).size;
    }

    if (!employeeTestResult.error && employeeTestResult.data) {
      employees = employeeTestResult.data as Employee[];
    }
  } catch (error) {
    console.error("Failed to fetch chat logs and employees from employee_test:", error);
    loadError = true;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-1 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Users &amp; Chat Logs
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
            ประวัติการสนทนาทั้งหมดพร้อมระบบค้นหาและตัวกรองข้อมูลขั้นสูงแบบเรียลไทม์
          </p>
        </div>
      </div>

      {loadError && <LoadErrorBanner what="ประวัติการสนทนา" />}
      <ChatLogsTable
        loadFailed={loadError}
        chatLogs={chatLogs}
        employees={employees}
        initialStatus={initialStatus}
        initialStartDate={initialStartDate}
        initialEndDate={initialEndDate}
        totalLogsInDb={totalLogsInDb}
        totalUsersInDb={totalUsersInDb}
      />
    </div>
  );
}
