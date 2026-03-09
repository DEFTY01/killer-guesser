import type { Metadata } from "next";
import GameBoardClient from "./GameBoardClient";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export const metadata: Metadata = { title: "Game Board" };

export default async function GameBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <ErrorBoundary>
      <GameBoardClient gameId={id} />
    </ErrorBoundary>
  );
}
