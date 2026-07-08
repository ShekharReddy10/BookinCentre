"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, BedDouble, CalendarDays, BookOpenCheck,
  BarChart3, Wallet, Users, LogOut, Menu, X, ShieldCheck, Building2, MoreHorizontal, KeyRound, Zap, UsersRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ClusterProvider, useCluster } from "@/lib/cluster-context";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";

const PRIMARY_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/bookings", label: "Bookings", icon: BookOpenCheck, permission: "bookings.view" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, permission: "calendar.view" },
  { href: "/rooms", label: "Rooms", icon: BedDouble, permission: "rooms.view" },
];

const MORE_NAV = [
  { href: "/reports", label: "Reports", icon: BarChart3, permission: "reports.view" },
  { href: "/expenses", label: "Expenses", icon: Wallet, permission: "expenses.view" },
  { href: "/guests", label: "Guests", icon: Users, permission: "guests.view" },
];

const ADMIN_NAV = [
  { href: "/admin/users", label: "Users", icon: ShieldCheck, permission: "admin.users" },
  { href: "/admin/clusters", label: "Clusters", icon: Building2, permission: "admin.clusters" },
  { href: "/admin/automation", label: "Automation", icon: Zap, permission: "admin.automation" },
  { href: "/admin/teams", label: "Teams", icon: UsersRound, permission: "admin.teams" },
];

function ClusterSwitcher() {
  const { clusters, selectedClusterId, setSelectedClusterId } = useCluster();
  if (clusters.length <= 1) return null;
  return (
    <Select
      value={selectedClusterId}
      onChange={(e) => setSelectedClusterId(e.target.value)}
      className="w-full md:w-56"
    >
      <option value="all">All Clusters</option>
      {clusters.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </Select>
  );
}

function DashShell({ children }: { children: ReactNode }) {
  const { user, logout, hasPermission } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  const primaryNav = PRIMARY_NAV.filter((n) => hasPermission(n.permission));
  const secondaryNav = [...MORE_NAV, ...ADMIN_NAV].filter((n) => hasPermission(n.permission));

  return (
    <div className="flex flex-1 min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 transform border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-transform md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-4 flex items-center justify-between px-2">
          <div>
            <h1 className="text-lg font-semibold">Booking Control</h1>
            <p className="text-xs text-slate-400">{user.name} · {user.role}</p>
          </div>
          <button className="md:hidden" onClick={() => setMobileOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-4 px-2">
          <ClusterSwitcher />
        </div>
        <nav className="space-y-1">
          {[...primaryNav, ...secondaryNav].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                pathname.startsWith(href)
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 space-y-1 border-t border-slate-100 dark:border-slate-800 pt-4">
          <Link
            href="/change-password"
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <KeyRound className="h-4 w-4" /> Change Password
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex min-w-0 flex-1 flex-col md:ml-60">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-3 md:hidden">
          <button onClick={() => setMobileOpen(true)} className="p-1 -ml-1">
            <Menu className="h-6 w-6" />
          </button>
          <span className="flex-1 font-semibold">Booking Control</span>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 pb-24 md:p-6 md:pb-6">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:hidden [padding-bottom:env(safe-area-inset-bottom)]">
          {primaryNav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                pathname.startsWith(href) ? "text-slate-900 dark:text-white" : "text-slate-400"
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
              secondaryNav.some((n) => pathname.startsWith(n.href)) ? "text-slate-900 dark:text-white" : "text-slate-400"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </nav>

        {/* Mobile "More" sheet */}
        {moreOpen && (
          <div className="fixed inset-0 z-40 flex items-end md:hidden" onClick={() => setMoreOpen(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="relative z-10 w-full rounded-t-2xl bg-white dark:bg-slate-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
              <div className="mb-3">
                <ClusterSwitcher />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {secondaryNav.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                ))}
                <Link
                  href="/change-password"
                  onClick={() => setMoreOpen(false)}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  <KeyRound className="h-5 w-5" />
                  Password
                </Link>
                <button
                  onClick={logout}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-900 p-3 text-xs font-medium text-red-600"
                >
                  <LogOut className="h-5 w-5" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.must_change_password) {
      router.replace("/change-password");
    }
  }, [loading, user, router]);

  if (loading || !user || user.must_change_password) {
    return <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <ClusterProvider>
      <DashShell>{children}</DashShell>
    </ClusterProvider>
  );
}
