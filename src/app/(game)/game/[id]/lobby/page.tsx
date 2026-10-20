import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { blobImageSrc } from "@/lib/blob-image";
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
    // Server component: runs once per request, so reading the clock is safe.
    // eslint-disable-next-line react-hooks/purity
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
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-8">
      {/* Status card */}
      <div className="card p-6">
        <h1 className="text-xl font-semibold text-fg">{gameName}</h1>
        <p className="mt-2 text-base text-fg">
          The game has not started yet - please wait.
        </p>
        <p className="mt-1 text-sm text-muted">
          Scheduled start: {formattedDate}
        </p>
        <Link href="/lobby" className="btn btn-primary mt-5">
          Back to lobby
        </Link>
      </div>

      {/* Participants */}
      {participants.length > 0 && (
        <section>
          <h2 className="mb-3 px-1 text-sm font-semibold text-muted">
            Participants ({participants.length})
          </h2>
          <div className="player-grid">
            {participants.map((player) => (
              <div
                key={player.id}
                className="card flex flex-col items-center gap-2 p-3 text-center"
              >
                <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-accent-soft">
                  {player.avatar_url ? (
                    <Image
                      src={blobImageSrc(player.avatar_url)}
                      alt={player.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full w-full select-none items-center justify-center text-2xl font-semibold text-accent">
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="w-full truncate px-1 text-sm font-semibold leading-tight text-fg">
                  {player.name}
                </p>
              </div>
            ))}
          </div>
        </section>
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
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <div className="card p-6">
        <h1 className="text-xl font-semibold text-fg">{title}</h1>
        <p className="mt-2 text-base text-fg">{message}</p>
        {hint ? <p className="mt-2 text-sm text-muted">{hint}</p> : null}
        <Link href="/lobby" className="btn btn-primary mt-5">
          Back to lobby
        </Link>
      </div>
    </div>
  );
}
