import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

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

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex flex-col">
      {/* ── Top header ─────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-40 border-b border-white/20 bg-white/80 backdrop-blur-md shadow-sm">
        <div className="flex h-14 items-center justify-between px-4 max-w-2xl mx-auto w-full">
          <Link
            href="/lobby"
            className="font-bold text-base text-indigo-700 tracking-tight"
          >
            Mountain Killer
          </Link>

          <div className="flex items-center gap-3">
            {user.avatar_url ? (
              <Image
                src={user.avatar_url}
                alt={user.name ?? "Player"}
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
            ) : null}
            <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
              {user.name}
            </span>
            <form action={handleSignOut}>
              <button
                type="submit"
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────── */}
      <main className="flex-1 pt-14">{children}</main>
    </div>
  );
}
