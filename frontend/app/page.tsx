"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type HealthStatus = "checking" | "connected" | "unreachable"

const MONO = "'Courier New', Courier, monospace"

export default function LandingPage() {
  const [health, setHealth] = useState<HealthStatus>("checking")

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/health", { signal: controller.signal })
      .then((res) => setHealth(res.ok ? "connected" : "unreachable"))
      .catch(() => setHealth("unreachable"))
    return () => controller.abort()
  }, [])

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", display: "flex", flexDirection: "column", position: "relative" }}>

      {/* Ruled paper texture */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "repeating-linear-gradient(transparent, transparent 31px, #E5E4DF 31px, #E5E4DF 32px)",
        opacity: 0.35,
      }} />

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 48px", borderBottom: "1px solid #E5E4DF",
        position: "relative", zIndex: 1, background: "#FAFAF7",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <span style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#1A1A1A" }}>
            ABNORMAL SECURITY
          </span>
          <span style={{ width: "1px", height: "14px", background: "#D1CFC6" }} />
          <span style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF" }}>
            BRIEF STUDIO
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: health === "connected" ? "#2D6A4F" : health === "unreachable" ? "#C0392B" : "#9CA3AF",
            boxShadow: health === "connected" ? "0 0 0 2px rgba(45,106,79,0.2)" : "none",
            display: "inline-block",
          }} />
          <span style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.15em", textTransform: "uppercase", color: health === "connected" ? "#2D6A4F" : health === "unreachable" ? "#C0392B" : "#9CA3AF" }}>
            {health === "checking" ? "CONNECTING" : health === "connected" ? "SYSTEM ONLINE" : "OFFLINE"}
          </span>
        </div>
      </header>

      {/* Body */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "72px 48px", maxWidth: "960px", margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>

        {/* Classification bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "52px" }}>
          <div style={{ flex: 1, height: "1px", background: "#4C566A" }} />
          <span style={{
            fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "#4C566A",
            padding: "5px 14px", border: "1px solid #4C566A",
          }}>
            SECURITY INTELLIGENCE · AI-NATIVE
          </span>
          <div style={{ flex: 1, height: "1px", background: "#4C566A" }} />
        </div>

        {/* Headline */}
        <h1 style={{
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "clamp(56px, 9vw, 104px)",
          fontWeight: 700, lineHeight: 0.92, letterSpacing: "-0.025em",
          color: "#1A1A1A", marginBottom: "36px",
        }}>
          Turn security<br />
          data into<br />
          <em style={{ color: "#4C566A", fontStyle: "italic" }}>board-ready</em><br />
          intelligence.
        </h1>

        {/* Lede */}
        <p style={{
          fontFamily: "var(--font-source-serif), Georgia, serif",
          fontSize: "19px", lineHeight: 1.65, color: "#4B5563",
          maxWidth: "500px", marginBottom: "56px",
        }}>
          Upload your CSV exports. Choose your audience.
          A five-stage AI pipeline writes the brief — every number
          grounded in evidence, every recommendation earned from the data.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap", marginBottom: "72px" }}>
          <Link href="/ingest?sample=true" style={{
            display: "inline-flex", alignItems: "center", gap: "10px",
            padding: "15px 36px", background: "#1A1A1A", color: "#FAFAF7",
            fontFamily: MONO, fontSize: "10px", fontWeight: 700,
            letterSpacing: "0.18em", textTransform: "uppercase", textDecoration: "none",
            border: "1px solid #1A1A1A",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
            LOAD MERIDIAN SAMPLE
          </Link>
          <Link href="/ingest" style={{
            display: "inline-flex", alignItems: "center", gap: "10px",
            padding: "15px 36px", background: "transparent", color: "#1A1A1A",
            fontFamily: MONO, fontSize: "10px", fontWeight: 700,
            letterSpacing: "0.18em", textTransform: "uppercase", textDecoration: "none",
            border: "1px solid #4C566A",
          }}>
            UPLOAD YOUR DATA
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <path d="M7 1l4 4-4 4M11 5H1" stroke="#4C566A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        {/* Stats strip */}
        <div style={{ display: "flex", gap: "0", borderTop: "1px solid #E5E4DF", borderLeft: "1px solid #E5E4DF" }}>
          {[
            { n: "5", label: "AI STAGES" },
            { n: "2", label: "AUDIENCE MODES" },
            { n: "~60s", label: "GENERATION TIME" },
            { n: "0", label: "DATA RETAINED" },
          ].map(({ n, label }) => (
            <div key={label} style={{ flex: 1, padding: "20px 24px", borderRight: "1px solid #E5E4DF", borderBottom: "1px solid #E5E4DF" }}>
              <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "28px", fontWeight: 700, color: "#1A1A1A", lineHeight: 1, marginBottom: "6px" }}>{n}</p>
              <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF" }}>{label}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: "14px 48px", borderTop: "1px solid #E5E4DF",
        display: "flex", justifyContent: "space-between",
        position: "relative", zIndex: 1, background: "#FAFAF7",
      }}>
        <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF" }}>
          DATA STAYS IN YOUR BROWSER SESSION · NOTHING IS PERSISTED
        </span>
        <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF" }}>
          CLAUDE SONNET 4.6 · PANDAS · FASTAPI
        </span>
      </footer>
    </div>
  )
}
