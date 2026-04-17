"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { ingestSample } from "@/lib/api"

export default function LandingPage() {
  const router = useRouter()
  const prefersReduced = useReducedMotion()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleUseSample = async () => {
    setLoading(true)
    setErr(null)
    try {
      const { session_id } = await ingestSample()
      router.push(`/configure?session_id=${session_id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load sample.")
      setLoading(false)
    }
  }

  const stagger = prefersReduced ? 0 : 0.08
  const dur = prefersReduced ? 0 : 0.55

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

      {/* Subtle grid texture */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0)",
        backgroundSize: "28px 28px",
      }} />

      {/* Coral glow — top right */}
      <div style={{
        position: "fixed", top: "-200px", right: "-200px",
        width: "600px", height: "600px",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,91,73,0.07) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 48px", borderBottom: "1px solid var(--border-subtle)",
        position: "relative", zIndex: 1, background: "var(--bg-page)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-primary)" }}>
            ABNORMAL SECURITY
          </span>
          <span style={{ width: "1px", height: "14px", background: "var(--border-strong)" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
            BRIEF STUDIO
          </span>
        </div>
        <Link
          href="/ingest"
          style={{
            fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em",
            textTransform: "uppercase", color: "var(--accent)",
            borderBottom: "1px solid var(--accent-dim)",
            paddingBottom: "1px",
          }}
        >
          UPLOAD DATA
        </Link>
      </header>

      {/* Body */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "72px 48px", maxWidth: "1040px", margin: "0 auto", width: "100%",
        position: "relative", zIndex: 1,
      }}>

        {/* Classification bar */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur, delay: stagger }}
          style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "52px" }}
        >
          <div style={{ flex: 1, height: "1px", background: "var(--border-strong)" }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700,
            letterSpacing: "0.28em", textTransform: "uppercase",
            color: "var(--text-tertiary)",
            padding: "5px 14px", border: "1px solid var(--border-strong)",
          }}>
            SECURITY INTELLIGENCE · AI-NATIVE
          </span>
          <div style={{ flex: 1, height: "1px", background: "var(--border-strong)" }} />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur, delay: stagger * 2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(52px, 8.5vw, 100px)",
            fontWeight: 700,
            lineHeight: 0.94,
            letterSpacing: "-0.025em",
            color: "var(--text-primary)",
            marginBottom: "40px",
          }}
        >
          Turn Abnormal<br />
          data into a{" "}
          <em style={{ color: "var(--accent)", fontStyle: "italic" }}>board-grade</em><br />
          brief.
        </motion.h1>

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: dur, delay: stagger * 5 }}
          style={{
            fontFamily: "var(--font-serif)", fontSize: "19px", lineHeight: 1.65,
            color: "var(--text-secondary)", maxWidth: "500px", marginBottom: "56px",
          }}
        >
          AI-native reporting for CISOs and CSMs. Every claim grounded in evidence.
          Upload your data, pick your audience, get a consulting-grade brief in under three minutes.
        </motion.p>

        {/* Two-path cards */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: dur, delay: stagger * 6, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginBottom: "64px" }}
        >
          {/* Card 1: Use Meridian sample */}
          <motion.button
            onClick={handleUseSample}
            disabled={loading}
            whileHover={prefersReduced ? {} : { y: -3, transition: { duration: 0.18 } }}
            style={{
              textAlign: "left", padding: "28px 24px",
              background: loading ? "var(--bg-surface)" : "var(--accent)",
              border: `1px solid ${loading ? "var(--border-subtle)" : "var(--accent)"}`,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              display: "flex", flexDirection: "column", gap: "12px",
              borderRadius: "4px",
              transition: "background 0.2s, border-color 0.2s",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {loading ? (
                <div style={{
                  width: "8px", height: "8px",
                  border: "1.5px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  flexShrink: 0,
                }} />
              ) : (
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "rgba(255,255,255,0.7)", display: "inline-block", flexShrink: 0 }} />
              )}
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>
                SAMPLE DATA
              </span>
            </span>
            <span style={{ fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>
              Use Meridian<br />sample
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "rgba(255,255,255,0.55)", letterSpacing: "0.06em", lineHeight: 1.5 }}>
              Meridian Healthcare · Q1 2026 · pre-loaded
            </span>
          </motion.button>

          {/* Card 2: Upload new data */}
          <Link href="/ingest" style={{ textDecoration: "none" }}>
            <motion.div
              whileHover={prefersReduced ? {} : { y: -3, transition: { duration: 0.18 } }}
              style={{
                padding: "28px 24px",
                border: "1px solid var(--border-strong)",
                cursor: "pointer",
                display: "flex", flexDirection: "column", gap: "12px",
                height: "100%", borderRadius: "4px",
                background: "var(--bg-surface)",
                transition: "border-color 0.2s",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-secondary)" }}>
                YOUR DATA
              </span>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
                Upload new<br />dataset
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.06em", lineHeight: 1.5 }}>
                Drop CSVs + account.json<br />to generate a brief from your data
              </span>
            </motion.div>
          </Link>
        </motion.div>

        {err && (
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--danger)", marginBottom: "16px" }}>
            {err}
          </p>
        )}

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: dur, delay: stagger * 8 }}
          style={{ display: "flex", borderTop: "1px solid var(--border-subtle)", borderLeft: "1px solid var(--border-subtle)" }}
        >
          {[
            { n: "6", label: "AI STAGES" },
            { n: "2", label: "AUDIENCE MODES" },
            { n: "~60s", label: "GENERATION TIME" },
            { n: "0", label: "DATA RETAINED" },
          ].map(({ n, label }) => (
            <div key={label} style={{
              flex: 1, padding: "20px 24px",
              borderRight: "1px solid var(--border-subtle)",
              borderBottom: "1px solid var(--border-subtle)",
            }}>
              <p style={{ fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1, marginBottom: "6px" }}>{n}</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>{label}</p>
            </div>
          ))}
        </motion.div>
      </main>

      <footer style={{
        padding: "14px 48px",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex", justifyContent: "space-between",
        position: "relative", zIndex: 1, background: "var(--bg-page)",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          DATA STAYS IN YOUR BROWSER SESSION · NOTHING IS PERSISTED
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          CLAUDE SONNET 4.6 · PANDAS · FASTAPI
        </span>
      </footer>

    </div>
  )
}
