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

// ---------------------------------------------------------------------------
// Dataset library
// ---------------------------------------------------------------------------

export interface DatasetFile {
  original_name: string
  detected_schema: string
  row_count: number
  columns: string[]
  size_bytes: number
}

export interface Dataset {
  dataset_id: string
  name: string
  description: string
  is_sample: boolean
  created_at: string
  updated_at: string
  files: DatasetFile[]
  account: Record<string, unknown> | null
  period_detected: { label?: string; start?: string; end?: string } | null
}

export interface FilePageResult {
  filename: string
  total_rows: number
  page: number
  page_size: number
  total_pages: number
  columns: string[]
  rows: Record<string, string>[]
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type MetricType = "scalar" | "criteria_table" | "row_list" | "breakdown"

export interface BreakdownSegment {
  label: string
  value: number
  share: number
}

export interface EvidenceRecord {
  evidence_id: string
  metric_label: string
  metric_type: MetricType
  calculation_description: string
  source_row_count: number
  // scalar
  value?: number | string | null
  unit?: string | null
  // criteria_table
  criteria_rows?: Record<string, unknown>[] | null
  // row_list
  rows?: Record<string, unknown>[] | null
  // breakdown
  segments?: BreakdownSegment[] | null
}
