import { SkeletonTable } from "@/components/ui/Skeleton";

export default function GamesLoading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-24 rounded-full bg-gray-200 animate-pulse" />
        <div className="h-9 w-28 rounded-lg bg-gray-200 animate-pulse" />
      </div>
      <div className="flex gap-1 mb-6 border-b border-gray-200 pb-px">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded bg-gray-200 animate-pulse mx-1" />
        ))}
      </div>
      <SkeletonTable />
    </div>
  );
}
