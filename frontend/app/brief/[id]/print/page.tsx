"use client"

export const dynamic = 'force-dynamic'

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getBrief, getBriefEvidenceIndex } from "@/lib/api"
import type { Brief, EvidenceRecord } from "@/lib/types"
import "@/styles/print.css"

const MONO = "'Courier New', Courier, monospace"
const SERIF = "var(--font-source-serif), Georgia, serif"

// ---------------------------------------------------------------------------
// Build footnote map: assigns a sequential number to each unique evidence ref
// in the order they first appear across all sections.
// ---------------------------------------------------------------------------

function buildFootnoteMap(sections: Brief["sections"]): Map<string, number> {
  const map = new Map<string, number>()
  let counter = 0
  for (const section of sections) {
    const matches = section.content.matchAll(/\[E(\d+)\]/g)
    for (const m of matches) {
      const key = `E${m[1]}`
      if (!map.has(key)) {
        counter++
        map.set(key, counter)
      }
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Render prose: replace [E{n}] with <sup>{footnote}</sup>
// ---------------------------------------------------------------------------

function PrintProse({ content, footnoteMap }: { content: string; footnoteMap: Map<string, number> }) {
  const parts = content.split(/(\[E\d+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[E(\d+)\]$/)
        if (match) {
          const key = `E${match[1]}`
          const fn = footnoteMap.get(key)
          return fn != null ? (
            <sup key={i} className="print-footnote-ref">{fn}</sup>
          ) : null
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Evidence appendix entry
// ---------------------------------------------------------------------------

function AppendixEntry({ footnote, record }: { footnote: number; record: EvidenceRecord }) {
  const mt = record.metric_type

  return (
    <div className="appendix-entry avoid-break" style={{ borderBottom: "0.5pt solid #E5E4DF", paddingBottom: "12pt", marginBottom: "12pt" }}>
      <div style={{ display: "flex", gap: "12pt", alignItems: "baseline", marginBottom: "4pt" }}>
        <sup style={{ fontFamily: MONO, fontSize: "8pt", color: "#4C566A", fontWeight: 700, flexShrink: 0 }}>{footnote}</sup>
        <p style={{ fontFamily: MONO, fontSize: "9pt", fontWeight: 700, color: "#1A1A1A", margin: 0 }}>{record.metric_label}</p>
      </div>
      <div style={{ paddingLeft: "20pt" }}>
        <p style={{ fontFamily: MONO, fontSize: "8pt", color: "#6B7280", lineHeight: 1.5, marginBottom: "6pt" }}>
          {record.calculation_description}
        </p>

        {mt === "scalar" && record.value != null && (
          <p style={{ fontFamily: SERIF, fontSize: "11pt", fontWeight: 700, color: "#374151" }}>
            {typeof record.value === "number"
              ? Number.isInteger(record.value) ? record.value.toLocaleString() : record.value.toFixed(2)
              : String(record.value)}
            {record.unit && <span style={{ fontWeight: 400, fontSize: "9pt", marginLeft: "4pt" }}>{record.unit}</span>}
          </p>
        )}

        {mt === "criteria_table" && record.criteria_rows && record.criteria_rows.length > 0 && (
          <table style={{ borderCollapse: "collapse", fontSize: "8pt", fontFamily: MONO, width: "100%" }}>
            <thead>
              <tr>
                {["Criterion", "Target", "Actual", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "3pt 6pt", borderBottom: "0.5pt solid #E5E4DF", color: "#4C566A", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.criteria_rows.slice(0, 5).map((row, i) => {
                const r = row as Record<string, unknown>
                const met = r.met === true || r.met === "true"
                return (
                  <tr key={i}>
                    <td style={{ padding: "3pt 6pt", color: "#374151" }}>{String(r.description ?? r.criterion ?? "")}</td>
                    <td style={{ padding: "3pt 6pt", color: "#374151" }}>{String(r.target ?? "")}</td>
                    <td style={{ padding: "3pt 6pt", color: "#374151" }}>{String(r.actual ?? "")}</td>
                    <td style={{ padding: "3pt 6pt", fontWeight: 700, color: met ? "#065F46" : "#991B1B" }}>{met ? "PASS" : "FAIL"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {mt === "breakdown" && record.segments && record.segments.length > 0 && (
          <table style={{ borderCollapse: "collapse", fontSize: "8pt", fontFamily: MONO }}>
            <tbody>
              {record.segments.slice(0, 5).map((seg, i) => (
                <tr key={i}>
                  <td style={{ padding: "2pt 8pt 2pt 0", color: "#374151" }}>{seg.label}</td>
                  <td style={{ padding: "2pt 0", color: "#1A1A1A", fontWeight: 700 }}>
                    {Number.isInteger(seg.value) ? seg.value.toLocaleString() : seg.value.toFixed(2)}
                  </td>
                  <td style={{ padding: "2pt 0 2pt 8pt", color: "#9CA3AF" }}>({(seg.share * 100).toFixed(1)}%)</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {mt === "row_list" && record.rows && record.rows.length > 0 && (
          <table style={{ borderCollapse: "collapse", fontSize: "8pt", fontFamily: MONO, width: "100%" }}>
            <thead>
              <tr>
                {Object.keys(record.rows[0]).slice(0, 5).map((col) => (
                  <th key={col} style={{ textAlign: "left", padding: "3pt 6pt", borderBottom: "0.5pt solid #E5E4DF", color: "#4C566A", letterSpacing: "0.08em", textTransform: "uppercase" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {record.rows.slice(0, 5).map((row, i) => (
                <tr key={i}>
                  {Object.entries(row).slice(0, 5).map(([, val], j) => (
                    <td key={j} style={{ padding: "3pt 6pt", color: "#374151" }}>{String(val ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main print page
// ---------------------------------------------------------------------------

export default function PrintPage() {
  const params = useParams()
  const briefId = params.id as string

  const [brief, setBrief] = useState<Brief | null>(null)
  const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getBrief(briefId),
      getBriefEvidenceIndex(briefId).catch(() => [] as EvidenceRecord[]),
    ])
      .then(([briefData, evidenceData]) => {
        setBrief(briefData as unknown as Brief)
        setEvidenceRecords(evidenceData)
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Brief not found.")
        setLoading(false)
      })
  }, [briefId])

  useEffect(() => {
    if (brief && !loading) {
      const t = setTimeout(() => window.print(), 900)
      return () => clearTimeout(t)
    }
  }, [brief, loading])

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, color: "#6B7280", fontSize: "12px" }}>
        Preparing print view…
      </div>
    )
  }

  if (error || !brief) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, color: "#C0392B", fontSize: "12px" }}>
        {error ?? "Brief not found."}
      </div>
    )
  }

  const footnoteMap = buildFootnoteMap(brief.sections)

  // Build ordered list of evidence refs for the appendix (in footnote order)
  const orderedRefs = Array.from(footnoteMap.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key)

  const evidenceByRef = new Map(evidenceRecords.map((r) => [r.evidence_id, r]))

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 0", fontFamily: SERIF, color: "#1A1A1A", background: "#FFFFFF" }}>

      {/* Print controls — hidden in print */}
      <div className="no-print" style={{ marginBottom: "32px", display: "flex", gap: "12px" }}>
        <button
          onClick={() => window.print()}
          style={{ padding: "8px 20px", background: "#1A1A1A", color: "#FAFAF7", border: "none", fontSize: "13px", cursor: "pointer", fontFamily: MONO }}
        >
          Print / Save as PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: "8px 16px", background: "transparent", color: "#6B7280", border: "1px solid #E5E4DF", fontSize: "13px", cursor: "pointer", fontFamily: MONO }}
        >
          Close
        </button>
      </div>

      {/* Masthead */}
      <div style={{ marginBottom: "40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <span style={{ fontFamily: MONO, fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 10px", background: "#1A1A1A", color: "#FAFAF7" }}>
            {brief.audience === "ciso" ? "CISO" : "CSM QBR"}
          </span>
          <span style={{ fontFamily: MONO, fontSize: "11px", color: "#9CA3AF" }}>{brief.period}</span>
          <span style={{ fontFamily: MONO, fontSize: "11px", color: "#9CA3AF", marginLeft: "auto" }}>Abnormal Brief Studio</span>
        </div>

        <h1 style={{ fontFamily: SERIF, fontSize: "28px", fontWeight: 600, lineHeight: 1.2, marginBottom: "20px", color: "#1A1A1A" }}>
          {brief.company_name}
        </h1>

        <div style={{ borderLeft: "2px solid #1A1A1A", paddingLeft: "14px" }}>
          <p style={{ fontFamily: SERIF, fontSize: "14px", lineHeight: 1.7, color: "#374151", margin: 0, fontStyle: "italic" }}>
            {brief.thesis}
          </p>
        </div>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #E5E4DF", margin: "0 0 36px 0" }} />

      {/* Sections */}
      <div style={{ marginBottom: "40px" }}>
        {brief.sections.map((section, i) => (
          <div key={section.id} className="avoid-break" style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <span style={{ fontFamily: MONO, fontSize: "11px", color: "#9CA3AF", flexShrink: 0, marginTop: "3px" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontFamily: SERIF, fontSize: "15px", fontWeight: 600, lineHeight: 1.4, marginBottom: "10px", color: "#1A1A1A" }}>
                  {section.headline}
                </h2>
                <p style={{ fontSize: "11px", lineHeight: 1.75, color: "#374151", margin: 0 }}>
                  <PrintProse content={section.content} footnoteMap={footnoteMap} />
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {brief.recommendations.length > 0 && (
        <>
          <hr style={{ border: "none", borderTop: "1px solid #E5E4DF", margin: "0 0 28px 0" }} />
          <div style={{ marginBottom: "40px" }}>
            <p style={{ fontFamily: MONO, fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "16px" }}>
              Recommendations
            </p>
            {brief.recommendations.map((rec, i) => {
              const r = rec as Record<string, string | undefined>
              return (
                <div key={i} className="avoid-break" data-rec-card style={{ border: "1px solid #E5E4DF", padding: "12px 14px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                    <span style={{ fontFamily: SERIF, fontSize: "14px", color: "#1A1A1A", flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: "11px", fontWeight: 600, marginBottom: "4px", color: "#1A1A1A" }}>{r.action ?? r.title ?? ""}</p>
                      {r.expected_impact && <p style={{ fontSize: "10px", color: "#4B5563", margin: 0 }}>{r.expected_impact}</p>}
                      {r.rationale_chain && <p style={{ fontSize: "10px", color: "#6B7280", marginTop: "4px" }}>{r.rationale_chain}</p>}
                    </div>
                    {(r.ask_type || r.commercial_angle) && (
                      <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 8px", background: "#F0EFE9", color: "#4C566A", flexShrink: 0 }}>
                        {r.ask_type ?? r.commercial_angle}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Signature */}
      <hr style={{ border: "none", borderTop: "1px solid #E5E4DF", margin: "0 0 16px 0" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <p style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF" }}>
          Generated by Abnormal Brief Studio · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
        <p style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF" }}>
          {brief.sections.length} sections · {brief.recommendations.length} recommendations
        </p>
      </div>

      {/* Evidence & Sources appendix — own page */}
      {orderedRefs.length > 0 && (
        <div className="page-break-before" style={{ paddingTop: "8px" }}>
          <div style={{ marginBottom: "24pt" }}>
            <p style={{ fontFamily: MONO, fontSize: "8pt", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "4pt" }}>APPENDIX</p>
            <h2 style={{ fontFamily: SERIF, fontSize: "18pt", fontWeight: 700, color: "#1A1A1A" }}>Evidence &amp; Sources</h2>
            <p style={{ fontFamily: MONO, fontSize: "9pt", color: "#6B7280", marginTop: "6pt" }}>
              Each footnote below corresponds to a superscript reference in the brief above.
            </p>
          </div>
          <hr style={{ border: "none", borderTop: "0.5pt solid #E5E4DF", margin: "0 0 16pt 0" }} />
          {orderedRefs.map((ref) => {
            const fn = footnoteMap.get(ref)!
            const rec = evidenceByRef.get(ref)
            if (!rec) return (
              <div key={ref} style={{ fontFamily: MONO, fontSize: "9pt", color: "#9CA3AF", marginBottom: "8pt" }}>
                <sup>{fn}</sup> {ref} — record not available
              </div>
            )
            return <AppendixEntry key={ref} footnote={fn} record={rec} />
          })}
        </div>
      )}
    </div>
  )
}
