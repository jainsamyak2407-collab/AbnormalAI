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
