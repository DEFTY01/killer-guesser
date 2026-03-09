import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { games, game_players, users } from "@/db/schema";
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
        title="Session error"
        message="Your session is invalid. Please sign in again."
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
        title="Game not found"
        message="This game does not exist or you are not a participant."
      />
    );
  }

  // Auto-activate if start_time has passed
  await activateGameIfReady(joinedGame.id);

  if (joinedGame.status === "scheduled") {
    const nowUnix = Math.floor(Date.now() / 1000);
    if (joinedGame.startTime <= nowUnix) {
      // Game was just activated by activateGameIfReady
      redirect(`/game/${joinedGame.id}`);
    }
  }

  if (joinedGame.status === "active") {
    redirect(`/game/${joinedGame.id}`);
  }

  if (joinedGame.status === "scheduled") {
    // Fetch participants to display in the waiting room
    const participants = await db
      .select({
        id: users.id,
        name: users.name,
        avatar_url: users.avatar_url,
      })
      .from(game_players)
      .innerJoin(users, eq(game_players.user_id, users.id))
      .where(eq(game_players.game_id, joinedGame.id))
      .orderBy(users.name);

    return (
      <ScheduledLobby
        gameName={joinedGame.name}
        startTime={joinedGame.startTime}
        participants={participants}
      />
    );
  }

  if (joinedGame.status === "closed") {
    return (
      <StatusCard
        title={joinedGame.name}
        message="This game has ended."
      />
    );
  }

  return (
    <StatusCard
      title={joinedGame.name}
      message="This game is currently unavailable."
    />
  );
}

// ── ScheduledLobby ────────────────────────────────────────────────

interface Participant {
  id: number;
  name: string;
  avatar_url: string | null;
}

function ScheduledLobby({
  gameName,
  startTime,
  participants,
}: {
  gameName: string;
  startTime: number;
  participants: Participant[];
}) {
  const startDate = new Date(startTime * 1000);
  const formattedDate = startDate.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      {/* Status card */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
        <h1 className="text-xl font-bold text-amber-900">{gameName}</h1>
        <p className="mt-2 text-base text-amber-800">
          The game has not started yet — please wait.
        </p>
        <p className="mt-1 text-sm text-amber-700">
          Scheduled start: {formattedDate}
        </p>
        <Link
          href="/lobby"
          className="mt-5 inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Back to lobby
        </Link>
      </div>

      {/* Participants */}
      {participants.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-gray-400 mb-3 px-1">
            Participants ({participants.length})
          </h2>
          <div className="player-grid">
            {participants.map((player) => (
              <div
                key={player.id}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white border border-gray-100 shadow-sm p-3 text-center"
              >
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-indigo-100 shrink-0">
                  {player.avatar_url ? (
                    <Image
                      src={player.avatar_url}
                      alt={player.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-indigo-400 select-none">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="text-sm font-semibold text-gray-800 leading-tight truncate w-full px-1">
                  {player.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── StatusCard ────────────────────────────────────────────────────

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
          Back to lobby
        </Link>
      </div>
    </div>
  );
}
