import type { IngestResponse, EvidenceRecord, Dataset, FilePageResult } from "./types"

export async function getBriefEvidenceIndex(briefId: string): Promise<EvidenceRecord[]> {
  const res = await fetch(`/api/brief/${briefId}/evidence-index`)
  if (!res.ok) throw new Error("Evidence index not found.")
  return res.json()
}

// ---------------------------------------------------------------------------
// Dataset library
// ---------------------------------------------------------------------------

export async function listDatasets(): Promise<Dataset[]> {
  const res = await fetch("/api/datasets")
  if (!res.ok) throw new Error("Failed to load datasets.")
  return res.json()
}

export async function getDataset(datasetId: string): Promise<Dataset> {
  const res = await fetch(`/api/datasets/${datasetId}`)
  if (!res.ok) throw new Error("Dataset not found.")
  return res.json()
}

export async function createDataset(name: string, description?: string): Promise<Dataset> {
  const res = await fetch("/api/datasets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description: description ?? "" }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to create dataset.")
  }
  return res.json()
}

export async function uploadDatasetFiles(datasetId: string, files: File[]): Promise<Dataset> {
  const form = new FormData()
  for (const file of files) form.append("files", file)
  const res = await fetch(`/api/datasets/${datasetId}/files`, { method: "POST", body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Upload failed.")
  }
  return res.json()
}

export async function getDatasetFilePage(
  datasetId: string,
  filename: string,
  page = 1,
  size = 50
): Promise<FilePageResult> {
  const res = await fetch(`/api/datasets/${datasetId}/files/${encodeURIComponent(filename)}?page=${page}&size=${size}`)
  if (!res.ok) throw new Error("File not found.")
  return res.json()
}

export async function deleteDataset(datasetId: string): Promise<void> {
  const res = await fetch(`/api/datasets/${datasetId}`, { method: "DELETE" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Delete failed.")
  }
}

export async function createSessionFromDataset(datasetId: string): Promise<{ session_id: string; dataset_id: string }> {
  const res = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset_id: datasetId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || "Failed to create session.")
  }
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
