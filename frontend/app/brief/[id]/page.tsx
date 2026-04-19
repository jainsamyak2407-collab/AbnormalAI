"use client"

export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ReferenceLine, Cell,
} from "recharts"
import { getBrief, getEvidence, getSectionPrompt, regenerateSection, getBriefEvidenceIndex } from "@/lib/api"
import type { Brief, BriefSection, EvidenceRecord } from "@/lib/types"
import { PresentationModal } from "@/components/presentation/PresentationModal"
import type { SlideContent } from "@/components/presentation/PresentationModal"

const MONO = "var(--font-mono)"
const SERIF = "var(--font-serif)"

// Paper palette (brief document is always light)
const P = {
  text:    "#1A1A1A",
  muted:   "#6B7280",
  faint:   "#9CA3AF",
  border:  "#E5E4DF",
  bg:      "#FAFAF7",
  surface: "#F5F4EF",
  accent:  "#4C566A",
  coral:   "#FF5B49",
  success: "#16A34A",
  danger:  "#C0392B",
}

// ---------------------------------------------------------------------------
// Evidence chip parser
// ---------------------------------------------------------------------------

function parseContent(content: string, onChip: (id: string) => void) {
  const parts = content.split(/(\[E\d+\])/g)
  return parts.map((part, i) => {
    const match = part.match(/^\[E(\d+)\]$/)
    if (match) {
      return (
        <button key={i} onClick={() => onChip(part.slice(1, -1))} className="chip-evidence">
          {part.slice(1, -1)}
        </button>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// ---------------------------------------------------------------------------
// Exhibit chart — maps exhibit name → EvidenceRecord → Recharts chart
// ---------------------------------------------------------------------------

function ExhibitChart({ exhibitName, evidenceIndex }: { exhibitName: string; evidenceIndex: EvidenceRecord[] }) {
  // Fuzzy-match exhibit name to an evidence record by metric_label
  const record = evidenceIndex.find((r) => {
    const label = r.metric_label.toLowerCase()
    const name = exhibitName.toLowerCase()
    // Exact or substring match
    return label === name || label.includes(name.split(" ").slice(0, 3).join(" ").toLowerCase())
      || name.includes(label.split(" ").slice(0, 3).join(" ").toLowerCase())
  }) ?? null

  if (!record) return null

  const mt = record.metric_type

  // Breakdown → horizontal or vertical bar chart
  if (mt === "breakdown" && record.segments && record.segments.length > 0) {
    const data = record.segments.map((s) => ({
      name: s.label,
      value: typeof s.value === "number" ? s.value : parseFloat(String(s.value)) || 0,
      pct: Math.round(s.share * 100),
    }))
    const isMonthly = data.some((d) =>
      /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(d.name)
    )

    return (
      <div style={{ margin: "24px 0 32px", padding: "20px 24px", background: P.surface, border: `1px solid ${P.border}`, borderRadius: "4px" }}>
        <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "16px" }}>
          EXHIBIT · {exhibitName.toUpperCase()}
        </p>
        <ResponsiveContainer width="100%" height={isMonthly ? 140 : Math.max(80, data.length * 28)}>
          {isMonthly ? (
            <LineChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
              <XAxis dataKey="name" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: P.faint }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ fontFamily: "var(--font-mono)", fontSize: 10, background: P.bg, border: `1px solid ${P.border}`, borderRadius: 3 }}
                formatter={(v: number) => [v.toLocaleString(), ""]}
                labelStyle={{ color: P.accent }}
              />
              <Line type="monotone" dataKey="value" stroke={P.accent} strokeWidth={2} dot={{ fill: P.accent, r: 3 }} activeDot={{ r: 4 }} />
            </LineChart>
          ) : (
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: P.muted }} axisLine={false} tickLine={false} width={140} />
              <Tooltip
                contentStyle={{ fontFamily: "var(--font-mono)", fontSize: 10, background: P.bg, border: `1px solid ${P.border}`, borderRadius: 3 }}
                formatter={(v: number) => [v.toLocaleString(), ""]}
              />
              <Bar dataKey="value" radius={[0, 2, 2, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? P.accent : "#CBD5E0"} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
        <p style={{ fontFamily: MONO, fontSize: "8px", color: P.faint, marginTop: "8px", letterSpacing: "0.06em" }}>
          {record.metric_label} · {record.source_row_count.toLocaleString()} source rows
        </p>
      </div>
    )
  }

  // Scalar with unit — stat card
  if (mt === "scalar" && record.value != null) {
    const display = typeof record.value === "number"
      ? Number.isInteger(record.value) ? record.value.toLocaleString() : record.value.toFixed(1)
      : String(record.value)
    return (
      <div style={{ margin: "24px 0 32px", padding: "20px 24px", background: P.surface, border: `1px solid ${P.border}`, borderRadius: "4px", display: "flex", alignItems: "baseline", gap: "16px" }}>
        <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, flexShrink: 0 }}>
          EXHIBIT · {exhibitName.toUpperCase()}
        </p>
        <p style={{ fontFamily: SERIF, fontSize: "32px", fontWeight: 700, color: P.accent, lineHeight: 1 }}>
          {display}
          {record.unit && <span style={{ fontFamily: MONO, fontSize: "14px", color: P.faint, marginLeft: "6px" }}>{record.unit}</span>}
        </p>
        <p style={{ fontFamily: MONO, fontSize: "9px", color: P.muted, lineHeight: 1.5, flexShrink: 0 }}>
          {record.metric_label}<br />{record.calculation_description.split(".")[0]}.
        </p>
      </div>
    )
  }

  // Criteria table
  if (mt === "criteria_table" && record.criteria_rows && record.criteria_rows.length > 0) {
    return (
      <div style={{ margin: "24px 0 32px" }}>
        <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "10px" }}>
          EXHIBIT · {exhibitName.toUpperCase()}
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: P.surface }}>
              {["Criterion", "Target", "Actual", "Status"].map((h) => (
                <th key={h} style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: P.accent, padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${P.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {record.criteria_rows.map((row, i) => {
              const r = row as Record<string, unknown>
              const met = r.met === true || r.met === "true"
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${P.border}` }}>
                  <td style={{ fontFamily: MONO, fontSize: "10px", color: P.text, padding: "8px 12px" }}>{String(r.description ?? r.criterion ?? "")}</td>
                  <td style={{ fontFamily: MONO, fontSize: "10px", color: P.muted, padding: "8px 12px" }}>{String(r.target ?? "")}</td>
                  <td style={{ fontFamily: MONO, fontSize: "10px", color: P.text, padding: "8px 12px", fontWeight: 600 }}>{String(r.actual ?? "")}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 8px", borderRadius: "2px", background: met ? "rgba(22,163,74,0.1)" : "rgba(192,57,43,0.1)", color: met ? P.success : P.danger }}>
                      {met ? "PASS" : "FAIL"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// Evidence drawer — typed renderers per metric_type
// ---------------------------------------------------------------------------

function EvidenceDrawerDataTable({ rows, totalCount }: { rows: Record<string, unknown>[]; totalCount: number }) {
  if (rows.length === 0) return null
  const cols = Object.keys(rows[0])
  return (
    <div>
      <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "8px" }}>
        SOURCE — {totalCount.toLocaleString()} ROWS
      </p>
      <div style={{ overflowX: "auto", border: `1px solid ${P.border}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: P.surface }}>
              {cols.map((col) => (
                <th key={col} style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: P.accent, padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${P.border}`, whiteSpace: "nowrap" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${P.border}`, background: i % 2 === 0 ? "#fff" : P.bg }}>
                {cols.map((col, j) => (
                  <td key={j} style={{ fontFamily: MONO, fontSize: "10px", color: "#374151", padding: "7px 10px", whiteSpace: "nowrap" }}>{String(row[col] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {totalCount > 5 && (
          <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", color: P.faint, padding: "8px 10px", borderTop: `1px solid ${P.border}` }}>
            + {(totalCount - 5).toLocaleString()} MORE ROWS
          </p>
        )}
      </div>
    </div>
  )
}

function EvidenceDrawerContent({ record }: { record: EvidenceRecord }) {
  const mt = record.metric_type
  return (
    <div>
      <div style={{ marginBottom: "20px" }}>
        <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "6px" }}>METRIC</p>
        <p style={{ fontFamily: SERIF, fontSize: "15px", color: P.text, fontWeight: 600 }}>{record.metric_label}</p>
      </div>

      {mt === "scalar" && record.value != null && (
        <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: `1px solid ${P.border}` }}>
          <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "6px" }}>VALUE</p>
          <p style={{ fontFamily: SERIF, fontSize: "36px", fontWeight: 700, color: P.accent, lineHeight: 1 }}>
            {typeof record.value === "number"
              ? Number.isInteger(record.value) ? record.value.toLocaleString() : record.value.toFixed(2)
              : record.value}
            {record.unit && <span style={{ fontSize: "16px", marginLeft: "6px", color: P.faint }}>{record.unit}</span>}
          </p>
        </div>
      )}

      {mt === "criteria_table" && record.criteria_rows && record.criteria_rows.length > 0 && (
        <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: `1px solid ${P.border}` }}>
          <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "10px" }}>SUCCESS CRITERIA</p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: P.surface }}>
                {["Criterion", "Target", "Actual", "Status"].map((h) => (
                  <th key={h} style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: P.accent, padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${P.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.criteria_rows.map((row, i) => {
                const r = row as Record<string, unknown>
                const met = r.met === true || r.met === "true"
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${P.border}` }}>
                    <td style={{ fontFamily: MONO, fontSize: "9px", color: "#374151", padding: "8px 10px" }}>{String(r.description ?? r.criterion ?? "")}</td>
                    <td style={{ fontFamily: MONO, fontSize: "9px", color: "#374151", padding: "8px 10px" }}>{String(r.target ?? "")}</td>
                    <td style={{ fontFamily: MONO, fontSize: "9px", color: "#374151", padding: "8px 10px" }}>{String(r.actual ?? "")}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 8px", background: met ? "rgba(22,163,74,0.1)" : "rgba(192,57,43,0.1)", color: met ? P.success : P.danger }}>
                        {met ? "PASS" : "FAIL"}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {mt === "breakdown" && record.segments && record.segments.length > 0 && (
        <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: `1px solid ${P.border}` }}>
          <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "10px" }}>BREAKDOWN</p>
          {record.segments.map((seg, i) => (
            <div key={i} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <span style={{ fontFamily: MONO, fontSize: "9px", color: "#374151" }}>{seg.label}</span>
                <span style={{ fontFamily: MONO, fontSize: "9px", color: P.accent, fontWeight: 700 }}>
                  {typeof seg.value === "number" && Number.isInteger(seg.value) ? seg.value.toLocaleString() : typeof seg.value === "number" ? seg.value.toFixed(2) : seg.value}
                  <span style={{ color: P.faint, marginLeft: "6px" }}>({(seg.share * 100).toFixed(1)}%)</span>
                </span>
              </div>
              <div style={{ height: "4px", background: P.border, borderRadius: "2px" }}>
                <div style={{ height: "100%", width: `${Math.min(seg.share * 100, 100)}%`, background: P.accent, borderRadius: "2px" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {mt === "row_list" && record.rows && (
        <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: `1px solid ${P.border}` }}>
          <EvidenceDrawerDataTable rows={record.rows} totalCount={record.source_row_count} />
        </div>
      )}

      <div style={{ marginBottom: "20px" }}>
        <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "6px" }}>CALCULATION</p>
        <p style={{ fontFamily: MONO, fontSize: "11px", lineHeight: 1.7, color: "#4B5563" }}>{record.calculation_description}</p>
      </div>
    </div>
  )
}

function EvidenceDrawer({ evidenceId, briefId, onClose }: { evidenceId: string | null; briefId: string; onClose: () => void }) {
  const [record, setRecord] = useState<EvidenceRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!evidenceId) { setRecord(null); return }
    setLoading(true); setErr(null)
    getEvidence(briefId, evidenceId)
      .then((r) => { setRecord(r); setLoading(false) })
      .catch((e) => { setErr(e instanceof Error ? e.message : "Not found."); setLoading(false) })
  }, [evidenceId, briefId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onClose])

  const open = !!evidenceId

  return (
    <>
      {open && <div className="brief-evidence-drawer" style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />}
      <div className="brief-evidence-drawer" style={{
        position: "fixed", top: 0, right: 0, height: "100%", zIndex: 50,
        width: "480px", background: P.bg, borderLeft: `1px solid ${P.border}`,
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${P.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: P.faint, marginBottom: "4px" }}>EVIDENCE RECORD</p>
            {record && <p style={{ fontFamily: MONO, fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em", color: P.accent }}>{evidenceId}</p>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${P.border}`, width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: "3px" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke={P.accent} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <div style={{ width: "20px", height: "20px", border: `2px solid ${P.border}`, borderTopColor: P.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}
          {err && <p style={{ fontFamily: MONO, fontSize: "10px", color: P.danger }}>{err}</p>}
          {record && !loading && <EvidenceDrawerContent record={record} />}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Steer / Edit-prompt modal
// ---------------------------------------------------------------------------

function SteerModal({ briefId, section, onClose, onRegenerated }: {
  briefId: string; section: BriefSection; onClose: () => void; onRegenerated: (s: BriefSection) => void
}) {
  const [tab, setTab] = useState<"steer" | "prompt">("steer")
  const [steering, setSteering] = useState("")
  const [promptData, setPromptData] = useState<{ system_prompt: string; user_prompt: string } | null>(null)
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLoadPrompt = useCallback(async () => {
    if (promptData) return
    setLoadingPrompt(true)
    try { setPromptData(await getSectionPrompt(briefId, section.id ?? section.section_id)) }
    catch (e) { setError(e instanceof Error ? e.message : "Failed.") }
    finally { setLoadingPrompt(false) }
  }, [briefId, section.id, promptData])

  useEffect(() => { if (tab === "prompt") handleLoadPrompt() }, [tab, handleLoadPrompt])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onClose])

  const handleRegenerate = async () => {
    setRegenerating(true); setError(null)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120_000)
      const result = await regenerateSection(briefId, section.id ?? section.section_id, steering || undefined)
      clearTimeout(timeout)
      onRegenerated(result)
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.name === "AbortError" ? "Request timed out. Try again." : e instanceof Error ? e.message : "Regeneration failed.")
      setRegenerating(false)
    }
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div style={{
        position: "fixed", zIndex: 60, background: P.bg, border: `1px solid ${P.border}`,
        borderRadius: "6px",
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "min(580px, 92vw)", maxHeight: "80vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${P.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: P.faint, marginBottom: "4px" }}>REWRITE SECTION</p>
            <p style={{ fontFamily: SERIF, fontSize: "15px", color: P.text, fontWeight: 600 }}>{section.headline}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${P.border}`, width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, borderRadius: "3px" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke={P.accent} strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ display: "flex", borderBottom: `1px solid ${P.border}` }}>
          {(["steer", "prompt"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 20px", background: "none", cursor: "pointer",
              fontFamily: MONO, fontSize: "9px", fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: tab === t ? P.text : P.faint,
              border: "none",
              borderBottom: tab === t ? `2px solid ${P.accent}` : "2px solid transparent",
            }}>
              {t === "steer" ? "STEER REWRITE" : "VIEW PROMPT"}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {tab === "steer" && (
            <div>
              <p style={{ fontFamily: MONO, fontSize: "10px", lineHeight: 1.7, color: P.muted, marginBottom: "16px" }}>
                Describe what you want different. The AI will rewrite this section with your note as steering.
              </p>
              <textarea value={steering} onChange={(e) => setSteering(e.target.value)}
                placeholder="e.g. Lead with the credential submission risk. Avoid mentioning department names. Close with a direct budget ask."
                rows={5} style={{
                  width: "100%", padding: "12px", background: "#fff",
                  border: `1px solid ${P.border}`, borderRadius: "4px",
                  fontFamily: MONO, fontSize: "11px",
                  color: P.text, lineHeight: 1.6, resize: "none",
                  outline: "none", boxSizing: "border-box",
                }} />
              {error && <p style={{ fontFamily: MONO, fontSize: "9px", color: P.danger, marginTop: "8px" }}>{error}</p>}
            </div>
          )}
          {tab === "prompt" && (
            <div>
              {loadingPrompt && <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}><div style={{ width: "18px", height: "18px", border: `2px solid ${P.border}`, borderTopColor: P.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /></div>}
              {promptData && !loadingPrompt && (
                <div>
                  <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "8px" }}>SYSTEM PROMPT</p>
                  <pre style={{ fontFamily: MONO, fontSize: "10px", lineHeight: 1.65, padding: "12px", background: P.surface, borderRadius: "3px", overflowX: "auto", whiteSpace: "pre-wrap", color: "#374151", marginBottom: "20px" }}>{promptData.system_prompt}</pre>
                  <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "8px" }}>USER PROMPT (RENDERED)</p>
                  <pre style={{ fontFamily: MONO, fontSize: "10px", lineHeight: 1.65, padding: "12px", background: P.surface, borderRadius: "3px", overflowX: "auto", whiteSpace: "pre-wrap", color: "#374151" }}>{promptData.user_prompt}</pre>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${P.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: P.faint }}>CANCEL</button>
          <button onClick={handleRegenerate} disabled={regenerating} style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "10px 24px", background: P.accent, color: "#fff",
            fontFamily: MONO, fontSize: "9px", fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase",
            border: "none", borderRadius: "3px",
            cursor: regenerating ? "not-allowed" : "pointer",
            opacity: regenerating ? 0.6 : 1,
          }}>
            {regenerating && <div style={{ width: "10px", height: "10px", border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
            {regenerating ? "REWRITING…" : tab === "steer" && steering ? "REWRITE WITH NOTE" : "REWRITE SECTION"}
          </button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Section block
// ---------------------------------------------------------------------------

function SectionBlock({ section, index, briefId, evidenceIndex, onChip, onRegenerated }: {
  section: BriefSection; index: number; briefId: string
  evidenceIndex: EvidenceRecord[]
  onChip: (id: string) => void; onRegenerated: (s: BriefSection) => void
}) {
  const [steerOpen, setSteerOpen] = useState(false)
  const [rewriting, setRewriting] = useState(false)

  const handleQuickRegen = async () => {
    setRewriting(true)
    try { onRegenerated(await regenerateSection(briefId, section.id ?? section.section_id)) }
    catch { /* silent */ }
    finally { setRewriting(false) }
  }

  return (
    <>
      <section style={{ opacity: rewriting ? 0.5 : 1, transition: "opacity 0.2s" }} className="brief-section">
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0" }}>
          {/* Section number in margin */}
          <div style={{ width: "64px", flexShrink: 0, paddingTop: "5px" }}>
            <span style={{ fontFamily: MONO, fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", color: P.border }}>
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>

          <div style={{ flex: 1 }}>
            {/* Headline row with hover actions */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "14px" }}>
              <h2 style={{ fontFamily: SERIF, fontSize: "21px", fontWeight: 700, lineHeight: 1.35, color: P.text, letterSpacing: "-0.01em" }}>
                {section.headline}
              </h2>
              <div className="section-actions" style={{ display: "flex", gap: "4px", flexShrink: 0, marginTop: "2px" }}>
                <button onClick={() => setSteerOpen(true)} title="Steer rewrite" style={{
                  width: "26px", height: "26px", background: "none", border: `1px solid ${P.border}`,
                  borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M8.5 1.5a1.414 1.414 0 112 2L4 10H2v-2l6.5-6.5z" stroke={P.accent} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button onClick={handleQuickRegen} disabled={rewriting} title="Regenerate" style={{
                  width: "26px", height: "26px", background: "none", border: `1px solid ${P.border}`,
                  borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}>
                  {rewriting ? (
                    <div style={{ width: "10px", height: "10px", border: `1.5px solid ${P.border}`, borderTopColor: P.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                      <path d="M12 2.5A6 6 0 1 1 7 1M7 1l2 2-2 2" stroke={P.accent} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Prose */}
            <div style={{ fontFamily: SERIF, fontSize: "16px", lineHeight: 1.9, color: "#374151" }}>
              {parseContent(section.content ?? section.prose_inline, onChip)}
            </div>

            {/* Exhibits */}
            {section.exhibits && section.exhibits.length > 0 && evidenceIndex.length > 0 && (
              <div>
                {section.exhibits.map((exhibitName, ei) => (
                  <ExhibitChart key={ei} exhibitName={exhibitName} evidenceIndex={evidenceIndex} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      {steerOpen && (
        <SteerModal briefId={briefId} section={section}
          onClose={() => setSteerOpen(false)}
          onRegenerated={(updated) => { onRegenerated(updated); setSteerOpen(false) }}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Recommendation card
// ---------------------------------------------------------------------------

function RecommendationCard({ rec, index }: { rec: Record<string, unknown>; index: number }) {
  const r = rec as Record<string, string | string[] | undefined>
  const priority = r.priority as string | undefined
  const urgency = r.urgency_signal as string | undefined

  const priorityColor = priority === "critical" ? P.danger : priority === "high" ? "#C05621" : P.muted

  return (
    <div style={{ display: "flex", gap: "0", borderBottom: `1px solid ${P.border}`, padding: "24px 0" }}>
      <div style={{ width: "64px", flexShrink: 0, paddingTop: "2px" }}>
        <span style={{ fontFamily: SERIF, fontSize: "26px", fontWeight: 700, color: P.border, lineHeight: 1 }}>
          {index + 1}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
          <p style={{ fontFamily: SERIF, fontSize: "17px", fontWeight: 700, color: P.text, flex: 1, lineHeight: 1.4 }}>
            {r.action ?? r.title ?? ""}
          </p>
          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
            {(r.ask_type ?? r.commercial_angle) && (
              <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 8px", background: P.surface, color: P.accent, border: `1px solid ${P.border}`, borderRadius: "2px" }}>
                {r.ask_type ?? r.commercial_angle}
              </span>
            )}
            {priority && (
              <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 8px", background: P.surface, color: priorityColor, border: `1px solid ${P.border}`, borderRadius: "2px" }}>
                {priority}
              </span>
            )}
          </div>
        </div>

        {r.urgency_context && (
          <p style={{ fontFamily: MONO, fontSize: "9px", color: urgency === "persistent" ? P.danger : P.muted, marginBottom: "8px", lineHeight: 1.5, display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ opacity: 0.6 }}>
              {urgency === "persistent" ? "▲" : urgency === "emerging" ? "→" : "●"}
            </span>
            {r.urgency_context}
          </p>
        )}

        {r.gap && (
          <p style={{ fontFamily: MONO, fontSize: "9px", color: P.muted, marginBottom: "10px", lineHeight: 1.5 }}>
            <span style={{ color: P.faint, marginRight: "6px", letterSpacing: "0.1em", textTransform: "uppercase", fontSize: "8px" }}>GAP</span>
            {r.gap}
          </p>
        )}

        {r.expected_impact && (
          <p style={{ fontFamily: SERIF, fontSize: "14px", lineHeight: 1.65, color: "#4B5563", marginBottom: "6px" }}>
            <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: P.faint, marginRight: "8px" }}>IMPACT</span>
            {r.expected_impact}
          </p>
        )}

        {Array.isArray(r.rationale_chain) ? (
          <ol style={{ margin: "8px 0", paddingLeft: "16px" }}>
            {(r.rationale_chain as string[]).map((step, i) => (
              <li key={i} style={{ fontFamily: SERIF, fontSize: "13px", lineHeight: 1.6, color: P.muted, marginBottom: "4px" }}>{step}</li>
            ))}
          </ol>
        ) : r.rationale_chain ? (
          <p style={{ fontFamily: SERIF, fontSize: "14px", lineHeight: 1.65, color: P.muted, fontStyle: "italic" }}>{String(r.rationale_chain)}</p>
        ) : null}

        {r.next_step && (
          <p style={{ fontFamily: SERIF, fontSize: "14px", lineHeight: 1.65, color: "#4B5563", marginTop: "8px" }}>
            <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: P.faint, marginRight: "8px" }}>NEXT</span>
            {r.next_step}
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action rail (fixed bottom-right panel)
// ---------------------------------------------------------------------------

function ActionRail({ brief, onCopy, onAudienceToggle, onDeck, onPrint }: {
  brief: Brief; briefId: string; onCopy: () => void; onAudienceToggle: () => void; onDeck: () => void; onPrint: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const otherAudience = brief.metadata.audience === "ciso" ? "CSM" : "CISO"

  return (
    <div className="brief-action-rail" style={{
      position: "fixed",
      bottom: "28px",
      right: "28px",
      zIndex: 20,
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      alignItems: "stretch",
      width: "200px",
      background: P.bg,
      border: `1px solid ${P.border}`,
      borderRadius: "8px",
      padding: "14px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
    }}>
      {/* Section label */}
      <p style={{ fontFamily: MONO, fontSize: "7px", letterSpacing: "0.2em", textTransform: "uppercase", color: P.faint, marginBottom: "2px" }}>
        ACTIONS
      </p>

      {/* Primary: Generate Deck */}
      <button onClick={onDeck} style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "11px 14px",
        background: P.accent, color: "#fff",
        border: "none", borderRadius: "5px",
        cursor: "pointer",
        fontFamily: MONO, fontSize: "10px", fontWeight: 700,
        letterSpacing: "0.1em", textTransform: "uppercase",
        width: "100%", textAlign: "left",
      }}>
        <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
          <rect x="1" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4 3V2h6v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M4 6h6M4 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        Generate Deck
      </button>

      {/* Divider */}
      <div style={{ height: "1px", background: P.border, margin: "2px 0" }} />

      {/* Secondary actions */}
      {[
        {
          icon: (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5h10M2 7h10M2 10.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          ),
          label: "Download PDF",
          onClick: onPrint,
        },
        {
          icon: (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9.5 1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5L9.5 1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ),
          label: copied ? "Copied!" : "Copy Markdown",
          onClick: handleCopy,
          active: copied,
        },
      ].map((action) => {
        const btnStyle = {
          display: "flex", alignItems: "center", gap: "9px",
          padding: "9px 12px",
          background: action.active ? `${P.accent}18` : P.surface,
          border: `1px solid ${action.active ? P.accent : P.border}`,
          borderRadius: "5px",
          cursor: "pointer" as const,
          color: action.active ? P.accent : P.muted,
          fontFamily: MONO, fontSize: "9px", fontWeight: 600,
          letterSpacing: "0.06em",
          textDecoration: "none",
          width: "100%", textAlign: "left" as const,
          transition: "background 0.15s",
        }
        return (
          <button key={action.label} onClick={action.onClick} style={btnStyle}>
            {action.icon}{action.label}
          </button>
        )
      })}

      {/* Divider */}
      <div style={{ height: "1px", background: P.border, margin: "2px 0" }} />

      {/* Audience switcher */}
      <button onClick={onAudienceToggle} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "9px 12px",
        background: P.surface,
        border: `1px solid ${P.border}`,
        borderRadius: "5px",
        cursor: "pointer",
        width: "100%",
      }}>
        <span style={{ fontFamily: MONO, fontSize: "9px", color: P.muted, letterSpacing: "0.06em" }}>
          Switch to
        </span>
        <span style={{
          fontFamily: MONO, fontSize: "8px", fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase",
          padding: "3px 8px", borderRadius: "3px",
          background: P.accent, color: "#fff",
        }}>
          {otherAudience}
        </span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BriefPage() {
  const params = useParams()
  const router = useRouter()
  const briefId = params.id as string

  const [brief, setBrief] = useState<Brief | null>(null)
  const [rawBrief, setRawBrief] = useState<Record<string, unknown>>({})
  const [evidenceIndex, setEvidenceIndex] = useState<EvidenceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null)
  const [presentationOpen, setPresentationOpen] = useState(false)
  const [deckPresId, setDeckPresId] = useState<string | null>(null)
  const [deckSlides, setDeckSlides] = useState<SlideContent[]>([])

  useEffect(() => {
    Promise.all([
      getBrief(briefId),
      getBriefEvidenceIndex(briefId).catch(() => []),
    ]).then(([data, index]) => {
      setRawBrief(data)
      setBrief(data as unknown as Brief)
      setEvidenceIndex(index)
      setLoading(false)
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Brief not found.")
      setLoading(false)
    })
  }, [briefId])

  const handleChip = useCallback((id: string) => setActiveEvidence(id), [])

  const handleSectionRegenerated = useCallback((updated: BriefSection) => {
    setBrief((prev) => prev ? { ...prev, sections: prev.sections.map((s) => s.id === updated.id ? updated : s) } : prev)
  }, [])

  const handleCopy = useCallback(() => {
    if (!brief) return
    const lines: string[] = [`# ${brief.metadata.customer_name} — ${brief.metadata.period.label}`, `\n> ${brief.thesis.sentence}`]
    for (const s of brief.sections) {
      lines.push(`\n## ${s.headline}`)
      lines.push((s.content ?? s.prose_inline).replace(/\[E\d+\]/g, ""))
    }
    if (brief.recommendations.length > 0) {
      lines.push("\n## Recommendations")
      for (const [i, r] of brief.recommendations.entries()) {
        lines.push(`\n${i + 1}. **${r.headline}**`)
        if (r.expected_impact) lines.push(`   ${r.expected_impact}`)
      }
    }
    navigator.clipboard.writeText(lines.join("\n"))
  }, [brief])

  const handleAudienceToggle = useCallback(() => {
    if (!brief) return
    const newAudience = brief.metadata.audience === "ciso" ? "csm" : "ciso"
    const sessionId = brief.session_id || (rawBrief.session_id as string) || brief._session_id || ""
    if (!sessionId) {
      alert("Cannot switch audience: session expired. Please re-upload your data.")
      return
    }
    const emphasis = brief.metadata.emphasis || "balanced"
    const length = brief.metadata.length || "standard"
    router.push(`/generate?${new URLSearchParams({ session_id: sessionId, audience: newAudience, emphasis, length }).toString()}`)
  }, [brief, rawBrief, router])

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "24px", height: "24px", border: "2px solid var(--border-strong)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  )

  if (error || !brief) return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--danger)", marginBottom: "16px" }}>{error ?? "BRIEF NOT FOUND"}</p>
        <Link href="/" style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", borderBottom: "1px solid var(--accent-dim)", paddingBottom: "1px" }}>HOME</Link>
      </div>
    </div>
  )

  return (
    <div className="brief-page-root" style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <style>{`
        .brief-section .section-actions { opacity: 0; transition: opacity 0.15s; }
        .brief-section:hover .section-actions { opacity: 1; }
      `}</style>

      {/* Dark chrome header */}
      <header className="brief-chrome-header" style={{
        position: "sticky", top: 0, zIndex: 30, background: "var(--bg-page)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 48px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <Link href="/" style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--text-primary)" }}>
            ABNORMAL SECURITY
          </Link>
          <span style={{ width: "1px", height: "14px", background: "var(--border-strong)" }} />
          <span style={{
            fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.16em",
            textTransform: "uppercase", padding: "4px 10px",
            background: "var(--accent)", color: "#fff", borderRadius: "2px",
          }}>
            {brief.metadata.audience === "ciso" ? "CISO" : "CSM QBR"}
          </span>
          <span style={{ fontFamily: MONO, fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>
            {brief.metadata.period.label}
          </span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>
          {brief.sections.length} SECTIONS · {brief.recommendations.length} RECS
        </span>
      </header>

      {/* Paper document — white card on dark background */}
      <div style={{ maxWidth: "860px", margin: "48px auto 80px", padding: "0 24px" }}>
        <div className="brief-document-card" style={{ background: P.bg, boxShadow: "0 4px 40px rgba(0,0,0,0.25)", borderRadius: "2px" }}>
          <div className="brief-document-inner" style={{ padding: "80px 80px 72px" }}>

            {/* Masthead */}
            <div style={{ marginBottom: "64px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
                <div style={{ flex: 1, height: "1px", background: P.accent }} />
                <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: P.accent }}>
                  INTELLIGENCE BRIEF · {brief.metadata.period.label}
                </span>
                <div style={{ flex: 1, height: "1px", background: P.accent }} />
              </div>

              <h1 style={{
                fontFamily: SERIF,
                fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 700,
                lineHeight: 1.02, letterSpacing: "-0.025em",
                color: P.text, marginBottom: "36px",
              }}>
                {brief.metadata.customer_name}
              </h1>

              {/* Thesis lede */}
              <blockquote style={{
                margin: 0,
                borderLeft: `3px solid ${P.accent}`,
                paddingLeft: "28px",
              }}>
                <p style={{
                  fontFamily: SERIF,
                  fontSize: "19px", lineHeight: 1.75, color: P.text,
                  fontStyle: "italic", fontWeight: 400,
                }}>
                  {brief.thesis.sentence}
                </p>
              </blockquote>
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: P.border, marginBottom: "64px" }} />

            {/* Sections */}
            <div style={{ display: "flex", flexDirection: "column", gap: "56px", marginBottom: "80px" }}>
              {brief.sections.map((section, i) => (
                <SectionBlock
                  key={section.id}
                  section={section}
                  index={i}
                  briefId={briefId}
                  evidenceIndex={evidenceIndex}
                  onChip={handleChip}
                  onRegenerated={handleSectionRegenerated}
                />
              ))}
            </div>

            {/* Recommendations */}
            {brief.recommendations.length > 0 && (
              <div style={{ marginBottom: "72px" }}>
                <div style={{ height: "1px", background: P.border, marginBottom: "40px" }} />
                <div style={{ display: "flex", alignItems: "baseline", gap: "20px", marginBottom: "4px" }}>
                  <div style={{ width: "64px", flexShrink: 0 }}>
                    <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: P.faint }}>REC.</span>
                  </div>
                  <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: P.faint }}>
                    RECOMMENDATIONS — {brief.recommendations.length} ACTIONS
                  </p>
                </div>
                {brief.recommendations.map((rec, i) => (
                  <RecommendationCard key={i} rec={rec as unknown as Record<string, unknown>} index={i} />
                ))}
              </div>
            )}

            {/* Closing ask */}
            {(rawBrief.closing_ask as string) && (
              <div style={{ marginBottom: "56px", padding: "24px 28px", background: P.surface, borderLeft: `3px solid ${P.accent}`, borderRadius: "0 4px 4px 0" }}>
                <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "8px" }}>CLOSING ASK</p>
                <p style={{ fontFamily: SERIF, fontSize: "16px", lineHeight: 1.7, color: P.text, fontWeight: 500 }}>{String(rawBrief.closing_ask)}</p>
              </div>
            )}

            {/* Signature */}
            <div style={{ height: "1px", background: P.border, marginBottom: "20px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: P.faint }}>
                ABNORMAL BRIEF STUDIO · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}
              </span>
              <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: P.faint }}>
                ABNORMAL SECURITY · AI-NATIVE INTELLIGENCE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed action rail */}
      <ActionRail brief={brief} briefId={briefId} onCopy={handleCopy} onAudienceToggle={handleAudienceToggle} onDeck={() => setPresentationOpen(true)} onPrint={() => window.print()} />

      {/* Evidence drawer */}
      <EvidenceDrawer evidenceId={activeEvidence} briefId={briefId} onClose={() => setActiveEvidence(null)} />

      {/* Presentation modal */}
      {presentationOpen && (
        <PresentationModal
          briefId={briefId}
          initialPresId={deckPresId}
          initialSlides={deckSlides}
          onReady={(pid, sl) => { setDeckPresId(pid || null); setDeckSlides(sl) }}
          onClose={() => setPresentationOpen(false)}
        />
      )}
    </div>
  )
}
