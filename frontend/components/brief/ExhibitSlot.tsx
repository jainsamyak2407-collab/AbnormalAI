"use client"

import {
  ResponsiveContainer,
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ReferenceLine, Cell, Legend,
} from "recharts"
import type { Exhibit } from "@/lib/types"

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
// Shared header/footer
// ---------------------------------------------------------------------------

function ExhibitShell({
  number, title, caption, sourceNote, children,
}: {
  number: number
  title: string
  caption?: string
  sourceNote?: string
  children: React.ReactNode
}) {
  return (
    <div style={{
      margin: "28px 0 36px",
      padding: "24px 28px",
      background: P.surface,
      border: `1px solid ${P.border}`,
      borderRadius: "4px",
    }}>
      <div style={{ marginBottom: "16px" }}>
        <p style={{
          fontFamily: MONO, fontSize: "8px", letterSpacing: "0.2em",
          textTransform: "uppercase", color: P.faint, marginBottom: "3px",
        }}>
          EXHIBIT {number}
        </p>
        <p style={{
          fontFamily: SERIF, fontSize: "13px", fontWeight: 600,
          color: P.accent, lineHeight: 1.3,
        }}>
          {title}
        </p>
        {caption && (
          <p style={{ fontFamily: MONO, fontSize: "9px", color: P.muted, marginTop: "3px", lineHeight: 1.5 }}>
            {caption}
          </p>
        )}
      </div>

      {children}

      {sourceNote && (
        <p style={{ fontFamily: MONO, fontSize: "8px", color: P.faint, marginTop: "12px", letterSpacing: "0.04em" }}>
          {sourceNote}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trend line — one or two series, months on x-axis
// ---------------------------------------------------------------------------

function TrendLineExhibit({ data }: { data: Record<string, unknown> }) {
  const series = (data.series as Array<{ name: string; data: Array<{ month: string; value: number }>; color: string }>) ?? []
  const yLabel = (data.y_label as string) ?? ""

  if (!series.length || !series[0]?.data?.length) return null

  // Merge all series data by month for Recharts
  const allMonths = series[0].data.map((d) => d.month)
  const chartData = allMonths.map((month) => {
    const point: Record<string, unknown> = { month }
    for (const s of series) {
      const found = s.data.find((d) => d.month === month)
      point[s.name] = found?.value ?? null
    }
    return point
  })

  const colors = ["#4C566A", "#FF5B49", "#9BA3B4"]
  const multiSeries = series.length > 1

  return (
    <div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="month"
            tick={{ fontFamily: MONO, fontSize: 9, fill: P.faint }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tick={{ fontFamily: MONO, fontSize: 9, fill: P.faint }}
            axisLine={false} tickLine={false} width={36}
            tickFormatter={(v) => String(v)}
          />
          <Tooltip
            contentStyle={{
              fontFamily: MONO, fontSize: 10,
              background: P.bg, border: `1px solid ${P.border}`, borderRadius: 3,
            }}
            labelStyle={{ color: P.accent }}
            formatter={(v: number, name: string) => [`${v}${yLabel.includes("%") ? "%" : ""}`, name]}
          />
          {multiSeries && (
            <Legend
              wrapperStyle={{ fontFamily: MONO, fontSize: 9, paddingTop: "8px" }}
              iconSize={8}
            />
          )}
          {series.map((s, i) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={{ fill: colors[i % colors.length], r: 3 }}
              activeDot={{ r: 4 }}
              strokeDasharray={i > 0 ? "4 3" : undefined}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Benchmark bars — value + industry percentile lines
// ---------------------------------------------------------------------------

function BenchmarkBarsExhibit({ data }: { data: Record<string, unknown> }) {
  const bars = (data.bars as Array<{
    name: string; value: number; unit?: string
    p50?: number; p75?: number; p99?: number; lower_is_better?: boolean
  }>) ?? []

  if (!bars.length) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {bars.map((bar, i) => {
        const lowerIsBetter = bar.lower_is_better ?? false
        const unit = bar.unit ?? ""
        const p50 = bar.p50
        const p75 = bar.p75
        const p99 = bar.p99

        // Determine color: green if beating benchmark, red if lagging
        const beating = lowerIsBetter ? (p50 != null && bar.value < p50) : (p50 != null && bar.value > p50)
        const valueColor = beating ? P.success : P.warning

        return (
          <div key={i}>
            <p style={{ fontFamily: MONO, fontSize: "9px", color: P.muted, marginBottom: "8px" }}>{bar.name}</p>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <p style={{
                fontFamily: SERIF, fontSize: "28px", fontWeight: 700,
                color: valueColor, lineHeight: 1, minWidth: "80px",
              }}>
                {typeof bar.value === "number" ? bar.value.toFixed(bar.value < 10 ? 1 : 0) : bar.value}
                <span style={{ fontFamily: MONO, fontSize: "12px", color: P.faint, marginLeft: "4px" }}>{unit}</span>
              </p>
              <div style={{ flex: 1 }}>
                {/* Percentile rail */}
                <div style={{ position: "relative", height: "4px", background: P.border, borderRadius: "2px", marginBottom: "8px" }}>
                  {/* Value marker */}
                  {p99 != null && (
                    <div style={{
                      position: "absolute", top: "-3px",
                      left: `${Math.min(100, (bar.value / (lowerIsBetter ? p99 * 1.5 : p99 * 1.1)) * 100)}%`,
                      width: "3px", height: "10px",
                      background: valueColor, borderRadius: "1px",
                      transform: "translateX(-50%)",
                    }} />
                  )}
                </div>
                <div style={{ display: "flex", gap: "12px" }}>
                  {[
                    { label: "p50", val: p50 },
                    { label: "p75", val: p75 },
                    { label: "p99", val: p99 },
                  ].filter((x) => x.val != null).map(({ label, val }) => (
                    <div key={label} style={{ display: "flex", gap: "4px", alignItems: "baseline" }}>
                      <span style={{ fontFamily: MONO, fontSize: "7px", letterSpacing: "0.1em", color: P.faint }}>{label.toUpperCase()}</span>
                      <span style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 600, color: P.muted }}>
                        {typeof val === "number" ? val.toFixed(val < 10 ? 1 : 0) : val}{unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Department bars — horizontal bar chart with optional threshold line
// ---------------------------------------------------------------------------

function DepartmentBarsExhibit({ data }: { data: Record<string, unknown> }) {
  const bars = (data.bars as Array<{ name: string; value: number; unit?: string }>) ?? []
  const threshold = (data.threshold as number | null) ?? null

  if (!bars.length) return null

  const unit = bars[0]?.unit ?? ""
  const chartData = bars.map((b) => ({ name: b.name, value: b.value }))
  const maxVal = Math.max(...chartData.map((d) => d.value), threshold ?? 0) * 1.15

  return (
    <ResponsiveContainer width="100%" height={Math.max(80, bars.length * 30)}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
        <XAxis
          type="number" domain={[0, maxVal]} hide
        />
        <YAxis
          type="category" dataKey="name"
          tick={{ fontFamily: MONO, fontSize: 9, fill: P.muted }}
          axisLine={false} tickLine={false} width={130}
        />
        <Tooltip
          contentStyle={{
            fontFamily: MONO, fontSize: 10,
            background: P.bg, border: `1px solid ${P.border}`, borderRadius: 3,
          }}
          formatter={(v: number) => [`${v.toFixed(1)}${unit}`, ""]}
        />
        {threshold != null && (
          <ReferenceLine
            x={threshold}
            stroke={P.coral}
            strokeDasharray="4 3"
            label={{
              value: `Target ${threshold}${unit}`,
              position: "right",
              style: { fontFamily: MONO, fontSize: 8, fill: P.coral },
            }}
          />
        )}
        <Bar dataKey="value" radius={[0, 2, 2, 0]}>
          {chartData.map((d, i) => (
            <Cell
              key={i}
              fill={threshold != null && d.value < threshold ? P.danger : P.accent}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ---------------------------------------------------------------------------
// Criteria scorecard — pass/fail table
// ---------------------------------------------------------------------------

function CriteriaScorecardExhibit({ data }: { data: Record<string, unknown> }) {
  const rows = (data.rows as Array<{
    criterion: string; target?: string; actual?: string; met: boolean
  }>) ?? []

  if (!rows.length) return null

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ background: "rgba(76,86,106,0.06)" }}>
          {["Criterion", "Target", "Actual", ""].map((h) => (
            <th key={h} style={{
              fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em",
              textTransform: "uppercase", color: P.accent,
              padding: "8px 12px", textAlign: "left",
              borderBottom: `1px solid ${P.border}`,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${P.border}` }}>
            <td style={{ fontFamily: MONO, fontSize: "10px", color: P.text, padding: "9px 12px" }}>
              {row.criterion}
            </td>
            <td style={{ fontFamily: MONO, fontSize: "10px", color: P.muted, padding: "9px 12px" }}>
              {row.target ?? "—"}
            </td>
            <td style={{ fontFamily: MONO, fontSize: "10px", color: P.text, padding: "9px 12px", fontWeight: 600 }}>
              {row.actual ?? "—"}
            </td>
            <td style={{ padding: "9px 12px" }}>
              <span style={{
                fontFamily: MONO, fontSize: "8px", fontWeight: 700,
                letterSpacing: "0.1em", textTransform: "uppercase",
                padding: "3px 8px", borderRadius: "2px",
                background: row.met ? "rgba(22,163,74,0.1)" : "rgba(192,57,43,0.1)",
                color: row.met ? P.success : P.danger,
              }}>
                {row.met ? "PASS" : "FAIL"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export function ExhibitSlot({ exhibit }: { exhibit: Exhibit }) {
  let inner: React.ReactNode = null

  switch (exhibit.type) {
    case "trend_line":
      inner = <TrendLineExhibit data={exhibit.data} />
      break
    case "benchmark_bars":
      inner = <BenchmarkBarsExhibit data={exhibit.data} />
      break
    case "department_bars":
      inner = <DepartmentBarsExhibit data={exhibit.data} />
      break
    case "criteria_scorecard":
      inner = <CriteriaScorecardExhibit data={exhibit.data} />
      break
    default:
      return null
  }

  return (
    <ExhibitShell
      number={exhibit.number}
      title={exhibit.title}
      caption={exhibit.caption}
      sourceNote={exhibit.source_note}
    >
      {inner}
    </ExhibitShell>
  )
}
