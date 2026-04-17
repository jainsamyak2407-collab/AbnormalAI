import type { IngestResponse, EvidenceRecord } from "./types"

export async function getBriefEvidenceIndex(briefId: string): Promise<EvidenceRecord[]> {
  const res = await fetch(`/api/brief/${briefId}/evidence-index`)
  if (!res.ok) throw new Error("Evidence index not found.")
  return res.json()
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export async function checkHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_URL}/api/health`)
  return res.json()
}

export async function ingestSample(): Promise<IngestResponse> {
  const form = new FormData()
  form.append("sample", "true")
  const res = await fetch("/api/ingest", { method: "POST", body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Ingest failed.")
  }
  return res.json()
}

export async function ingestFiles(files: File[]): Promise<IngestResponse> {
  const form = new FormData()
  for (const file of files) {
    form.append("files", file)
  }
  const res = await fetch("/api/ingest", { method: "POST", body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Ingest failed.")
  }
  return res.json()
}

export async function getBrief(briefId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/brief/${briefId}`)
  if (!res.ok) throw new Error("Brief not found.")
  return res.json()
}

export async function getEvidence(briefId: string, evidenceId: string): Promise<EvidenceRecord> {
  const res = await fetch(`/api/evidence/${briefId}/${evidenceId}`)
  if (!res.ok) throw new Error("Evidence not found.")
  return res.json()
}

export async function getSectionPrompt(briefId: string, sectionId: string): Promise<{ system_prompt: string; user_prompt: string }> {
  const res = await fetch(`/api/brief/${briefId}/section/${sectionId}/prompt`)
  if (!res.ok) throw new Error("Prompt not found.")
  return res.json()
}

export async function regenerateSection(briefId: string, sectionId: string, steering?: string): Promise<import("./types").BriefSection> {
  const res = await fetch(`/api/brief/${briefId}/section/${sectionId}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steering: steering ?? null }),
  })
  if (!res.ok) throw new Error("Regeneration failed.")
  return res.json()
}
