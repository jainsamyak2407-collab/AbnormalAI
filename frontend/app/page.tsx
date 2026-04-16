"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type HealthStatus = "checking" | "connected" | "unreachable"

export default function LandingPage() {
  const [health, setHealth] = useState<HealthStatus>("checking")

  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/health", { signal: controller.signal })
      .then((res) => {
        if (res.ok) setHealth("connected")
        else setHealth("unreachable")
      })
      .catch(() => setHealth("unreachable"))

    return () => controller.abort()
  }, [])

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Backend health badge — top right */}
      <div className="absolute top-6 right-8">
        <span
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-sans"
          style={{
            backgroundColor:
              health === "connected"
                ? "#E6F4EA"
                : health === "unreachable"
                  ? "#F5E6E4"
                  : "#F0EFE9",
            color:
              health === "connected"
                ? "#2D6A4F"
                : health === "unreachable"
                  ? "#C0392B"
                  : "#6B7280",
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor:
                health === "connected"
                  ? "#2D6A4F"
                  : health === "unreachable"
                    ? "#C0392B"
                    : "#9CA3AF",
            }}
          />
          {health === "checking"
            ? "Backend: checking..."
            : health === "connected"
              ? "Backend: Connected"
              : "Backend: Unreachable"}
        </span>
      </div>

      {/* Main content — vertically centered */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* Wordmark */}
        <p
          className="text-xs tracking-widest uppercase mb-10 font-sans"
          style={{ color: "#4C566A", letterSpacing: "0.18em" }}
        >
          Abnormal Security
        </p>

        {/* Headline */}
        <h1
          className="font-serif text-5xl md:text-6xl lg:text-7xl leading-tight mb-6"
          style={{ color: "#1A1A1A", maxWidth: "820px" }}
        >
          Brief Studio
        </h1>

        {/* Tagline */}
        <p
          className="text-lg md:text-xl font-sans leading-relaxed mb-14"
          style={{ color: "#4B5563", maxWidth: "560px" }}
        >
          Upload your security data. Pick an audience. Get a consulting-grade
          brief in under three minutes.
        </p>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <Link
            href="/ingest?sample=true"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded text-sm font-sans font-medium transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "#4C566A",
              color: "#FAFAF7",
              minWidth: "200px",
            }}
          >
            Load Meridian sample
          </Link>
          <Link
            href="/ingest"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded text-sm font-sans font-medium transition-colors"
            style={{
              backgroundColor: "transparent",
              color: "#4C566A",
              border: "1px solid #4C566A",
              minWidth: "200px",
            }}
          >
            Upload your data
          </Link>
        </div>

        {/* Subtle caption */}
        <p
          className="mt-10 text-xs font-sans"
          style={{ color: "#9CA3AF" }}
        >
          No account required. Data stays in your browser session.
        </p>
      </main>

      {/* Footer */}
      <footer className="py-8 text-center">
        <p className="text-xs font-sans" style={{ color: "#9CA3AF" }}>
          Abnormal Brief Studio &mdash; Phase 0 scaffold
        </p>
      </footer>
    </div>
  )
}
