import type { Metadata } from "next";
import LoginScreen from "@/components/auth/LoginScreen";

export const metadata: Metadata = { title: "Summit of Lies" };

export default function HomePage() {
  return <LoginScreen />;
}
