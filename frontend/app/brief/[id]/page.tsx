"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip,
} from "recharts"
import { getBrief, getEvidence, getSectionPrompt, regenerateSection } from "@/lib/api"
import type { BriefEvidenceRecord } from "@/lib/types"
import type { Brief, BriefSection, EvidenceRecord, Exhibit } from "@/lib/types"
import { ExhibitSlot } from "@/components/brief/ExhibitSlot"

const MONO = "var(--font-mono)"
const SERIF = "var(--font-serif)"

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
  warning: "#B45309",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sectionId(s: BriefSection) {
  return s.section_id || s.id || ""
}

function sectionContent(s: BriefSection) {
  return s.prose_inline || s.content || ""
}

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
// Evidence drawer content — typed per metric_type
// ---------------------------------------------------------------------------

function EvidenceDrawerDataTable({ rows, totalCount }: { rows: Record<string, unknown>[]; totalCount: number }) {
  if (!rows.length) return null
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
            {record.unit && <span style={{ fontSize: "16px", marginLeft: "6px", color: P.faint, fontFamily: MONO }}>{record.unit}</span>}
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

function EvidenceDrawer({ evidenceId, briefId, embeddedIndex, onClose }: {
  evidenceId: string | null
  briefId: string
  embeddedIndex: Record<string, BriefEvidenceRecord>
  onClose: () => void
}) {
  const [record, setRecord] = useState<EvidenceRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!evidenceId) { setRecord(null); return }

    // Show embedded data instantly if available (has value + calculation)
    const embedded = embeddedIndex[evidenceId]
    if (embedded) {
      setRecord({
        evidence_id: evidenceId,
        metric_label: embedded.metric_label,
        metric_type: embedded.metric_type as EvidenceRecord["metric_type"],
        calculation_description: embedded.calculation_description,
        source_row_count: embedded.source_rows?.length ?? 0,
        value: embedded.value,
        unit: embedded.unit ?? null,
        rows: embedded.source_rows?.length ? embedded.source_rows : null,
      })
    }

    // Fetch full record (with source rows, criteria, segments) from network
    setLoading(!embedded); setErr(null)
    getEvidence(briefId, evidenceId)
      .then((r) => { setRecord(r); setLoading(false) })
      .catch((e) => {
        if (!embedded) setErr(e instanceof Error ? e.message : "Not found.")
        setLoading(false)
      })
  }, [evidenceId, briefId, embeddedIndex])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onClose])

  const open = !!evidenceId

  return (
    <>
      {open && <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />}
      <div style={{
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
// Steer modal
// ---------------------------------------------------------------------------

function SteerModal({ briefId, section, initialSteering, onClose, onRegenerated }: {
  briefId: string; section: BriefSection; initialSteering?: string; onClose: () => void; onRegenerated: (s: BriefSection) => void
}) {
  const [tab, setTab] = useState<"steer" | "prompt">("steer")
  const [steering, setSteering] = useState(initialSteering ?? "")
  const [promptData, setPromptData] = useState<{ system_prompt: string; user_prompt: string } | null>(null)
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sid = sectionId(section)

  const handleLoadPrompt = useCallback(async () => {
    if (promptData) return
    setLoadingPrompt(true)
    try { setPromptData(await getSectionPrompt(briefId, sid)) }
    catch (e) { setError(e instanceof Error ? e.message : "Failed.") }
    finally { setLoadingPrompt(false) }
  }, [briefId, sid, promptData])

  useEffect(() => { if (tab === "prompt") handleLoadPrompt() }, [tab, handleLoadPrompt])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onClose])

  const handleRegenerate = async () => {
    setRegenerating(true); setError(null)
    try { onRegenerated(await regenerateSection(briefId, sid, steering || undefined)); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : "Regeneration failed."); setRegenerating(false) }
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
                placeholder="e.g. Lead with the credential submission risk. Close with a direct budget ask."
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
                  <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "8px" }}>USER PROMPT</p>
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

