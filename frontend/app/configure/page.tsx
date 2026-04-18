"use client"

export const dynamic = 'force-dynamic'

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import type { Audience, Emphasis, Length } from "@/lib/types"

function StepBar({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Upload", "Configure", "Brief"]
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {steps.map((label, i) => {
        const num = i + 1
        const active = num === current
        const done = num < current
        return (
          <div key={label} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: "22px", height: "22px", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "11px", fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  background: active || done ? "var(--accent)" : "var(--bg-surface-2)",
                  color: active || done ? "#fff" : "var(--text-tertiary)",
                  transition: "background 0.2s",
                }}
              >
                {done ? (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : num}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.1em",
                textTransform: "uppercase", fontWeight: 600,
                color: active ? "var(--text-primary)" : "var(--text-tertiary)",
              }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ width: "40px", height: "1px", margin: "0 12px", background: "var(--border-strong)" }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

const AUDIENCE_OPTIONS: {
  id: Audience
  label: string
  role: string
  arc: string
  bullets: string[]
}[] = [
  {
    id: "ciso",
    label: "CISO",
    role: "Chief Information Security Officer",
    arc: "Risk posture → protection → gaps → investment ask",
    bullets: [
      "Board-grade risk framing",
      "Budget and policy asks",
      "Benchmark context for executives",
      "Trend direction over the quarter",
    ],
  },
  {
    id: "csm",
    label: "CSM",
    role: "Customer Success Manager",
    arc: "Value realized → benchmark position → expansion → renewal",
    bullets: [
      "Value-realized story",
      "Peer benchmark position",
      "Expansion and renewal signals",
      "Forward-looking recommendations",
    ],
  },
]

const EMPHASIS_OPTIONS: { id: Emphasis; label: string; desc: string }[] = [
  { id: "risk", label: "Risk", desc: "Lead with gaps and threats" },
  { id: "balanced", label: "Balanced", desc: "Equal weight on wins and gaps" },
  { id: "value", label: "Value", desc: "Lead with protection wins" },
]

const LENGTH_OPTIONS: { id: Length; label: string; desc: string }[] = [
  { id: "short", label: "Short", desc: "3 sections · ~80 words each" },
  { id: "standard", label: "Standard", desc: "4 sections · ~120 words each" },
  { id: "full", label: "Full", desc: "5–6 sections · ~160 words each" },
]

function ConfigurePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id") ?? searchParams.get("session") ?? ""

  const [audience, setAudience] = useState<Audience>("ciso")
  const [emphasis, setEmphasis] = useState<Emphasis>("balanced")
  const [length, setLength] = useState<Length>("standard")

  const handleGenerate = () => {
    if (!sessionId) return
    const params = new URLSearchParams({ session_id: sessionId, audience, emphasis, length })
    router.push(`/generate?${params.toString()}`)
  }

  if (!sessionId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-page)" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "16px", letterSpacing: "0.06em" }}>
            No session found. Please upload data first.
          </p>
          <Link href="/ingest" style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--accent)", borderBottom: "1px solid var(--accent-dim)", paddingBottom: "1px", letterSpacing: "0.06em" }}>
            Go to upload
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-page)" }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 48px", background: "var(--bg-page)",
      }}>
        <Link
          href="/"
          style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 700, color: "var(--text-primary)" }}
        >
          Abnormal Security
        </Link>
        <StepBar current={2} />
        <div style={{ width: "160px" }} />
      </header>

      {/* Body */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 24px" }}>
        <div style={{ width: "100%", maxWidth: "680px", display: "flex", flexDirection: "column", gap: "40px" }}>

          {/* Heading */}
          <div>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "36px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", letterSpacing: "-0.02em" }}>
              Configure your brief
            </h1>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
              Same data, different story. The audience shapes the narrative arc, tone, and closing ask.
            </p>
          </div>

          {/* Audience selector */}
          <section>
            <h2 style={{
              fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em",
              textTransform: "uppercase", fontWeight: 700, color: "var(--text-tertiary)",
              marginBottom: "16px",
            }}>
              Who is reading this?
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {AUDIENCE_OPTIONS.map((opt) => {
                const selected = audience === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setAudience(opt.id)}
                    style={{
                      textAlign: "left",
                      borderRadius: "8px",
                      border: `1.5px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
                      padding: "20px",
                      background: selected ? "rgba(255,91,73,0.07)" : "var(--bg-surface)",
                      cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "12px" }}>
                      <div>
                        <span style={{
                          display: "inline-block",
                          fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700,
                          letterSpacing: "0.12em", textTransform: "uppercase",
                          padding: "2px 8px", borderRadius: "2px", marginBottom: "8px",
                          background: selected ? "var(--accent)" : "var(--bg-surface-2)",
                          color: selected ? "#fff" : "var(--text-secondary)",
                        }}>
                          {opt.label}
                        </span>
                        <p style={{ fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {opt.role}
                        </p>
                      </div>
                      <div style={{
                        width: "18px", height: "18px", borderRadius: "50%",
                        border: `2px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
                        background: selected ? "var(--accent)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, marginTop: "2px",
                        transition: "border-color 0.15s, background 0.15s",
                      }}>
                        {selected && <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff" }} />}
                      </div>
                    </div>

                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontStyle: "italic", color: "var(--text-tertiary)", marginBottom: "12px", letterSpacing: "0.04em" }}>
                      {opt.arc}
                    </p>

                    <ul style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {opt.bullets.map((b) => (
                        <li key={b} style={{ display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-sans)", fontSize: "12px", color: "var(--text-secondary)", listStyle: "none" }}>
                          <div style={{ width: "4px", height: "4px", borderRadius: "50%", flexShrink: 0, background: selected ? "var(--accent)" : "var(--text-tertiary)" }} />
                          {b}
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Emphasis */}
          <section>
            <h2 style={{
              fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em",
              textTransform: "uppercase", fontWeight: 700, color: "var(--text-tertiary)",
              marginBottom: "16px",
            }}>
              Narrative emphasis
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {EMPHASIS_OPTIONS.map((opt) => {
                const selected = emphasis === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setEmphasis(opt.id)}
                    style={{
                      borderRadius: "6px",
                      border: `1.5px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
                      padding: "14px 12px",
                      textAlign: "center",
                      background: selected ? "rgba(255,91,73,0.07)" : "var(--bg-surface)",
                      cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, marginBottom: "4px", color: selected ? "var(--accent)" : "var(--text-primary)" }}>
                      {opt.label}
                    </p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.04em" }}>
                      {opt.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Length */}
          <section>
            <h2 style={{
              fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em",
              textTransform: "uppercase", fontWeight: 700, color: "var(--text-tertiary)",
              marginBottom: "16px",
            }}>
              Brief length
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {LENGTH_OPTIONS.map((opt) => {
                const selected = length === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setLength(opt.id)}
                    style={{
                      borderRadius: "6px",
                      border: `1.5px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
                      padding: "14px 12px",
                      textAlign: "center",
                      background: selected ? "rgba(255,91,73,0.07)" : "var(--bg-surface)",
                      cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, marginBottom: "4px", color: selected ? "var(--accent)" : "var(--text-primary)" }}>
                      {opt.label}
                    </p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.04em" }}>
                      {opt.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          <div style={{ height: "1px", background: "var(--border-subtle)" }} />

          {/* Summary + CTA */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                {audience === "ciso" ? "CISO brief" : "CSM QBR brief"} &middot; {emphasis.charAt(0).toUpperCase() + emphasis.slice(1)} &middot; {length.charAt(0).toUpperCase() + length.slice(1)}
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)", marginTop: "4px", letterSpacing: "0.06em" }}>
                6-stage AI pipeline &middot; ~75 seconds
              </p>
            </div>
            <button
              onClick={handleGenerate}
              style={{
                display: "inline-flex", alignItems: "center", gap: "8px",
                padding: "12px 28px", borderRadius: "4px",
                fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600,
                background: "var(--accent)", color: "#fff", cursor: "pointer",
                border: "none", transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
            >
              Generate brief
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

        </div>
      </main>
    </div>
  )
}

export default function ConfigurePage() {
  return (
    <Suspense>
      <ConfigurePageInner />
    </Suspense>
  )
}
