import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { UserRole } from "@/types";
import SignOutButton from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Players", href: "/admin/players" },
  { label: "Games", href: "/admin/games" },
  { label: "Roles", href: "/admin/roles" },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const role = (session?.user as { role?: UserRole } | undefined)?.role;

  if (!session || !role || !["admin", "moderator"].includes(role)) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* ── Top header ─────────────────────────────────────────────── */}
      <header
        className="fixed top-0 inset-x-0 z-40 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm"
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <span className="font-bold text-lg text-gray-900 dark:text-gray-100 tracking-tight">
            Summit of Lies — Admin
          </span>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-gray-500 dark:text-gray-400">
              {session.user?.email}
            </span>
            <ThemeToggle />
            <SignOutButton
              redirectTo="/admin/login"
              className="min-h-[44px] rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            />
          </div>
        </div>
      </header>

      <div
        className="flex flex-1 pt-16"
        style={{ paddingTop: "calc(4rem + var(--safe-top))" }}
      >
        {/* ── Sidebar — desktop only ──────────────────────────────── */}
        <aside
          className="hidden md:flex w-56 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 fixed top-16 bottom-0 left-0 overflow-y-auto"
          aria-label="Admin sidebar"
        >
          <nav className="flex flex-col gap-1 p-3">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* ── Main content ────────────────────────────────────────── */}
        <main className="flex-1 md:ml-56 p-4 md:p-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* ── Bottom tab bar — mobile only ───────────────────────────── */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 md:hidden"
        style={{ paddingBottom: "var(--safe-bottom)" }}
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center min-h-[44px] py-3 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
