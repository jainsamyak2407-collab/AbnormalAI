from __future__ import annotations

from typing import Literal, Optional

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


class EvidenceRecord(BaseModel):
    evidence_id: str
    metric_name: str
    value: float | str
    calculation: str
    source_row_count: int
    source_rows: list[dict] = Field(default_factory=list)
