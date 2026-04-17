"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { getBrief, getEvidence, getSectionPrompt, regenerateSection } from "@/lib/api"
import type { Brief, BriefSection, EvidenceRecord } from "@/lib/types"

const MONO = "'Courier New', Courier, monospace"

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
// Evidence drawer — typed renderers per metric_type
// ---------------------------------------------------------------------------

function EvidenceDrawerDataTable({ rows, totalCount }: { rows: Record<string, unknown>[]; totalCount: number }) {
  if (rows.length === 0) return null
  const cols = Object.keys(rows[0])
  return (
    <div>
      <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "8px" }}>
        SOURCE — {totalCount.toLocaleString()} ROWS
      </p>
      <div style={{ overflowX: "auto", border: "1px solid #E5E4DF" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F0EFE9" }}>
              {cols.map((col) => (
                <th key={col} style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#4C566A", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #E5E4DF", whiteSpace: "nowrap" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((row, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #E5E4DF", background: i % 2 === 0 ? "#FFFFFF" : "#FAFAF7" }}>
                {cols.map((col, j) => (
                  <td key={j} style={{ fontFamily: MONO, fontSize: "10px", color: "#4B5563", padding: "7px 10px", whiteSpace: "nowrap" }}>{String(row[col] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {totalCount > 5 && (
          <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", color: "#9CA3AF", padding: "8px 10px", borderTop: "1px solid #E5E4DF" }}>
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
        <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "6px" }}>METRIC</p>
        <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "15px", color: "#1A1A1A", fontWeight: 600 }}>{record.metric_label}</p>
      </div>

      {/* Scalar: one large number */}
      {mt === "scalar" && record.value != null && (
        <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #E5E4DF" }}>
          <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "6px" }}>VALUE</p>
          <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "36px", fontWeight: 700, color: "#4C566A", lineHeight: 1 }}>
            {typeof record.value === "number"
              ? Number.isInteger(record.value) ? record.value.toLocaleString() : record.value.toFixed(2)
              : record.value}
            {record.unit && <span style={{ fontSize: "16px", marginLeft: "6px", color: "#9CA3AF" }}>{record.unit}</span>}
          </p>
        </div>
      )}

      {/* Criteria table: pass/fail grid */}
      {mt === "criteria_table" && record.criteria_rows && record.criteria_rows.length > 0 && (
        <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #E5E4DF" }}>
          <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "10px" }}>SUCCESS CRITERIA</p>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
            <thead>
              <tr style={{ background: "#F0EFE9" }}>
                {["Criterion", "Target", "Actual", "Status"].map((h) => (
                  <th key={h} style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#4C566A", padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #E5E4DF" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.criteria_rows.map((row, i) => {
                const r = row as Record<string, unknown>
                const met = r.met === true || r.met === "true"
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #E5E4DF" }}>
                    <td style={{ fontFamily: MONO, fontSize: "9px", color: "#374151", padding: "8px 10px" }}>{String(r.description ?? r.criterion ?? "")}</td>
                    <td style={{ fontFamily: MONO, fontSize: "9px", color: "#374151", padding: "8px 10px" }}>{String(r.target ?? "")}</td>
                    <td style={{ fontFamily: MONO, fontSize: "9px", color: "#374151", padding: "8px 10px" }}>{String(r.actual ?? "")}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{
                        fontFamily: MONO, fontSize: "8px", fontWeight: 700,
                        letterSpacing: "0.1em", textTransform: "uppercase",
                        padding: "2px 8px",
                        background: met ? "#D1FAE5" : "#FEE2E2",
                        color: met ? "#065F46" : "#991B1B",
                      }}>
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

      {/* Breakdown: horizontal bar chart */}
      {mt === "breakdown" && record.segments && record.segments.length > 0 && (
        <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #E5E4DF" }}>
          <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "10px" }}>BREAKDOWN</p>
          {record.segments.map((seg, i) => (
            <div key={i} style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <span style={{ fontFamily: MONO, fontSize: "9px", color: "#374151" }}>{seg.label}</span>
                <span style={{ fontFamily: MONO, fontSize: "9px", color: "#4C566A", fontWeight: 700 }}>
                  {typeof seg.value === "number" && Number.isInteger(seg.value) ? seg.value.toLocaleString() : seg.value.toFixed ? seg.value.toFixed(2) : seg.value}
                  <span style={{ color: "#9CA3AF", marginLeft: "6px" }}>({(seg.share * 100).toFixed(1)}%)</span>
                </span>
              </div>
              <div style={{ height: "4px", background: "#E5E4DF", borderRadius: "2px" }}>
                <div style={{ height: "100%", width: `${Math.min(seg.share * 100, 100)}%`, background: "#4C566A", borderRadius: "2px" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Row list: paginated table */}
      {mt === "row_list" && record.rows && (
        <div style={{ marginBottom: "20px", paddingBottom: "20px", borderBottom: "1px solid #E5E4DF" }}>
          <EvidenceDrawerDataTable rows={record.rows} totalCount={record.source_row_count} />
        </div>
      )}

      {/* Calculation */}
      <div style={{ marginBottom: "20px" }}>
        <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "6px" }}>CALCULATION</p>
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

  // Close on Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  const open = !!evidenceId

  return (
    <>
      {open && <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(26,26,26,0.3)" }} onClick={onClose} />}
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100%", zIndex: 50,
        width: "480px", background: "#FAFAF7", borderLeft: "1px solid #E5E4DF",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E5E4DF", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "4px" }}>EVIDENCE RECORD</p>
            {record && <p style={{ fontFamily: MONO, fontSize: "13px", fontWeight: 700, letterSpacing: "0.06em", color: "#4C566A" }}>{evidenceId}</p>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #E5E4DF", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#4C566A" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <div style={{ width: "20px", height: "20px", border: "2px solid #E5E4DF", borderTopColor: "#4C566A", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}
          {err && <p style={{ fontFamily: MONO, fontSize: "10px", color: "#C0392B" }}>{err}</p>}
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
    try { setPromptData(await getSectionPrompt(briefId, section.id)) }
    catch (e) { setError(e instanceof Error ? e.message : "Failed.") }
    finally { setLoadingPrompt(false) }
  }, [briefId, section.id, promptData])

  useEffect(() => { if (tab === "prompt") handleLoadPrompt() }, [tab, handleLoadPrompt])

  const handleRegenerate = async () => {
    setRegenerating(true); setError(null)
    try { onRegenerated(await regenerateSection(briefId, section.id, steering || undefined)); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : "Regeneration failed."); setRegenerating(false) }
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(26,26,26,0.5)" }} onClick={onClose} />
      <div style={{
        position: "fixed", zIndex: 60, background: "#FAFAF7", border: "1px solid #E5E4DF",
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "min(580px, 92vw)", maxHeight: "80vh",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E5E4DF", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "4px" }}>REWRITE SECTION</p>
            <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "15px", color: "#1A1A1A", fontWeight: 600 }}>{section.headline}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #E5E4DF", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#4C566A" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #E5E4DF" }}>
          {(["steer", "prompt"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 20px", background: "none", cursor: "pointer",
              fontFamily: MONO, fontSize: "9px", fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase",
              color: tab === t ? "#1A1A1A" : "#9CA3AF",
              border: "none",
              borderBottom: tab === t ? "2px solid #4C566A" : "2px solid transparent",
            }}>
              {t === "steer" ? "STEER REWRITE" : "VIEW PROMPT"}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {tab === "steer" && (
            <div>
              <p style={{ fontFamily: MONO, fontSize: "10px", lineHeight: 1.7, color: "#6B7280", marginBottom: "16px" }}>
                Describe what you want different. The AI will rewrite this section with your note as steering.
              </p>
              <textarea value={steering} onChange={(e) => setSteering(e.target.value)}
                placeholder="e.g. Lead with the credential submission risk. Avoid mentioning department names. Close with a direct budget ask."
                rows={5} style={{
                  width: "100%", padding: "12px", background: "#FFFFFF",
                  border: "1px solid #E5E4DF", fontFamily: MONO, fontSize: "11px",
                  color: "#1A1A1A", lineHeight: 1.6, resize: "none",
                  outline: "none", boxSizing: "border-box",
                }} />
              {error && <p style={{ fontFamily: MONO, fontSize: "9px", color: "#C0392B", marginTop: "8px" }}>{error}</p>}
            </div>
          )}
          {tab === "prompt" && (
            <div>
              {loadingPrompt && <div style={{ display: "flex", justifyContent: "center", padding: "32px" }}><div style={{ width: "18px", height: "18px", border: "2px solid #E5E4DF", borderTopColor: "#4C566A", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /></div>}
              {promptData && !loadingPrompt && (
                <div>
                  <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "8px" }}>SYSTEM PROMPT</p>
                  <pre style={{ fontFamily: MONO, fontSize: "10px", lineHeight: 1.65, padding: "12px", background: "#F0EFE9", overflowX: "auto", whiteSpace: "pre-wrap", color: "#374151", marginBottom: "20px" }}>{promptData.system_prompt}</pre>
                  <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "8px" }}>USER PROMPT (RENDERED)</p>
                  <pre style={{ fontFamily: MONO, fontSize: "10px", lineHeight: 1.65, padding: "12px", background: "#F0EFE9", overflowX: "auto", whiteSpace: "pre-wrap", color: "#374151" }}>{promptData.user_prompt}</pre>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #E5E4DF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9CA3AF" }}>CANCEL</button>
          <button onClick={handleRegenerate} disabled={regenerating} style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "10px 24px", background: "#1A1A1A", color: "#FAFAF7",
            fontFamily: MONO, fontSize: "9px", fontWeight: 700,
            letterSpacing: "0.14em", textTransform: "uppercase",
            border: "none", cursor: regenerating ? "not-allowed" : "pointer",
            opacity: regenerating ? 0.6 : 1,
          }}>
            {regenerating && <div style={{ width: "10px", height: "10px", border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#FAFAF7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
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

function SectionBlock({ section, index, briefId, onChip, onRegenerated }: {
  section: BriefSection; index: number; briefId: string
  onChip: (id: string) => void; onRegenerated: (s: BriefSection) => void
}) {
  const [steerOpen, setSteerOpen] = useState(false)
  const [rewriting, setRewriting] = useState(false)

  const handleQuickRegen = async () => {
    setRewriting(true)
    try { onRegenerated(await regenerateSection(briefId, section.id)) }
    catch { /* silent */ }
    finally { setRewriting(false) }
  }

  return (
    <>
      <section style={{ opacity: rewriting ? 0.5 : 1, transition: "opacity 0.2s", position: "relative" }} className="brief-section">
        {/* Section number in margin */}
        <div style={{ display: "flex", gap: "0", alignItems: "flex-start" }}>
          <div style={{ width: "72px", flexShrink: 0, paddingTop: "4px" }}>
            <span style={{ fontFamily: MONO, fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", color: "#D1CFC6" }}>
              {String(index + 1).padStart(2, "0")}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            {/* Headline row */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "16px" }}>
              <h2 style={{
                fontFamily: "var(--font-source-serif), Georgia, serif",
                fontSize: "22px", fontWeight: 700, lineHeight: 1.3,
                color: "#1A1A1A", letterSpacing: "-0.01em",
              }}>
                {section.headline}
              </h2>
              {/* Hover actions */}
              <div className="section-actions" style={{ display: "flex", gap: "6px", flexShrink: 0, marginTop: "2px" }}>
                <button onClick={() => setSteerOpen(true)} title="Edit prompt / steer rewrite" style={{
                  width: "28px", height: "28px", background: "none", border: "1px solid #E5E4DF",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M8.5 1.5a1.414 1.414 0 112 2L4 10H2v-2l6.5-6.5z" stroke="#4C566A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button onClick={handleQuickRegen} disabled={rewriting} title="Regenerate section" style={{
                  width: "28px", height: "28px", background: "none", border: "1px solid #E5E4DF",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}>
                  {rewriting ? (
                    <div style={{ width: "10px", height: "10px", border: "1.5px solid #E5E4DF", borderTopColor: "#4C566A", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M10.5 2C9.5.8 8 0 6.5 0A6.5 6.5 0 000 6.5h1.5A5 5 0 016.5 1.5c1.1 0 2.2.4 3 1.1L7.5 5H12V0L10.5 2z" fill="#4C566A" />
                      <path d="M10.5 6.5A5 5 0 016.5 11c-1.1 0-2.2-.4-3-1.1L5.5 7H1v5l1.5-2C3.5 11.2 5 12 6.5 12A6.5 6.5 0 0013 5.5H10.5z" fill="#4C566A" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {/* Content */}
            <div style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "16px", lineHeight: 1.85, color: "#374151" }}>
              {parseContent(section.content, onChip)}
            </div>
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
  const r = rec as Record<string, string | undefined>
  return (
    <div style={{ display: "flex", gap: "0", borderBottom: "1px solid #E5E4DF", padding: "24px 0" }}>
      <div style={{ width: "72px", flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "28px", fontWeight: 700, color: "#E5E4DF", lineHeight: 1 }}>
          {index + 1}
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "10px" }}>
          <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "17px", fontWeight: 700, color: "#1A1A1A", flex: 1, lineHeight: 1.4 }}>
            {r.action ?? r.title ?? ""}
          </p>
          {(r.ask_type || r.commercial_angle) && (
            <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", padding: "4px 10px", background: "#F0EFE9", color: "#4C566A", flexShrink: 0, border: "1px solid #E5E4DF" }}>
              {r.ask_type ?? r.commercial_angle}
            </span>
          )}
        </div>
        {r.gap && <p style={{ fontFamily: MONO, fontSize: "10px", color: "#9CA3AF", marginBottom: "8px" }}>GAP: {r.gap}</p>}
        {r.expected_impact && (
          <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "14px", lineHeight: 1.65, color: "#4B5563", marginBottom: "6px" }}>
            <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9CA3AF", marginRight: "8px" }}>IMPACT</span>
            {r.expected_impact}
          </p>
        )}
        {r.rationale_chain && <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "14px", lineHeight: 1.65, color: "#6B7280", fontStyle: "italic" }}>{r.rationale_chain}</p>}
        {r.next_step && (
          <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "14px", lineHeight: 1.65, color: "#4B5563", marginTop: "6px" }}>
            <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9CA3AF", marginRight: "8px" }}>NEXT</span>
            {r.next_step}
          </p>
        )}
      </div>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeEvidence, setActiveEvidence] = useState<string | null>(null)

  useEffect(() => {
    getBrief(briefId)
      .then((data) => { setRawBrief(data); setBrief(data as unknown as Brief); setLoading(false) })
      .catch((e) => { setError(e instanceof Error ? e.message : "Brief not found."); setLoading(false) })
  }, [briefId])

  const handleChip = useCallback((id: string) => setActiveEvidence(id), [])

  const handleSectionRegenerated = useCallback((updated: BriefSection) => {
    setBrief((prev) => prev ? { ...prev, sections: prev.sections.map((s) => s.id === updated.id ? updated : s) } : prev)
  }, [])

  const handleCopy = useCallback(() => {
    if (!brief) return
    const lines: string[] = [`# ${brief.company_name} — ${brief.period}`, `\n> ${brief.thesis}`]
    for (const s of brief.sections) {
      lines.push(`\n## ${s.headline}`)
      lines.push(s.content.replace(/\[E\d+\]/g, ""))
    }
    if (brief.recommendations.length > 0) {
      lines.push("\n## Recommendations")
      for (const [i, r] of brief.recommendations.entries()) {
        const rec = r as Record<string, string | undefined>
        lines.push(`\n${i + 1}. **${rec.action ?? ""}**`)
        if (rec.expected_impact) lines.push(`   ${rec.expected_impact}`)
      }
    }
    navigator.clipboard.writeText(lines.join("\n"))
  }, [brief])

  const handleAudienceToggle = useCallback(() => {
    if (!brief) return
    const newAudience = brief.audience === "ciso" ? "csm" : "ciso"
    const sessionId = (rawBrief.session_id as string) || brief.session_id
    const emphasis = (rawBrief.emphasis as string) || "balanced"
    const length = (rawBrief.length as string) || "standard"
    router.push(`/generate?${new URLSearchParams({ session_id: sessionId, audience: newAudience, emphasis, length }).toString()}`)
  }, [brief, rawBrief, router])

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "24px", height: "24px", border: "2px solid var(--border-strong)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (error || !brief) return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--danger)", marginBottom: "16px" }}>{error ?? "BRIEF NOT FOUND"}</p>
        <Link href="/ingest" style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--accent)", borderBottom: "1px solid var(--accent-dim)", paddingBottom: "1px" }}>START OVER</Link>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .brief-section .section-actions { opacity: 0; transition: opacity 0.15s; }
        .brief-section:hover .section-actions { opacity: 1; }
      `}</style>

      {/* Sticky header — dark chrome */}
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
            {brief.audience === "ciso" ? "CISO" : "CSM QBR"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {[
            { label: `SWITCH TO ${brief.audience === "ciso" ? "CSM" : "CISO"}`, onClick: handleAudienceToggle },
            { label: "COPY MARKDOWN", onClick: handleCopy },
          ].map(({ label, onClick }) => (
            <button key={label} onClick={onClick} style={{
              fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em",
              textTransform: "uppercase", padding: "8px 14px",
              background: "none", border: "1px solid var(--border-strong)", color: "var(--text-secondary)", cursor: "pointer", borderRadius: "3px",
            }}>{label}</button>
          ))}
          <Link href={`/brief/${briefId}/print`} target="_blank" style={{
            fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", padding: "8px 14px",
            background: "none", border: "1px solid var(--border-strong)", color: "var(--text-secondary)",
            textDecoration: "none", display: "inline-block", borderRadius: "3px",
          }}>PRINT PDF</Link>
        </div>
      </header>

      {/* Brief body — light paper */}
      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "80px 48px" }}>

        {/* Masthead */}
        <div style={{ marginBottom: "64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "32px" }}>
            <div style={{ flex: 1, height: "1px", background: "#4C566A" }} />
            <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: "#4C566A" }}>
              INTELLIGENCE BRIEF · {brief.period}
            </span>
            <div style={{ flex: 1, height: "1px", background: "#4C566A" }} />
          </div>

          <h1 style={{
            fontFamily: "var(--font-source-serif), Georgia, serif",
            fontSize: "clamp(40px, 5vw, 60px)", fontWeight: 700,
            lineHeight: 1.05, letterSpacing: "-0.02em",
            color: "#1A1A1A", marginBottom: "40px",
          }}>
            {brief.company_name}
          </h1>

          {/* Thesis — styled as a lede */}
          <div style={{ borderLeft: "3px solid #4C566A", paddingLeft: "28px", marginLeft: "0" }}>
            <p style={{
              fontFamily: "var(--font-source-serif), Georgia, serif",
              fontSize: "20px", lineHeight: 1.7, color: "#1A1A1A",
              fontStyle: "italic", fontWeight: 400,
            }}>
              {brief.thesis}
            </p>
          </div>
        </div>

        {/* Rule */}
        <div style={{ height: "1px", background: "#E5E4DF", marginBottom: "64px" }} />

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: "52px", marginBottom: "72px" }}>
          {brief.sections.map((section, i) => (
            <SectionBlock key={section.id} section={section} index={i} briefId={briefId} onChip={handleChip} onRegenerated={handleSectionRegenerated} />
          ))}
        </div>

        {/* Recommendations */}
        {brief.recommendations.length > 0 && (
          <div style={{ marginBottom: "64px" }}>
            <div style={{ height: "1px", background: "#E5E4DF", marginBottom: "40px" }} />
            <div style={{ display: "flex", alignItems: "baseline", gap: "24px", marginBottom: "0" }}>
              <div style={{ width: "72px", flexShrink: 0 }}>
                <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "#9CA3AF" }}>REC.</span>
              </div>
              <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9CA3AF" }}>
                RECOMMENDATIONS — {brief.recommendations.length} ACTIONS
              </p>
            </div>
            {brief.recommendations.map((rec, i) => (
              <RecommendationCard key={i} rec={rec} index={i} />
            ))}
          </div>
        )}

        {/* Risks */}
        {brief.risks && brief.risks.length > 0 && (
          <div style={{ marginBottom: "64px" }}>
            <div style={{ height: "1px", background: "#E5E4DF", marginBottom: "32px" }} />
            <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "20px", marginLeft: "72px" }}>
              RISK FLAGS
            </p>
            {brief.risks.map((risk, i) => (
              <div key={i} style={{ display: "flex", gap: "0", borderBottom: "1px solid #E5E4DF", padding: "16px 0" }}>
                <div style={{ width: "72px", flexShrink: 0 }}>
                  <span style={{ fontFamily: MONO, fontSize: "10px", color: "#C0392B" }}>▲</span>
                </div>
                <div>
                  <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "15px", fontWeight: 600, color: "#1A1A1A", marginBottom: "4px" }}>
                    {String(risk.title ?? risk.risk ?? "")}
                  </p>
                  {risk.description != null && (
                    <p style={{ fontFamily: "var(--font-source-serif), Georgia, serif", fontSize: "14px", color: "#6B7280", lineHeight: 1.6 }}>{String(risk.description)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Signature */}
        <div style={{ height: "1px", background: "#E5E4DF", marginBottom: "24px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9CA3AF" }}>
            ABNORMAL BRIEF STUDIO · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}
          </span>
          <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9CA3AF" }}>
            {brief.sections.length} SECTIONS · {brief.recommendations.length} RECOMMENDATIONS
          </span>
        </div>
      </main>

      {/* Evidence drawer */}
      <EvidenceDrawer evidenceId={activeEvidence} briefId={briefId} onClose={() => setActiveEvidence(null)} />
    </div>
  )
}
