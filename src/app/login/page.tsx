import type { Metadata } from "next";
import LoginScreen from "@/components/auth/LoginScreen";

export const metadata: Metadata = { title: "Enter the Game" };

export default function LoginPage() {
  return <LoginScreen />;
}
