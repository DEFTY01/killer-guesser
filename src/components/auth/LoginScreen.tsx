"use client";

import { useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────────────

type Player = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
};

type Props = {
  players: Player[];
};

// ── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin"
      style={{ width: 18, height: 18, display: "inline-block" }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Checkmark badge ───────────────────────────────────────────────────────────

function CheckBadge() {
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        top: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: "50%",
        background: "#7c3aed",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path
          d="M2 5.5L4.5 8L9 3"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// ── Avatar placeholder ────────────────────────────────────────────────────────

function AvatarPlaceholder({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      aria-hidden="true"
      style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #4c1d95, #7c3aed)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto 6px",
        fontSize: 24,
        fontWeight: 700,
        color: "#fff",
        fontFamily: "var(--font-cinzel), serif",
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** Only allow relative paths and same-origin absolute URLs for avatar images. */
function isSafeAvatarUrl(url: string): boolean {
  if (url.startsWith("/") || url.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export default function LoginScreen({ players }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const selectedPlayer = players.find((p) => p.id === selectedId) ?? null;

  const openPanel = useCallback(() => {
    setError(null);
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    if (loading) return;
    setPanelOpen(false);
  }, [loading]);

  const selectPlayer = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
    setError(null);
  }, []);

  const handleSignIn = useCallback(async () => {
    if (!selectedId || loading) return;
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("player", {
        userId: selectedId,
        redirect: false,
      });

      if (!result || result.error) {
        setError("Sign in failed. Please try again.");
        setLoading(false);
        return;
      }

      // Redirect to the lobby after a successful player sign-in.
      router.push("/lobby");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }, [selectedId, loading, router]);

  return (
    <>
      {/* ── Landing view ────────────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
          padding: "0 24px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            fontWeight: 700,
            color: "#e8e0ff",
            letterSpacing: "0.04em",
            lineHeight: 1.15,
            marginBottom: "16px",
            animation: "fadeInUp 0.7s ease both",
            animationDelay: "0.1s",
            textShadow: "0 2px 24px rgba(124, 58, 237, 0.5)",
          }}
        >
          Mountain Killer Game
        </h1>

        <p
          style={{
            fontSize: "clamp(0.95rem, 2.5vw, 1.15rem)",
            color: "rgba(200, 190, 240, 0.8)",
            marginBottom: "40px",
            maxWidth: 420,
            lineHeight: 1.6,
            animation: "fadeInUp 0.7s ease both",
            animationDelay: "0.25s",
          }}
        >
          Uncover the truth. Survive the night.
        </p>

        <button
          onClick={openPanel}
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "1rem",
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: "#fff",
            background: "linear-gradient(135deg, #5b21b6, #7c3aed)",
            border: "none",
            borderRadius: "12px",
            padding: "14px 40px",
            cursor: "pointer",
            animation: "fadeInUp 0.7s ease both",
            animationDelay: "0.42s",
            boxShadow: "0 4px 24px rgba(124, 58, 237, 0.45)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform =
              "translateY(-2px)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 8px 28px rgba(124, 58, 237, 0.6)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform =
              "translateY(0)";
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "0 4px 24px rgba(124, 58, 237, 0.45)";
          }}
        >
          Play Now
        </button>
      </div>

      {/* ── Backdrop ────────────────────────────────────────────────── */}
      <div
        className={`login-backdrop${panelOpen ? " backdrop-open" : ""}`}
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* ── Bottom-sheet / modal panel ───────────────────────────────── */}
      <div
        className={`login-panel${panelOpen ? " panel-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Select your avatar to sign in"
      >
        {/* Drag handle */}
        <div
          style={{
            width: 44,
            height: 4,
            borderRadius: 2,
            background: "rgba(255,255,255,0.2)",
            margin: "14px auto 0",
            flexShrink: 0,
          }}
          aria-hidden="true"
        />

        {/* Panel header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 4px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "#e8e0ff",
              letterSpacing: "0.03em",
            }}
          >
            Who are you?
          </h2>

          <button
            onClick={closePanel}
            disabled={loading}
            aria-label="Close panel"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(200, 190, 240, 0.6)",
              cursor: loading ? "not-allowed" : "pointer",
              padding: 4,
              borderRadius: 6,
              lineHeight: 1,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Avatar grid */}
        <div
          style={{
            padding: "16px 20px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
            gap: 10,
          }}
        >
          {players.length === 0 ? (
            <p
              style={{
                gridColumn: "1 / -1",
                color: "rgba(200, 190, 240, 0.5)",
                textAlign: "center",
                padding: "24px 0",
                fontSize: "0.9rem",
              }}
            >
              No players found. Add players first.
            </p>
          ) : (
            players.map((player, index) => (
              <button
                key={player.id}
                className={`avatar-card${selectedId === player.id ? " selected" : ""}`}
                onClick={() => selectPlayer(player.id)}
                aria-pressed={selectedId === player.id}
                aria-label={`Select ${player.nickname}`}
                style={{
                  animation: panelOpen
                    ? `fadeIn 0.35s ease both`
                    : undefined,
                  animationDelay: panelOpen
                    ? `${index * 50}ms`
                    : undefined,
                }}
              >
                {selectedId === player.id && <CheckBadge />}

                {player.avatarUrl && isSafeAvatarUrl(player.avatarUrl) ? (
                  <img
                    src={player.avatarUrl}
                    alt={player.nickname}
                    loading="eager"
                    width={64}
                    height={64}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      objectFit: "cover",
                      display: "block",
                      margin: "0 auto 6px",
                    }}
                  />
                ) : (
                  <AvatarPlaceholder name={player.nickname} />
                )}

                <span
                  style={{
                    display: "block",
                    fontSize: "0.72rem",
                    color: "rgba(220, 210, 255, 0.85)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  {player.nickname}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Error message */}
        {error && (
          <p
            role="alert"
            style={{
              margin: "0 24px 8px",
              padding: "10px 14px",
              borderRadius: 10,
              background: "rgba(220, 38, 38, 0.15)",
              border: "1px solid rgba(220, 38, 38, 0.35)",
              color: "#fca5a5",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </p>
        )}

        {/* Footer: hint + sign-in button */}
        <div
          style={{
            padding: "8px 24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <p
            style={{
              fontSize: "0.82rem",
              color: "rgba(200, 190, 240, 0.55)",
              textAlign: "center",
              minHeight: "1.2em",
            }}
            aria-live="polite"
          >
            {selectedPlayer ? (
              <>
                Signing in as{" "}
                <strong style={{ color: "rgba(200, 190, 240, 0.85)" }}>
                  {selectedPlayer.nickname}
                </strong>
              </>
            ) : (
              "Tap a card to select your avatar"
            )}
          </p>

          <button
            className="sign-in-btn"
            onClick={handleSignIn}
            disabled={!selectedId || loading}
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "0.95rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              color: "#fff",
              background: "linear-gradient(135deg, #5b21b6, #7c3aed)",
              border: "none",
              borderRadius: "12px",
              padding: "13px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              width: "100%",
            }}
            aria-label={
              loading
                ? "Signing in…"
                : selectedPlayer
                  ? `Sign in as ${selectedPlayer.nickname}`
                  : "Sign In"
            }
          >
            {loading && <Spinner />}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </div>
      </div>
    </>
  );
}
