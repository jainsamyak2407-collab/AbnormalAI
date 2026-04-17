"use client"

import { useState, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createDataset, uploadDatasetFiles } from "@/lib/api"
import type { Dataset } from "@/lib/types"

const MONO = "'Courier New', Courier, monospace"
const SERIF = "var(--font-source-serif), Georgia, serif"

type Step = 1 | 2 | 3

interface StagedFile {
  file: File
  detectedSchema: string | null
  warning: string | null
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

  // Known schema signatures for client-side detection preview
  const SCHEMA_HINTS: Record<string, string[]> = {
    threat_log:          ["event_id", "attack_type", "is_vip", "disposition"],
    remediation_log:     ["remediation_id", "method", "mttr_minutes", "outcome"],
    user_reporting:      ["reporting_rate", "credential_submission_rate", "department"],
    posture_checks:      ["check_id", "check_name", "status", "severity"],
    ato_events:          ["ato_id", "risk_score", "risk_factors", "outcome"],
    industry_benchmarks: ["metric_name", "percentile", "value"],
  }

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
          if (required.every((r) => cols.has(r))) {
            resolve({ schema, warning: null })
            return
          }
        }
        resolve({ schema: "unknown", warning: "Schema not recognised — file will still be stored." })
      }
      reader.onerror = () => resolve({ schema: null, warning: "Could not read file." })
      reader.readAsText(file.slice(0, 4096))
    })
  }, [])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files)
    const staged: StagedFile[] = await Promise.all(
      arr.map(async (file) => {
        const { schema, warning } = await detectSchemaClient(file)
        return { file, detectedSchema: schema, warning }
      })
    )
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
    setNameErr(null)
    setStep(2)
  }

  const handleSave = async () => {
    setSaving(true); setSaveErr(null)
    try {
      const created = await createDataset(name.trim(), description.trim())
      if (stagedFiles.length > 0) {
        await uploadDatasetFiles(created.dataset_id, stagedFiles.map((s) => s.file))
      }
      const updated = await import("@/lib/api").then((m) => m.getDataset(created.dataset_id))
      setDataset(updated)
      setStep(3)
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <header style={{ padding: "14px 48px", borderBottom: "1px solid #E5E4DF", display: "flex", alignItems: "center", gap: "20px", background: "#FAFAF7" }}>
        <Link href="/datasets" style={{ fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1A1A1A", textDecoration: "none" }}>← DATA LIBRARY</Link>
        <span style={{ width: "1px", height: "14px", background: "#E5E4DF" }} />
        <span style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#1A1A1A" }}>NEW DATASET</span>
      </header>

      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "64px 48px" }}>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "0", marginBottom: "48px" }}>
          {([1, 2, 3] as Step[]).map((n, i) => (
            <div key={n} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: step > n ? "#1A1A1A" : step === n ? "#4C566A" : "none",
                border: step <= n ? "1px solid #E5E4DF" : "none",
              }}>
                {step > n ? (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="#FAFAF7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <span style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 700, color: step === n ? "#FAFAF7" : "#9CA3AF" }}>{n}</span>
                )}
              </div>
              <span style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: step === n ? "#1A1A1A" : "#9CA3AF", margin: "0 12px" }}>
                {n === 1 ? "NAME" : n === 2 ? "UPLOAD" : "REVIEW"}
              </span>
              {i < 2 && <div style={{ flex: 1, height: "1px", background: "#E5E4DF", width: "32px", marginRight: "12px" }} />}
            </div>
          ))}
        </div>

        {/* Step 1: Name */}
        {step === 1 && (
          <div>
            <h2 style={{ fontFamily: SERIF, fontSize: "28px", fontWeight: 700, color: "#1A1A1A", marginBottom: "8px" }}>Name your dataset</h2>
            <p style={{ fontFamily: SERIF, fontSize: "15px", color: "#6B7280", lineHeight: 1.6, marginBottom: "36px" }}>Give this dataset a recognisable name. You can update it later.</p>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", display: "block", marginBottom: "6px" }}>DATASET NAME *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleStep1Continue() }}
                placeholder="e.g. Acme Corp · Q2 2026"
                style={{ width: "100%", padding: "12px", fontFamily: SERIF, fontSize: "16px", border: `1px solid ${nameErr ? "#C0392B" : "#E5E4DF"}`, background: "#FFFFFF", color: "#1A1A1A", outline: "none", boxSizing: "border-box" }}
                autoFocus
              />
              {nameErr && <p style={{ fontFamily: MONO, fontSize: "9px", color: "#C0392B", marginTop: "4px" }}>{nameErr}</p>}
            </div>

            <div style={{ marginBottom: "36px" }}>
              <label style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", display: "block", marginBottom: "6px" }}>DESCRIPTION (OPTIONAL)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief notes about this dataset…"
                rows={3}
                style={{ width: "100%", padding: "12px", fontFamily: SERIF, fontSize: "14px", border: "1px solid #E5E4DF", background: "#FFFFFF", color: "#1A1A1A", outline: "none", resize: "none", boxSizing: "border-box" }}
              />
            </div>

            <button onClick={handleStep1Continue} style={{ padding: "13px 36px", background: "#1A1A1A", color: "#FAFAF7", fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", border: "none", cursor: "pointer" }}>
              CONTINUE →
            </button>
          </div>
        )}

        {/* Step 2: Upload */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: SERIF, fontSize: "28px", fontWeight: 700, color: "#1A1A1A", marginBottom: "8px" }}>Upload files</h2>
            <p style={{ fontFamily: SERIF, fontSize: "15px", color: "#6B7280", lineHeight: 1.6, marginBottom: "36px" }}>
              Drop your CSV exports and <code style={{ fontFamily: MONO }}>account.json</code>. Files are schema-detected automatically.
            </p>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#4C566A" : "#D1CFC6"}`,
                padding: "48px 24px", textAlign: "center", cursor: "pointer",
                background: dragOver ? "#F0EFE9" : "transparent",
                marginBottom: "20px", transition: "all 0.15s",
              }}
            >
              <p style={{ fontFamily: SERIF, fontSize: "16px", color: "#4B5563", marginBottom: "6px" }}>Drop files here or click to browse</p>
              <p style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF", letterSpacing: "0.1em" }}>CSV FILES + ACCOUNT.JSON · ANY ORDER</p>
              <input ref={fileInputRef} type="file" multiple accept=".csv,.json" style={{ display: "none" }} onChange={(e) => e.target.files && addFiles(e.target.files)} />
            </div>

            {/* Staged files */}
            {stagedFiles.length > 0 && (
              <div style={{ marginBottom: "28px" }}>
                {stagedFiles.map((sf, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderBottom: "1px solid #E5E4DF" }}>
                    <span style={{ fontFamily: MONO, fontSize: "10px", color: "#1A1A1A", flex: 1 }}>{sf.file.name}</span>
                    {sf.detectedSchema && !sf.warning && (
                      <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em", padding: "2px 8px", background: "#D1FAE5", color: "#065F46" }}>✓ {sf.detectedSchema}</span>
                    )}
                    {sf.warning && (
                      <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em", padding: "2px 8px", background: "#FEF3C7", color: "#92400E" }}>⚠ {sf.warning}</span>
                    )}
                    <button
                      onClick={() => setStagedFiles((prev) => prev.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", fontSize: "14px" }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => setStep(1)} style={{ padding: "13px 24px", background: "none", color: "#4C566A", fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", border: "1px solid #E5E4DF", cursor: "pointer" }}>← BACK</button>
              <button onClick={() => setStep(3)} style={{ padding: "13px 36px", background: "#1A1A1A", color: "#FAFAF7", fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", border: "none", cursor: "pointer" }}>
                REVIEW →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Save */}
        {step === 3 && !dataset && (
          <div>
            <h2 style={{ fontFamily: SERIF, fontSize: "28px", fontWeight: 700, color: "#1A1A1A", marginBottom: "8px" }}>Review</h2>
            <p style={{ fontFamily: SERIF, fontSize: "15px", color: "#6B7280", lineHeight: 1.6, marginBottom: "36px" }}>Confirm the dataset before saving.</p>

            <div style={{ border: "1px solid #E5E4DF", padding: "24px", marginBottom: "28px" }}>
              <div style={{ marginBottom: "16px" }}>
                <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "4px" }}>NAME</p>
                <p style={{ fontFamily: SERIF, fontSize: "18px", fontWeight: 700, color: "#1A1A1A" }}>{name}</p>
              </div>
              {description && (
                <div style={{ marginBottom: "16px" }}>
                  <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "4px" }}>DESCRIPTION</p>
                  <p style={{ fontFamily: SERIF, fontSize: "14px", color: "#4B5563" }}>{description}</p>
                </div>
              )}
              <div>
                <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "8px" }}>FILES ({stagedFiles.length})</p>
                {stagedFiles.map((sf, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: i === 0 ? "1px solid #E5E4DF" : "none" }}>
                    <span style={{ fontFamily: MONO, fontSize: "10px", color: "#1A1A1A" }}>{sf.file.name}</span>
                    <span style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF" }}>
                      {sf.detectedSchema ?? "unknown"}
                    </span>
                  </div>
                ))}
                {stagedFiles.length === 0 && <p style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF" }}>No files — you can add them later.</p>}
              </div>
            </div>

            {saveErr && <p style={{ fontFamily: MONO, fontSize: "9px", color: "#C0392B", marginBottom: "12px" }}>{saveErr}</p>}

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => setStep(2)} style={{ padding: "13px 24px", background: "none", color: "#4C566A", fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", border: "1px solid #E5E4DF", cursor: "pointer" }}>← BACK</button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ padding: "13px 36px", background: "#1A1A1A", color: "#FAFAF7", fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", border: "none", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: "8px" }}
              >
                {saving && <div style={{ width: "10px", height: "10px", border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#FAFAF7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                {saving ? "SAVING…" : "SAVE DATASET"}
              </button>
            </div>
          </div>
        )}

        {/* Saved — navigate to dataset */}
        {step === 3 && dataset && (
          <div>
            <h2 style={{ fontFamily: SERIF, fontSize: "28px", fontWeight: 700, color: "#1A1A1A", marginBottom: "16px" }}>Dataset saved.</h2>
            <p style={{ fontFamily: SERIF, fontSize: "15px", color: "#6B7280", lineHeight: 1.6, marginBottom: "32px" }}>
              <strong>{dataset.name}</strong> is ready. You can now generate a brief or return to the library.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={async () => {
                  setSaving(true)
                  try {
                    const { session_id } = await import("@/lib/api").then((m) => m.createSessionFromDataset(dataset.dataset_id))
                    router.push(`/configure?session=${session_id}`)
                  } catch {
                    setSaving(false)
                  }
                }}
                style={{ padding: "13px 36px", background: "#1A1A1A", color: "#FAFAF7", fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", border: "none", cursor: "pointer" }}
              >
                GENERATE BRIEF
              </button>
              <Link href="/datasets" style={{ padding: "13px 24px", background: "none", color: "#4C566A", fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", border: "1px solid #E5E4DF", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                OPEN LIBRARY
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
