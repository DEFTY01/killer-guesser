"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="night-bg">
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .fade-in-up {
          animation: fadeInUp 0.7s ease both;
        }
        
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.25s; }
        .delay-3 { animation-delay: 0.42s; }
      `}</style>

      <main
        className="flex min-h-screen flex-col items-center justify-center gap-12 px-6 py-8"
        style={{
          position: "relative",
          zIndex: 2,
        }}
      >
        <div className="text-center max-w-2xl">
          <h1
            className={`fade-in-up delay-1 ${mounted ? "" : "opacity-0"}`}
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "clamp(2.5rem, 7vw, 4rem)",
              fontWeight: 700,
              color: "#e8e0ff",
              letterSpacing: "0.04em",
              lineHeight: 1.15,
              marginBottom: "16px",
              textShadow: "0 2px 24px rgba(124, 58, 237, 0.5)",
            }}
          >
            Summit of Lies
          </h1>

          <p
            className={`fade-in-up delay-2 ${mounted ? "" : "opacity-0"}`}
            style={{
              fontSize: "clamp(1rem, 2.5vw, 1.25rem)",
              color: "rgba(200, 190, 240, 0.8)",
              marginBottom: "20px",
              lineHeight: 1.6,
              letterSpacing: "0.01em",
            }}
          >
            Uncover the truth. Survive the night.
          </p>

          <p
            className={`fade-in-up delay-2 ${mounted ? "" : "opacity-0"}`}
            style={{
              fontSize: "0.95rem",
              color: "rgba(200, 190, 240, 0.65)",
              marginTop: "8px",
            }}
          >
            A real-time social deduction experience
          </p>
        </div>

        <div className={`fade-in-up delay-3 flex flex-col gap-4 sm:flex-row ${mounted ? "" : "opacity-0"}`}>
          <Link
            href="/login"
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
              boxShadow: "0 4px 24px rgba(124, 58, 237, 0.45)",
              transition: "transform 0.15s, box-shadow 0.15s",
              textDecoration: "none",
              textAlign: "center",
              display: "inline-block",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 8px 28px rgba(124, 58, 237, 0.6)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 4px 24px rgba(124, 58, 237, 0.45)";
            }}
          >
            Play Now
          </Link>
          <Link
            href="/admin"
            style={{
              fontFamily: "var(--font-cinzel), serif",
              fontSize: "1rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              color: "#e8e0ff",
              background: "transparent",
              border: "2px solid rgba(232, 224, 255, 0.3)",
              borderRadius: "12px",
              padding: "12px 40px",
              cursor: "pointer",
              transition: "all 0.15s",
              textDecoration: "none",
              textAlign: "center",
              display: "inline-block",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(232, 224, 255, 0.6)";
              (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(124, 58, 237, 0.15)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(232, 224, 255, 0.3)";
              (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent";
            }}
          >
            Admin Panel
          </Link>
        </div>
      </main>
    </div>
  );
}