function SectionBlock({ section, index, briefId, exhibits, onChip, onRegenerated, onFocus }: {
  section: BriefSection
  index: number
  briefId: string
  exhibits: Exhibit[]
  onChip: (id: string) => void
  onRegenerated: (s: BriefSection) => void
  onFocus: (s: BriefSection) => void
}) {
  const [steerOpen, setSteerOpen] = useState(false)
  const [rewriting, setRewriting] = useState(false)

  const sid = sectionId(section)
  const content = sectionContent(section)

  const handleQuickRegen = async () => {
    setRewriting(true)
    try { onRegenerated(await regenerateSection(briefId, sid)) }
    catch { /* non-fatal */ }
    finally { setRewriting(false) }
  }

  // Resolve exhibit objects for this section
  const exhibitRefs = section.exhibit_refs?.length ? section.exhibit_refs : (section.exhibits ?? [])
  const sectionExhibits = exhibitRefs
    .map((ref) => exhibits.find((ex) => ex.exhibit_id === ref))
    .filter(Boolean) as Exhibit[]

  return (
    <>
      <section style={{ opacity: rewriting ? 0.5 : 1, transition: "opacity 0.2s" }} className="brief-section" onClick={() => onFocus(section)}>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {/* Section number in margin */}
          <div style={{ width: "56px", flexShrink: 0, paddingTop: "4px" }}>
            <span style={{ fontFamily: MONO, fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: P.border }}>
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>

          <div style={{ flex: 1 }}>
            {/* Headline row with hover actions */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "14px" }}>
              <h2 style={{ fontFamily: SERIF, fontSize: "20px", fontWeight: 600, lineHeight: 1.35, color: P.text, letterSpacing: "-0.01em" }}>
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
            <div style={{ fontFamily: SERIF, fontSize: "16px", lineHeight: 1.85, color: "#374151" }}>
              {parseContent(content, onChip)}
            </div>

            {/* So what */}
            {section.so_what && (
              <div style={{ marginTop: "16px", paddingLeft: "16px", borderLeft: `2px solid ${P.border}` }}>
                <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "4px" }}>SO WHAT</p>
                <p style={{ fontFamily: SERIF, fontSize: "14px", lineHeight: 1.7, color: P.muted, fontStyle: "italic" }}>
                  {section.so_what}
                </p>
              </div>
            )}

            {/* Typed exhibits */}
            {sectionExhibits.length > 0 && sectionExhibits.map((ex) => (
              <ExhibitSlot key={ex.exhibit_id} exhibit={ex} />
            ))}
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
// Recommendation card — new schema
// ---------------------------------------------------------------------------

