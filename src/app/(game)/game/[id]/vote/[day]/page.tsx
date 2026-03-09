import VotePageClient from "./VotePageClient";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

interface VotePageProps {
  params: Promise<{ id: string; day: string }>;
}

export default async function VotePage({ params }: VotePageProps) {
  const { id: gameId, day: dayParam } = await params;
  const day = Number(dayParam);

  return (
    <ErrorBoundary>
      <VotePageClient gameId={gameId} day={isNaN(day) ? 1 : day} />
    </ErrorBoundary>
  );
}
