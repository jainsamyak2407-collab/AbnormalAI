"use client"

import { useState, useEffect, useRef } from "react"
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, ReferenceLine, Cell, Tooltip,
} from "recharts"

// ── Slide theme palette (matches backend slide_theme.py exactly) ──────────────
const S = {
  bgPrimary:    "#FAF8F3",
  bgAlt:        "#121A2A",
  inkPrimary:   "#101622",
  inkSecondary: "#555C6A",
  inkOnDark:    "#F6F4EE",
  accent:       "#D94A38",
  accentSoft:   "#F0AC9E",
  success:      "#4A825C",
  warning:      "#C28C38",
  rule:         "#DCD6CA",
  chartNeutral: "#949494",
}

const SERIF = '"IBM Plex Serif", "Source Serif 4", Georgia, serif'
const SANS  = '"IBM Plex Sans", Inter, "Helvetica Neue", sans-serif'
const MONO  = '"IBM Plex Mono", Menlo, monospace'

// ── Types ────────────────────────────────────────────────────────────────────

interface SlideCallout {
  number: string
  label: string
  context: string
  color?: "ink" | "accent" | "success" | "warning"
}

interface SlideChartSpec {
  type: "trend_line" | "benchmark_bars" | "department_bars" | "criteria_scorecard"
  title: string
  caption?: string
  data: Record<string, unknown>
  evidence_refs?: string[]
}

interface SlideRecommendation {
  kind: string
  headline: string
  rationale: string
}

interface SlideContent {
  slide_number: number
  slide_type: "title" | "thesis" | "what_happened" | "what_needs_attention" | "the_ask"
  headline?: string
  subtitle?: string
  thesis_sentence?: string
  thesis_tagline?: string
  chart?: SlideChartSpec
  callouts?: SlideCallout[]
  recommendations?: SlideRecommendation[]
  closing_ask?: string
  footer?: string
  evidence_refs?: string[]
}

// ── Chart preview (Recharts) ─────────────────────────────────────────────────

