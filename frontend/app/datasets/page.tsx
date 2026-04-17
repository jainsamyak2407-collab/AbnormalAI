"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { listDatasets, getDatasetFilePage, createSessionFromDataset, deleteDataset } from "@/lib/api"
import type { Dataset, FilePageResult } from "@/lib/types"
import { Suspense } from "react"

const MONO = "'Courier New', Courier, monospace"
const SERIF = "var(--font-source-serif), Georgia, serif"

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function schemaBadgeColor(schema: string): { bg: string; color: string } {
  const map: Record<string, { bg: string; color: string }> = {
    threat_log:          { bg: "#FEE2E2", color: "#991B1B" },
    remediation_log:     { bg: "#DBEAFE", color: "#1E40AF" },
    user_reporting:      { bg: "#D1FAE5", color: "#065F46" },
    posture_checks:      { bg: "#FEF3C7", color: "#92400E" },
    ato_events:          { bg: "#EDE9FE", color: "#5B21B6" },
    industry_benchmarks: { bg: "#F3F4F6", color: "#374151" },
  }
  return map[schema] || { bg: "#F0EFE9", color: "#4C566A" }
}

// ---------------------------------------------------------------------------
// File table viewer (drawer)
// ---------------------------------------------------------------------------

function FileViewer({
  datasetId,
  filename,
  onClose,
}: {
  datasetId: string
  filename: string
  onClose: () => void
}) {
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
      <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(26,26,26,0.4)" }} onClick={onClose} />
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100%", zIndex: 50,
        width: "min(860px, 90vw)", background: "#FAFAF7", borderLeft: "1px solid #E5E4DF",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #E5E4DF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "2px" }}>FILE VIEWER</p>
            <p style={{ fontFamily: MONO, fontSize: "13px", fontWeight: 700, color: "#1A1A1A" }}>{filename}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "1px solid #E5E4DF", width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#4C566A" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowX: "auto", overflowY: "auto" }}>
          {loading && (
            <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
              <div style={{ width: "20px", height: "20px", border: "2px solid #E5E4DF", borderTopColor: "#4C566A", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          )}
          {err && <p style={{ fontFamily: MONO, fontSize: "10px", color: "#C0392B", padding: "24px" }}>{err}</p>}
          {data && !loading && (
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
              <thead>
                <tr style={{ background: "#F0EFE9", position: "sticky", top: 0 }}>
                  {data.columns.map((col) => (
                    <th key={col} style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#4C566A", padding: "10px 12px", textAlign: "left", borderBottom: "1px solid #E5E4DF", whiteSpace: "nowrap" }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #E5E4DF", background: i % 2 === 0 ? "#FFFFFF" : "#FAFAF7" }}>
                    {data.columns.map((col, j) => (
                      <td key={j} style={{ fontFamily: MONO, fontSize: "10px", color: "#374151", padding: "8px 12px", whiteSpace: "nowrap", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {String(row[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data && (
          <div style={{ padding: "12px 24px", borderTop: "1px solid #E5E4DF", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF" }}>
              {data.total_rows.toLocaleString()} ROWS · PAGE {data.page} OF {data.total_pages}
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => load(page - 1)} disabled={page <= 1} style={{ fontFamily: MONO, fontSize: "9px", padding: "6px 12px", border: "1px solid #E5E4DF", background: "none", cursor: page <= 1 ? "not-allowed" : "pointer", color: page <= 1 ? "#D1CFC6" : "#4C566A" }}>← PREV</button>
              <button onClick={() => load(page + 1)} disabled={page >= data.total_pages} style={{ fontFamily: MONO, fontSize: "9px", padding: "6px 12px", border: "1px solid #E5E4DF", background: "none", cursor: page >= data.total_pages ? "not-allowed" : "pointer", color: page >= data.total_pages ? "#D1CFC6" : "#4C566A" }}>NEXT →</button>
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ padding: "32px 40px", overflowY: "auto", height: "100%" }}>

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "8px" }}>
            <h1 style={{ fontFamily: SERIF, fontSize: "28px", fontWeight: 700, color: "#1A1A1A", lineHeight: 1.2 }}>{dataset.name}</h1>
            {dataset.is_sample && (
              <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 10px", background: "#1A1A1A", color: "#FAFAF7", flexShrink: 0 }}>SAMPLE</span>
            )}
          </div>
          {dataset.description && (
            <p style={{ fontFamily: SERIF, fontSize: "15px", color: "#6B7280", lineHeight: 1.6, marginBottom: "12px" }}>{dataset.description}</p>
          )}
          <div style={{ display: "flex", gap: "24px" }}>
            <span style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF" }}>
              CREATED {new Date(dataset.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}
            </span>
            {dataset.period_detected?.label && (
              <span style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF" }}>PERIOD: {dataset.period_detected.label}</span>
            )}
          </div>
        </div>

        <div style={{ height: "1px", background: "#E5E4DF", marginBottom: "28px" }} />

        {/* Account summary */}
        {account && (
          <div style={{ marginBottom: "32px" }}>
            <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "14px" }}>ACCOUNT</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              {[
                { label: "Company", value: String(account.company_name ?? "") },
                { label: "Industry", value: String(account.industry ?? "") },
                { label: "Employees", value: String(account.employee_count ?? "") },
                { label: "Plan", value: String(account.plan ?? "") },
              ].filter(x => x.value).map(({ label, value }) => (
                <div key={label}>
                  <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "2px" }}>{label}</p>
                  <p style={{ fontFamily: SERIF, fontSize: "14px", color: "#1A1A1A", fontWeight: 600 }}>{value}</p>
                </div>
              ))}
            </div>
            {tenants.length > 0 && (
              <div>
                <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "8px" }}>TENANTS ({tenants.length})</p>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F0EFE9" }}>
                      {["Tenant ID", "Domain", "Provider", "Mailboxes"].map((h) => (
                        <th key={h} style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#4C566A", padding: "7px 10px", textAlign: "left", borderBottom: "1px solid #E5E4DF" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t, i) => {
                      const tenant = t as Record<string, unknown>
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid #E5E4DF" }}>
                          <td style={{ fontFamily: MONO, fontSize: "10px", color: "#374151", padding: "7px 10px" }}>{String(tenant.tenant_id ?? "")}</td>
                          <td style={{ fontFamily: MONO, fontSize: "10px", color: "#374151", padding: "7px 10px" }}>{String(tenant.domain ?? "")}</td>
                          <td style={{ fontFamily: MONO, fontSize: "10px", color: "#374151", padding: "7px 10px" }}>{String(tenant.email_provider ?? "")}</td>
                          <td style={{ fontFamily: MONO, fontSize: "10px", color: "#374151", padding: "7px 10px" }}>{String(tenant.mailbox_count ?? "")}</td>
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
          <p style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF", marginBottom: "14px" }}>
            FILES ({dataset.files.length})
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F0EFE9" }}>
                {["File", "Schema", "Rows", "Columns", "Size"].map((h) => (
                  <th key={h} style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#4C566A", padding: "7px 10px", textAlign: "left", borderBottom: "1px solid #E5E4DF" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataset.files.map((f, i) => {
                const badge = schemaBadgeColor(f.detected_schema)
                return (
                  <tr
                    key={i}
                    onClick={() => setViewingFile(f.original_name)}
                    style={{ borderBottom: "1px solid #E5E4DF", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F5F5F0")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <td style={{ fontFamily: MONO, fontSize: "10px", color: "#1A1A1A", padding: "8px 10px", fontWeight: 600 }}>{f.original_name}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 8px", background: badge.bg, color: badge.color }}>
                        {f.detected_schema}
                      </span>
                    </td>
                    <td style={{ fontFamily: MONO, fontSize: "10px", color: "#374151", padding: "8px 10px" }}>{f.row_count.toLocaleString()}</td>
                    <td style={{ fontFamily: MONO, fontSize: "10px", color: "#374151", padding: "8px 10px" }}>{f.columns.length}</td>
                    <td style={{ fontFamily: MONO, fontSize: "10px", color: "#374151", padding: "8px 10px" }}>{formatBytes(f.size_bytes)}</td>
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
              padding: "12px 28px", background: "#1A1A1A", color: "#FAFAF7",
              fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.16em",
              textTransform: "uppercase", border: "none", cursor: generating ? "not-allowed" : "pointer",
              opacity: generating ? 0.7 : 1, display: "flex", alignItems: "center", gap: "8px",
            }}
          >
            {generating && <div style={{ width: "10px", height: "10px", border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#FAFAF7", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
            {generating ? "PREPARING…" : "GENERATE BRIEF"}
          </button>
          {!dataset.is_sample && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ padding: "12px 20px", background: "none", color: "#C0392B", fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", border: "1px solid #E5E4DF", cursor: "pointer" }}
            >
              DELETE DATASET
            </button>
          )}
        </div>
        {genErr && <p style={{ fontFamily: MONO, fontSize: "9px", color: "#C0392B", marginTop: "10px" }}>{genErr}</p>}
      </div>

      {/* File viewer */}
      {viewingFile && (
        <FileViewer
          datasetId={dataset.dataset_id}
          filename={viewingFile}
          onClose={() => setViewingFile(null)}
        />
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
    <div style={{ minHeight: "100vh", background: "#FAFAF7", display: "flex", flexDirection: "column" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Top bar */}
      <header style={{ padding: "14px 24px", borderBottom: "1px solid #E5E4DF", display: "flex", alignItems: "center", gap: "20px", background: "#FAFAF7" }}>
        <Link href="/" style={{ fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "#1A1A1A", textDecoration: "none" }}>← HOME</Link>
        <span style={{ width: "1px", height: "14px", background: "#E5E4DF" }} />
        <span style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#1A1A1A" }}>DATA LIBRARY</span>
      </header>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left rail */}
        <div style={{ width: "240px", flexShrink: 0, borderRight: "1px solid #E5E4DF", display: "flex", flexDirection: "column", background: "#FAFAF7" }}>
          {/* Search */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #E5E4DF" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search datasets…"
              style={{ width: "100%", padding: "7px 10px", fontFamily: MONO, fontSize: "10px", border: "1px solid #E5E4DF", background: "#FFFFFF", color: "#1A1A1A", outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading && <p style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF", padding: "16px" }}>LOADING…</p>}
            {!loading && samples.length > 0 && (
              <>
                <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#9CA3AF", padding: "12px 16px 4px" }}>SAMPLES</p>
                {filtered(samples).map((d) => (
                  <button
                    key={d.dataset_id}
                    onClick={() => setSelectedId(d.dataset_id)}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 16px",
                      background: selectedId === d.dataset_id ? "#F0EFE9" : "none",
                      border: "none", borderBottom: "1px solid #E5E4DF",
                      borderLeft: selectedId === d.dataset_id ? "3px solid #4C566A" : "3px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    <p style={{ fontFamily: SERIF, fontSize: "13px", fontWeight: 600, color: "#1A1A1A", marginBottom: "2px" }}>{d.name}</p>
                    <p style={{ fontFamily: MONO, fontSize: "8px", color: "#9CA3AF" }}>{d.files.length} FILES</p>
                  </button>
                ))}
              </>
            )}
            {!loading && others.length > 0 && (
              <>
                <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#9CA3AF", padding: "12px 16px 4px" }}>YOUR DATASETS</p>
                {filtered(others).map((d) => (
                  <button
                    key={d.dataset_id}
                    onClick={() => setSelectedId(d.dataset_id)}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 16px",
                      background: selectedId === d.dataset_id ? "#F0EFE9" : "none",
                      border: "none", borderBottom: "1px solid #E5E4DF",
                      borderLeft: selectedId === d.dataset_id ? "3px solid #4C566A" : "3px solid transparent",
                      cursor: "pointer",
                    }}
                  >
                    <p style={{ fontFamily: SERIF, fontSize: "13px", fontWeight: 600, color: "#1A1A1A", marginBottom: "2px" }}>{d.name}</p>
                    <p style={{ fontFamily: MONO, fontSize: "8px", color: "#9CA3AF" }}>{d.files.length} FILES · {new Date(d.updated_at).toLocaleDateString()}</p>
                  </button>
                ))}
              </>
            )}
            {!loading && datasets.length === 0 && (
              <p style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF", padding: "16px" }}>NO DATASETS FOUND</p>
            )}
          </div>

          {/* New dataset button */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #E5E4DF" }}>
            <Link href="/datasets/new" style={{
              display: "block", textAlign: "center", padding: "9px",
              background: "#1A1A1A", color: "#FAFAF7", textDecoration: "none",
              fontFamily: MONO, fontSize: "9px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
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
              onDeleted={() => {
                setSelectedId(null)
                load()
              }}
            />
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
              <p style={{ fontFamily: MONO, fontSize: "10px", color: "#9CA3AF" }}>SELECT A DATASET</p>
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
