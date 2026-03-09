import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { games, game_players } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { activateGameIfReady } from "@/lib/activateGame";

export const metadata: Metadata = { title: "Game Lobby" };

export default async function GameLobbyStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session || session.user?.role !== "player") {
    redirect("/login");
  }

  const userId = Number(session.user.id);
  if (!userId || Number.isNaN(userId)) {
    return (
      <StatusCard
        title="Sikertelen azonositas"
        message="A munkamenet ervenytelen. Lepj be ujra."
      />
    );
  }

  const [joinedGame] = await db
    .select({
      id: games.id,
      name: games.name,
      status: games.status,
      startTime: games.start_time,
    })
    .from(games)
    .innerJoin(game_players, eq(games.id, game_players.game_id))
    .where(and(eq(games.id, id), eq(game_players.user_id, userId)))
    .limit(1);

  if (!joinedGame) {
    return (
      <StatusCard
        title="A jatek nem erheto el"
        message="Ez a jatek nem letezik, vagy nem vagy a resztvevoje."
      />
    );
  }

  // Auto-activate if start_time has passed
  await activateGameIfReady(joinedGame.id);

  if (joinedGame.status === "scheduled") {
    // Re-read status after potential activation
    const [fresh] = await db
      .select({ status: games.status })
      .from(games)
      .where(eq(games.id, joinedGame.id))
      .limit(1);
    if (fresh?.status === "active") {
      redirect(`/game/${joinedGame.id}`);
    }
  }

  if (joinedGame.status === "active") {
    redirect(`/game/${joinedGame.id}`);
  }

  if (joinedGame.status === "scheduled") {
    return (
      <StatusCard
        title={joinedGame.name}
        message="Nem indult még el a játék, kérlek várj"
        hint={`Tervezett kezdes: ${new Date(joinedGame.startTime * 1000).toLocaleString()}`}
      />
    );
  }

  if (joinedGame.status === "closed") {
    return (
      <StatusCard
        title={joinedGame.name}
        message="A jatek mar veget ert."
      />
    );
  }

  return (
    <StatusCard
      title={joinedGame.name}
      message="A jatek jelenleg nem erheto el."
    />
  );
}

function StatusCard({
  title,
  message,
  hint,
}: {
  title: string;
  message: string;
  hint?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h1 className="text-xl font-bold text-amber-900">{title}</h1>
        <p className="mt-2 text-base text-amber-800">{message}</p>
        {hint ? <p className="mt-2 text-sm text-amber-700">{hint}</p> : null}
        <Link
          href="/lobby"
          className="mt-5 inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Vissza a lobbyba
        </Link>
      </div>
    </div>
  );
}
