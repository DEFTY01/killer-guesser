"use client";

import { useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { blobImageSrc } from "@/lib/blob-image";
import { ThemeToggle } from "@/components/ThemeToggle";

// ── Types ────────────────────────────────────────────────────────────────────

type Player = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
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

export default function LoginScreen() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [step, setStep] = useState<"code" | "avatar" | "pin">("code");
  const [code, setCode] = useState("");
  const [gameName, setGameName] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
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

  const lookUpGame = useCallback(async () => {
    if (loading || code.trim().length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/login/game?code=${encodeURIComponent(code.trim())}`,
      );
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError("We couldn't find a game with that code.");
        return;
      }
      setGameName(json.data.gameName as string);
      setPlayers(json.data.players as Player[]);
      setStep("avatar");
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [code, loading]);

  const selectPlayer = useCallback((id: string) => {
    setSelectedId(id);
    setPin("");
    setError(null);
    setStep("pin");
  }, []);

  const goBack = useCallback(() => {
    setError(null);
    setPin("");
    setStep((prev) => {
      if (prev === "pin") return "avatar";
      setSelectedId(null);
      return "code";
    });
  }, []);

  const handleSignIn = useCallback(async () => {
    if (!selectedId || pin.length === 0 || loading) return;
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("player", {
        gameCode: code,
        userId: selectedId,
        pin,
        redirect: false,
      });

      if (!result || result.error) {
        setError("Wrong PIN, or too many attempts. Ask your host if you're stuck.");
        setPin("");
        setLoading(false);
        return;
      }

      router.push("/lobby");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }, [selectedId, pin, code, loading, router]);

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
        {/* Theme toggle — top-right corner */}
        <div style={{ position: "absolute", top: 16, right: 16, zIndex: 10 }}>
          <ThemeToggle />
        </div>
        <h1
          style={{
            fontFamily: "var(--font-cinzel), serif",
            fontSize: "clamp(2rem, 5vw, 3.5rem)",
            fontWeight: 700,
            color: "var(--login-title-color)",
            letterSpacing: "0.04em",
            lineHeight: 1.15,
            marginBottom: "16px",
            animation: "fadeInUp 0.7s ease both",
            animationDelay: "0.1s",
            textShadow: "0 2px 24px rgba(124, 58, 237, 0.5)",
          }}
        >
          Summit of Lies
        </h1>

        <p
          style={{
            fontSize: "clamp(0.95rem, 2.5vw, 1.15rem)",
            color: "var(--login-subtitle-color)",
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

        <Link
          href="/admin"
          style={{
            marginTop: "16px",
            fontSize: "0.82rem",
            color: "var(--login-admin-link-color)",
            textDecoration: "none",
            letterSpacing: "0.06em",
            animation: "fadeInUp 0.7s ease both",
            animationDelay: "0.55s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color =
              "var(--login-title-color)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color =
              "var(--login-admin-link-color)";
          }}
        >
          Admin Panel
        </Link>
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
        aria-label="Sign in to your game"
      >
        {/* Drag handle */}
        <div
          style={{
            width: 44,
            height: 4,
            borderRadius: 2,
            background: "var(--login-panel-handle)",
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
              color: "var(--login-heading-color)",
              letterSpacing: "0.03em",
            }}
          >
            {step === "code" ? "Join a game" : "Who are you?"}
          </h2>

          <button
            onClick={closePanel}
            disabled={loading}
            aria-label="Close panel"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--login-close-btn-color)",
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

        {step === "code" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookUpGame();
            }}
            style={{ padding: "16px 24px 28px", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <label htmlFor="game-code" style={{ fontSize: "0.85rem", color: "var(--login-hint-color)" }}>
              Enter the game code from your host
            </label>
            <input
              id="game-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={8}
              placeholder="ABC234"
              style={{
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "1.6rem",
                letterSpacing: "0.3em",
                textAlign: "center",
                padding: "12px",
                borderRadius: 12,
                border: "1px solid var(--login-hint-color)",
                background: "transparent",
                color: "var(--login-heading-color)",
              }}
            />
          </form>
        )}

        {step === "avatar" && (
          <div style={{ padding: "8px 20px 0" }}>
            <p style={{ fontSize: "0.85rem", color: "var(--login-hint-color)", textAlign: "center" }}>
              {gameName} — tap your avatar
            </p>
            <div
              style={{
                padding: "12px 0 16px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
                gap: 10,
              }}
            >
              {players.map((player, index) => (
                <button
                  key={player.id}
                  className="avatar-card"
                  onClick={() => selectPlayer(player.id)}
                  aria-label={`Select ${player.nickname}`}
                  style={{
                    animation: panelOpen ? `fadeIn 0.35s ease both` : undefined,
                    animationDelay: panelOpen ? `${index * 50}ms` : undefined,
                  }}
                >
                  {player.avatarUrl && isSafeAvatarUrl(player.avatarUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- avatars are fixed-size blobs served through blobImageSrc
                    <img
                      src={blobImageSrc(player.avatarUrl)}
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
                      color: "var(--login-nickname-color)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    {player.nickname}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "pin" && selectedPlayer && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSignIn();
            }}
            style={{ padding: "16px 24px 8px", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}
          >
            <p style={{ fontSize: "0.9rem", color: "var(--login-hint-color)" }}>
              Hi{" "}
              <strong style={{ color: "var(--login-hint-selected-color)" }}>
                {selectedPlayer.nickname}
              </strong>
              , enter your PIN
            </p>
            <input
              aria-label="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="••••"
              style={{
                fontSize: "1.8rem",
                letterSpacing: "0.5em",
                textAlign: "center",
                width: "100%",
                maxWidth: 240,
                padding: "10px",
                borderRadius: 12,
                border: "1px solid var(--login-hint-color)",
                background: "transparent",
                color: "var(--login-heading-color)",
              }}
            />
          </form>
        )}

        {error && (
          <p
            role="alert"
            style={{
              margin: "8px 24px",
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

        <div style={{ padding: "8px 24px 28px", display: "flex", gap: 10 }}>
          {step !== "code" && (
            <button
              type="button"
              onClick={goBack}
              disabled={loading}
              style={{
                minHeight: 48,
                padding: "0 18px",
                borderRadius: 12,
                border: "1px solid var(--login-hint-color)",
                background: "transparent",
                color: "var(--login-heading-color)",
              }}
            >
              Back
            </button>
          )}
          {step !== "avatar" && (
            <button
              className="sign-in-btn"
              onClick={step === "code" ? lookUpGame : handleSignIn}
              disabled={loading || (step === "code" ? code.trim().length < 6 : pin.length < 4)}
              style={{
                flex: 1,
                minHeight: 48,
                fontFamily: "var(--font-cinzel), serif",
                fontSize: "0.95rem",
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: "#fff",
                background: "linear-gradient(135deg, #5b21b6, #7c3aed)",
                border: "none",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              {loading && <Spinner />}
              {step === "code" ? "Find my game" : "Sign In"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
