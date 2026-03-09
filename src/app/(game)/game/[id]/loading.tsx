import { SkeletonCard } from "@/components/ui/Skeleton";

export default function GameBoardLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="h-7 w-48 rounded-full bg-gray-200 animate-pulse" />
      <div className="player-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
