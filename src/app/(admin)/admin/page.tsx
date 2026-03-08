import type { Metadata } from "next";
import { db } from "@/db";
import { games, users } from "@/db/schema";
import { sql } from "drizzle-orm";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const [gameCount, playerCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(games)
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .then((r) => r[0]?.count ?? 0),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Total Games" value={gameCount} />
        <StatCard title="Total Players" value={playerCount} />
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-2 text-4xl font-bold">{value}</p>
    </div>
  );
}
