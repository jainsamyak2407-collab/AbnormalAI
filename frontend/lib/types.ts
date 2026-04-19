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

// ---------------------------------------------------------------------------
// Brief contract — mirrors backend models.py Phase 2 schema
// ---------------------------------------------------------------------------

export interface PeriodInfo {
  label: string
  start?: string
  end?: string
}

export interface BriefMetadata {
  customer_name: string
  period: PeriodInfo
  audience: Audience
  emphasis: string
  length: string
  prepared_by: string
  prepared_for: string
  generated_at: string
}

export interface ThesisBlock {
  sentence: string
  evidence_refs: string[]
}

export interface ExecutiveSummaryItem {
  bullet: string
  evidence_refs: string[]
}

export interface BriefSection {
  section_id: string
  /** legacy field — same value as section_id */
  id?: string
  order: number
  headline: string
  prose_inline: string
  prose_print?: string
  exhibit_refs: string[]
  so_what?: string
  evidence_refs?: string[]
  /** legacy field — same value as prose_inline */
  content?: string
  /** legacy field — same value as exhibit_refs */
  exhibits?: string[]
}

export type ExhibitType =
  | "trend_line"
  | "benchmark_bars"
  | "department_bars"
  | "vip_cards"
  | "criteria_scorecard"

export interface Exhibit {
  exhibit_id: string
  number: number
  type: ExhibitType
  title: string
  caption: string
  source_note: string
  /** Shape depends on type — see exhibit_builder.py */
  data: Record<string, unknown>
  evidence_refs: string[]
}

export interface Recommendation {
  rec_id: string
  kind: string
  headline: string
  expected_impact: string
  rationale: string
  evidence_refs: string[]
  risk_if_unaddressed: string
}

export interface RiskItem {
  item_id: string
  label: string
  status: "open" | "monitoring" | "trending_worse" | "resolved"
  evidence_refs: string[]
}

export interface Closing {
  ask: string
  audience_specific: boolean
}

export interface BriefEvidenceRecord {
  evidence_id: string
  metric_id: string
  metric_label: string
  metric_type: string
  value: number | string | null
  unit?: string | null
  calculation_description: string
  source_rows: Record<string, unknown>[]
  source_files: string[]
  additional_data: unknown
}

export interface Brief {
  brief_id: string
  session_id?: string
  metadata: BriefMetadata
  thesis: ThesisBlock
  executive_summary: ExecutiveSummaryItem[]
  sections: BriefSection[]
  exhibits: Exhibit[]
  recommendations: Recommendation[]
  risks_open_items: RiskItem[]
  closing: Closing
  evidence_index: Record<string, BriefEvidenceRecord>
  /** Pipeline internals stored for regeneration */
  _session_id?: string
  _observations?: unknown[]
  _outline?: Record<string, unknown>
  _critique?: { narrative_score: number; issues: unknown[] }
  _audit?: { passed: boolean; issues: number }
  _emphasis?: string
  _length?: string
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
