import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { db } from "@/db";
import { app_settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Summit of Lies",
    template: "%s | Summit of Lies",
  },
  description: "A real-time social deduction guessing game",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch global theme background URLs — gracefully fall back to null on error.
  let bgLightUrl: string | null = null;
  let bgDarkUrl: string | null = null;
  try {
    const [row] = await db
      .select()
      .from(app_settings)
      .where(eq(app_settings.id, 1))
      .limit(1);
    // Validate URLs to prevent CSS injection via malicious database values.
    const validateUrl = (u: string | null | undefined): string | null => {
      if (!u) return null;
      try {
        const parsed = new URL(u);
        return parsed.protocol === "https:" ? u : null;
      } catch {
        return null;
      }
    };
    bgLightUrl = validateUrl(row?.bg_light_url);
    bgDarkUrl = validateUrl(row?.bg_dark_url);
  } catch {
    // Non-fatal: fall back to CSS defaults.
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script to apply saved theme class before first paint (no-flash) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light"){document.documentElement.classList.add(t)}else if(!t||t==="system"){if(window.matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.classList.add("dark")}}}catch(e){}})()`,
          }}
        />
        {/* Cinzel display font for headings — loaded at runtime from Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased night-bg overflow-x-hidden`}
        style={
          {
            ...(bgLightUrl
              ? { "--bg-light-image": `url(${bgLightUrl})` }
              : {}),
            ...(bgDarkUrl
              ? { "--bg-dark-image": `url(${bgDarkUrl})` }
              : {}),
          } as React.CSSProperties
        }
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
