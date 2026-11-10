// ==========================================
// Database Types for Admin Dashboard
// ==========================================

export interface AdminUser {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: "active" | "blocked";
  total_tokens_used: number;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  emp_id: string;
  name: string;
  department: string;
  position: string;
  line_user_id: string | null;
  status: string;
  access_level: "staff" | "manager" | "admin";
  line_name: string | null;
  name_th?: string | null;
  nickname_th?: string | null;
}

export interface ChatLog {
  id: string;
  line_user_id: string;
  message_type: string;
  user_message: string | null;
  ai_response: string | null;
  tokens_used: number;
  status: "success" | "not_found" | "unauthorized" | "timeout";
  created_at: string;
  display_name?: string | null;
  employee?: Employee | null;
  response_time?: number | null;
  response_time_seconds?: number | null;
  response_time_ms?: number | null;
  /** timeout rows: why the user got no reply (the n8n step and its error). */
  error_detail?: string | null;
  /** The n8n execution, to look the run up under Executions in n8n. */
  n8n_execution_id?: string | null;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string | boolean | number;
  updated_at: string;
  updated_by: string | null;
}

// ==========================================
// Dashboard Stats Types
// ==========================================

export interface DashboardStats {
  totalUsers: number;
  activeUsersToday: number;
  totalMessages: number;
  messagesToday: number;
  /** success / (success + timeout), as a percentage — how often a question
   *  got an answer instead of timing out. not_found and unauthorized are left
   *  out: they depend on what was asked, not on the system. */
  answerSuccessRate: number;
  totalTokensUsed?: number;
}

/** Per-day counts for the usage chart. "timeout" is deliberately absent: those
 *  requests stay in chat_logs but are filtered out before reaching the UI. */
export interface DailyUsage {
  date: string;
  success: number;
  not_found: number;
  unauthorized: number;
}

export interface DailyMessageUsage {
  date: string;
  messages: number;
}

export interface DeptMessageUsage {
  department: string;
  messages: number;
}

export interface DailyTokenUsage {
  date: string;
  tokens: number;
}

export interface DeptTokenUsage {
  department: string;
  tokens: number;
}

// ==========================================
// Analytics & Insights Types
// ==========================================

export interface AnalyticsSummary {
  totalInquiries?: number;
  avgInquiriesPerWeek: number | string;
  avgResponseTime?: string;
  estimatedTimeSaved: string;
  avgTokensPerQuery?: number;
  peakTrafficTime: string;
  mostActiveDept: string;
}

export interface HourlyUsage {
  hour: string;
  count: number;
  tier: "peak" | "high" | "regular";
}

export interface DeptUserActivity {
  lineUserId: string;
  name: string;
  count: number;
}

export interface DeptActivity {
  department: string;
  count: number;
  /** Per-person breakdown behind `count`, busiest first. */
  users: DeptUserActivity[];
}

// ==========================================
// เพิ่มเข้าไปใน src/lib/types.ts (ต่อท้ายไฟล์เดิม)
// ==========================================

export interface EmployeeRegistry {
  emp_id: number;
  name: string;
  name_th: string | null;
  nickname: string | null;
  nickname_th: string | null;
  department: string | null;
  position: string | null;
  line_user_id: string | null;
  line_name: string | null;
  /** LINE profile picture saved at LIFF registration (migration 08); absent before that. */
  line_picture_url?: string | null;
  email: string | null;
  phone_number: string | null;
  status: "unlinked" | "linked" | "disabled" | null;
  access_level: "staff" | "manager";
}

/** An employee's "ask an admin to verify me" request from the LIFF page (migration 19). */
export interface LinkRequest {
  id: number;
  ref_code: string;
  employee_table: string;
  emp_id: number;
  line_user_id: string;
  line_name: string | null;
  line_picture_url: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  decided_at: string | null;
  /** Admin email. */
  decided_by: string | null;
  /** Admin name at decision time (migration 20). */
  decided_by_name: string | null;
  note: string | null;
}

export const DEPARTMENTS: Record<string, string[]> = {
  "Executive Office": [
    "General Manager",
    "IT Manager",
    "Asst. E-Distribution Manager",
    "Cluster Marcom. Manager",
    "Health and Safety Officer",
    "Sales Manager",
    "Sales Coordinator",
  ],
  Accounting: [
    "Financial Controller",
    "Assistant Chief Accountant",
    "General Cashier",
    "Paymaster Income Auditor",
    "Account Payable Supervisor",
    "Account Receivable Supervisor",
    "F&B Cost Controller",
    "Store & Receiving Officer",
    "Cluster Purchasing Mgr.",
    "Purchasing Officer",
  ],
  "Front Office": [
    "Front Office Manager",
    "Asst. Front Office Manger",
    "Duty Manager",
    "Night Manager",
    "Night Guest Service Agent Sup.",
    "Guest Relations Officer",
    "Bell Captain",
    "Guest Service Agent",
    "Bell Boy",
  ],
  "Front Office (Reservation)": [
    "Revenue & Reservation Mgr.",
    "Reservation Agent",
  ],
  "Housekeeping (Service)": [
    "Housekeeping Manager",
    "Floor Supervisor",
    "Public Area Attendant",
    "Room Attendant",
  ],
  "Housekeeping (Regular)": [
    "Assistant Housekeeping Mgr.",
    "Housekeeping Supervisor",
    "Linen Attendant",
    "Seamstress",
    "Gardener",
    "Linen Attendant - Houseman",
  ],
  "Food & Beverage": [
    "F&B Operations Manager",
    "Asst. Restaurant Manager",
    "Sr. Supervisor",
    "Captain Bar",
    "Supervisor - Coffee Shop",
    "Bartender",
    "Captain - Coffee Shop",
    "Waitress",
    "Waiter",
    "Sr. Artist Supervisor",
    "Sr. Supervisor - Pool",
    "Waiter - Pool",
    "Bartendy",
  ],
  "Main Kitchen": [
    "Cluster Executive Chef",
    "Sous Chef",
    "Executive Chef Consultant",
    "Chef De Partie",
    "Chef De Partie - Bakery",
    "Demi Chef De Partie",
    "Commis I - Pantry",
    "Commis I",
    "Commis II",
    "Cook Helper",
    "Cook Helper Bakery",
  ],
  "Main Kitchen (Staff Canteen)": [
    "Cluster Executive Chef",
    "Sous Chef",
    "Cook Staff Canteen",
    "Steward Canteen",
  ],
  "Main Kitchen (Steward)": [
    "Cluster Executive Chef",
    "Sous Chef",
    "Steward Supervisor",
    "Steward",
    "Steward (Disable)",
  ],
  Engineering: [
    "Chief Engineer",
    "Asst. Chief Engineer",
    "Engineering Secretary",
    "Air Mechanic Supervisor",
    "Sr. Plumber Supervisor",
    "Preventive & Maintenance Sup.",
    "Duty Engineer",
    "Sr. Chief Carpenter",
    "Carpenter",
    "Painter Supervisor",
    "Air Mechanic",
    "Plumber",
    "Electrician",
    "Painter",
  ],
  "Human Resources": [
    "Regional Human Resources Manager",
    "Human Resources Manager",
    "HR Supervisor & Training Support",
    "Hotel Driver",
  ],
};

export const ACCESS_LEVELS: { value: EmployeeRegistry["access_level"]; label: string }[] = [
  { value: "staff", label: "พนักงานทั่วไป" },
  { value: "manager", label: "ระดับ Manager" },
];
