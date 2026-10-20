// ── Skeleton ──────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`skeleton rounded-full ${className}`}
      aria-hidden="true"
    />
  );
}

// ── SkeletonCard: player avatar card (matches PlayerCard) ─────────

export function SkeletonCard() {
  return (
    <div
      className="card flex flex-col items-center gap-2 p-3"
      aria-hidden="true"
    >
      <div className="skeleton size-16 rounded-full" />
      <div className="skeleton h-3.5 w-20 rounded-full" />
      <div className="skeleton h-5 w-14 rounded-full" />
    </div>
  );
}

// ── SkeletonRow: list row / game card (matches lobby + summary rows) ──

export function SkeletonRow({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`card flex items-center gap-3 p-4 ${tall ? "min-h-28" : "min-h-20"}`}
      aria-hidden="true"
    >
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-2/5 rounded-full" />
        <div className="skeleton h-3 w-1/4 rounded-full" />
      </div>
      <div className="skeleton h-9 w-16 rounded-full" />
    </div>
  );
}

// ── SkeletonTable: admin data table (unchanged, admin styling) ────

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
