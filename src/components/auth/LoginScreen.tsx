"use client";

import { useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CircleNotch, X } from "@phosphor-icons/react";
import { blobImageSrc } from "@/lib/blob-image";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Modal } from "@/components/ui/Modal";

// ── Types ────────────────────────────────────────────────────────────────────

type Player = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  /** False until the player has chosen a PIN (first login or after an admin reset). */
  hasPin: boolean;
};

// ── Checkmark badge ───────────────────────────────────────────────────────────

function CheckBadge() {
  return (
    <span
      aria-hidden="true"
      className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg"
    >
      <Check className="size-3" />
    </span>
  );
}

// ── Avatar placeholder ────────────────────────────────────────────────────────

function AvatarPlaceholder({ name }: { name: string }) {
  return (
    <div
      aria-hidden="true"
      className="mx-auto mb-1.5 flex size-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xl font-semibold text-accent"
    >
      {name.charAt(0).toUpperCase()}
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

const enter = "animate-[fadeInUp_600ms_var(--ease-out)_both]";

export default function LoginScreen() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [step, setStep] = useState<"code" | "avatar" | "pin" | "newpin">("code");
  const [code, setCode] = useState("");
  const [gameName, setGameName] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
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

  const fetchGame = useCallback(async (): Promise<{ gameName: string; players: Player[] } | null> => {
    const res = await fetch(`/api/login/game?code=${encodeURIComponent(code.trim())}`);
    const json = await res.json();
    if (!res.ok || !json.success) return null;
    return json.data as { gameName: string; players: Player[] };
  }, [code]);

  const lookUpGame = useCallback(async () => {
    if (loading || code.trim().length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const game = await fetchGame();
      if (!game) {
        setError("We couldn't find a game with that code.");
        return;
      }
      setGameName(game.gameName);
      setPlayers(game.players);
      setStep("avatar");
    } catch {
      setError("Network problem. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [code, loading, fetchGame]);

  const selectPlayer = useCallback(
    (id: string) => {
      const player = players.find((p) => p.id === id);
      setSelectedId(id);
      setPin("");
      setConfirmPin("");
      setError(null);
      setStep(player && !player.hasPin ? "newpin" : "pin");
    },
    [players],
  );

  const goBack = useCallback(() => {
    setError(null);
    setPin("");
    setConfirmPin("");
    setStep((prev) => {
      if (prev === "pin" || prev === "newpin") return "avatar";
      setSelectedId(null);
      return "code";
    });
  }, []);

  const handleSignIn = useCallback(async () => {
    if (!selectedId || pin.length === 0 || loading) return;
    const choosing = step === "newpin";
    if (choosing && pin !== confirmPin) return;
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("player", {
        gameCode: code,
        userId: selectedId,
        pin,
        ...(choosing ? { setPin: "1" } : {}),
        redirect: false,
      });

      if (!result || result.error) {
        setPin("");
        setConfirmPin("");
        // The PIN situation may have changed (the admin reset it, or someone
        // else chose one first): refresh and send the player to the right step.
        const game = await fetchGame().catch(() => null);
        const current = game?.players.find((p) => p.id === selectedId);
        if (game) setPlayers(game.players);
        if (current && !choosing && !current.hasPin) {
          setStep("newpin");
          setError("Your PIN was reset. Choose a new one.");
        } else if (current && choosing && current.hasPin) {
          setStep("pin");
          setError("Someone already chose a PIN for this player. Enter it, or ask your host to reset it.");
        } else {
          setError(
            choosing
              ? "Could not save your PIN. Please try again."
              : "Wrong PIN, or too many attempts. Ask your host if you're stuck.",
          );
        }
        setLoading(false);
        return;
      }

      router.push("/lobby");
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }, [selectedId, pin, confirmPin, step, code, loading, router, fetchGame]);

  return (
    <>
      {/* ── Landing view ────────────────────────────────────────────── */}
      <div className="relative z-[2] mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
        {/* Theme toggle, top-right corner */}
        <div className="absolute right-4 top-[calc(1rem+var(--safe-top))]">
          <ThemeToggle />
        </div>

        <h1
          className={`${enter} font-display text-4xl font-bold leading-tight tracking-wide text-fg sm:text-5xl`}
          style={{ animationDelay: "100ms" }}
        >
          Summit of Lies
        </h1>

        <p
          className={`${enter} mb-10 mt-4 max-w-sm text-base leading-relaxed text-muted`}
          style={{ animationDelay: "200ms" }}
        >
          Uncover the truth. Survive the night.
        </p>

        <button
          type="button"
          onClick={openPanel}
          className={`${enter} btn btn-primary min-h-12 px-10 text-base`}
          style={{ animationDelay: "300ms" }}
        >
          Play Now
        </button>

        <Link
          href="/admin"
          className={`${enter} btn btn-ghost btn-sm mt-3`}
          style={{ animationDelay: "400ms" }}
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

      {/* ── Bottom-sheet / modal panel (native dialog) ───────────────── */}
      <Modal
        className={`login-panel${panelOpen ? " panel-open" : ""}`}
        aria-label="Sign in to your game"
        open={panelOpen}
        exitMs={400}
        onClose={closePanel}
      >
        {/* Drag handle */}
        <div
          className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden"
          aria-hidden="true"
        />

        {/* Panel header */}
        <div className="flex items-center justify-between px-6 pb-1 pt-4">
          <h2 className="text-xl font-semibold text-fg">
            {step === "code" ? "Join a game" : "Who are you?"}
          </h2>

          <button
            type="button"
            onClick={closePanel}
            disabled={loading}
            aria-label="Close panel"
            className="btn btn-ghost size-11 px-0"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {step === "code" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookUpGame();
            }}
            className="flex flex-col gap-3 px-6 pb-6 pt-3"
          >
            <label htmlFor="game-code" className="text-sm text-muted">
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
              className="field h-16 text-center text-2xl font-semibold tracking-[0.3em]"
            />
          </form>
        )}

        {step === "avatar" && (
          <div className="px-5 pt-2">
            <p className="text-center text-sm text-muted">
              {gameName} - tap your avatar
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2.5 pb-4 pt-3">
              {players.map((player, index) => (
                <button
                  key={player.id}
                  type="button"
                  className={`avatar-card${player.id === selectedId ? " selected" : ""}`}
                  onClick={() => selectPlayer(player.id)}
                  aria-label={`Select ${player.nickname}`}
                  style={{
                    animation: panelOpen ? `fadeIn 300ms var(--ease-out) both` : undefined,
                    animationDelay: panelOpen ? `${index * 40}ms` : undefined,
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
                      className="mx-auto mb-1.5 block size-16 rounded-full object-cover"
                    />
                  ) : (
                    <AvatarPlaceholder name={player.nickname} />
                  )}
                  <span className="block max-w-full truncate px-1 text-xs font-medium text-fg">
                    {player.nickname}
                  </span>
                  {player.id === selectedId && <CheckBadge />}
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
            className="flex flex-col items-center gap-4 px-6 pb-2 pt-3"
          >
            <p className="text-sm text-muted">
              Hi <strong className="font-semibold text-fg">{selectedPlayer.nickname}</strong>
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
              className="field h-16 max-w-60 text-center text-3xl font-semibold tracking-[0.5em]"
            />
          </form>
        )}

        {step === "newpin" && selectedPlayer && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSignIn();
            }}
            className="flex flex-col items-center gap-3 px-6 pb-2 pt-3"
          >
            <p className="text-center text-sm text-muted">
              Hi <strong className="font-semibold text-fg">{selectedPlayer.nickname}</strong>
              , choose a 4-digit PIN. You will use it every time you sign in.
            </p>
            <input
              aria-label="New PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              autoFocus
              placeholder="••••"
              className="field h-14 max-w-60 text-center text-3xl font-semibold tracking-[0.5em]"
            />
            <input
              aria-label="Confirm PIN"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="••••"
              className="field h-14 max-w-60 text-center text-3xl font-semibold tracking-[0.5em]"
            />
            {confirmPin.length === 4 && pin !== confirmPin && (
              <p role="status" className="text-sm text-danger">The two PINs do not match.</p>
            )}
          </form>
        )}

        {error && (
          <p role="alert" className="callout callout-danger mx-6 my-2">
            {error}
          </p>
        )}

        <div className="flex gap-2.5 px-6 pb-7 pt-2">
          {step !== "code" && (
            <button
              type="button"
              onClick={goBack}
              disabled={loading}
              className="btn btn-secondary min-h-12"
            >
              Back
            </button>
          )}
          {step !== "avatar" && (
            <button
              type="button"
              className="sign-in-btn btn btn-primary min-h-12 flex-1"
              onClick={step === "code" ? lookUpGame : handleSignIn}
              disabled={
                loading ||
                (step === "code"
                  ? code.trim().length < 6
                  : step === "newpin"
                    ? pin.length < 4 || pin !== confirmPin
                    : pin.length < 4)
              }
            >
              {loading && (
                <CircleNotch className="size-5 animate-spin" aria-hidden="true" />
              )}
              {step === "code" ? "Find my game" : step === "newpin" ? "Save PIN and sign in" : "Sign In"}
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
