import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">Killer Guesser</h1>
        <p className="mt-4 text-xl text-gray-500">
          A real-time social deduction guessing game
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/game"
          className="rounded-xl bg-indigo-600 px-8 py-3 text-center text-lg font-semibold text-white shadow hover:bg-indigo-700 transition-colors"
        >
          Play Now
        </Link>
        <Link
          href="/admin"
          className="rounded-xl border border-gray-300 px-8 py-3 text-center text-lg font-semibold hover:bg-gray-50 transition-colors"
        >
          Admin Panel
        </Link>
      </div>
    </main>
  );
}