function RecommendationCard({ rec, index }: { rec: { rec_id: string; kind: string; headline: string; expected_impact?: string; rationale?: string; evidence_refs?: string[]; risk_if_unaddressed?: string }; index: number }) {
  const kindColors: Record<string, string> = {
    BUDGET: P.warning,
    HEADCOUNT: P.warning,
    EXPANSION: P.success,
    RENEWAL: P.success,
    POLICY: P.accent,
    TRAINING: P.accent,
  }
  const kindColor = kindColors[rec.kind] ?? P.muted

  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${P.border}`, padding: "24px 0" }}>
      <div style={{ width: "56px", flexShrink: 0, paddingTop: "2px" }}>
        <span style={{ fontFamily: SERIF, fontSize: "26px", fontWeight: 700, color: P.border, lineHeight: 1 }}>
          {index + 1}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
          <p style={{ fontFamily: SERIF, fontSize: "17px", fontWeight: 600, color: P.text, flex: 1, lineHeight: 1.4 }}>
            {rec.headline}
          </p>
          {rec.kind && (
            <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 8px", background: P.surface, color: kindColor, border: `1px solid ${P.border}`, borderRadius: "2px", flexShrink: 0 }}>
              {rec.kind}
            </span>
          )}
        </div>

        {rec.expected_impact && (
          <p style={{ fontFamily: SERIF, fontSize: "14px", lineHeight: 1.65, color: "#4B5563", marginBottom: "8px" }}>
            <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: P.faint, marginRight: "8px" }}>IMPACT</span>
            {rec.expected_impact}
          </p>
        )}

        {rec.rationale && (
          <p style={{ fontFamily: SERIF, fontSize: "14px", lineHeight: 1.65, color: P.muted, fontStyle: "italic", marginBottom: "8px" }}>
            {rec.rationale}
          </p>
        )}

        {rec.risk_if_unaddressed && (
          <p style={{ fontFamily: MONO, fontSize: "9px", color: P.danger, lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: "6px" }}>
            <span style={{ flexShrink: 0, marginTop: "1px" }}>▲</span>
            <span><span style={{ opacity: 0.6, marginRight: "6px" }}>RISK IF UNADDRESSED</span>{rec.risk_if_unaddressed}</span>
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Action rail — 6 actions
// ---------------------------------------------------------------------------

type RailAction = {
  id: string
  icon: React.ReactNode
  label: string
  onClick?: () => void
  href?: string
  active?: boolean
  disabled?: boolean
  tooltip?: string
}

function ActionRail({ brief, briefId, focusedSection, onCopy, onAudienceToggle, onRailSteer }: {
  brief: Brief
  briefId: string
  focusedSection: BriefSection | null
  onCopy: () => void
  onAudienceToggle: () => void
  onRailSteer: (preset: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [tooltip, setTooltip] = useState<string | null>(null)

  const handleCopy = () => {
    onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const score = brief._critique?.narrative_score ?? null
  const audience = brief.metadata?.audience ?? "ciso"
  const hasFocus = focusedSection !== null

  const actions: RailAction[] = [
    {
      id: "audience",
      icon: (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 1l2 4h4l-3.5 2.5 1.5 4L7 9l-4 2.5 1.5-4L1 5h4l2-4z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      label: audience === "ciso" ? "→ CSM" : "→ CISO",
      onClick: onAudienceToggle,
      tooltip: "Switch audience and regenerate",
    },
    {
      id: "revise",
      icon: (
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
          <path d="M8.5 1.5a1.414 1.414 0 112 2L4 10H2v-2l6.5-6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      label: "REVISE",
      onClick: hasFocus ? () => onRailSteer("") : undefined,
      disabled: !hasFocus,
      tooltip: hasFocus ? `Revise: ${focusedSection!.headline}` : "Click a section first",
    },
    {
      id: "explain",
      icon: (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7 6.5v4M7 4.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
      label: "EXPLAIN",
      onClick: hasFocus ? () => onRailSteer("Rewrite this section in plain language for a non-technical executive. Remove jargon. Lead with the business impact. Keep it under 80 words.") : undefined,
      disabled: !hasFocus,
      tooltip: hasFocus ? "Explain in plain language" : "Click a section first",
    },
    {
      id: "strengthen",
      icon: (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M7 2v10M3.5 5.5L7 2l3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      ),
      label: "STRENGTHEN",
      onClick: hasFocus ? () => onRailSteer("Strengthen the narrative. Sharpen the governing claim. Cite more specific numbers. Make the so_what a concrete recommendation.") : undefined,
      disabled: !hasFocus,
      tooltip: hasFocus ? "Strengthen the argument" : "Click a section first",
    },
    {
      id: "export",
      icon: (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M2 3.5h10M2 7h10M2 10.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      ),
      label: "DOWNLOAD PDF",
      href: `/brief/${briefId}/print`,
      tooltip: "Save brief as PDF",
    },
    {
      id: "copy",
      icon: (
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M9.5 1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5L9.5 1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      label: copied ? "COPIED" : "COPY MD",
      onClick: handleCopy,
      active: copied,
      tooltip: "Copy brief as Markdown",
    },
  ]

  return (
    <div style={{
      position: "fixed",
      right: "20px",
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: 20,
      display: "flex",
      flexDirection: "column",
      gap: "5px",
      alignItems: "flex-end",
    }}>
      {/* Quality score */}
      {score !== null && (
        <div style={{
          padding: "6px 10px",
          background: "var(--bg-surface)",
          border: `1px solid ${score >= 80 ? "rgba(74,222,128,0.3)" : score >= 60 ? "rgba(251,191,36,0.3)" : "rgba(239,68,68,0.3)"}`,
          borderRadius: "4px",
          marginBottom: "6px",
          textAlign: "center",
        }}>
          <p style={{ fontFamily: MONO, fontSize: "16px", fontWeight: 700, color: score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--danger)", lineHeight: 1, marginBottom: "2px" }}>
            {score}
          </p>
          <p style={{ fontFamily: MONO, fontSize: "7px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>QUALITY</p>
        </div>
      )}

      {/* Context hint */}
      {hasFocus && (
        <div style={{ marginBottom: "4px", maxWidth: "120px", textAlign: "right" }}>
          <p style={{ fontFamily: MONO, fontSize: "7px", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", lineHeight: 1.4 }}>
            {focusedSection!.headline.split(" ").slice(0, 4).join(" ")}…
          </p>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute", right: "100%", marginRight: "8px",
          background: "var(--bg-surface-2)", border: "1px solid var(--border-subtle)",
          borderRadius: "3px", padding: "5px 10px", whiteSpace: "nowrap",
          fontFamily: MONO, fontSize: "9px", color: "var(--text-secondary)",
          pointerEvents: "none",
        }}>
          {tooltip}
        </div>
      )}

      {/* Action buttons */}
      {actions.map((action) => {
        const isDisabled = action.disabled
        const btnStyle = {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "7px 11px",
          background: action.active ? "var(--accent)" : "var(--bg-surface)",
          border: `1px solid ${action.active ? "var(--accent)" : isDisabled ? "var(--border-subtle)" : "var(--border-strong)"}`,
          borderRadius: "4px",
          cursor: isDisabled ? "not-allowed" as const : "pointer" as const,
          color: action.active ? "#fff" : isDisabled ? "var(--text-tertiary)" : "var(--text-secondary)",
          fontFamily: MONO,
          fontSize: "8px",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase" as const,
          textDecoration: "none",
          transition: "background 0.15s, border-color 0.15s, opacity 0.15s",
          whiteSpace: "nowrap" as const,
          opacity: isDisabled ? 0.45 : 1,
        }

        if (action.href) {
          return (
            <Link
              key={action.id} href={action.href} target="_blank" style={btnStyle}
              onMouseEnter={() => setTooltip(action.tooltip ?? null)}
              onMouseLeave={() => setTooltip(null)}
            >
              {action.icon} {action.label}
            </Link>
          )
        }
        return (
          <button
            key={action.id}
            onClick={isDisabled ? undefined : action.onClick}
            style={btnStyle}
            onMouseEnter={() => setTooltip(action.tooltip ?? null)}
            onMouseLeave={() => setTooltip(null)}
          >
            {action.icon} {action.label}
          </button>
        )
      })}
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null)
  const [focusedSection, setFocusedSection] = useState<BriefSection | null>(null)
  const [railSteerSection, setRailSteerSection] = useState<BriefSection | null>(null)
  const [railSteerPreset, setRailSteerPreset] = useState<string>("")

  useEffect(() => {
    getBrief(briefId)
      .then((data) => {
        setBrief(data as unknown as Brief)
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Brief not found.")
        setLoading(false)
      })
  }, [briefId])

  const handleChip = useCallback((id: string) => setActiveEvidence(id), [])

  const handleSectionRegenerated = useCallback((updated: BriefSection) => {
    setBrief((prev) => {
      if (!prev) return prev
      const updatedId = sectionId(updated)
      return {
        ...prev,
        sections: prev.sections.map((s) => sectionId(s) === updatedId ? updated : s),
      }
    })
  }, [])

  const handleCopy = useCallback(() => {
    if (!brief) return
    const meta = brief.metadata
    const lines: string[] = [`# ${meta?.customer_name ?? ""} — ${meta?.period?.label ?? ""}`]
    if (brief.thesis?.sentence) lines.push(`\n> ${brief.thesis.sentence}`)
    if (brief.executive_summary?.length) {
      lines.push("\n## Executive Summary")
      for (const item of brief.executive_summary) lines.push(`- ${item.bullet}`)
    }
    for (const s of brief.sections ?? []) {
      lines.push(`\n## ${s.headline}`)
      lines.push(sectionContent(s).replace(/\[E\d+\]/g, ""))
    }
    if (brief.recommendations?.length) {
      lines.push("\n## Recommendations")
      for (const [i, r] of brief.recommendations.entries()) {
        lines.push(`\n${i + 1}. **${r.headline}**`)
        if (r.expected_impact) lines.push(`   ${r.expected_impact}`)
      }
    }
    if (brief.closing?.ask) lines.push(`\n---\n${brief.closing.ask}`)
    navigator.clipboard.writeText(lines.join("\n"))
  }, [brief])

  const handleFocusSection = useCallback((s: BriefSection) => {
    setFocusedSection(s)
  }, [])

  const handleRailSteer = useCallback((preset: string) => {
    if (!focusedSection) return
    setRailSteerSection(focusedSection)
    setRailSteerPreset(preset)
  }, [focusedSection])

  const handleAudienceToggle = useCallback(() => {
    if (!brief) return
    const audience = brief.metadata?.audience ?? "ciso"
    const newAudience = audience === "ciso" ? "csm" : "ciso"
    const sessionId = brief._session_id ?? ""
    const emphasis = brief._emphasis ?? "balanced"
    const length = brief._length ?? "standard"
    router.push(`/generate?${new URLSearchParams({ session_id: sessionId, audience: newAudience, emphasis, length }).toString()}`)
  }, [brief, router])

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

  const meta = brief.metadata
  const customerName = meta?.customer_name ?? "—"
  const periodLabel = meta?.period?.label ?? "—"
  const audience = meta?.audience ?? "ciso"
  const thesis = brief.thesis?.sentence ?? ""
  const execSummary = brief.executive_summary ?? []
  const sections = brief.sections ?? []
  const exhibits = brief.exhibits ?? []
  const recommendations = brief.recommendations ?? []
  const risks = brief.risks_open_items ?? []
  const closingAsk = brief.closing?.ask ?? ""
  const score = brief._critique?.narrative_score ?? null

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <style>{`
        .brief-section .section-actions { opacity: 0; transition: opacity 0.15s; }
        .brief-section:hover .section-actions { opacity: 1; }
      `}</style>

      {/* Dark chrome header */}
      <header style={{
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
            {audience === "ciso" ? "CISO BRIEF" : "CSM QBR"}
          </span>
          <span style={{ fontFamily: MONO, fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>
            {periodLabel}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {score !== null && (
            <span style={{ fontFamily: MONO, fontSize: "9px", color: score >= 80 ? "var(--success)" : "var(--warning)", letterSpacing: "0.1em" }}>
              QUALITY {score}/100
            </span>
          )}
          <span style={{ fontFamily: MONO, fontSize: "9px", color: "var(--text-tertiary)", letterSpacing: "0.1em" }}>
            {sections.length} SECTIONS
          </span>
        </div>
      </header>

      {/* Paper document */}
      <div style={{ maxWidth: "880px", margin: "48px auto 80px", padding: "0 24px" }}>
        <div style={{ background: P.bg, boxShadow: "0 4px 40px rgba(0,0,0,0.25)", borderRadius: "2px" }}>
          <div style={{ padding: "72px 80px 64px" }}>

            {/* Masthead */}
            <div style={{ marginBottom: "56px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "36px" }}>
                <div style={{ flex: 1, height: "1px", background: P.accent }} />
                <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: P.accent }}>
                  INTELLIGENCE BRIEF · {periodLabel}
                </span>
                <div style={{ flex: 1, height: "1px", background: P.accent }} />
              </div>

              <h1 style={{
                fontFamily: SERIF,
                fontSize: "clamp(38px, 5vw, 60px)", fontWeight: 700,
                lineHeight: 1.04, letterSpacing: "-0.025em",
                color: P.text, marginBottom: "12px",
              }}>
                {customerName}
              </h1>
              <p style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: P.faint, marginBottom: "32px" }}>
                {meta?.prepared_for ? `PREPARED FOR ${meta.prepared_for.toUpperCase()}` : ""}
              </p>

              {/* Thesis */}
              {thesis && (
                <blockquote style={{ margin: 0, borderLeft: `3px solid ${P.accent}`, paddingLeft: "28px" }}>
                  <p style={{ fontFamily: SERIF, fontSize: "19px", lineHeight: 1.75, color: P.text, fontStyle: "italic", fontWeight: 400 }}>
                    {parseContent(thesis, handleChip)}
                  </p>
                </blockquote>
              )}
            </div>

            {/* Executive summary */}
            {execSummary.length > 0 && (
              <div style={{ marginBottom: "56px", padding: "28px 32px", background: P.surface, border: `1px solid ${P.border}`, borderRadius: "4px" }}>
                <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: P.faint, marginBottom: "18px" }}>
                  EXECUTIVE SUMMARY
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {execSummary.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
                      <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, color: P.accent, flexShrink: 0, marginTop: "5px", letterSpacing: "0.04em" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <p style={{ fontFamily: SERIF, fontSize: "15px", lineHeight: 1.65, color: P.text }}>
                        {parseContent(item.bullet, handleChip)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ height: "1px", background: P.border, marginBottom: "56px" }} />

            {/* Sections */}
            <div style={{ display: "flex", flexDirection: "column", gap: "56px", marginBottom: "80px" }}>
              {sections.map((section, i) => (
                <SectionBlock
                  key={sectionId(section) || i}
                  section={section}
                  index={i}
                  briefId={briefId}
                  exhibits={exhibits}
                  onChip={handleChip}
                  onRegenerated={handleSectionRegenerated}
                  onFocus={handleFocusSection}
                />
              ))}
            </div>

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div style={{ marginBottom: "72px" }}>
                <div style={{ height: "1px", background: P.border, marginBottom: "36px" }} />
                <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: P.faint, marginBottom: "4px" }}>
                  RECOMMENDATIONS — {recommendations.length} ACTIONS
                </p>
                {recommendations.map((rec, i) => (
                  <RecommendationCard key={rec.rec_id || i} rec={rec} index={i} />
                ))}
              </div>
            )}

            {/* Risks / open items */}
            {risks.length > 0 && (
              <div style={{ marginBottom: "56px" }}>
                <div style={{ height: "1px", background: P.border, marginBottom: "28px" }} />
                <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: P.faint, marginBottom: "12px" }}>
                  OPEN ITEMS & RISKS
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {risks.map((risk) => {
                    const statusColors: Record<string, string> = {
                      trending_worse: P.danger,
                      open: P.warning,
                      monitoring: P.muted,
                      resolved: P.success,
                    }
                    const statusColor = statusColors[risk.status] ?? P.muted
                    return (
                      <div key={risk.item_id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", background: P.surface, border: `1px solid ${P.border}`, borderRadius: "3px" }}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                        <p style={{ fontFamily: MONO, fontSize: "10px", color: P.text, flex: 1 }}>{risk.label}</p>
                        <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: statusColor, flexShrink: 0 }}>
                          {risk.status.replace("_", " ")}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Closing ask */}
            {closingAsk && (
              <div style={{ marginBottom: "56px", padding: "24px 28px", background: P.surface, borderLeft: `3px solid ${P.accent}`, borderRadius: "0 4px 4px 0" }}>
                <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: P.faint, marginBottom: "8px" }}>CLOSING ASK</p>
                <p style={{ fontFamily: SERIF, fontSize: "16px", lineHeight: 1.7, color: P.text, fontWeight: 500 }}>{closingAsk}</p>
              </div>
            )}

            {/* Signature */}
            <div style={{ height: "1px", background: P.border, marginBottom: "20px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: P.faint }}>
                ABNORMAL BRIEF STUDIO · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}
              </span>
              <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: P.faint }}>
                CLAUDE SONNET 4.6 · 6-STAGE PIPELINE
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed action rail */}
      <ActionRail
        brief={brief}
        briefId={briefId}
        focusedSection={focusedSection}
        onCopy={handleCopy}
        onAudienceToggle={handleAudienceToggle}
        onRailSteer={handleRailSteer}
      />

      {/* Rail-triggered steer modal */}
      {railSteerSection && (
        <SteerModal
          briefId={briefId}
          section={railSteerSection}
          initialSteering={railSteerPreset}
          onClose={() => setRailSteerSection(null)}
          onRegenerated={(updated) => {
            handleSectionRegenerated(updated)
            setRailSteerSection(null)
          }}
        />
      )}

      {/* Evidence drawer */}
      <EvidenceDrawer
        evidenceId={activeEvidence}
        briefId={briefId}
        embeddedIndex={brief.evidence_index ?? {}}
        onClose={() => setActiveEvidence(null)}
      />
    </div>
  )
}
