"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { listDatasets, createSessionFromDataset } from "@/lib/api"

const MONO = "'Courier New', Courier, monospace"
const SERIF = "var(--font-source-serif), Georgia, serif"

export default function LandingPage() {
  const router = useRouter()
  const [datasetCount, setDatasetCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    listDatasets()
      .then((ds) => setDatasetCount(ds.length))
      .catch(() => setDatasetCount(0))
  }, [])

  const handleUseSample = async () => {
    setLoading(true); setErr(null)
    try {
      const { session_id } = await createSessionFromDataset("ds_meridian_sample")
      router.push(`/configure?session=${session_id}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load sample.")
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAF7", display: "flex", flexDirection: "column", position: "relative" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Ruled paper texture */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "repeating-linear-gradient(transparent, transparent 31px, #E5E4DF 31px, #E5E4DF 32px)",
        opacity: 0.35,
      }} />

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "18px 48px", borderBottom: "1px solid #E5E4DF",
        position: "relative", zIndex: 1, background: "#FAFAF7",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <span style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 700, letterSpacing: "0.22em", textTransform: "uppercase", color: "#1A1A1A" }}>
            ABNORMAL SECURITY
          </span>
          <span style={{ width: "1px", height: "14px", background: "#D1CFC6" }} />
          <span style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF" }}>
            BRIEF STUDIO
          </span>
        </div>
        <Link href="/datasets" style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#4C566A", textDecoration: "none", borderBottom: "1px solid #4C566A" }}>
          DATA LIBRARY
        </Link>
      </header>

      {/* Body */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "72px 48px", maxWidth: "960px", margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>

        {/* Classification bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "52px" }}>
          <div style={{ flex: 1, height: "1px", background: "#4C566A" }} />
          <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.28em", textTransform: "uppercase", color: "#4C566A", padding: "5px 14px", border: "1px solid #4C566A" }}>
            SECURITY INTELLIGENCE · AI-NATIVE
          </span>
          <div style={{ flex: 1, height: "1px", background: "#4C566A" }} />
        </div>

        {/* Headline */}
        <h1 style={{ fontFamily: SERIF, fontSize: "clamp(56px, 9vw, 104px)", fontWeight: 700, lineHeight: 0.92, letterSpacing: "-0.025em", color: "#1A1A1A", marginBottom: "36px" }}>
          Turn Abnormal<br />
          data into a<br />
          <em style={{ color: "#4C566A", fontStyle: "italic" }}>board-grade</em><br />
          brief.
        </h1>

        {/* Subhead */}
        <p style={{ fontFamily: SERIF, fontSize: "19px", lineHeight: 1.65, color: "#4B5563", maxWidth: "500px", marginBottom: "56px" }}>
          AI-native reporting for CISOs and CSMs. Every claim grounded in evidence.
          Upload your data, pick your audience, get a consulting-grade brief in under three minutes.
        </p>

        {/* Three-path cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "72px" }}>

          {/* Card 1: Use Meridian sample */}
          <button
            onClick={handleUseSample}
            disabled={loading}
            style={{
              textAlign: "left", padding: "28px 24px",
              background: "#1A1A1A", border: "1px solid #1A1A1A",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              display: "flex", flexDirection: "column", gap: "12px",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {loading ? (
                <div style={{ width: "8px", height: "8px", border: "1.5px solid rgba(255,255,255,0.3)", borderTopColor: "#FAFAF7", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
              ) : (
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#4ade80", display: "inline-block", flexShrink: 0 }} />
              )}
              <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9CA3AF" }}>SAMPLE DATA</span>
            </span>
            <span style={{ fontFamily: SERIF, fontSize: "20px", fontWeight: 700, color: "#FAFAF7", lineHeight: 1.2 }}>
              Use Meridian<br />sample
            </span>
            <span style={{ fontFamily: MONO, fontSize: "9px", color: "#6B7280", letterSpacing: "0.06em", lineHeight: 1.5 }}>
              Meridian Healthcare · Q1 2026 · pre-loaded
            </span>
          </button>

          {/* Card 2: Open data library */}
          <Link href="/datasets" style={{ textDecoration: "none" }}>
            <div style={{
              padding: "28px 24px", border: "1px solid #4C566A", cursor: "pointer",
              display: "flex", flexDirection: "column", gap: "12px", height: "100%",
            }}>
              <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#4C566A" }}>
                DATA LIBRARY
                {datasetCount != null && (
                  <span style={{ marginLeft: "8px", padding: "1px 6px", background: "#4C566A", color: "#FAFAF7" }}>{datasetCount}</span>
                )}
              </span>
              <span style={{ fontFamily: SERIF, fontSize: "20px", fontWeight: 700, color: "#1A1A1A", lineHeight: 1.2 }}>
                Open data<br />library
              </span>
              <span style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF", letterSpacing: "0.06em", lineHeight: 1.5 }}>
                View, manage, and generate<br />from saved datasets
              </span>
            </div>
          </Link>

          {/* Card 3: Upload new dataset */}
          <Link href="/datasets/new" style={{ textDecoration: "none" }}>
            <div style={{
              padding: "28px 24px", border: "1px solid #E5E4DF", cursor: "pointer",
              display: "flex", flexDirection: "column", gap: "12px", height: "100%",
            }}>
              <span style={{ fontFamily: MONO, fontSize: "8px", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9CA3AF" }}>NEW DATASET</span>
              <span style={{ fontFamily: SERIF, fontSize: "20px", fontWeight: 700, color: "#1A1A1A", lineHeight: 1.2 }}>
                Upload new<br />dataset
              </span>
              <span style={{ fontFamily: MONO, fontSize: "9px", color: "#9CA3AF", letterSpacing: "0.06em", lineHeight: 1.5 }}>
                Drop CSVs + account.json<br />to create a new dataset
              </span>
            </div>
          </Link>
        </div>

        {err && <p style={{ fontFamily: MONO, fontSize: "10px", color: "#C0392B", marginBottom: "16px" }}>{err}</p>}

        {/* Stats strip */}
        <div style={{ display: "flex", borderTop: "1px solid #E5E4DF", borderLeft: "1px solid #E5E4DF" }}>
          {[
            { n: "5", label: "AI STAGES" },
            { n: "2", label: "AUDIENCE MODES" },
            { n: "~60s", label: "GENERATION TIME" },
            { n: "0", label: "DATA RETAINED" },
          ].map(({ n, label }) => (
            <div key={label} style={{ flex: 1, padding: "20px 24px", borderRight: "1px solid #E5E4DF", borderBottom: "1px solid #E5E4DF" }}>
              <p style={{ fontFamily: SERIF, fontSize: "28px", fontWeight: 700, color: "#1A1A1A", lineHeight: 1, marginBottom: "6px" }}>{n}</p>
              <p style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#9CA3AF" }}>{label}</p>
            </div>
          ))}
        </div>
      </main>

      <footer style={{ padding: "14px 48px", borderTop: "1px solid #E5E4DF", display: "flex", justifyContent: "space-between", position: "relative", zIndex: 1, background: "#FAFAF7" }}>
        <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF" }}>
          DATA STAYS IN YOUR BROWSER SESSION · NOTHING IS PERSISTED
        </span>
        <span style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.14em", textTransform: "uppercase", color: "#9CA3AF" }}>
          CLAUDE SONNET 4.6 · PANDAS · FASTAPI
        </span>
      </footer>
    </div>
  )
}
