import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4 flex items-center justify-between shadow-sm">
        <span className="font-bold text-lg">Killer Guesser — Admin</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{session.user?.email}</span>
          <form action="/api/auth/signout" method="POST">
            <button
              type="submit"
              className="rounded-lg border px-3 py-1 text-sm hover:bg-gray-100 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl p-8">{children}</main>
    </div>
  );
}
