"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CurrentAdmin } from "@/components/dashboard/current-admin";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { DASHBOARD_DATA_REFRESH } from "@/lib/system-health-events";
import { createClient } from "@/lib/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Users,
  Settings,
  Activity,
  LogOut,
  Menu,
  ChevronLeft,
  ChevronRight,
  IdCard,
  UploadCloud,
  BarChart3,
  MessageSquareReply,
  UserCog,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "ภาพรวม",
    items: [
      {
        label: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        label: "Analytics & Insights",
        href: "/dashboard/analytics",
        icon: BarChart3,
      },
    ],
  },
  {
    title: "การจัดการผู้ใช้",
    items: [
      {
        label: "Employees Management",
        href: "/dashboard/employees",
        icon: IdCard,
      },
      {
        label: "Admin Manage",
        href: "/dashboard/admins",
        icon: UserCog,
      },
    ],
  },
  {
    title: "ข้อมูลบอทและการสนทนา",
    items: [
      {
        label: "SOP Documents",
        href: "/dashboard/sop",
        icon: UploadCloud,
      },
      {
        label: "Pending Replies",
        href: "/dashboard/replies",
        icon: MessageSquareReply,
      },
      {
        label: "Users & Logs",
        href: "/dashboard/users",
        icon: Users,
      },
    ],
  },
  {
    title: "ระบบ",
    items: [
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
      },
      {
        label: "System Status",
        href: "/dashboard/status",
        icon: Activity,
      },
    ],
  },
];

