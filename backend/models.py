from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------


class IngestResponse(BaseModel):
    session_id: str
    detected_schemas: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    period_detected: Optional[str] = None


# ---------------------------------------------------------------------------
# Generate
# ---------------------------------------------------------------------------


class GenerateRequest(BaseModel):
    session_id: str
    audience: Literal["ciso", "csm"]
    emphasis: Literal["risk", "value", "balanced"]
    tenants: Optional[list[str]] = None
    length: Literal["short", "standard", "full"] = "standard"


# ---------------------------------------------------------------------------
# Brief schema — authoritative contract (Part 2 of spec)
# ---------------------------------------------------------------------------


class PeriodInfo(BaseModel):
    label: str
    start: Optional[str] = None
    end: Optional[str] = None


class BriefMetadata(BaseModel):
    customer_name: str
    period: PeriodInfo
    audience: Literal["ciso", "csm"]
    emphasis: Literal["risk", "balanced", "value"]
    length: Literal["short", "standard", "full"]
    prepared_by: str = "Abnormal Brief Studio"
    prepared_for: str
    generated_at: str


class ThesisBlock(BaseModel):
    sentence: str
    evidence_refs: list[str] = Field(default_factory=list)


class ExecutiveSummaryItem(BaseModel):
    bullet: str
    evidence_refs: list[str] = Field(default_factory=list)


class Section(BaseModel):
    section_id: str
    order: int
    headline: str
    prose_inline: str   # markdown with [E{n}] chips for browser
    prose_print: str    # same prose with superscript markers for print
    exhibit_refs: list[str] = Field(default_factory=list)
    so_what: str


class Exhibit(BaseModel):
    exhibit_id: str
    number: int
    type: Literal["trend_line", "benchmark_bars", "department_bars", "vip_cards", "criteria_scorecard"]
    title: str
    caption: str
    source_note: str
    data: dict
    evidence_refs: list[str] = Field(default_factory=list)


class Recommendation(BaseModel):
    rec_id: str
    kind: Literal["POLICY", "BUDGET", "HEADCOUNT", "EXPANSION", "TRAINING", "RENEWAL"]
    headline: str
    expected_impact: str
    rationale: str
    evidence_refs: list[str] = Field(default_factory=list)
    risk_if_unaddressed: str


class RiskItem(BaseModel):
    item_id: str
    label: str
    status: Literal["open", "trending_worse", "trending_better", "monitoring"]
    evidence_refs: list[str] = Field(default_factory=list)


class Closing(BaseModel):
    ask: str
    audience_specific: bool = True


class BriefEvidenceRecord(BaseModel):
    """Evidence record embedded inside the brief's evidence_index."""
    evidence_id: str
    metric_id: str
    metric_label: str
    metric_type: Literal["scalar", "criteria_table", "row_list", "breakdown", "timeseries"]
    value: Any = None
    unit: Optional[str] = None
    calculation_description: str
    source_rows: list[dict] = Field(default_factory=list)
    source_files: list[str] = Field(default_factory=list)
    additional_data: Optional[dict] = None


class Brief(BaseModel):
    brief_id: str
    metadata: BriefMetadata
    thesis: ThesisBlock
    executive_summary: list[ExecutiveSummaryItem] = Field(default_factory=list)
    sections: list[Section] = Field(default_factory=list)
    exhibits: list[Exhibit] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    risks_open_items: list[RiskItem] = Field(default_factory=list)
    closing: Closing
    evidence_index: dict[str, BriefEvidenceRecord] = Field(default_factory=dict)

    # Stored for pipeline re-use (not rendered in UI)
    observations: list[dict] = Field(default_factory=list, exclude=True)
    outline: dict = Field(default_factory=dict, exclude=True)


# ---------------------------------------------------------------------------
# Evidence API response — individual endpoint (backward compatible)
# ---------------------------------------------------------------------------


class CriterionRow(BaseModel):
    criterion: str
    target: Any
    actual: Any
    met: bool
    description: Optional[str] = None


class BreakdownSegment(BaseModel):
    label: str
    value: float
    share: float


class EvidenceResponse(BaseModel):
    evidence_id: str
    metric_label: str
    metric_type: Literal["scalar", "criteria_table", "row_list", "breakdown", "timeseries"]
    calculation_description: str
    source_row_count: int
    # scalar
    value: Optional[Any] = None
    unit: Optional[str] = None
    # criteria_table
    criteria_rows: Optional[list[dict]] = None
    # row_list
    rows: Optional[list[dict]] = None
    # breakdown
    segments: Optional[list[BreakdownSegment]] = None
    # timeseries
    series: Optional[list[dict]] = None


# Keep legacy alias so existing imports don't break
EvidenceRecord = EvidenceResponse


# ---------------------------------------------------------------------------
# Presentation
# ---------------------------------------------------------------------------


class SlideCallout(BaseModel):
    number: str
    label: str
    context: str
    color: Literal["ink", "accent", "success", "warning"] = "ink"


class SlideChartSpec(BaseModel):
    type: Literal["trend_line", "benchmark_bars", "department_bars", "criteria_scorecard"]
    title: str
    caption: str
    source_note: str
    data: dict
    evidence_refs: list[str] = Field(default_factory=list)


class SlideRecommendation(BaseModel):
    kind: Literal["POLICY", "BUDGET", "HEADCOUNT", "EXPANSION", "TRAINING", "RENEWAL"]
    headline: str
    rationale: str
    evidence_refs: list[str] = Field(default_factory=list)


class SlideContent(BaseModel):
    slide_number: int
    slide_type: Literal["title", "thesis", "what_happened", "what_needs_attention", "the_ask"]
    headline: Optional[str] = None
    subtitle: Optional[str] = None
    thesis_sentence: Optional[str] = None
    thesis_tagline: Optional[str] = None
    chart: Optional[SlideChartSpec] = None
    callouts: Optional[list[SlideCallout]] = None
    recommendations: Optional[list[SlideRecommendation]] = None
    closing_ask: Optional[str] = None
    footer: str = ""
    evidence_refs: list[str] = Field(default_factory=list)


class Presentation(BaseModel):
    presentation_id: str
    brief_id: str
    audience: Literal["ciso", "csm"]
    user_context: Optional[str] = None
    slides: list[SlideContent]
    generated_at: str  # ISO datetime string
