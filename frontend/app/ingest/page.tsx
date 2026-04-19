"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ingestFiles, ingestSample } from "@/lib/api"
import type { IngestResponse } from "@/lib/types"

const SCHEMA_LABELS: Record<string, string> = {
  threat_log: "Threat Log",
  posture_checks: "Posture Checks",
  remediation_log: "Remediation Log",
  user_reporting: "User Reporting",
  ato_events: "ATO Events",
  industry_benchmarks: "Benchmarks",
  account_json: "Account",
}

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
                  background: active || done ? "var(--paper-accent)" : "var(--paper-border)",
                  color: active || done ? "var(--paper-bg)" : "var(--paper-muted)",
                }}
              >
                {done ? (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l2.5 2.5L9 1" stroke="var(--paper-bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : num}
              </span>
              <span
                className="text-xs font-medium"
                style={{ color: active ? "var(--paper-text)" : "var(--paper-muted)" }}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="w-12 h-px mx-3" style={{ background: "var(--paper-border)" }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function IngestPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isSample = searchParams.get("sample") === "true"

  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [result, setResult] = useState<IngestResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const runIngest = useCallback(async (fileList?: File[]) => {
    setStatus("loading")
    setError(null)
    try {
      const data = fileList
        ? await ingestFiles(fileList)
        : await ingestSample()
      setResult(data)
      setStatus("done")
    } catch (e) {
      setStatus("error")
      setError(e instanceof Error ? e.message : "Upload failed.")
    }
  }, [])

  // Auto-load sample when ?sample=true
  useEffect(() => {
    if (isSample) runIngest()
  }, [isSample, runIngest])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    dragCounter.current = 0
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".csv") || f.name.endsWith(".json")
    )
    if (dropped.length) {
      setFiles(dropped)
      runIngest(dropped)
    }
  }, [runIngest])

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    setDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragging(false)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    if (picked.length) {
      setFiles(picked)
      runIngest(picked)
    }
  }

  const handleContinue = () => {
    if (result?.session_id) {
      router.push(`/configure?session_id=${result.session_id}`)
    }
  }

  const detectedSchemas = result?.detected_schemas.filter((s) => s !== "account_json") ?? []

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--paper-bg)" }}>
      {/* Header */}
      <header className="border-b flex items-center justify-between px-8 py-4" style={{ borderColor: "var(--paper-border)" }}>
        <Link href="/" className="text-xs tracking-widest uppercase font-sans font-medium" style={{ color: "var(--paper-accent)", letterSpacing: "0.18em" }}>
          Abnormal Security
        </Link>
        <StepBar current={1} />
        <div className="w-36" />
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-2xl">
          {/* Heading */}
          <div className="mb-10 text-center">
            <h1 className="font-serif text-4xl mb-3" style={{ color: "var(--paper-text)" }}>
              {isSample ? "Loading sample data" : "Upload your data"}
            </h1>
            <p className="text-sm font-sans" style={{ color: "var(--paper-muted)" }}>
              {isSample
                ? "Loading the Meridian Healthcare Q1 2026 dataset."
                : "Drop your CSV exports and account.json. Schema is detected automatically."}
            </p>
          </div>

          {/* Loading state */}
          {status === "loading" && (
            <div className="flex flex-col items-center gap-6 py-16">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--paper-border)", borderTopColor: "var(--paper-accent)" }} />
              </div>
              <p className="text-sm font-sans" style={{ color: "var(--paper-muted)" }}>
                {isSample ? "Loading Meridian sample and computing analytics..." : "Detecting schemas and computing analytics..."}
              </p>
            </div>
          )}

          {/* Done state */}
          {status === "done" && result && (
            <div
              className="rounded-lg border p-8 flex flex-col gap-6"
              style={{ borderColor: "var(--paper-border)", background: "#fff" }}
            >
              {/* Success mark */}
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "#E6F4EA" }}
                >
                  <svg width="14" height="12" viewBox="0 0 14 12" fill="none">
                    <path d="M1.5 6l3.5 3.5L12.5 1.5" stroke="#2D6A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium font-sans" style={{ color: "var(--paper-text)" }}>
                    Data loaded
                  </p>
                  {result.period_detected && (
                    <p className="text-xs font-sans mt-0.5" style={{ color: "var(--paper-muted)" }}>
                      Period detected: {result.period_detected}
                    </p>
                  )}
                </div>
              </div>

              {/* Detected schemas */}
              <div>
                <p className="text-xs font-sans uppercase tracking-wide mb-3 font-medium" style={{ color: "var(--paper-muted)", letterSpacing: "0.08em" }}>
                  Detected data sources
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.detected_schemas.filter(s => s !== "account_json").map((schema) => (
                    <span key={schema} className="chip-schema">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <circle cx="4" cy="4" r="3.5" fill="#2D6A4F" />
                      </svg>
                      {SCHEMA_LABELS[schema] ?? schema}
                    </span>
                  ))}
                  {result.detected_schemas.includes("account_json") && (
                    <span className="chip-schema">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <circle cx="4" cy="4" r="3.5" fill="#2D6A4F" />
                      </svg>
                      Account
                    </span>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="rounded p-3" style={{ background: "#FDFBE8", border: "1px solid #F0E9CC" }}>
                  <p className="text-xs font-sans font-medium mb-1" style={{ color: "#7A6B3A" }}>
                    {result.warnings.length} schema {result.warnings.length === 1 ? "note" : "notes"}
                  </p>
                  <p className="text-xs font-sans" style={{ color: "var(--paper-muted)" }}>
                    Extra columns ignored. All required fields present.
                  </p>
                </div>
              )}

              <hr className="rule" />

              {/* Continue CTA */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-sans" style={{ color: "var(--paper-muted)" }}>
                  Ready to configure your brief
                </p>
                <button
                  onClick={handleContinue}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded text-sm font-medium font-sans transition-opacity hover:opacity-90"
                  style={{ background: "var(--paper-accent)", color: "var(--paper-bg)" }}
                >
                  Configure audience
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7h9M8 3.5l3.5 3.5L8 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="rounded-lg border p-6 text-center" style={{ borderColor: "#F5C6C2", background: "#FDF4F4" }}>
              <p className="text-sm font-sans font-medium mb-1" style={{ color: "#C0392B" }}>
                {error ?? "Something went wrong."}
              </p>
              <button
                onClick={() => { setStatus("idle"); setError(null) }}
                className="text-xs font-sans underline mt-2"
                style={{ color: "var(--paper-muted)" }}
              >
                Try again
              </button>
            </div>
          )}

          {/* Idle drop zone */}
          {status === "idle" && !isSample && (
            <>
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer rounded-xl border-2 border-dashed p-12 flex flex-col items-center gap-4 transition-colors"
                style={{
                  borderColor: dragging ? "var(--paper-accent)" : "var(--paper-border)",
                  background: dragging ? "var(--paper-bg)" : "#fff",
                }}
              >
                {/* Upload icon */}
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "var(--paper-border)" }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <path d="M11 14V4M7 8l4-4 4 4" stroke="var(--paper-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3 16v1a2 2 0 002 2h12a2 2 0 002-2v-1" stroke="var(--paper-accent)" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium font-sans" style={{ color: "var(--paper-text)" }}>
                    Drop CSV files and account.json here
                  </p>
                  <p className="text-xs font-sans mt-1" style={{ color: "var(--paper-muted)" }}>
                    Or click to browse &mdash; threat_log.csv, posture_checks.csv, etc.
                  </p>
                </div>
                {files.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {files.map((f) => (
                      <span key={f.name} className="text-xs font-sans px-3 py-1 rounded-full" style={{ background: "var(--paper-border)", color: "var(--paper-accent)" }}>
                        {f.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,.json"
                className="hidden"
                onChange={handleFileInput}
              />

              {/* Divider */}
              <div className="flex items-center gap-4 my-6">
                <hr className="flex-1 rule" />
                <span className="text-xs font-sans" style={{ color: "var(--paper-muted)" }}>or</span>
                <hr className="flex-1 rule" />
              </div>

              {/* Sample shortcut */}
              <div className="rounded-xl border p-6 flex items-center justify-between" style={{ borderColor: "var(--paper-border)", background: "#fff" }}>
                <div>
                  <p className="text-sm font-medium font-sans" style={{ color: "var(--paper-text)" }}>
                    Load Meridian Healthcare sample
                  </p>
                  <p className="text-xs font-sans mt-0.5" style={{ color: "var(--paper-muted)" }}>
                    Q1 2026 &mdash; 2,500 employees, two tenants, 62 threats
                  </p>
                </div>
                <Link
                  href="/ingest?sample=true"
                  className="inline-flex items-center gap-2 px-5 py-2 rounded text-sm font-medium font-sans transition-opacity hover:opacity-90 flex-shrink-0 ml-6"
                  style={{ background: "var(--paper-accent)", color: "var(--paper-bg)" }}
                >
                  Load sample
                </Link>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center border-t" style={{ borderColor: "var(--paper-border)" }}>
        <p className="text-xs font-sans" style={{ color: "var(--paper-muted)" }}>
          Data stays in your browser session. Nothing is persisted.
        </p>
      </footer>
    </div>
  )
}
