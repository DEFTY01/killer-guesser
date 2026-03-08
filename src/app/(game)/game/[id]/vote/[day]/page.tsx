"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────

interface Player {
  id: number;
  name: string;
  avatar_url: string | null;
}

interface VoteCount {
  target_id: number;
  target_name: string;
  target_avatar: string | null;
  count: number;
}

interface VoteRow {
  voter_id: number;
  voter_name: string;
  voter_avatar: string | null;
  target_id: number;
  target_name: string;
  target_avatar: string | null;
}

interface OpenState {
  status: "open";
  day: number;
  players: Player[];
  currentVote: number | null;
  isSpy: boolean;
}

interface ClosedState {
  status: "closed";
  day: number;
  voteCounts: VoteCount[];
  outcome: "killer_defeated" | "killer_survived" | "no_majority" | null;
  callerTeam: "team1" | "team2" | null;
  voteList?: VoteRow[];
}

type VoteState = OpenState | ClosedState;

// ── Avatar helpers ────────────────────────────────────────────────

function isSafeUrl(url: string): boolean {
  if (url.startsWith("/") || url.startsWith("data:image/")) return true;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function Avatar({
  url,
  name,
  size = 56,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  if (url && isSafeUrl(url)) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          display: "block",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #4c1d95, #7c3aed)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.4,
        fontWeight: 700,
        color: "#fff",
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ── Outcome popup ─────────────────────────────────────────────────

function OutcomePopup({
  outcome,
  callerTeam,
  onClose,
}: {
  outcome: ClosedState["outcome"];
  callerTeam: ClosedState["callerTeam"];
  onClose: () => void;
}) {
  let title = "";
  let body = "";
  let accent = "#7c3aed";

  if (outcome === "killer_defeated") {
    if (callerTeam === "team1") {
      title = "You have died";
      body = "The survivors identified you. Your reign of terror is over.";
      accent = "#ef4444";
    } else {
      title = "You killed the killer! 🎉";
      body = "The village has voted out the killer. Peace is restored!";
      accent = "#22c55e";
    }
  } else if (outcome === "killer_survived") {
    title = "The killer is still among us!";
    body =
      "An innocent player was eliminated. The killer walks free for another day…";
    accent = "#f97316";
  } else {
    title = "No majority reached";
    body = "The vote ended without a decisive outcome. The game continues.";
    accent = "#6b7280";
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="outcome-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(0,0,0,0.65)",
      }}
    >
      <div
        style={{
          background: "#1e1b4b",
          border: `2px solid ${accent}`,
          borderRadius: 20,
          padding: "32px 28px",
          maxWidth: 380,
          width: "100%",
          textAlign: "center",
          boxShadow: `0 8px 40px ${accent}55`,
        }}
      >
        <p
          id="outcome-title"
          style={{
            fontSize: "1.4rem",
            fontWeight: 700,
            color: accent,
            marginBottom: 12,
            fontFamily: "var(--font-cinzel), serif",
          }}
        >
          {title}
        </p>
        <p style={{ color: "rgba(200,190,240,0.8)", lineHeight: 1.6, marginBottom: 28 }}>
          {body}
        </p>
        <button
          onClick={onClose}
          style={{
            background: accent,
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "11px 32px",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: "0.95rem",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// ── Open: voting grid ─────────────────────────────────────────────

function VotingGrid({
  state,
  gameId,
  day,
}: {
  state: OpenState;
  gameId: string;
  day: number;
}) {
  const [selected, setSelected] = useState<number | null>(state.currentVote);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/game/${gameId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: selected, day }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };

      if (!json.success) {
        setError(json.error ?? "Failed to submit vote");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, gameId, day]);

  return (
    <div style={{ padding: "0 16px 32px" }}>
      <h2
        style={{
          fontFamily: "var(--font-cinzel), serif",
          fontSize: "1.2rem",
          color: "#e8e0ff",
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        Day {day} — Cast Your Vote
      </h2>
      <p
        style={{
          color: "rgba(200,190,240,0.6)",
          textAlign: "center",
          fontSize: "0.85rem",
          marginBottom: 24,
        }}
      >
        Tap a player to select, then confirm. You may change your vote while
        the window is open.
      </p>

      {submitted && (
        <p
          role="status"
          style={{
            textAlign: "center",
            color: "#86efac",
            marginBottom: 16,
            fontSize: "0.9rem",
          }}
        >
          ✓ Vote recorded — you can still change it while the window is open.
        </p>
      )}

      {/* Player grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
          gap: 12,
          marginBottom: 28,
        }}
      >
        {state.players.map((player) => {
          const isSelected = selected === player.id;
          return (
            <button
              key={player.id}
              onClick={() => {
                setSelected((prev) => (prev === player.id ? null : player.id));
                setSubmitted(false);
                setError(null);
              }}
              aria-pressed={isSelected}
              aria-label={`Vote for ${player.name}`}
              style={{
                background: isSelected
                  ? "rgba(59,130,246,0.2)"
                  : "rgba(255,255,255,0.05)",
                border: isSelected
                  ? "2px solid #3b82f6"
                  : "2px solid transparent",
                borderRadius: 14,
                padding: "12px 8px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                transition: "border-color 0.15s, background 0.15s",
                boxShadow: isSelected
                  ? "0 0 0 4px rgba(59,130,246,0.25)"
                  : "none",
              }}
            >
              <Avatar url={player.avatar_url} name={player.name} size={56} />
              <span
                style={{
                  fontSize: "0.78rem",
                  color: isSelected ? "#93c5fd" : "rgba(220,210,255,0.8)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                  fontWeight: isSelected ? 600 : 400,
                }}
              >
                {player.name}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          style={{
            color: "#fca5a5",
            background: "rgba(220,38,38,0.15)",
            border: "1px solid rgba(220,38,38,0.35)",
            borderRadius: 10,
            padding: "10px 14px",
            textAlign: "center",
            marginBottom: 16,
            fontSize: "0.85rem",
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleConfirm}
        disabled={!selected || submitting}
        style={{
          width: "100%",
          background:
            !selected || submitting
              ? "rgba(255,255,255,0.1)"
              : "linear-gradient(135deg, #1d4ed8, #3b82f6)",
          color: !selected || submitting ? "rgba(200,190,240,0.4)" : "#fff",
          border: "none",
          borderRadius: 12,
          padding: "14px 24px",
          fontWeight: 600,
          fontSize: "1rem",
          cursor: !selected || submitting ? "not-allowed" : "pointer",
          transition: "background 0.2s, color 0.2s",
          fontFamily: "var(--font-cinzel), serif",
          letterSpacing: "0.04em",
        }}
      >
        {submitting ? "Submitting…" : "Confirm Vote"}
      </button>

      {/* Spy section (collapsible) */}
      {state.isSpy && <SpySection day={day} gameId={gameId} />}
    </div>
  );
}

// ── Closed: results view ──────────────────────────────────────────

function ResultsView({
  state,
  gameId,
}: {
  state: ClosedState;
  gameId: string;
}) {
  const [popupDismissed, setPopupDismissed] = useState(false);
  const maxCount = Math.max(...state.voteCounts.map((v) => v.count), 1);

  const showPopup =
    !popupDismissed && state.outcome && state.outcome !== "no_majority";

  return (
    <>
      {showPopup && (
        <OutcomePopup
          outcome={state.outcome}
          callerTeam={state.callerTeam}
          onClose={() => setPopupDismissed(true)}
        />
      )}

      <div style={{ padding: "0 16px 32px" }}>
        <h2
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "1.2rem",
            color: "#e8e0ff",
            textAlign: "center",
            marginBottom: 6,
          }}
        >
          Day {state.day} — Vote Results
        </h2>
        {state.outcome === "no_majority" && (
          <p
            style={{
              color: "#fbbf24",
              textAlign: "center",
              fontSize: "0.85rem",
              marginBottom: 16,
            }}
          >
            No majority reached — the game continues.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
          {state.voteCounts.length === 0 ? (
            <p
              style={{
                color: "rgba(200,190,240,0.5)",
                textAlign: "center",
                fontSize: "0.9rem",
              }}
            >
              No votes were cast.
            </p>
          ) : (
            [...state.voteCounts]
              .sort((a, b) => b.count - a.count)
              .map((vc) => (
                <div key={vc.target_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar url={vc.target_avatar} name={vc.target_name} size={36} />
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{ color: "rgba(220,210,255,0.9)", fontSize: "0.88rem" }}
                      >
                        {vc.target_name}
                      </span>
                      <span
                        style={{ color: "rgba(200,190,240,0.6)", fontSize: "0.8rem" }}
                      >
                        {vc.count} vote{vc.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {/* Vote bar */}
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: "rgba(255,255,255,0.08)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          borderRadius: 4,
                          background: "linear-gradient(90deg, #3b82f6, #7c3aed)",
                          width: `${Math.round((vc.count / maxCount) * 100)}%`,
                          transition: "width 0.5s ease",
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>

        {/* Spy section (collapsible) */}
        {state.voteList && (
          <SpyVoteList voteList={state.voteList} />
        )}
      </div>
    </>
  );
}

// ── Spy: open-window live section ─────────────────────────────────

function SpySection({ day, gameId }: { day: number; gameId: string }) {
  const [open, setOpen] = useState(false);
  const [voteList, setVoteList] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/game/${gameId}/vote?day=${day}`);
      const json = (await res.json()) as {
        success: boolean;
        data?: OpenState & { voteList?: VoteRow[] };
      };
      if (json.success && json.data?.voteList) {
        setVoteList(json.data.voteList);
      }
    } finally {
      setLoading(false);
    }
  }, [gameId, day]);

  useEffect(() => {
    if (open) void fetchVotes();
  }, [open, fetchVotes]);

  return (
    <div style={{ marginTop: 28 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "rgba(20,184,166,0.12)",
          border: "1px solid rgba(20,184,166,0.3)",
          borderRadius: 10,
          padding: "11px 16px",
          color: "#5eead4",
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.9rem",
        }}
      >
        <span>Secret Info 🕵️</span>
        <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
          {open ? "▲ hide" : "▼ show"}
        </span>
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            background: "rgba(20,184,166,0.06)",
            border: "1px solid rgba(20,184,166,0.2)",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          {loading ? (
            <p style={{ color: "rgba(200,190,240,0.5)", fontSize: "0.85rem" }}>
              Loading…
            </p>
          ) : voteList.length === 0 ? (
            <p style={{ color: "rgba(200,190,240,0.5)", fontSize: "0.85rem" }}>
              No votes cast yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {voteList.map((row, i) => (
                <VoteRowItem key={`spy-open-${row.voter_id}-${row.target_id}-${i}`} row={row} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Spy: closed-window vote list ──────────────────────────────────

function SpyVoteList({ voteList }: { voteList: VoteRow[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginTop: 28 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: "100%",
          background: "rgba(20,184,166,0.12)",
          border: "1px solid rgba(20,184,166,0.3)",
          borderRadius: 10,
          padding: "11px 16px",
          color: "#5eead4",
          fontWeight: 600,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "0.9rem",
        }}
      >
        <span>Secret Info 🕵️</span>
        <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
          {open ? "▲ hide" : "▼ show"}
        </span>
      </button>

      {open && (
        <div
          style={{
            marginTop: 8,
            background: "rgba(20,184,166,0.06)",
            border: "1px solid rgba(20,184,166,0.2)",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          {voteList.length === 0 ? (
            <p style={{ color: "rgba(200,190,240,0.5)", fontSize: "0.85rem" }}>
              No votes were cast.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {voteList.map((row, i) => (
                <VoteRowItem key={`spy-closed-${row.voter_id}-${row.target_id}-${i}`} row={row} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared: single vote row (voter → target) ──────────────────────

function VoteRowItem({ row }: { row: VoteRow }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: "0.82rem",
        color: "rgba(200,190,240,0.85)",
      }}
    >
      <Avatar url={row.voter_avatar} name={row.voter_name} size={28} />
      <span style={{ fontWeight: 500 }}>{row.voter_name}</span>
      <span style={{ color: "rgba(200,190,240,0.4)", margin: "0 2px" }}>→</span>
      <Avatar url={row.target_avatar} name={row.target_name} size={28} />
      <span style={{ fontWeight: 500 }}>{row.target_name}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function VotePage() {
  const params = useParams<{ id: string; day: string }>();
  const gameId = params.id;
  const day = parseInt(params.day ?? "1", 10);

  const [voteState, setVoteState] = useState<VoteState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchState() {
      try {
        const res = await fetch(`/api/game/${gameId}/vote?day=${day}`);
        if (res.status === 401) {
          setError("You must be signed in to view this page.");
          return;
        }
        const json = (await res.json()) as {
          success: boolean;
          data?: VoteState;
          error?: string;
        };
        if (json.success && json.data) {
          setVoteState(json.data);
        } else {
          setError(json.error ?? "Failed to load voting state.");
        }
      } catch {
        setError("An unexpected error occurred.");
      }
    }

    void fetchState();
  }, [gameId, day]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(160deg, #0f0a1e 0%, #1a1040 100%)",
        color: "#e8e0ff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 20px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "clamp(1.1rem, 4vw, 1.4rem)",
            fontWeight: 700,
            color: "#e8e0ff",
            letterSpacing: "0.05em",
            margin: 0,
            textAlign: "center",
          }}
        >
          Voting Phase
        </h1>
        {voteState && (
          <span
            style={{
              position: "absolute",
              right: 20,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              color:
                voteState.status === "open" ? "#86efac" : "rgba(200,190,240,0.5)",
              background:
                voteState.status === "open"
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(255,255,255,0.05)",
              border:
                voteState.status === "open"
                  ? "1px solid rgba(34,197,94,0.3)"
                  : "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20,
              padding: "3px 10px",
              textTransform: "uppercase",
            }}
          >
            {voteState.status === "open" ? "● Live" : "Closed"}
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 0 0" }}>
        {error ? (
          <p
            role="alert"
            style={{
              margin: "40px 24px",
              padding: "16px",
              borderRadius: 12,
              background: "rgba(220,38,38,0.15)",
              border: "1px solid rgba(220,38,38,0.35)",
              color: "#fca5a5",
              textAlign: "center",
            }}
          >
            {error}
          </p>
        ) : !voteState ? (
          <p
            style={{
              textAlign: "center",
              color: "rgba(200,190,240,0.5)",
              marginTop: 60,
            }}
          >
            Loading…
          </p>
        ) : voteState.status === "open" ? (
          <VotingGrid state={voteState} gameId={gameId} day={day} />
        ) : (
          <ResultsView state={voteState} gameId={gameId} />
        )}
      </div>
    </div>
  );
}
