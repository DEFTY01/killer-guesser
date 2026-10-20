import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold text-fg">Page not found</h1>
      <Link href="/" className="btn btn-primary">
        Back home
      </Link>
    </div>
  );
}
