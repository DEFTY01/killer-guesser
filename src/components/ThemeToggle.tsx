"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@phosphor-icons/react";

const subscribe = () => () => {};

/**
 * ThemeToggle
 *
 * A button that switches between dark and light mode using next-themes.
 * Renders a sun icon in dark mode and a moon icon in light mode.
 * Suppresses rendering until mounted to avoid hydration mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  if (!mounted) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex size-11 items-center justify-center rounded-control ${className ?? ""}`}
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`btn btn-ghost size-11 px-0 ${className ?? ""}`}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
