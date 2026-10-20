"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold text-fg">Something went wrong</h1>
      <p className="text-sm text-muted">Check your connection and try again.</p>
      <button type="button" onClick={reset} className="btn btn-primary">
        Retry
      </button>
    </div>
  );
}
