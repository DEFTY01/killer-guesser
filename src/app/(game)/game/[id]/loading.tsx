import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export default function GameBoardLoading() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-6">
      <Skeleton className="h-8 w-48" />
      <div className="player-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
