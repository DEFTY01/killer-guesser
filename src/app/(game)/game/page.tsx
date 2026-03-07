import type { Metadata } from "next";
import { PlayerLogin } from "@/components/PlayerLogin";

export const metadata: Metadata = { title: "Join Game" };

export default function GamePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <PlayerLogin />
    </main>
  );
}
