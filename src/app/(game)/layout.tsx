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
    <div className="flex min-h-dvh flex-col">
      {/* ── Top header ─────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line bg-surface/90 pl-[var(--safe-left)] pr-[var(--safe-right)] pt-[var(--safe-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-lg items-center justify-between px-4">
          <Link
            href="/lobby"
            className="inline-flex min-h-11 items-center font-display text-base font-semibold tracking-wide text-fg"
          >
            Summit of Lies
          </Link>

          <div className="flex items-center gap-1">
            {user.avatar_url ? (
              <Image
                src={blobImageSrc(user.avatar_url)}
                alt={user.name ?? "Player"}
                width={32}
                height={32}
                className="mr-1 size-8 rounded-full object-cover"
                unoptimized
              />
            ) : null}
            <span className="mr-1 hidden max-w-[120px] truncate text-sm font-medium text-muted sm:block">
              {user.name}
            </span>
            <ThemeToggle />
            <SignOutButton
              redirectTo="/login"
              className="btn btn-secondary btn-sm"
            />
          </div>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────── */}
      <main className="flex-1 pt-[calc(3.5rem+var(--safe-top))]">
        {children}
      </main>
    </div>
  );
}
