"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { listDatasets, getDatasetFilePage, createSessionFromDataset, deleteDataset } from "@/lib/api"
import type { Dataset, FilePageResult } from "@/lib/types"
import { Suspense } from "react"

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function schemaBadgeStyle(schema: string): { background: string; color: string } {
  const map: Record<string, { background: string; color: string }> = {
    threat_log:          { background: "rgba(239,68,68,0.12)", color: "#F87171" },
    remediation_log:     { background: "rgba(96,165,250,0.12)", color: "#60A5FA" },
    user_reporting:      { background: "rgba(74,222,128,0.12)", color: "#4ADE80" },
    posture_checks:      { background: "rgba(251,191,36,0.12)", color: "#FBBF24" },
    ato_events:          { background: "rgba(167,139,250,0.12)", color: "#A78BFA" },
    industry_benchmarks: { background: "rgba(155,163,180,0.1)", color: "#9BA3B4" },
  }
  return map[schema] || { background: "rgba(155,163,180,0.1)", color: "#9BA3B4" }
}

// ---------------------------------------------------------------------------
// File table viewer (drawer)
// ---------------------------------------------------------------------------

function FileViewer({ datasetId, filename, onClose }: { datasetId: string; filename: string; onClose: () => void }) {
  const [data, setData] = useState<FilePageResult | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback((p: number) => {
    setLoading(true)
    getDatasetFilePage(datasetId, filename, p)
      .then((r) => { setData(r); setPage(p); setLoading(false) })
      .catch((e) => { setErr(e instanceof Error ? e.message : "Failed."); setLoading(false) })
  }, [datasetId, filename])

  useEffect(() => { load(1) }, [load])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [onClose])

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100%", zIndex: 50,
        width: "min(860px, 90vw)",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border-strong)",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "2px" }}>FILE VIEWER</p>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{filename}</p>
          </div>
          <button onClick={onClose} style={{ border: "1px solid var(--border-strong)", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "none", borderRadius: "4px" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="scrollbar-dark" style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
              <div style={{ width: "20px", height: "20px", border: "2px solid var(--border-strong)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}
          {err && <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--danger)", padding: "24px" }}>{err}</p>}
          {data && !loading && (
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
              <thead>
                <tr style={{ background: "var(--bg-surface-2)", position: "sticky", top: 0 }}>
                  {data.columns.map((col) => (
                    <th key={col} style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)", background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-surface-2)" }}>
                    {data.columns.map((col, j) => (
                      <td key={j} style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)", padding: "8px 12px", whiteSpace: "nowrap", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {String(row[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && (
          <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)" }}>
              {data.total_rows.toLocaleString()} ROWS · PAGE {data.page} OF {data.total_pages}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => load(page - 1)} disabled={page <= 1} style={{ fontFamily: "var(--font-mono)", fontSize: "9px", padding: "6px 12px", border: "1px solid var(--border-strong)", background: "none", cursor: page <= 1 ? "not-allowed" : "pointer", color: page <= 1 ? "var(--text-tertiary)" : "var(--text-secondary)", borderRadius: "3px" }}>← PREV</button>
              <button onClick={() => load(page + 1)} disabled={page >= data.total_pages} style={{ fontFamily: "var(--font-mono)", fontSize: "9px", padding: "6px 12px", border: "1px solid var(--border-strong)", background: "none", cursor: page >= data.total_pages ? "not-allowed" : "pointer", color: page >= data.total_pages ? "var(--text-tertiary)" : "var(--text-secondary)", borderRadius: "3px" }}>NEXT →</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Dataset detail panel
// ---------------------------------------------------------------------------

function DatasetDetail({ dataset, onDeleted }: { dataset: Dataset; onDeleted: () => void }) {
  const router = useRouter()
  const [generating, setGenerating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [viewingFile, setViewingFile] = useState<string | null>(null)
  const [genErr, setGenErr] = useState<string | null>(null)

  const account = dataset.account as Record<string, unknown> | null

  const handleGenerate = async () => {
    setGenerating(true); setGenErr(null)
    try {
      const { session_id } = await createSessionFromDataset(dataset.dataset_id)
      router.push(`/configure?session=${session_id}`)
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : "Failed to start session.")
      setGenerating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete dataset "${dataset.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await deleteDataset(dataset.dataset_id)
      onDeleted()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed.")
      setDeleting(false)
    }
  }

  const tenants = (account?.tenants as unknown[]) ?? []

  return (
    <>
      <div className="scrollbar-dark" style={{ padding: "32px 40px", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "8px" }}>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "28px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, letterSpacing: "-0.02em" }}>{dataset.name}</h1>
            {dataset.is_sample && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 10px", background: "var(--bg-surface-2)", color: "var(--text-secondary)", border: "1px solid var(--border-strong)", flexShrink: 0, borderRadius: "2px" }}>SAMPLE</span>
            )}
          </div>
          {dataset.description && (
            <p style={{ fontFamily: "var(--font-sans)", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "12px" }}>{dataset.description}</p>
          )}
          <div style={{ display: "flex", gap: "24px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)" }}>
              CREATED {new Date(dataset.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
            </span>
            {dataset.period_detected?.label && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)" }}>PERIOD: {dataset.period_detected.label}</span>
            )}
          </div>
        </div>

        <div style={{ height: "1px", background: "var(--border-subtle)", marginBottom: "28px" }} />

        {/* Account summary */}
        {account && (
          <div style={{ marginBottom: "32px" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "14px" }}>ACCOUNT</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              {[
                { label: "Company", value: String(account.company_name ?? "") },
                { label: "Industry", value: String(account.industry ?? "") },
                { label: "Employees", value: String(account.employee_count ?? "") },
                { label: "Plan", value: String(account.plan ?? "") },
              ].filter(x => x.value).map(({ label, value }) => (
                <div key={label} style={{ padding: "12px 16px", background: "var(--bg-surface-2)", borderRadius: "4px", border: "1px solid var(--border-subtle)" }}>
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "4px" }}>{label}</p>
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}>{value}</p>
                </div>
              ))}
            </div>
            {tenants.length > 0 && (
              <div>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>TENANTS ({tenants.length})</p>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-surface-2)" }}>
                      {["Tenant ID", "Domain", "Provider", "Mailboxes"].map((h) => (
                        <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", padding: "8px 12px", textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t, i) => {
                      const tenant = t as Record<string, unknown>
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)", padding: "8px 12px" }}>{String(tenant.tenant_id ?? "")}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)", padding: "8px 12px" }}>{String(tenant.domain ?? "")}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)", padding: "8px 12px" }}>{String(tenant.email_provider ?? "")}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)", padding: "8px 12px" }}>{String(tenant.mailbox_count ?? "")}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Files */}
        <div style={{ marginBottom: "32px" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "14px" }}>
            FILES ({dataset.files.length})
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-surface-2)" }}>
                {["File", "Schema", "Rows", "Columns", "Size"].map((h) => (
                  <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-tertiary)", padding: "8px 12px", textAlign: "left", borderBottom: "1px solid var(--border-subtle)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.files.map((f, i) => {
                const badge = schemaBadgeStyle(f.detected_schema)
                return (
                  <tr
                    key={i}
                    onClick={() => setViewingFile(f.original_name)}
                    style={{ borderBottom: "1px solid var(--border-subtle)", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-surface-2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-primary)", padding: "9px 12px", fontWeight: 600 }}>{f.original_name}</td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 8px", borderRadius: "2px", ...badge }}>
                        {f.detected_schema}
                      </span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)", padding: "9px 12px" }}>{f.row_count.toLocaleString()}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)", padding: "9px 12px" }}>{f.columns.length}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-secondary)", padding: "9px 12px" }}>{formatBytes(f.size_bytes)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              padding: "12px 28px", background: "var(--accent)", color: "#fff",
              fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600,
              border: "none", cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.7 : 1, display: "flex", alignItems: "center", gap: "8px",
              borderRadius: "4px", transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (!generating) e.currentTarget.style.background = "var(--accent-hover)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)" }}
          >
            {generating && <div style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
            {generating ? "Preparing…" : "Generate Brief"}
          </button>
          {!dataset.is_sample && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ padding: "12px 20px", background: "none", color: "var(--text-tertiary)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 500, border: "1px solid var(--border-strong)", cursor: "pointer", borderRadius: "4px", transition: "color 0.15s, border-color 0.15s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.borderColor = "var(--border-strong)" }}
            >
              Delete Dataset
            </button>
          )}
        </div>
        {genErr && <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--danger)", marginTop: "10px" }}>{genErr}</p>}
      </div>

      {viewingFile && (
        <FileViewer datasetId={dataset.dataset_id} filename={viewingFile} onClose={() => setViewingFile(null)} />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main library page
// ---------------------------------------------------------------------------

function DataLibraryInner() {
  const searchParams = useSearchParams()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("dataset"))

  const load = useCallback(() => {
    setLoading(true)
    listDatasets()
      .then((ds) => {
        setDatasets(ds)
        setLoading(false)
        if (!selectedId && ds.length > 0) setSelectedId(ds[0].dataset_id)
      })
      .catch(() => setLoading(false))
  }, [selectedId])

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const samples = datasets.filter((d) => d.is_sample)
  const others = datasets.filter((d) => !d.is_sample)
  const filtered = (group: Dataset[]) =>
    search ? group.filter((d) => d.name.toLowerCase().includes(search.toLowerCase())) : group

  const selectedDataset = datasets.find((d) => d.dataset_id === selectedId) ?? null

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <header style={{ padding: "14px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", gap: "20px", background: "var(--bg-page)" }}>
        <Link href="/" style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>← HOME</Link>
        <span style={{ width: "1px", height: "14px", background: "var(--border-strong)" }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--text-primary)" }}>DATA LIBRARY</span>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left rail */}
        <div className="scrollbar-dark" style={{ width: "240px", flexShrink: 0, borderRight: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", background: "var(--bg-surface)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search datasets…"
              style={{
                width: "100%", padding: "7px 10px",
                fontFamily: "var(--font-mono)", fontSize: "10px",
                border: "1px solid var(--border-strong)",
                background: "var(--bg-surface-2)",
                color: "var(--text-primary)",
                outline: "none", boxSizing: "border-box", borderRadius: "3px",
              }}
            />
          </div>

          <div className="scrollbar-dark" style={{ flex: 1, overflowY: "auto" }}>
            {loading && <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", padding: "16px" }}>LOADING…</p>}
            {!loading && samples.length > 0 && (
              <>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-tertiary)", padding: "12px 16px 4px" }}>SAMPLES</p>
                {filtered(samples).map((d) => (
                  <button
                    key={d.dataset_id}
                    onClick={() => setSelectedId(d.dataset_id)}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 16px",
                      background: selectedId === d.dataset_id ? "var(--bg-surface-2)" : "none",
                      border: "none", borderBottom: "1px solid var(--border-subtle)",
                      borderLeft: `3px solid ${selectedId === d.dataset_id ? "var(--accent)" : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>{d.name}</p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-tertiary)" }}>{d.files.length} FILES</p>
                  </button>
                ))}
              </>
            )}
            {!loading && others.length > 0 && (
              <>
                <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--text-tertiary)", padding: "12px 16px 4px" }}>YOUR DATASETS</p>
                {filtered(others).map((d) => (
                  <button
                    key={d.dataset_id}
                    onClick={() => setSelectedId(d.dataset_id)}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 16px",
                      background: selectedId === d.dataset_id ? "var(--bg-surface-2)" : "none",
                      border: "none", borderBottom: "1px solid var(--border-subtle)",
                      borderLeft: `3px solid ${selectedId === d.dataset_id ? "var(--accent)" : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <p style={{ fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>{d.name}</p>
                    <p style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-tertiary)" }}>{d.files.length} FILES · {new Date(d.updated_at).toLocaleDateString()}</p>
                  </button>
                ))}
              </>
            )}
            {!loading && datasets.length === 0 && (
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--text-tertiary)", padding: "16px" }}>NO DATASETS FOUND</p>
            )}
          </div>

          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-subtle)" }}>
            <Link href="/datasets/new" style={{
              display: "block", textAlign: "center", padding: "9px",
              background: "var(--accent)", color: "#fff",
              fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700,
              letterSpacing: "0.14em", textTransform: "uppercase", borderRadius: "3px",
            }}>
              + NEW DATASET
            </Link>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {selectedDataset ? (
            <DatasetDetail
              key={selectedDataset.dataset_id}
              dataset={selectedDataset}
              onDeleted={() => { setSelectedId(null); load() }}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-tertiary)" }}>SELECT A DATASET</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DataLibraryPage() {
  return (
    <Suspense>
      <DataLibraryInner />
    </Suspense>
  )
}
