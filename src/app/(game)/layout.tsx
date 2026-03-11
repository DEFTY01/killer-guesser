import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import { blobImageSrc } from "@/lib/blob-image";
import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session || session.user?.role !== "player") {
    redirect("/login");
  }

  const user = session.user;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col">
      {/* ── Top header ─────────────────────────────────────────── */}
      <header
        className="fixed top-0 inset-x-0 z-40 border-b border-white/20 dark:border-white/10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm"
        style={{
          paddingTop: "var(--safe-top)",
          paddingLeft: "var(--safe-left)",
          paddingRight: "var(--safe-right)",
        }}
      >
        <div className="flex h-14 items-center justify-between px-4 max-w-2xl mx-auto w-full">
          <Link
            href="/lobby"
            className="font-bold text-base text-indigo-700 dark:text-indigo-400 tracking-tight"
          >
            Summit of Lies
          </Link>

          <div className="flex items-center gap-3">
            {user.avatar_url ? (
              <Image
                src={blobImageSrc(user.avatar_url)}
                alt={user.name ?? "Player"}
                width={32}
                height={32}
                className="rounded-full object-cover"
                unoptimized
              />
            ) : null}
            <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
              {user.name}
            </span>
            <ThemeToggle />
            <SignOutButton
              redirectTo="/login"
              className="min-h-[44px] rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            />
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────── */}
      <main
        className="flex-1 pt-14"
        style={{ paddingTop: "calc(3.5rem + var(--safe-top))" }}
      >
        {children}
      </main>
    </div>
  );
}
