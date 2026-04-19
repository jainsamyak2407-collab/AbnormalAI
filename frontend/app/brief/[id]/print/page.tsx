"use client"

export const dynamic = 'force-dynamic'

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getBrief } from "@/lib/api"
import type { Brief, BriefSection, EvidenceRecord } from "@/lib/types"
import "@/styles/print.css"

const MONO = "var(--font-mono)"
const SERIF = "var(--font-serif)"

function sectionId(s: BriefSection) {
  return s.section_id || s.id || ""
}

function sectionContent(s: BriefSection) {
  return s.prose_inline || s.content || ""
}

// ---------------------------------------------------------------------------
// Build footnote map: sequential number per unique evidence ref in section order
// ---------------------------------------------------------------------------

function buildFootnoteMap(sections: BriefSection[]): Map<string, number> {
  const map = new Map<string, number>()
  let counter = 0
  for (const section of sections) {
    const matches = sectionContent(section).matchAll(/\[E(\d+)\]/g)
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
// Render prose: replace [E{n}] with superscript footnote number
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // No auto-print — user clicks the button when ready

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

  const meta = brief.metadata
  const customerName = meta?.customer_name ?? "—"
  const periodLabel = meta?.period?.label ?? "—"
  const audience = meta?.audience ?? "ciso"
  const thesis = brief.thesis?.sentence ?? ""
  const sections = brief.sections ?? []
  const recommendations = brief.recommendations ?? []

  const footnoteMap = buildFootnoteMap(sections)

  // Build ordered list of evidence refs for appendix (in footnote order)
  const orderedRefs = Array.from(footnoteMap.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key)

  // Build evidence lookup from embedded evidence_index
  const evidenceIndex = brief.evidence_index ?? {}
  const evidenceByRef = new Map<string, EvidenceRecord>(
    Object.entries(evidenceIndex).map(([id, rec]) => [
      id,
      {
        evidence_id: id,
        metric_label: rec.metric_label,
        metric_type: rec.metric_type as EvidenceRecord["metric_type"],
        calculation_description: rec.calculation_description,
        source_row_count: rec.source_rows?.length ?? 0,
        value: rec.value,
        unit: rec.unit,
      } satisfies EvidenceRecord,
    ])
  )

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 0", fontFamily: SERIF, color: "#1A1A1A", background: "#FFFFFF" }}>

      {/* Print controls — hidden in print */}
      <div className="no-print" style={{ marginBottom: "32px" }}>
        <div style={{ display: "flex", gap: "12px", marginBottom: "10px" }}>
          <button
            onClick={() => window.print()}
            style={{ padding: "10px 24px", background: "#1A1A1A", color: "#FAFAF7", border: "none", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: MONO, borderRadius: "3px" }}
          >
            Download PDF
          </button>
          <button
            onClick={() => window.close()}
            style={{ padding: "10px 16px", background: "transparent", color: "#6B7280", border: "1px solid #E5E4DF", fontSize: "13px", cursor: "pointer", fontFamily: MONO, borderRadius: "3px" }}
          >
            Close
          </button>
        </div>
        <p style={{ fontFamily: MONO, fontSize: "11px", color: "#9CA3AF", margin: 0 }}>
          In the print dialog, set <strong style={{ color: "#4C566A" }}>Destination</strong> to <strong style={{ color: "#4C566A" }}>"Save as PDF"</strong>
        </p>
      </div>

      {/* Masthead */}
      <div style={{ marginBottom: "40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <span style={{ fontFamily: MONO, fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 10px", background: "#1A1A1A", color: "#FAFAF7" }}>
            {audience === "ciso" ? "CISO" : "CSM QBR"}
          </span>
          <span style={{ fontFamily: MONO, fontSize: "11px", color: "#9CA3AF" }}>{periodLabel}</span>
          <span style={{ fontFamily: MONO, fontSize: "11px", color: "#9CA3AF", marginLeft: "auto" }}>Abnormal Brief Studio</span>
        </div>

        <h1 style={{ fontFamily: SERIF, fontSize: "28px", fontWeight: 600, lineHeight: 1.2, marginBottom: "20px", color: "#1A1A1A" }}>
          {customerName}
        </h1>

        {thesis && (
          <div style={{ borderLeft: "2px solid #1A1A1A", paddingLeft: "14px" }}>
            <p style={{ fontFamily: SERIF, fontSize: "14px", lineHeight: 1.7, color: "#374151", margin: 0, fontStyle: "italic" }}>
              {thesis}
            </p>
          </div>
        )}
      </div>

      <hr style={{ border: "none", borderTop: "1px solid #E5E4DF", margin: "0 0 36px 0" }} />

      {/* Executive summary */}
      {(brief.executive_summary ?? []).length > 0 && (
        <div style={{ marginBottom: "32px", padding: "16px 20px", background: "#F5F4EF", border: "1px solid #E5E4DF" }}>
          <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "12px" }}>
            EXECUTIVE SUMMARY
          </p>
          {brief.executive_summary.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: "12px", marginBottom: "8px" }}>
              <span style={{ fontFamily: MONO, fontSize: "9px", color: "#4C566A", flexShrink: 0 }}>{i + 1}.</span>
              <p style={{ fontFamily: SERIF, fontSize: "12px", lineHeight: 1.6, color: "#1A1A1A", margin: 0 }}>
                <PrintProse content={item.bullet} footnoteMap={footnoteMap} />
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Sections */}
      <div style={{ marginBottom: "40px" }}>
        {sections.map((section, i) => (
          <div key={sectionId(section) || i} className="avoid-break" style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
              <span style={{ fontFamily: MONO, fontSize: "11px", color: "#9CA3AF", flexShrink: 0, marginTop: "3px" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontFamily: SERIF, fontSize: "15px", fontWeight: 600, lineHeight: 1.4, marginBottom: "10px", color: "#1A1A1A" }}>
                  {section.headline}
                </h2>
                <p style={{ fontSize: "11px", lineHeight: 1.75, color: "#374151", margin: 0 }}>
                  <PrintProse content={sectionContent(section)} footnoteMap={footnoteMap} />
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <>
          <hr style={{ border: "none", borderTop: "1px solid #E5E4DF", margin: "0 0 28px 0" }} />
          <div style={{ marginBottom: "40px" }}>
            <p style={{ fontFamily: MONO, fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "16px" }}>
              Recommendations
            </p>
            {recommendations.map((rec, i) => (
              <div key={rec.rec_id || i} className="avoid-break" style={{ border: "1px solid #E5E4DF", padding: "12px 14px", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{ fontFamily: SERIF, fontSize: "14px", color: "#1A1A1A", flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "11px", fontWeight: 600, marginBottom: "4px", color: "#1A1A1A" }}>{rec.headline}</p>
                    {rec.expected_impact && <p style={{ fontSize: "10px", color: "#4B5563", margin: 0 }}>{rec.expected_impact}</p>}
                    {rec.rationale && <p style={{ fontSize: "10px", color: "#6B7280", marginTop: "4px", fontStyle: "italic" }}>{rec.rationale}</p>}
                    {rec.risk_if_unaddressed && <p style={{ fontSize: "10px", color: "#C0392B", marginTop: "4px" }}>Risk: {rec.risk_if_unaddressed}</p>}
                  </div>
                  {rec.kind && (
                    <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", padding: "2px 8px", background: "#F0EFE9", color: "#4C566A", flexShrink: 0 }}>
                      {rec.kind}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Closing ask */}
      {brief.closing?.ask && (
        <>
          <hr style={{ border: "none", borderTop: "1px solid #E5E4DF", margin: "0 0 20px 0" }} />
          <div style={{ borderLeft: "2px solid #4C566A", paddingLeft: "14px", marginBottom: "32px" }}>
            <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "6px" }}>CLOSING ASK</p>
            <p style={{ fontFamily: SERIF, fontSize: "13px", lineHeight: 1.7, color: "#1A1A1A", margin: 0 }}>{brief.closing.ask}</p>
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
          {sections.length} sections · {recommendations.length} recommendations
        </p>
      </div>

      {/* Evidence & Sources appendix */}
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
