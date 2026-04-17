"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

type StageStatus = "pending" | "running" | "done"

const STAGES = [
  { num: 1, label: "DATA INTERPRETER", sub: "Reading computed metrics and evidence index" },
  { num: 2, label: "NARRATIVE ARCHITECT", sub: "Structuring thesis, pillars, and section order" },
  { num: 3, label: "SECTION WRITER", sub: "Drafting each section with evidence references" },
  { num: 4, label: "RECOMMENDATION REASONER", sub: "Deriving actions from identified gaps" },
  { num: 5, label: "EVIDENCE AUDITOR", sub: "Verifying all evidence references resolve" },
]

export default function GeneratePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get("session_id") ?? ""
  const audience = searchParams.get("audience") ?? "ciso"
  const emphasis = searchParams.get("emphasis") ?? "balanced"
  const length = searchParams.get("length") ?? "standard"

  const [stages, setStages] = useState<Record<number, StageStatus>>({ 1: "pending", 2: "pending", 3: "pending", 4: "pending", 5: "pending" })
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    const controller = new AbortController()

    async function run() {
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, audience, emphasis, length }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || "Generation failed.")
        }
        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body.")
        const decoder = new TextDecoder()
        let buffer = ""
        while (true) {
          const { done: streamDone, value } = await reader.read()
          if (streamDone) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const raw = line.slice(6).trim()
            if (!raw) continue
            let event: Record<string, unknown>
            try { event = JSON.parse(raw) } catch { continue }
            const type = event.type as string
            if (type === "stage_start") {
              setStages((prev) => ({ ...prev, [event.stage as number]: "running" }))
            } else if (type === "stage_complete") {
              const s = event.stage as number
              setStages((prev) => ({ ...prev, [s]: "done" }))
              setProgress((s / 5) * 100)
            } else if (type === "done") {
              setProgress(100); setDone(true)
              setTimeout(() => router.push(`/brief/${event.brief_id as string}`), 800)
            } else if (type === "error") {
              throw new Error((event.message as string) || "Generation failed.")
            }
          }
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Something went wrong.")
        }
      }
    }

    run()
    return () => { controller.abort() }
  }, [sessionId, audience, emphasis, length, router])

  const doneCount = Object.values(stages).filter((s) => s === "done").length
  const runningStage = STAGES.find((s) => stages[s.num] === "running")

  if (!sessionId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "16px" }}>NO SESSION FOUND</p>
          <Link href="/ingest" style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", borderBottom: "1px solid var(--accent-dim)", paddingBottom: "1px" }}>
            START OVER
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", flexDirection: "column" }}>

      {/* Progress bar */}
      <div style={{ height: "3px", background: "var(--border-subtle)", position: "fixed", top: 0, left: 0, right: 0, zIndex: 50 }}>
        <div style={{
          height: "100%", background: "var(--accent)",
          width: `${progress}%`,
          transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)",
          boxShadow: `0 0 12px var(--accent)`,
        }} />
      </div>

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 48px", borderBottom: "1px solid var(--border-subtle)",
        marginTop: "3px", background: "var(--bg-page)",
      }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-primary)" }}>
          ABNORMAL SECURITY
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
          {audience.toUpperCase()} · {emphasis.toUpperCase()} · {length.toUpperCase()}
        </span>
      </header>

      {/* Main */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 48px" }}>
        <div style={{ width: "100%", maxWidth: "560px" }}>

          {error ? (
            <div style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)", padding: "24px", borderRadius: "6px" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--danger)", marginBottom: "12px" }}>
                PIPELINE ERROR
              </p>
              <p style={{ fontFamily: "var(--font-serif)", fontSize: "15px", color: "var(--text-primary)", marginBottom: "16px", lineHeight: 1.5 }}>{error}</p>
              <Link href={`/configure?session_id=${sessionId}`} style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", borderBottom: "1px solid var(--accent-dim)", paddingBottom: "1px" }}>
                BACK TO CONFIGURE
              </Link>
            </div>
          ) : (
            <>
              {/* Status headline */}
              <div style={{ marginBottom: "48px" }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "12px" }}>
                  {done ? "COMPLETE" : "PIPELINE RUNNING"} · STAGE {doneCount}/{STAGES.length}
                </p>
                <h1 style={{
                  fontFamily: "var(--font-serif)",
                  fontSize: "36px", fontWeight: 700, lineHeight: 1.15,
                  color: "var(--text-primary)", marginBottom: "8px", letterSpacing: "-0.02em",
                }}>
                  {done ? "Brief ready." : runningStage ? runningStage.label.charAt(0) + runningStage.label.slice(1).toLowerCase() + "…" : "Initialising pipeline…"}
                </h1>
                {!done && (
                  <p style={{ fontFamily: "var(--font-serif)", fontSize: "15px", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                    {runningStage?.sub ?? "Connecting to pipeline…"}
                  </p>
                )}
              </div>

              {/* Stage list */}
              <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {STAGES.map((stage) => {
                  const status = stages[stage.num]
                  return (
                    <div key={stage.num} style={{
                      display: "flex", alignItems: "center", gap: "20px",
                      padding: "16px 0", borderBottom: "1px solid var(--border-subtle)",
                      opacity: status === "pending" ? 0.35 : 1,
                      transition: "opacity 0.4s ease",
                    }}>
                      <div style={{ width: "28px", flexShrink: 0, display: "flex", justifyContent: "center" }}>
                        {status === "done" && (
                          <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
                            <path d="M1.5 6.5l3.5 4L12.5 1" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {status === "running" && (
                          <div style={{ width: "10px", height: "10px", borderRadius: "50%", border: "2px solid var(--border-strong)", borderTopColor: "var(--accent)", animation: "spin 0.8s linear infinite" }} />
                        )}
                        {status === "pending" && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>{stage.num}</span>
                        )}
                      </div>

                      <div style={{ flex: 1 }}>
                        <p style={{
                          fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700,
                          letterSpacing: "0.14em", textTransform: "uppercase",
                          color: status === "done" ? "var(--success)" : status === "running" ? "var(--text-primary)" : "var(--text-tertiary)",
                          marginBottom: "2px",
                        }}>
                          {stage.label}
                        </p>
                        {status === "running" && (
                          <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.08em", color: "var(--text-tertiary)" }}>
                            {stage.sub}
                          </p>
                        )}
                      </div>

                      {status === "done" && (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--success)" }}>
                          DONE
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              {!done && (
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", marginTop: "20px", textAlign: "center" }}>
                  TYPICALLY COMPLETES IN UNDER 60 SECONDS
                </p>
              )}
            </>
          )}
        </div>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
