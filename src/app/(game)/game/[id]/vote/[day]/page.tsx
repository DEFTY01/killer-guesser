import VotePageClient from "./VotePageClient";

interface VotePageProps {
  params: Promise<{ id: string; day: string }>;
}

export default async function VotePage({ params }: VotePageProps) {
  const { id: gameId, day: dayParam } = await params;
  const day = Number(dayParam);

  return <VotePageClient gameId={gameId} day={isNaN(day) ? 1 : day} />;
}
