// Shared TypeScript types mirroring backend Pydantic models.

export type Audience = "ciso" | "csm"
export type Emphasis = "risk" | "value" | "balanced"
export type Length = "short" | "standard" | "full"

export interface IngestResponse {
  session_id: string
  detected_schemas: string[]
  warnings: string[]
  period_detected: string | null
}

export interface GenerateRequest {
  session_id: string
  audience: Audience
  emphasis: Emphasis
  tenants?: string[]
  length?: Length
}

export interface BriefSection {
  id: string
  headline: string
  content: string
  exhibits: string[]
  evidence_refs: string[]
}

export interface Brief {
  brief_id: string
  session_id: string
  audience: Audience
  period: string
  company_name: string
  thesis: string
  sections: BriefSection[]
  recommendations: Record<string, unknown>[]
  risks: Record<string, unknown>[]
}

export interface EvidenceRecord {
  evidence_id: string
  metric_name: string
  value: number | string
  calculation: string
  source_row_count: number
  source_rows: Record<string, unknown>[]
}
