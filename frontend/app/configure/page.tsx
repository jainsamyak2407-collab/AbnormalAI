"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import type { Audience, Emphasis, Length } from "@/lib/types"

function StepBar({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Upload", "Configure", "Brief"]
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const num = i + 1
        const active = num === current
        const done = num < current
        return (
          <div key={label} className="flex items-center">
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors"
                style={{
                  background: active ? "#4C566A" : done ? "#4C566A" : "#E5E4DF",
                  color: active || done ? "#FAFAF7" : "#9CA3AF",
                }}
              >
                {done ? (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l2.5 2.5L9 1" stroke="#FAFAF7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : num}
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: active ? "#1A1A1A" : "#9CA3AF" }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-12 h-px mx-3" style={{ background: "#E5E4DF" }} />
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

export default function ConfigurePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id") ?? ""

  const [audience, setAudience] = useState<Audience>("ciso")
  const [emphasis, setEmphasis] = useState<Emphasis>("balanced")
  const [length, setLength] = useState<Length>("standard")

  const handleGenerate = () => {
    if (!sessionId) return
    const params = new URLSearchParams({
      session_id: sessionId,
      audience,
      emphasis,
      length,
    })
    router.push(`/generate?${params.toString()}`)
  }

  if (!sessionId) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAFAF7" }}>
        <div className="text-center">
          <p className="text-sm font-sans mb-4" style={{ color: "#6B7280" }}>
            No session found. Please upload data first.
          </p>
          <Link
            href="/ingest"
            className="text-sm font-sans underline"
            style={{ color: "#4C566A" }}
          >
            Go to upload
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FAFAF7" }}>
      {/* Header */}
      <header className="border-b flex items-center justify-between px-8 py-4" style={{ borderColor: "#E5E4DF" }}>
        <Link href="/" className="text-xs tracking-widest uppercase font-sans font-medium" style={{ color: "#4C566A", letterSpacing: "0.18em" }}>
          Abnormal Security
        </Link>
        <StepBar current={2} />
        <div className="w-36" />
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center px-6 py-16">
        <div className="w-full max-w-2xl flex flex-col gap-10">

          {/* Heading */}
          <div>
            <h1 className="font-serif text-4xl mb-2" style={{ color: "#1A1A1A" }}>
              Configure your brief
            </h1>
            <p className="text-sm font-sans" style={{ color: "#6B7280" }}>
              Same data, different story. The audience shapes the narrative arc, tone, and closing ask.
            </p>
          </div>

          {/* Audience selector */}
          <section>
            <h2 className="text-xs font-sans uppercase tracking-wide font-semibold mb-4" style={{ color: "#9CA3AF", letterSpacing: "0.1em" }}>
              Who is reading this?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {AUDIENCE_OPTIONS.map((opt) => {
                const selected = audience === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setAudience(opt.id)}
                    className="text-left rounded-xl border-2 p-6 transition-all hover:shadow-sm"
                    style={{
                      borderColor: selected ? "#4C566A" : "#E5E4DF",
                      background: selected ? "#F0EFE9" : "#FFFFFF",
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span
                          className="inline-block text-xs font-sans font-semibold tracking-widest uppercase px-2 py-0.5 rounded mb-2"
                          style={{
                            background: selected ? "#4C566A" : "#F0EFE9",
                            color: selected ? "#FAFAF7" : "#4C566A",
                            letterSpacing: "0.12em",
                          }}
                        >
                          {opt.label}
                        </span>
                        <p className="text-sm font-sans font-medium" style={{ color: "#1A1A1A" }}>
                          {opt.role}
                        </p>
                      </div>
                      <div
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1"
                        style={{
                          borderColor: selected ? "#4C566A" : "#D1CFC6",
                          background: selected ? "#4C566A" : "transparent",
                        }}
                      >
                        {selected && (
                          <div className="w-2 h-2 rounded-full" style={{ background: "#FAFAF7" }} />
                        )}
                      </div>
                    </div>

                    <p className="text-xs font-sans italic mb-3" style={{ color: "#9CA3AF" }}>
                      {opt.arc}
                    </p>

                    <ul className="flex flex-col gap-1.5">
                      {opt.bullets.map((b) => (
                        <li key={b} className="flex items-center gap-2 text-xs font-sans" style={{ color: "#4B5563" }}>
                          <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: "#4C566A" }} />
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
            <h2 className="text-xs font-sans uppercase tracking-wide font-semibold mb-4" style={{ color: "#9CA3AF", letterSpacing: "0.1em" }}>
              Narrative emphasis
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {EMPHASIS_OPTIONS.map((opt) => {
                const selected = emphasis === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setEmphasis(opt.id)}
                    className="rounded-lg border-2 p-4 text-center transition-all hover:shadow-sm"
                    style={{
                      borderColor: selected ? "#4C566A" : "#E5E4DF",
                      background: selected ? "#F0EFE9" : "#FFFFFF",
                    }}
                  >
                    <p className="text-sm font-sans font-semibold mb-1" style={{ color: selected ? "#4C566A" : "#1A1A1A" }}>
                      {opt.label}
                    </p>
                    <p className="text-xs font-sans" style={{ color: "#9CA3AF" }}>
                      {opt.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Length */}
          <section>
            <h2 className="text-xs font-sans uppercase tracking-wide font-semibold mb-4" style={{ color: "#9CA3AF", letterSpacing: "0.1em" }}>
              Brief length
            </h2>
            <div className="grid grid-cols-3 gap-3">
              {LENGTH_OPTIONS.map((opt) => {
                const selected = length === opt.id
                return (
                  <button
                    key={opt.id}
                    onClick={() => setLength(opt.id)}
                    className="rounded-lg border-2 p-4 text-center transition-all hover:shadow-sm"
                    style={{
                      borderColor: selected ? "#4C566A" : "#E5E4DF",
                      background: selected ? "#F0EFE9" : "#FFFFFF",
                    }}
                  >
                    <p className="text-sm font-sans font-semibold mb-1" style={{ color: selected ? "#4C566A" : "#1A1A1A" }}>
                      {opt.label}
                    </p>
                    <p className="text-xs font-sans" style={{ color: "#9CA3AF" }}>
                      {opt.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>

          <hr className="rule" />

          {/* Summary + CTA */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-sans font-medium" style={{ color: "#1A1A1A" }}>
                {audience === "ciso" ? "CISO brief" : "CSM QBR brief"} &middot; {emphasis.charAt(0).toUpperCase() + emphasis.slice(1)} &middot; {length.charAt(0).toUpperCase() + length.slice(1)}
              </p>
              <p className="text-xs font-sans mt-0.5" style={{ color: "#9CA3AF" }}>
                5-stage AI pipeline &middot; ~60 seconds
              </p>
            </div>
            <button
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 px-7 py-3 rounded text-sm font-medium font-sans transition-opacity hover:opacity-90"
              style={{ background: "#4C566A", color: "#FAFAF7" }}
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
