"use client"

export const dynamic = 'force-dynamic'

import { useState, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createDataset, uploadDatasetFiles } from "@/lib/api"
import type { Dataset } from "@/lib/types"

type Step = 1 | 2 | 3

interface StagedFile {
  file: File
  detectedSchema: string | null
  warning: string | null
}

const SCHEMA_HINTS: Record<string, string[]> = {
  threat_log:          ["event_id", "attack_type", "is_vip", "disposition"],
  remediation_log:     ["remediation_id", "method", "mttr_minutes", "outcome"],
  user_reporting:      ["reporting_rate", "credential_submission_rate", "department"],
  posture_checks:      ["check_id", "check_name", "status", "severity"],
  ato_events:          ["ato_id", "risk_score", "risk_factors", "outcome"],
  industry_benchmarks: ["metric_name", "percentile", "value"],
}

export default function NewDatasetPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>(1)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [nameErr, setNameErr] = useState<string | null>(null)

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [dragOver, setDragOver] = useState(false)

  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const detectSchemaClient = useCallback(async (file: File): Promise<{ schema: string | null; warning: string | null }> => {
    if (file.name.endsWith(".json")) return { schema: "account_json", warning: null }
    if (!file.name.endsWith(".csv")) return { schema: null, warning: "Unsupported file type." }
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = (e.target?.result as string) || ""
        const headerLine = text.split("\n")[0] || ""
        const cols = new Set(headerLine.split(",").map((c) => c.trim().toLowerCase().replace(/^"|"$/g, "")))
        for (const [schema, required] of Object.entries(SCHEMA_HINTS)) {
          if (required.every((r) => cols.has(r))) { resolve({ schema, warning: null }); return }
        }
        resolve({ schema: "unknown", warning: "Schema not recognised — file will still be stored." })
      }
      reader.onerror = () => resolve({ schema: null, warning: "Could not read file." })
      reader.readAsText(file.slice(0, 4096))
    })
  }, [])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    const staged = await Promise.all(arr.map(async (file) => {
      const { schema, warning } = await detectSchemaClient(file)
      return { file, detectedSchema: schema, warning }
    }))
    setStagedFiles((prev) => {
      const existing = new Set(prev.map((f) => f.file.name))
      return [...prev, ...staged.filter((s) => !existing.has(s.file.name))]
    })
  }, [detectSchemaClient])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files)
  }, [addFiles])

  const handleStep1Continue = () => {
    if (!name.trim()) { setNameErr("Dataset name is required."); return }
    setNameErr(null); setStep(2)
  }

  const handleSave = async () => {
    setSaving(true); setSaveErr(null)
    try {
      const created = await createDataset(name.trim(), description.trim())
      if (stagedFiles.length > 0) {
        await uploadDatasetFiles(created.dataset_id, stagedFiles.map((s) => s.file))
      }
      const updated = await import("@/lib/api").then((m) => m.getDataset(created.dataset_id))
      setDataset(updated); setStep(3)
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <header style={{ padding: "14px 48px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: "20px", background: "var(--bg-page)" }}>
        <Link href="/datasets" style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>← DATA LIBRARY</Link>
        <span style={{ width: "1px", height: "14px", background: "var(--border-strong)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-primary)" }}>NEW DATASET</span>
      </header>

      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "64px 48px" }}>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "48px" }}>
          {([1, 2, 3] as Step[]).map((n, i) => (
            <div key={n} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                width: "26px", height: "26px", borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: step > n ? "var(--accent)" : step === n ? "var(--accent)" : "transparent",
                border: step <= n ? `1px solid ${step === n ? "var(--accent)" : "var(--border-strong)"}` : "none",
              }}>
                {step > n ? (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: step === n ? "#fff" : "var(--text-tertiary)" }}>{n}</span>
                )}
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: step === n ? "var(--text-primary)" : "var(--text-tertiary)", margin: "0 10px" }}>
                {n === 1 ? "NAME" : n === 2 ? "UPLOAD" : "REVIEW"}
              </span>
              {i < 2 && <div style={{ width: "28px", height: "1px", background: "var(--border-strong)", marginRight: "10px" }} />}
            </div>
          ))}
        </div>

        {/* Step 1: Name */}
        {step === 1 && (
          <div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", letterSpacing: "-0.02em" }}>Name your dataset</h2>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "36px" }}>Give this dataset a recognisable name. You can update it later.</p>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", display: "block", marginBottom: "6px" }}>DATASET NAME *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleStep1Continue() }}
                placeholder="e.g. Acme Corp · Q2 2026"
                style={{ width: "100%", padding: "12px 14px", fontFamily: "var(--font-sans)", fontSize: "16px", border: `1px solid ${nameErr ? "var(--danger)" : "var(--border-strong)"}`, background: "var(--bg-surface)", color: "var(--text-primary)", outline: "none", boxSizing: "border-box", borderRadius: "4px" }}
                autoFocus
              />
              {nameErr && <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--danger)", marginTop: "4px" }}>{nameErr}</p>}
            </div>

            <div style={{ marginBottom: "36px" }}>
              <label style={{ fontFamily: "var(--font-mono)", fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", display: "block", marginBottom: "6px" }}>DESCRIPTION (OPTIONAL)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief notes about this dataset…"
                rows={3}
                style={{ width: "100%", padding: "12px 14px", fontFamily: "var(--font-sans)", fontSize: "14px", border: "1px solid var(--border-strong)", background: "var(--bg-surface)", color: "var(--text-primary)", outline: "none", resize: "none", boxSizing: "border-box", borderRadius: "4px" }}
              />
            </div>

            <button
              onClick={handleStep1Continue}
              style={{ padding: "12px 32px", background: "var(--accent)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", borderRadius: "4px", transition: "background 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2: Upload */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", letterSpacing: "-0.02em" }}>Upload files</h2>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "36px" }}>
              Drop your CSV exports and <code style={{ fontFamily: "var(--font-mono)", fontSize: "13px", background: "var(--bg-surface-2)", padding: "1px 5px", borderRadius: "2px" }}>account.json</code>. Files are schema-detected automatically.
            </p>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border-strong)"}`,
                padding: "48px 24px", textAlign: "center", cursor: "pointer",
                background: dragOver ? "rgba(255,91,73,0.05)" : "transparent",
                marginBottom: "20px", transition: "all 0.15s", borderRadius: "6px",
              }}
            >
              <p style={{ fontFamily: "var(--font-sans)", fontSize: "15px", color: "var(--text-secondary)", marginBottom: "6px" }}>Drop files here or click to browse</p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>CSV FILES + ACCOUNT.JSON · ANY ORDER</p>
              <input ref={fileInputRef} type="file" multiple accept=".csv,.json" style={{ display: "none" }} onChange={(e) => e.target.files && addFiles(e.target.files)} />
            </div>

            {stagedFiles.length > 0 && (
              <div style={{ marginBottom: "28px" }}>
                {stagedFiles.map((sf, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-primary)", flex: 1 }}>{sf.file.name}</span>
                    {sf.detectedSchema && !sf.warning && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em", padding: "2px 8px", background: "rgba(74,222,128,0.12)", color: "var(--success)", borderRadius: "2px" }}>✓ {sf.detectedSchema}</span>
                    )}
                    {sf.warning && (
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em", padding: "2px 8px", background: "rgba(251,191,36,0.12)", color: "var(--warning)", borderRadius: "2px" }}>⚠ {sf.warning}</span>
                    )}
                    <button onClick={() => setStagedFiles((prev) => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "16px", lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => setStep(1)} style={{ padding: "12px 20px", background: "none", color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 500, border: "1px solid var(--border-strong)", cursor: "pointer", borderRadius: "4px" }}>← Back</button>
              <button
                onClick={() => setStep(3)}
                style={{ padding: "12px 32px", background: "var(--accent)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", borderRadius: "4px", transition: "background 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
              >
                Review →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Save */}
        {step === 3 && !dataset && (
          <div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", letterSpacing: "-0.02em" }}>Review</h2>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "36px" }}>Confirm the dataset before saving.</p>

            <div style={{ border: "1px solid var(--border-strong)", padding: "24px", marginBottom: "28px", borderRadius: "6px", background: "var(--bg-surface)" }}>
              <div style={{ marginBottom: "16px" }}>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "4px" }}>NAME</p>
                <p style={{ fontFamily: "var(--font-serif)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{name}</p>
              </div>
              {description && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "4px" }}>DESCRIPTION</p>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: "14px", color: "var(--text-secondary)" }}>{description}</p>
                </div>
              )}
              <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>FILES ({stagedFiles.length})</p>
                {stagedFiles.map((sf, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--border-subtle)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-primary)" }}>{sf.file.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)" }}>{sf.detectedSchema ?? "unknown"}</span>
                  </div>
                ))}
                {stagedFiles.length === 0 && <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)" }}>No files — you can add them later.</p>}
              </div>
            </div>

            {saveErr && <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--danger)", marginBottom: "12px" }}>{saveErr}</p>}

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => setStep(2)} style={{ padding: "12px 20px", background: "none", color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 500, border: "1px solid var(--border-strong)", cursor: "pointer", borderRadius: "4px" }}>← Back</button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: "12px 32px", background: "var(--accent)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: "8px", borderRadius: "4px" }}
              >
                {saving && <div style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                {saving ? "Saving…" : "Save Dataset"}
              </button>
            </div>
          </div>
        )}

        {/* Saved */}
        {step === 3 && dataset && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "rgba(74,222,128,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="14" height="12" viewBox="0 0 14 12" fill="none"><path d="M1.5 6l3.5 3.5L12.5 1.5" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Dataset saved.</h2>
            </div>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "32px" }}>
              <strong style={{ color: "var(--text-primary)" }}>{dataset.name}</strong> is ready. Generate a brief or return to the library.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={async () => {
                  setSaving(true)
                  try {
                    const { session_id } = await import("@/lib/api").then((m) => m.createSessionFromDataset(dataset.dataset_id))
                    router.push(`/configure?session=${session_id}`)
                  } catch { setSaving(false) }
                }}
                style={{ padding: "12px 32px", background: "var(--accent)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, border: "none", cursor: "pointer", borderRadius: "4px", transition: "background 0.15s" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
              >
                Generate Brief
              </button>
              <Link
                href="/datasets"
                style={{ padding: "12px 20px", background: "none", color: "var(--text-secondary)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 500, border: "1px solid var(--border-strong)", display: "inline-flex", alignItems: "center", borderRadius: "4px" }}
              >
                Open Library
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
