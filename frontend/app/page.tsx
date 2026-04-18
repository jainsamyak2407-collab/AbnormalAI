"use client"

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion"
import { ingestSample } from "@/lib/api"

/* ─── Abnormal logo mark ─────────────────────────────────────────────── */
function AbnormalLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size * 3.6} height={size} viewBox="0 0 90 22" fill="none">
      <path d="M4 18 L11 4 L18 18" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6.5 13.5 H15.5" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      <text x="24" y="17" fill="white" fontFamily="inherit" fontSize="15" fontWeight="800" letterSpacing="-0.02em">bnormal</text>
    </svg>
  )
}

/* ─── 3D tilt card hook ──────────────────────────────────────────────── */
function use3DTilt() {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-0.5, 0.5], [6, -6])
  const rotateY = useTransform(x, [-0.5, 0.5], [-6, 6])
  const sRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 })
  const sRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 })

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const { left, top, width, height } = el.getBoundingClientRect()
    x.set((e.clientX - left) / width - 0.5)
    y.set((e.clientY - top) / height - 0.5)
  }
  const onMouseLeave = () => { x.set(0); y.set(0) }

  return { ref, onMouseMove, onMouseLeave, rotateX: sRotateX, rotateY: sRotateY }
}

/* ─── Stats item ─────────────────────────────────────────────────────── */
function StatItem({ n, label, delay }: { n: string; label: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{
        flex: 1, padding: "22px 28px",
        borderRight: "1px solid var(--border-strong)",
        borderBottom: "1px solid var(--border-strong)",
      }}
    >
      <p style={{
        fontFamily: "var(--font-sans)", fontSize: "32px", fontWeight: 800,
        color: "var(--accent)", lineHeight: 1, marginBottom: "6px",
        letterSpacing: "-0.02em",
      }}>{n}</p>
      <p style={{
        fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.18em",
        textTransform: "uppercase", color: "var(--text-tertiary)",
      }}>{label}</p>
    </motion.div>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const tilt1 = use3DTilt()
  const tilt2 = use3DTilt()

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

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg-page)",
      display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden",
    }}>

      {/* ── Animated background orbs ── */}
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        {/* Teal orb top-right */}
        <div style={{
          position: "absolute", top: "-10%", right: "-5%",
          width: "55vw", height: "55vw", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,196,180,0.12) 0%, transparent 65%)",
          animation: "float-slow 12s ease-in-out infinite",
        }} />
        {/* Yellow-green orb bottom-left */}
        <div style={{
          position: "absolute", bottom: "-15%", left: "-10%",
          width: "50vw", height: "50vw", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(200,241,53,0.07) 0%, transparent 65%)",
          animation: "float-medium 16s ease-in-out infinite",
        }} />
        {/* Subtle dot grid */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.025) 1px, transparent 0)",
          backgroundSize: "32px 32px",
        }} />
      </div>

      {/* ── Header ── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 48px", height: "64px",
          borderBottom: "1px solid var(--border-subtle)",
          position: "relative", zIndex: 10,
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(12px)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <AbnormalLogo size={20} />
          <div style={{ width: "1px", height: "16px", background: "var(--border-strong)" }} />
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 600,
            letterSpacing: "0.2em", textTransform: "uppercase",
            color: "var(--accent)",
          }}>
            Brief Studio
          </span>
        </div>

        {/* Nav right */}
        <Link
          href="/ingest"
          style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "8px 20px", borderRadius: "4px",
            background: "var(--accent)", color: "#000",
            fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700,
            transition: "background 0.2s, transform 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--accent-hover)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)" }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--accent)"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)" }}
        >
          Upload Data
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8M7 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </motion.header>

      {/* ── Hero ── */}
      <main style={{
        flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "80px 48px 64px", maxWidth: "1080px", margin: "0 auto", width: "100%",
        position: "relative", zIndex: 1,
      }}>

        {/* Classification pill */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{ marginBottom: "40px", display: "flex", alignItems: "center", gap: "12px" }}
        >
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "5px 14px",
            border: "1px solid var(--accent-dim)",
            borderRadius: "999px",
            background: "var(--accent-bg)",
            fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700,
            letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--accent)",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent)", display: "inline-block", animation: "pulse-teal 2.5s ease-in-out infinite" }} />
            AI-Native Security Intelligence
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "clamp(48px, 7.5vw, 92px)",
            fontWeight: 800,
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            color: "var(--text-primary)",
            marginBottom: "32px",
          }}
        >
          Turn Abnormal<br />
          data into a{" "}
          <span style={{
            color: "var(--accent)",
            position: "relative", display: "inline-block",
          }}>
            board-grade
          </span>
          <br />brief.
        </motion.h1>

        {/* Subhead */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{
            fontFamily: "var(--font-sans)", fontSize: "17px", fontWeight: 400,
            lineHeight: 1.65, color: "var(--text-secondary)",
            maxWidth: "520px", marginBottom: "56px",
          }}
        >
          AI-native reporting for CISOs and CSMs. Every claim grounded in evidence.
          Upload your data, pick your audience, get a consulting-grade brief in under three minutes.
        </motion.p>

        {/* Action cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.38, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "60px", maxWidth: "680px" }}
        >
          {/* Card 1 — Meridian sample */}
          <motion.div
            ref={tilt1.ref}
            onMouseMove={tilt1.onMouseMove}
            onMouseLeave={tilt1.onMouseLeave}
            style={{ rotateX: tilt1.rotateX, rotateY: tilt1.rotateY, transformStyle: "preserve-3d", perspective: 1000 }}
          >
            <button
              onClick={handleUseSample}
              disabled={loading}
              style={{
                width: "100%", textAlign: "left", padding: "28px 24px",
                background: loading ? "var(--bg-surface-2)" : "var(--accent)",
                border: "none", borderRadius: "6px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                display: "flex", flexDirection: "column", gap: "14px",
                transition: "box-shadow 0.2s",
                boxShadow: "0 4px 24px rgba(0,196,180,0.25)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {loading ? (
                  <div style={{
                    width: "8px", height: "8px",
                    border: "1.5px solid rgba(0,0,0,0.25)",
                    borderTopColor: "#000", borderRadius: "50%",
                    animation: "spin 0.8s linear infinite", flexShrink: 0,
                  }} />
                ) : (
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "rgba(0,0,0,0.4)", display: "inline-block" }} />
                )}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(0,0,0,0.6)" }}>
                  SAMPLE DATA
                </span>
              </span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: "21px", fontWeight: 800, color: "#000", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                Use Meridian<br />sample
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "rgba(0,0,0,0.55)", letterSpacing: "0.05em", lineHeight: 1.5 }}>
                Meridian Healthcare · Q1 2026 · pre-loaded
              </span>
            </button>
          </motion.div>

          {/* Card 2 — Upload data */}
          <motion.div
            ref={tilt2.ref}
            onMouseMove={tilt2.onMouseMove}
            onMouseLeave={tilt2.onMouseLeave}
            style={{ rotateX: tilt2.rotateX, rotateY: tilt2.rotateY, transformStyle: "preserve-3d", perspective: 1000 }}
          >
            <Link href="/ingest" style={{ display: "block", height: "100%" }}>
              <div style={{
                padding: "28px 24px", height: "100%",
                border: "1px solid var(--border-strong)",
                borderRadius: "6px", cursor: "pointer",
                display: "flex", flexDirection: "column", gap: "14px",
                background: "var(--bg-surface)",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-dim)"
                  ;(e.currentTarget as HTMLElement).style.boxShadow = "0 4px 24px rgba(0,196,180,0.12)"
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border-strong)"
                  ;(e.currentTarget as HTMLElement).style.boxShadow = "none"
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
                  YOUR DATA
                </span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: "21px", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                  Upload new<br />dataset
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.05em", lineHeight: 1.5 }}>
                  Drop CSVs + account.json<br />to generate a brief from your data
                </span>
              </div>
            </Link>
          </motion.div>
        </motion.div>

        {err && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--danger)", marginBottom: "16px" }}
          >
            {err}
          </motion.p>
        )}

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.55 }}
          style={{
            display: "flex",
            borderTop: "1px solid var(--border-strong)",
            borderLeft: "1px solid var(--border-strong)",
            maxWidth: "680px",
          }}
        >
          {[
            { n: "6", label: "AI STAGES", delay: 0.6 },
            { n: "2", label: "AUDIENCE MODES", delay: 0.65 },
            { n: "~60s", label: "GENERATION TIME", delay: 0.7 },
            { n: "0", label: "DATA RETAINED", delay: 0.75 },
          ].map(({ n, label, delay }) => (
            <StatItem key={label} n={n} label={label} delay={delay} />
          ))}
        </motion.div>
      </main>

      {/* ── Footer ── */}
      <footer style={{
        padding: "14px 48px",
        borderTop: "1px solid var(--border-subtle)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        position: "relative", zIndex: 1,
        background: "rgba(0,0,0,0.8)",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          DATA STAYS IN YOUR BROWSER SESSION · NOTHING IS PERSISTED
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <AbnormalLogo size={12} />
        </div>
      </footer>

    </div>
  )
}
