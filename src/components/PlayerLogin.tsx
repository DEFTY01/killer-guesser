"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AvatarUpload } from "@/components/AvatarUpload";
import type { PlayerSession } from "@/types";

type Step = "nickname" | "avatar" | "lobby";

export function PlayerLogin() {
  const [step, setStep] = useState<Step>("nickname");
  const [nickname, setNickname] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<PlayerSession | null>(null);

  async function handleNicknameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNicknameError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      const json = await res.json();

      if (!json.success) {
        setNicknameError(json.error ?? "Something went wrong.");
        return;
      }

      const { playerId, sessionToken, expiresAt } = json.data;
      const playerSession: PlayerSession = {
        playerId,
        name: nickname,
        avatarUrl: null,
        sessionToken,
        expiresAt,
      };

      // Persist in sessionStorage so the player stays logged in on refresh.
      sessionStorage.setItem("playerSession", JSON.stringify(playerSession));
      setSession(playerSession);
      setStep("avatar");
    } catch {
      setNicknameError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "nickname") {
    return (
      <Card
        title="Join the Game"
        description="Pick a nickname to get started."
        className="w-full max-w-sm"
      >
        <form onSubmit={handleNicknameSubmit} className="space-y-4">
          <Input
            label="Nickname"
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            error={nicknameError ?? undefined}
            placeholder="e.g. GhostRider99"
            autoFocus
            required
          />
          <Button type="submit" loading={loading} className="w-full">
            Continue
          </Button>
        </form>
      </Card>
    );
  }

  if (step === "avatar" && session) {
    return (
      <Card
        title={`Hi, ${session.name}! 👋`}
        description="Upload an avatar (optional)."
        className="w-full max-w-sm"
      >
        <AvatarUpload
          playerId={String(session.playerId)}
          onSuccess={(url) =>
            setSession((s) => (s ? { ...s, avatarUrl: url } : s))
          }
        />
        <Button
          className="mt-6 w-full"
          onClick={() => setStep("lobby")}
        >
          Enter Lobby
        </Button>
      </Card>
    );
  }

  return (
    <Card
      title="Lobby"
      description="Waiting for the game to start…"
      className="w-full max-w-sm text-center"
    >
      <p className="text-2xl font-bold mt-2">{session?.name}</p>
      <p className="mt-2 text-gray-500">You&apos;re in! Good luck 🎉</p>
    </Card>
  );
}
