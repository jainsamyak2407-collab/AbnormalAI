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
# Brief
# ---------------------------------------------------------------------------


class BriefSection(BaseModel):
    id: str
    headline: str
    content: str
    exhibits: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)


class Brief(BaseModel):
    brief_id: str
    session_id: str
    audience: Literal["ciso", "csm"]
    period: str
    company_name: str
    thesis: str
    sections: list[BriefSection] = Field(default_factory=list)
    recommendations: list[dict] = Field(default_factory=list)
    risks: list[dict] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Evidence
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
    metric_type: Literal["scalar", "criteria_table", "row_list", "breakdown"]
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


# Keep legacy name so existing imports don't break
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
