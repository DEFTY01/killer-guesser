import { SkeletonTable } from "@/components/ui/Skeleton";

export default function GameEditorLoading() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="h-4 w-16 rounded-full bg-gray-200 animate-pulse" />
        <div className="h-4 w-3 rounded-full bg-gray-200 animate-pulse" />
        <div className="h-4 w-24 rounded-full bg-gray-200 animate-pulse" />
      </div>
      <SkeletonTable rows={6} cols={5} />
    </div>
  );
}
