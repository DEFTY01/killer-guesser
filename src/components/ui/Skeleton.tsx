// ── Skeleton ──────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200 ${className}`}
      aria-hidden="true"
    />
  );
}

// ── SkeletonCard — player avatar card ─────────────────────────────

export function SkeletonCard() {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-2xl bg-white border border-gray-100 p-3 animate-pulse"
      aria-hidden="true"
    >
      <div className="w-16 h-16 rounded-full bg-gray-200" />
      <div className="h-3 w-20 rounded-full bg-gray-200" />
      <div className="h-4 w-14 rounded-full bg-gray-200" />
    </div>
  );
}

// ── SkeletonTable — admin data table ──────────────────────────────

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
}

export function SkeletonTable({ rows = 5, cols = 5 }: SkeletonTableProps) {
  return (
    <div
      className="rounded-xl border bg-white overflow-hidden shadow-sm animate-pulse"
      aria-hidden="true"
    >
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <div className="h-4 w-20 rounded-full bg-gray-200" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <tr key={rowIdx} className="border-b last:border-0">
              {Array.from({ length: cols }).map((_, colIdx) => (
                <td key={colIdx} className="px-4 py-3">
                  {/* Vary widths so the skeleton looks natural, not uniform */}
                  <div
                    className="h-4 rounded-full bg-gray-200"
                    style={{ width: `${40 + ((colIdx * 3 + rowIdx * 5) % 5) * 10}%` }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