function TrendLineChart({ data }: { data: Record<string, unknown> }) {
  const xLabels = (data.x_labels as string[]) ?? []
  const series  = (data.series  as { label: string; values: number[] }[]) ?? []
  const target  = data.target  as number | null | undefined
  const targetLabel = (data.target_label as string) ?? "Target"

  const chartData = xLabels.map((x, i) => {
    const pt: Record<string, string | number> = { x }
    for (const s of series) pt[s.label] = s.values[i] ?? 0
    return pt
  })

  const colors = [S.accent, S.accentSoft, S.chartNeutral]

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <XAxis dataKey="x" tick={{ fontSize: 10, fill: S.inkSecondary, fontFamily: SANS }}
               axisLine={{ stroke: S.rule }} tickLine={false} />
        <YAxis hide />
        {target != null && (
          <ReferenceLine y={target} stroke={S.rule} strokeWidth={1} strokeDasharray="4 3"
            label={{ value: targetLabel, fontSize: 8, fill: S.inkSecondary, position: "insideTopRight" }} />
        )}
        {series.map((s, i) => (
          <Line key={s.label} type="monotone" dataKey={s.label}
            stroke={colors[i % colors.length]} strokeWidth={i === 0 ? 2.5 : 1.5}
            dot={{ r: 4, fill: colors[i % colors.length], strokeWidth: 0 }}
            activeDot={{ r: 5 }} />
        ))}
        <Tooltip contentStyle={{ fontSize: 10, fontFamily: MONO, background: S.bgPrimary, border: `1px solid ${S.rule}` }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function BenchmarkBarsChart({ data }: { data: Record<string, unknown> }) {
  const metrics = (data.metrics as {
    label: string; value: number; p25?: number; p50?: number; p75?: number;
    unit?: string; higher_is_better?: boolean
  }[]) ?? []

  const chartData = metrics.map(m => ({ label: m.label, value: m.value, p50: m.p50 }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={chartData}
        margin={{ top: 4, right: 40, bottom: 4, left: 120 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={112}
               tick={{ fontSize: 9, fill: S.inkSecondary, fontFamily: SANS }} axisLine={false} tickLine={false} />
        <Bar dataKey="value" radius={[0, 2, 2, 0]} barSize={18}>
          {chartData.map((d, i) => {
            const m = metrics[i]
            const good = m.p50 == null ? true : (m.higher_is_better !== false ? d.value >= m.p50 : d.value <= m.p50)
            return <Cell key={i} fill={good ? S.success : S.accent} />
          })}
        </Bar>
        {metrics[0]?.p50 != null && (
          <ReferenceLine x={metrics[0].p50} stroke={S.chartNeutral} strokeWidth={1} strokeDasharray="3 2"
            label={{ value: "p50", fontSize: 8, fill: S.chartNeutral, position: "top" }} />
        )}
        <Tooltip contentStyle={{ fontSize: 10, fontFamily: MONO, background: S.bgPrimary, border: `1px solid ${S.rule}` }} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function DepartmentBarsChart({ data }: { data: Record<string, unknown> }) {
  const categories = (data.categories as { label: string; value: number }[]) ?? []
  const threshold  = data.threshold as number | undefined
  const threshLabel = (data.threshold_label as string) ?? "Threshold"

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={categories}
        margin={{ top: 4, right: 40, bottom: 4, left: 100 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="label" width={96}
               tick={{ fontSize: 9, fill: S.inkSecondary, fontFamily: SANS }} axisLine={false} tickLine={false} />
        <Bar dataKey="value" radius={[0, 2, 2, 0]} barSize={14}>
          {categories.map((c, i) => (
            <Cell key={i} fill={threshold != null && c.value < threshold ? S.accent : S.success} />
          ))}
        </Bar>
        {threshold != null && (
          <ReferenceLine x={threshold} stroke={S.warning} strokeWidth={1.2} strokeDasharray="4 2"
            label={{ value: threshLabel, fontSize: 8, fill: S.warning, position: "top" }} />
        )}
        <Tooltip contentStyle={{ fontSize: 10, fontFamily: MONO, background: S.bgPrimary, border: `1px solid ${S.rule}` }} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function CriteriaScorecardTable({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as { criterion: string; target: string; actual: string; met: boolean }[]) ?? []
  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", padding: "8px 0" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Criterion", "Target", "Actual", "Status"].map(h => (
              <th key={h} style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.1em",
                textTransform: "uppercase", color: S.inkSecondary, textAlign: "left",
                padding: "4px 8px", borderBottom: `1px solid ${S.rule}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ fontFamily: SANS, fontSize: 10, color: S.inkPrimary, padding: "5px 8px",
                borderBottom: `1px solid ${S.rule}` }}>{r.criterion}</td>
              <td style={{ fontFamily: MONO, fontSize: 9, color: S.inkSecondary, padding: "5px 8px",
                borderBottom: `1px solid ${S.rule}` }}>{r.target}</td>
              <td style={{ fontFamily: MONO, fontSize: 9, color: S.inkSecondary, padding: "5px 8px",
                borderBottom: `1px solid ${S.rule}` }}>{r.actual}</td>
              <td style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "5px 8px",
                color: r.met ? S.success : S.accent,
                borderBottom: `1px solid ${S.rule}` }}>{r.met ? "✓" : "✗"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ChartPreview({ chart }: { chart: SlideChartSpec }) {
  const h = "100%"
  if (chart.type === "trend_line")       return <TrendLineChart data={chart.data} />
  if (chart.type === "benchmark_bars")   return <BenchmarkBarsChart data={chart.data} />
  if (chart.type === "department_bars")  return <DepartmentBarsChart data={chart.data} />
  if (chart.type === "criteria_scorecard") return <CriteriaScorecardTable data={chart.data} />
  return <div style={{ color: S.inkSecondary, fontSize: 10, fontFamily: MONO }}>Chart unavailable</div>
}

// ── Shared subcomponents ──────────────────────────────────────────────────────

function AccentRule() {
  return (
    <div style={{
      position: "absolute", top: 20, left: 28,
      width: 80, height: 3, background: S.accent, borderRadius: 1,
    }} />
  )
}

function SlideFooter({ text, dark }: { text?: string; dark?: boolean }) {
  if (!text) return null
  return (
    <div style={{
      position: "absolute", bottom: 10, right: 20,
      fontFamily: MONO, fontSize: 7, letterSpacing: "0.1em",
      textTransform: "uppercase" as const, color: dark ? S.inkOnDark : S.inkSecondary,
      opacity: 0.7,
    }}>{text}</div>
  )
}

function CalloutColor(c: SlideCallout["color"]): string {
  if (c === "accent")  return S.accent
  if (c === "success") return S.success
  if (c === "warning") return S.warning
  return S.inkPrimary
}

function CalloutStack({ callouts }: { callouts: SlideCallout[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, height: "100%", justifyContent: "space-around" }}>
      {callouts.slice(0, 3).map((c, i) => (
        <div key={i} style={{
          borderTop: i > 0 ? `1px solid ${S.rule}` : "none",
          paddingTop: i > 0 ? 10 : 0,
        }}>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: CalloutColor(c.color), lineHeight: 1.1, marginBottom: 3 }}>
            {c.number}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 9, fontWeight: 600, color: S.inkPrimary, marginBottom: 2, lineHeight: 1.3 }}>
            {c.label}
          </div>
          <div style={{ fontFamily: SANS, fontSize: 8, color: S.inkSecondary, lineHeight: 1.45 }}>
            {c.context}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Slide preview components ──────────────────────────────────────────────────

function TitleSlide({ slide }: { slide: SlideContent }) {
  const subtitle = slide.subtitle ?? ""
  const parts = subtitle.includes("·") ? subtitle.split("·") : [subtitle]
  const label  = parts[0]?.trim() ?? ""
  const rest   = parts.slice(1).join("·").trim()

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: S.bgAlt, padding: "32px 40px 24px", boxSizing: "border-box" }}>
      <AccentRule />
      <div style={{ marginTop: 32 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: S.accent, marginBottom: 16 }}>
          {label}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 36, fontWeight: 700, color: S.inkOnDark, lineHeight: 1.05, marginBottom: 20 }}>
          {slide.headline}
        </div>
        {rest && (
          <div style={{ fontFamily: SANS, fontSize: 11, color: S.inkOnDark, opacity: 0.7 }}>
            {rest}
          </div>
        )}
      </div>
      <SlideFooter text={slide.footer} dark />
    </div>
  )
}

function ThesisSlide({ slide }: { slide: SlideContent }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: S.bgAlt, padding: "32px 40px 28px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <AccentRule />
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 500, color: S.inkOnDark, lineHeight: 1.35, marginBottom: 20 }}>
        {slide.thesis_sentence}
      </div>
      {slide.thesis_tagline && (
        <div style={{ fontFamily: SANS, fontSize: 11, color: S.inkOnDark, opacity: 0.55, letterSpacing: "0.04em" }}>
          {slide.thesis_tagline}
        </div>
      )}
      <SlideFooter text={slide.footer} dark />
    </div>
  )
}

function DataSlide({ slide, chartLeft }: { slide: SlideContent; chartLeft: boolean }) {
  const callouts = slide.callouts ?? []
  const hasChart = !!slide.chart

  const chartCol = (
    <div style={{ flex: "0 0 60%", height: "100%", minWidth: 0 }}>
      {hasChart ? (
        <ChartPreview chart={slide.chart!} />
      ) : (
        <div style={{ width: "100%", height: "100%", background: S.rule, borderRadius: 2 }} />
      )}
    </div>
  )

  const calloutCol = (
    <div style={{ flex: "0 0 36%", height: "100%", paddingLeft: chartLeft ? 16 : 0, paddingRight: chartLeft ? 0 : 16 }}>
      <CalloutStack callouts={callouts} />
    </div>
  )

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: S.bgPrimary, padding: "28px 28px 24px", boxSizing: "border-box" }}>
      <AccentRule />
      <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: S.inkPrimary, lineHeight: 1.25, marginTop: 16, marginBottom: 12 }}>
        {slide.headline}
      </div>
      <div style={{ display: "flex", gap: 12, height: "calc(100% - 72px)" }}>
        {chartLeft ? <>{chartCol}{calloutCol}</> : <>{calloutCol}{chartCol}</>}
      </div>
      <SlideFooter text={slide.footer} />
    </div>
  )
}

const KIND_COLOR: Record<string, string> = {
  POLICY: S.inkSecondary, BUDGET: S.accent, HEADCOUNT: S.warning,
  EXPANSION: S.success, TRAINING: S.inkSecondary, RENEWAL: S.success,
}

function AskSlide({ slide }: { slide: SlideContent }) {
  const recs = (slide.recommendations ?? []).slice(0, 3)
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: S.bgPrimary, padding: "24px 28px 0", boxSizing: "border-box" }}>
      <AccentRule />
      <div style={{ fontFamily: SERIF, fontSize: 14, fontWeight: 600, color: S.inkPrimary, lineHeight: 1.25, marginTop: 14, marginBottom: 10 }}>
        {slide.headline}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {recs.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 8, borderBottom: i < recs.length - 1 ? `1px solid ${S.rule}` : "none" }}>
            <div style={{ fontFamily: SERIF, fontSize: 14, color: S.accent, fontWeight: 700, flexShrink: 0, width: 16 }}>{i + 1}.</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 3 }}>
                <div style={{ fontFamily: SERIF, fontSize: 11, fontWeight: 600, color: S.inkPrimary, lineHeight: 1.35 }}>{r.headline}</div>
                <span style={{ fontFamily: MONO, fontSize: 7, letterSpacing: "0.1em", color: KIND_COLOR[r.kind] ?? S.inkSecondary,
                  background: S.rule, padding: "2px 6px", borderRadius: 2, flexShrink: 0, whiteSpace: "nowrap" as const }}>{r.kind}</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 9, color: S.inkSecondary, lineHeight: 1.4 }}>{r.rationale}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Dark footer band */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 56,
        background: S.bgAlt, padding: "10px 28px" }}>
        {slide.closing_ask && (
          <div style={{ fontFamily: SERIF, fontSize: 10, color: S.inkOnDark, lineHeight: 1.45 }}>
            {slide.closing_ask}
          </div>
        )}
      </div>
      <SlideFooter text={slide.footer} />
    </div>
  )
}

function SlidePreview({ slide }: { slide: SlideContent }) {
  if (slide.slide_type === "title")                return <TitleSlide slide={slide} />
  if (slide.slide_type === "thesis")               return <ThesisSlide slide={slide} />
  if (slide.slide_type === "what_happened")        return <DataSlide slide={slide} chartLeft />
  if (slide.slide_type === "what_needs_attention") return <DataSlide slide={slide} chartLeft={false} />
  if (slide.slide_type === "the_ask")              return <AskSlide slide={slide} />
  return null
}

// ── Progress indicator ────────────────────────────────────────────────────────

const STAGE_ORDER = ["compose", "write", "charts"]
const STAGE_LABELS: Record<string, string> = {
  compose: "Composing slide plan",
  write:   "Writing slides",
  charts:  "Rendering charts",
}

function ProgressView({ completed, current, error }: {
  completed: Set<string>; current: string | null; error: string | null
}) {
  return (
    <div style={{ padding: "40px 0" }}>
      {STAGE_ORDER.map((stage, i) => {
        const done    = completed.has(stage)
        const active  = current === stage
        const pending = !done && !active
        return (
          <div key={stage} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0",
            borderBottom: i < STAGE_ORDER.length - 1 ? `1px solid var(--border-subtle)` : "none" }}>
            <div style={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {done ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" fill={S.success} />
                  <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : active ? (
                <div style={{ width: 16, height: 16, border: "2px solid var(--accent)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              ) : (
                <div style={{ width: 12, height: 12, border: `2px solid var(--border-strong)`, borderRadius: "50%" }} />
              )}
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em",
              textTransform: "uppercase" as const,
              color: done ? "var(--text-secondary)" : active ? "var(--text-primary)" : "var(--text-tertiary)",
              fontWeight: active ? 700 : 400 }}>
              {STAGE_LABELS[stage]}
            </span>
          </div>
        )
      })}
      {error && (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--danger)", marginTop: 16 }}>{error}</p>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

type ModalState = "idle" | "generating" | "ready"

interface ReviseState {
  [slideNumber: number]: { text: string; inProgress: boolean }
}

export function PresentationModal({ briefId, onClose }: { briefId: string; onClose: () => void }) {
  const [state,     setState]     = useState<ModalState>("idle")
  const [userCtx,   setUserCtx]   = useState("")
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [current,   setCurrent]   = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [presId,    setPresId]    = useState<string | null>(null)
  const [slides,    setSlides]    = useState<SlideContent[]>([])
  const [revise,    setRevise]    = useState<ReviseState>({})

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  const handleGenerate = async () => {
    setState("generating")
    setCompleted(new Set())
    setCurrent(null)
    setError(null)

    try {
      const res = await fetch(`/api/brief/${briefId}/presentation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_context: userCtx.trim() || null }),
      })
      if (!res.ok) { setError("Generation failed."); setState("idle"); return }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.type === "stage_start")    { setCurrent(ev.stage) }
            if (ev.type === "stage_complete") { setCompleted(p => new Set([...p, ev.stage])); setCurrent(null) }
            if (ev.type === "error")          { setError(ev.message); setState("idle"); return }
            if (ev.type === "done") {
              const data = await fetch(`/api/presentation/${ev.presentation_id}`)
              const pres = await data.json()
              setSlides(pres.slides ?? [])
              setPresId(ev.presentation_id)
              setState("ready")
            }
          } catch { /* malformed SSE line */ }
        }
      }
    } catch (e) {
      setError("Network error. Try again.")
      setState("idle")
    }
  }

  const handleReviseApply = async (slideNumber: number) => {
    if (!presId) return
    const instruction = revise[slideNumber]?.text ?? ""
    if (!instruction.trim()) return

    setRevise(p => ({ ...p, [slideNumber]: { ...p[slideNumber], inProgress: true } }))
    try {
      const res = await fetch(`/api/presentation/${presId}/slide/${slideNumber}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      })
      if (!res.ok) throw new Error("Revise failed.")
      const updated: SlideContent = await res.json()
      setSlides(prev => prev.map(s => s.slide_number === slideNumber ? updated : s))
      setRevise(p => { const n = { ...p }; delete n[slideNumber]; return n })
    } catch {
      setRevise(p => ({ ...p, [slideNumber]: { ...p[slideNumber], inProgress: false } }))
    }
  }

  const handleDownload = () => {
    if (!presId) return
    const a = document.createElement("a")
    a.href = `/api/presentation/${presId}/download`
    a.download = "presentation.pptx"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 50,
      background: "rgba(0,0,0,0.65)", backdropFilter: "blur(2px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: "100%", maxWidth: 960,
        maxHeight: "90vh", overflowY: "auto",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 6,
        boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Modal header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 1,
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
            letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-primary)" }}>
            PRESENTATION
          </span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {state === "ready" && (
              <button onClick={handleDownload} style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                letterSpacing: "0.14em", textTransform: "uppercase",
                padding: "8px 16px", background: S.accent, color: "#fff",
                border: "none", borderRadius: 4, cursor: "pointer",
              }}>
                ↓ Download .pptx
              </button>
            )}
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-tertiary)", fontSize: 18, lineHeight: 1, padding: "2px 6px",
            }}>×</button>
          </div>
        </div>

        {/* Modal body */}
        <div style={{ padding: "24px" }}>

          {/* IDLE state */}
          {state === "idle" && (
            <div>
              <p style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700,
                color: "var(--text-primary)", marginBottom: 8 }}>
                Generate a 5-slide McKinsey-style deck
              </p>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)",
                letterSpacing: "0.06em", marginBottom: 24 }}>
                The base prompt turns this brief into a structured executive deck. Add anything specific below.
              </p>
              <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9,
                letterSpacing: "0.14em", textTransform: "uppercase",
                color: "var(--text-secondary)", marginBottom: 8 }}>
                Additional context or instructions for this presentation
              </label>
              <textarea
                value={userCtx}
                onChange={e => setUserCtx(e.target.value)}
                placeholder="e.g. Emphasize the acquired tenant. The CEO cares about SOC cost."
                rows={4}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "12px 14px",
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: "var(--text-primary)",
                  background: "var(--bg-page)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 4, resize: "vertical", outline: "none",
                  marginBottom: 24,
                }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleGenerate} style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  padding: "10px 20px", background: "var(--accent)", color: "#fff",
                  border: "none", borderRadius: 4, cursor: "pointer",
                }}>
                  Generate 5-slide deck
                </button>
                <button onClick={onClose} style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase",
                  padding: "10px 20px", background: "none", color: "var(--text-secondary)",
                  border: "1px solid var(--border-strong)", borderRadius: 4, cursor: "pointer",
                }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* GENERATING state */}
          {state === "generating" && (
            <ProgressView completed={completed} current={current} error={error} />
          )}

          {/* READY state */}
          {state === "ready" && slides.length > 0 && (
            <div>
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                {slides.map(slide => {
                  const rs = revise[slide.slide_number]
                  return (
                    <div key={slide.slide_number}>
                      {/* Slide label */}
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em",
                        textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: 8 }}>
                        Slide {slide.slide_number} — {slide.slide_type.replace(/_/g, " ")}
                      </div>

                      {/* Slide preview card */}
                      <div style={{
                        aspectRatio: "16 / 9",
                        width: "100%",
                        borderRadius: 4,
                        overflow: "hidden",
                        boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
                        border: `1px solid ${S.rule}`,
                        position: "relative",
                        transition: "transform 0.15s",
                      }}>
                        <SlidePreview slide={slide} />
                      </div>

                      {/* Revise controls */}
                      {!rs ? (
                        <button onClick={() => setRevise(p => ({ ...p, [slide.slide_number]: { text: "", inProgress: false } }))}
                          style={{
                            marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                            letterSpacing: "0.12em", textTransform: "uppercase",
                            padding: "6px 12px", background: "none", color: "var(--text-secondary)",
                            border: "1px solid var(--border-strong)", borderRadius: 3, cursor: "pointer",
                          }}>
                          Revise this slide
                        </button>
                      ) : (
                        <div style={{ marginTop: 10 }}>
                          <textarea
                            value={rs.text}
                            onChange={e => setRevise(p => ({ ...p, [slide.slide_number]: { ...p[slide.slide_number], text: e.target.value } }))}
                            placeholder="Describe what to change on this slide…"
                            rows={2}
                            disabled={rs.inProgress}
                            style={{
                              width: "100%", boxSizing: "border-box", padding: "8px 12px",
                              fontFamily: "var(--font-mono)", fontSize: 10,
                              color: "var(--text-primary)", background: "var(--bg-page)",
                              border: "1px solid var(--border-strong)", borderRadius: 4,
                              resize: "none", outline: "none", marginBottom: 8, display: "block",
                            }}
                          />
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => handleReviseApply(slide.slide_number)}
                              disabled={rs.inProgress || !rs.text.trim()}
                              style={{
                                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                                letterSpacing: "0.12em", textTransform: "uppercase",
                                padding: "6px 14px",
                                background: rs.inProgress ? "var(--border-strong)" : "var(--accent)",
                                color: "#fff", border: "none", borderRadius: 3,
                                cursor: rs.inProgress ? "wait" : "pointer",
                              }}>
                              {rs.inProgress ? "Applying…" : "Apply"}
                            </button>
                            <button
                              onClick={() => setRevise(p => { const n = { ...p }; delete n[slide.slide_number]; return n })}
                              disabled={rs.inProgress}
                              style={{
                                fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                                letterSpacing: "0.12em", textTransform: "uppercase",
                                padding: "6px 12px", background: "none", color: "var(--text-secondary)",
                                border: "1px solid var(--border-strong)", borderRadius: 3, cursor: "pointer",
                              }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Regenerate from scratch */}
              <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
                <button onClick={() => { setState("idle"); setSlides([]); setPresId(null) }}
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                    letterSpacing: "0.12em", textTransform: "uppercase",
                    padding: "8px 16px", background: "none", color: "var(--text-tertiary)",
                    border: "1px solid var(--border-subtle)", borderRadius: 3, cursor: "pointer",
                  }}>
                  Start over
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