function SidebarContent({
  collapsed = false,
  onNavigate,
  pendingCount = 0,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  pendingCount?: number;
}) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 ${collapsed ? "justify-center" : ""}`}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bayview-mark.png" alt="" className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-100">Bayview Dashboard</h1>
            <p className="text-[0.6875rem] text-zinc-500 dark:text-zinc-400">Admin Panel</p>
          </div>
        )}
      </div>

      <Separator className="bg-zinc-100 dark:bg-zinc-800/50" />

      {/* Navigation Groups */}
      <nav className="flex-1 py-3 px-3 overflow-y-auto space-y-4">
        {navSections.map((section, sectionIdx) => (
          <div key={section.title} className="space-y-1">
            {!collapsed ? (
              <div className="px-3 pt-1 pb-0.5">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {section.title}
                </p>
              </div>
            ) : (
              sectionIdx > 0 && <Separator className="my-2 bg-zinc-100 dark:bg-zinc-800/50" />
            )}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);

                const isReplies = item.href === "/dashboard/replies";
                const hasBadge = isReplies && pendingCount > 0;

                const linkContent = (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center ${
                      collapsed
                        ? "justify-center"
                        : isReplies
                        ? "justify-between"
                        : "gap-3"
                    } px-3 py-2.5 lg:py-2 rounded-lg text-sm font-medium transition-all duration-200 group ${
                      collapsed ? "justify-center" : ""
                    } ${
                      isActive
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold shadow-sm shadow-blue-500/5"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    {isReplies && !collapsed ? (
                      <>
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={`w-4 h-4 flex-shrink-0 transition-colors ${
                              isActive
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {hasBadge && (
                          <span
                            className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-medium shrink-0 leading-none border transition-colors tabular-nums ${
                              isActive
                                ? "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-500/40"
                                : "bg-zinc-200 text-zinc-700 border-zinc-300/60 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700"
                            }`}
                          >
                            {pendingCount}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="relative flex items-center justify-center">
                          <Icon
                            className={`w-4 h-4 flex-shrink-0 transition-colors ${
                              isActive
                                ? "text-blue-600 dark:text-blue-400"
                                : "text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-300"
                            }`}
                          />
                          {collapsed && hasBadge && (
                            <span
                              className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                                isActive ? "bg-emerald-500" : "bg-zinc-400 dark:bg-zinc-500"
                              }`}
                            />
                          )}
                        </div>
                        {!collapsed && <span>{item.label}</span>}
                      </>
                    )}
                  </Link>
                );

                if (collapsed) {
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger render={linkContent} />
                      <TooltipContent
                        side="right"
                        className="bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border-zinc-300 dark:border-zinc-700 flex items-center gap-1.5"
                      >
                        <span>{item.label}</span>
                        {hasBadge && (
                          <span
                            className={`inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-medium leading-none border tabular-nums ${
                              isActive
                                ? "bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-900/80 dark:text-emerald-300 dark:border-emerald-500/40"
                                : "bg-zinc-300 text-zinc-800 border-zinc-400/50 dark:bg-zinc-700 dark:text-zinc-200 dark:border-zinc-600"
                            }`}
                          >
                            {pendingCount}
                          </span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  );
                }

                return linkContent;
              })}
            </div>
          </div>
        ))}
      </nav>

      <Separator className="bg-zinc-100 dark:bg-zinc-800/50" />

      {/* Logout */}
      <div className={`p-3 ${collapsed ? "flex justify-center" : ""}`}>
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="ghost"
            className={`text-zinc-500 dark:text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors ${
              collapsed ? "w-10 h-10 p-0" : "w-full justify-start gap-3"
            }`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>ออกจากระบบ</span>}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const pathname = usePathname();

  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch("/api/pending-replies/count", { cache: "no-store" });
      const data = await res.json();
      if (data.success && typeof data.count === "number") {
        setPendingCount(data.count);
      }
    } catch (err) {
      console.error("Failed to fetch pending replies count:", err);
    }
  }, []);

  useEffect(() => {
    fetchPendingCount();

    const handleRefresh = () => {
      fetchPendingCount();
    };
    window.addEventListener(DASHBOARD_DATA_REFRESH, handleRefresh);

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchPendingCount();
      }
    }, 30_000);

    return () => {
      window.removeEventListener(DASHBOARD_DATA_REFRESH, handleRefresh);
      clearInterval(interval);
    };
  }, [fetchPendingCount]);

  useEffect(() => {
    fetchPendingCount();
  }, [pathname, fetchPendingCount]);

  useEffect(() => {
    // A bulk change (e.g. deleting 200 rows) arrives as one event per row.
    // Counting once per event fired hundreds of full-table reads per open tab
    // and stalled Supabase, so events are collapsed into one count after the
    // burst settles.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const supabase = createClient();
    const channel = supabase
      .channel("sidebar_pending_replies_count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_logs" },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            fetchPendingCount();
          }, 2000);
        }
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchPendingCount]);

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-zinc-50 dark:bg-zinc-950">
        {/* Desktop Sidebar */}
        <aside
          className={`hidden lg:flex flex-col border-r border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/50 backdrop-blur-sm transition-all duration-300 ${
            collapsed ? "w-[68px]" : "w-64"
          }`}
        >
          <SidebarContent collapsed={collapsed} pendingCount={pendingCount} />
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Header */}
          <header className="h-14 border-b border-zinc-200 dark:border-zinc-800/50 bg-zinc-50/70 dark:bg-zinc-900/30 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mobile menu */}
              {/* Controlled so choosing a page closes it; the layout stays
                  mounted between pages, so it would otherwise stay open. */}
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="เปิดเมนู"
                      className="lg:hidden size-10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                    >
                      <Menu className="w-5 h-5" />
                    </Button>
                  }
                />
                <SheetContent side="left" className="w-64 p-0 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
                  <SheetTitle className="sr-only">เมนูหลัก</SheetTitle>
                  <SidebarContent onNavigate={() => setMenuOpen(false)} pendingCount={pendingCount} />
                </SheetContent>
              </Sheet>

              {/* Collapse toggle - desktop */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"}
                className="hidden lg:flex text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              >
                {collapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </Button>

              {/* Refresh Button */}
              <RefreshButton />
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 shrink-0">
              <CurrentAdmin />
              <ThemeToggle />
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
