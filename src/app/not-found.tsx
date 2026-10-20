import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link
        href="/"
        className="min-h-11 inline-flex items-center rounded-lg bg-blue-600 px-5 text-white font-medium"
      >
        Back home
      </Link>
    </div>
  );
}
