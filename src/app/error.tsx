"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm opacity-70">
        Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="min-h-11 rounded-lg bg-blue-600 px-5 text-white font-medium"
      >
        Retry
      </button>
    </div>
  );
}
