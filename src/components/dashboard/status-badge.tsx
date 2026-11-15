import { CheckCircle2, AlertCircle, ShieldAlert, TimerOff } from "lucide-react";

// Single source of truth for chat_logs.status -> color/label, shared by
// Recent Activity (Overview) and the Users & Chat Logs table so a given
// status always reads the same everywhere instead of drifting per-widget.
export const STATUS_META = {
  success: {
    label: "Success",
    Icon: CheckCircle2,
    hex: "#10b981", // emerald-500 — keep in sync with dotClass/badgeClass below
    dotClass: "bg-emerald-500 shadow-emerald-500/50",
    badgeClass:
      "text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60",
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  not_found: {
    label: "Not Found",
    Icon: AlertCircle,
    hex: "#f59e0b", // amber-500
    dotClass: "bg-amber-500 shadow-amber-500/50",
    badgeClass:
      "text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/60",
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  unauthorized: {
    label: "Unauthorized",
    Icon: ShieldAlert,
    hex: "#a855f7", // purple-500
    dotClass: "bg-purple-500 shadow-purple-500/50",
    badgeClass:
      "text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 border-purple-200 dark:border-purple-800/60",
    iconClass: "text-purple-600 dark:text-purple-400",
  },
  // The AI (Google Gemini) did not answer in time, so the user got no reply.
  timeout: {
    label: "Time Out",
    Icon: TimerOff,
    hex: "#f43f5e", // rose-500
    dotClass: "bg-rose-500 shadow-rose-500/50",
    badgeClass:
      "text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800/60",
    iconClass: "text-rose-600 dark:text-rose-400",
  },
} as const;

export type StatusKey = keyof typeof STATUS_META;

// Fixed display order shared by every status list/legend/chart in the app.
// "timeout" is intentionally missing: those rows are still written to
// chat_logs and can be inspected in Supabase, but they are filtered out of
// every dashboard query, so nothing should draw a legend chip or series for
// them. STATUS_META still carries the timeout entry because normalizeStatusKey
// falls back to it for any status string the app does not recognise.
export const STATUS_ORDER: StatusKey[] = ["success", "not_found", "unauthorized"];

export function getStatusMeta(status: string) {
  return STATUS_META[status.toLowerCase() as StatusKey] ?? STATUS_META.timeout;
}

/** Maps any chat_logs.status string to one of the 4 known keys, defaulting unrecognized values to "timeout". */
export function normalizeStatusKey(status: string): StatusKey {
  const key = status.toLowerCase();
  return (Object.prototype.hasOwnProperty.call(STATUS_META, key) ? key : "timeout") as StatusKey;
}

/** Full pill badge with icon + label, e.g. for table rows and detail dialogs. */
export function StatusBadge({ status }: { status: string }) {
  const { label, Icon, badgeClass, iconClass } = getStatusMeta(status);
  return (
    <span
      className={`inline-flex items-center justify-center gap-1 text-[0.6875rem] font-bold border px-2 py-0.5 rounded-full whitespace-nowrap ${badgeClass}`}
    >
      <Icon className={`w-3 h-3 shrink-0 ${iconClass}`} />
      {label}
    </span>
  );
}

/** Small colored dot only, e.g. for compact list rows. */
export function StatusDot({ status }: { status: string }) {
  const { dotClass } = getStatusMeta(status);
  return <span className={`inline-block w-2 h-2 rounded-full shadow-sm ${dotClass}`} />;
}
