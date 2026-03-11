"use client";

import { signOut } from "next-auth/react";

interface Props {
  redirectTo: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Client-side sign-out button.
 *
 * Uses next-auth/react's signOut() which clears the session cookie in the
 * browser without a server round-trip Server Action, making it noticeably
 * faster than the "use server" form-action pattern.
 */
export default function SignOutButton({ redirectTo, className, children }: Props) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => signOut({ callbackUrl: redirectTo })}
    >
      {children ?? "Sign out"}
    </button>
  );
}
