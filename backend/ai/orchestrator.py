"""
AI Orchestrator: wires all 6 stages, streams SSE progress, builds final Brief.
Called by api/generate.py.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator

from ai import stage1_interpreter, stage2_architect, stage3_writer, stage4_recommender, stage5_auditor, stage6_critic
from ai.client import get_async_client
from analytics.anomalies import Anomaly
from analytics.evidence_index import EvidenceIndex
from analytics.exhibit_builder import build_exhibits
from analytics.metrics import MetricsBundle
from models import (
    Brief, BriefEvidenceRecord, BriefMetadata, Closing, ExecutiveSummaryItem,
    PeriodInfo, RiskItem, Section, ThesisBlock,
)
from models import GenerateRequest

logger = logging.getLogger(__name__)

PROFILES_DIR = Path(__file__).parent.parent / "profiles"

STAGE_NAMES = [
    "Data Interpreter",
    "Narrative Architect",
    "Section Writer",
    "Recommendation Reasoner",
    "Evidence Auditor",
    "Narrative Critic",
]


def _load_profile(audience: str) -> dict:
    path = PROFILES_DIR / f"{audience}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _build_evidence_index(evidence: EvidenceIndex) -> dict[str, dict]:
    """Serialize the EvidenceIndex into the Brief's embedded evidence_index."""
    result: dict[str, dict] = {}
    for eid, rec in evidence.all().items():
        result[eid] = {
            "evidence_id": rec.evidence_id,
            "metric_id": rec.metric_id,
            "metric_label": rec.metric_name,
            "metric_type": rec.metric_type,
            "value": rec.value,
            "unit": getattr(rec, "unit", None),
            "calculation_description": rec.calculation,
            "source_rows": rec.source_rows[:50] if rec.source_rows else [],
            "source_files": getattr(rec, "source_files", []),
            "additional_data": None,
        }
    return result


def _build_risks(anomalies: list, evidence: EvidenceIndex) -> list[dict]:
    """Convert anomalies to RiskItem dicts for the Brief schema."""
    risks = []
    for i, anomaly in enumerate(anomalies):
        if isinstance(anomaly, Anomaly):
            status_map = {
                "critical": "trending_worse",
                "high": "open",
                "medium": "monitoring",
            }
            risks.append({
                "item_id": getattr(anomaly, "anomaly_id", f"risk_{i+1:02d}"),
                "label": getattr(anomaly, "title", anomaly.rule if hasattr(anomaly, "rule") else "Unknown"),
                "status": status_map.get(getattr(anomaly, "severity", "medium"), "open"),
                "evidence_refs": getattr(anomaly, "evidence_ids", []),
            })
        elif isinstance(anomaly, dict):
            risks.append({
                "item_id": anomaly.get("anomaly_id", f"risk_{i+1:02d}"),
                "label": anomaly.get("title", anomaly.get("rule", "Unknown")),
                "status": anomaly.get("status", "open"),
                "evidence_refs": anomaly.get("evidence_ids", []),
            })
    return risks


def _parse_period(period_str: str) -> PeriodInfo:
    """Parse a period string like 'Q1 2026' into a PeriodInfo."""
    # Try common formats
    import re
    m = re.match(r"Q(\d)\s+(\d{4})", period_str)
    if m:
        q, yr = int(m.group(1)), int(m.group(2))
        starts = {1: "01-01", 2: "04-01", 3: "07-01", 4: "10-01"}
        ends = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}
        return PeriodInfo(
            label=period_str,
            start=f"{yr}-{starts[q]}",
            end=f"{yr}-{ends[q]}",
        )
    return PeriodInfo(label=period_str)


async def run_pipeline(
    brief_id: str,
    request: GenerateRequest,
    session: dict,
) -> AsyncGenerator[str, None]:
    """
    Async generator that runs the 6-stage AI pipeline and yields SSE event strings.
    Final events: {"type": "done", "brief_id": "..."} then {"type": "_brief_payload", "brief": {...}}
    """
    metrics: MetricsBundle = session["metrics"]
    evidence: EvidenceIndex = session["evidence"]
    account: dict = session["account"]
    anomalies: list = session.get("anomalies", [])
    trends = session.get("trends")
    tenant_drift = session.get("tenant_drift")
    dfs: dict = session.get("dfs", {})

    audience_profile = _load_profile(request.audience)
    client = get_async_client()

    # -----------------------------------------------------------------------
    # Stage 1: Data Interpreter
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 1, "stage_name": STAGE_NAMES[0], "total_stages": 6})
    try:
        observations = await stage1_interpreter.run(
            metrics=metrics,
            evidence=evidence,
            anomalies=anomalies,
            trends=trends,
            tenant_drift=tenant_drift,
            client=client,
        )
    except Exception as e:
        logger.error("Stage 1 failed: %s", e)
        yield _sse({"type": "error", "stage": 1, "message": "Stage 1 failed."})
        raise

    yield _sse({"type": "stage_complete", "stage": 1, "stage_name": STAGE_NAMES[0], "total_stages": 6})

    # -----------------------------------------------------------------------
    # Stage 2: Narrative Architect
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 2, "stage_name": STAGE_NAMES[1], "total_stages": 6})
    try:
        outline = await stage2_architect.run(
            observations=observations,
            audience_profile=audience_profile,
            audience=request.audience,
            emphasis=request.emphasis,
            length=request.length,
            period=metrics.period,
            company_name=metrics.company_name,
            client=client,
        )
    except Exception as e:
        logger.error("Stage 2 failed: %s", e)
        yield _sse({"type": "error", "stage": 2, "message": "Stage 2 failed."})
        raise

    yield _sse({"type": "stage_complete", "stage": 2, "stage_name": STAGE_NAMES[1], "total_stages": 6})

    # -----------------------------------------------------------------------
    # Stage 3: Section Writer (parallel)
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 3, "stage_name": STAGE_NAMES[2], "total_stages": 6})
    try:
        sections = await stage3_writer.run(
            outline=outline,
            observations=observations,
            evidence=evidence,
            audience=request.audience,
            length=request.length,
            period=metrics.period,
            company_name=metrics.company_name,
            client=client,
        )
    except Exception as e:
        logger.error("Stage 3 failed: %s", e)
        yield _sse({"type": "error", "stage": 3, "message": "Stage 3 failed."})
        raise

    yield _sse({"type": "stage_complete", "stage": 3, "stage_name": STAGE_NAMES[2], "total_stages": 6})

    # -----------------------------------------------------------------------
    # Stage 4: Recommendation Reasoner
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 4, "stage_name": STAGE_NAMES[3], "total_stages": 6})
    try:
        recommendations = await stage4_recommender.run(
            observations=observations,
            sections=sections,
            evidence=evidence,
            audience=request.audience,
            emphasis=request.emphasis,
            period=metrics.period,
            company_name=metrics.company_name,
            audience_profile=audience_profile,
            client=client,
        )
    except Exception as e:
        import traceback
        logger.error("Stage 4 failed: %s\n%s", e, traceback.format_exc())
        yield _sse({"type": "error", "stage": 4, "message": "Stage 4 failed."})
        raise

    yield _sse({"type": "stage_complete", "stage": 4, "stage_name": STAGE_NAMES[3], "total_stages": 6})

    # -----------------------------------------------------------------------
    # Build exhibit objects (analytics, not AI)
    # -----------------------------------------------------------------------
    exhibits = build_exhibits(outline.get("exhibits_plan", []), metrics)

    # Build thesis and executive_summary from outline
    thesis_raw = outline.get("thesis", f"Abnormal protected {metrics.company_name} in {metrics.period}.")
    thesis_evidence_refs = outline.get("thesis_evidence_refs", [])
    thesis = {"sentence": thesis_raw, "evidence_refs": thesis_evidence_refs}

    exec_summary_raw = outline.get("executive_summary", [])
    executive_summary = [
        {"bullet": item.get("bullet", ""), "evidence_refs": item.get("evidence_refs", [])}
        for item in exec_summary_raw
    ]

    closing_ask = outline.get("closing_ask", "")

    # -----------------------------------------------------------------------
    # Stage 5: Evidence Auditor
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 5, "stage_name": STAGE_NAMES[4], "total_stages": 6})
    try:
        audit = await stage5_auditor.run(
            sections=sections,
            evidence=evidence,
            period=metrics.period,
            company_name=metrics.company_name,
            client=client,
            thesis=thesis,
            executive_summary=executive_summary,
            recommendations=recommendations,
            closing_ask=closing_ask,
        )
    except Exception as e:
        logger.error("Stage 5 failed: %s", e)
        audit = {"audit_passed": False, "sections_to_regenerate": [], "issues": []}

    # Regenerate failed sections (one pass only)
    regen_ids = set(audit.get("sections_to_regenerate", []))
    if regen_ids:
        logger.info("Regenerating sections: %s", regen_ids)
        failed_pillars = [
            p for p in outline.get("pillars", [])
            if p.get("pillar_id", "").lower().replace("-", "_") in regen_ids
            or p.get("pillar_id", "") in regen_ids
        ]
        if failed_pillars:
            regen_outline = {**outline, "pillars": failed_pillars}
            try:
                rewritten = await stage3_writer.run(
                    outline=regen_outline,
                    observations=observations,
                    evidence=evidence,
                    audience=request.audience,
                    length=request.length,
                    period=metrics.period,
                    company_name=metrics.company_name,
                    client=client,
                )
                rewritten_by_id = {s["section_id"]: s for s in rewritten}
                sections = [rewritten_by_id.get(s["section_id"], s) for s in sections]
            except Exception as e:
                logger.error("Section regeneration failed: %s", e)

    yield _sse({"type": "stage_complete", "stage": 5, "stage_name": STAGE_NAMES[4], "total_stages": 6})

    # -----------------------------------------------------------------------
    # Stage 6: Narrative Critic (non-fatal)
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 6, "stage_name": STAGE_NAMES[5], "total_stages": 6})
    try:
        critique = await stage6_critic.run(
            sections=sections,
            outline=outline,
            period=metrics.period,
            company_name=metrics.company_name,
            audience=request.audience,
            client=client,
        )
    except Exception as e:
        logger.error("Stage 6 failed (non-fatal): %s", e)
        critique = {"narrative_score": 75, "issues": [], "sections_to_regenerate": []}

    critic_regen_ids = set(critique.get("sections_to_regenerate", []))
    if critic_regen_ids:
        critic_failed_pillars = [
            p for p in outline.get("pillars", [])
            if p.get("pillar_id", "").lower().replace("-", "_") in critic_regen_ids
            or p.get("pillar_id", "") in critic_regen_ids
        ]
        if critic_failed_pillars:
            try:
                critic_rewritten = await stage3_writer.run(
                    outline={**outline, "pillars": critic_failed_pillars},
                    observations=observations,
                    evidence=evidence,
                    audience=request.audience,
                    length=request.length,
                    period=metrics.period,
                    company_name=metrics.company_name,
                    client=client,
                )
                rewritten_by_id = {s["section_id"]: s for s in critic_rewritten}
                sections = [rewritten_by_id.get(s["section_id"], s) for s in sections]
            except Exception as e:
                logger.error("Stage 6 section regeneration failed: %s", e)

    yield _sse({"type": "stage_complete", "stage": 6, "stage_name": STAGE_NAMES[5], "total_stages": 6})

    # -----------------------------------------------------------------------
    # Assemble full Brief conforming to the Part 2 contract
    # -----------------------------------------------------------------------
    prepared_for = (
        "Board of Directors" if request.audience == "ciso" else "Customer Success Review"
    )

    period_info = _parse_period(metrics.period)

    metadata = {
        "customer_name": metrics.company_name,
        "period": {"label": period_info.label, "start": period_info.start, "end": period_info.end},
        "audience": request.audience,
        "emphasis": request.emphasis,
        "length": request.length,
        "prepared_by": "Abnormal Brief Studio",
        "prepared_for": prepared_for,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

    # Normalize sections to Brief Section schema
    normalized_sections = []
    for i, s in enumerate(sections):
        normalized_sections.append({
            "section_id": s.get("section_id") or s.get("id", f"sec_{i+1:02d}"),
            "order": s.get("order", i + 1),
            "headline": s.get("headline", ""),
            "prose_inline": s.get("prose_inline") or s.get("content", ""),
            "prose_print": s.get("prose_print") or s.get("prose_inline") or s.get("content", ""),
            "exhibit_refs": s.get("exhibit_refs") or s.get("exhibits", []),
            "so_what": s.get("so_what", ""),
        })

    # Normalize exhibits to Brief Exhibit schema
    normalized_exhibits = [ex.model_dump() for ex in exhibits]

    # Build embedded evidence index
    embedded_evidence = _build_evidence_index(evidence)

    # Build risks from anomalies
    risks = _build_risks(anomalies, evidence)

    brief = {
        "brief_id": brief_id,
        "metadata": metadata,
        "thesis": thesis,
        "executive_summary": executive_summary,
        "sections": normalized_sections,
        "exhibits": normalized_exhibits,
        "recommendations": recommendations,
        "risks_open_items": risks,
        "closing": {"ask": closing_ask, "audience_specific": True},
        "evidence_index": embedded_evidence,
        # Pipeline internals stored for regeneration but excluded from contract model
        "_session_id": request.session_id,
        "_observations": observations,
        "_outline": outline,
        "_critique": {
            "narrative_score": critique.get("narrative_score", 75),
            "issues": critique.get("issues", []),
        },
        "_audit": {
            "passed": audit.get("audit_passed", True),
            "issues": len(audit.get("issues", [])),
        },
        "_emphasis": request.emphasis,
        "_length": request.length,
    }

    yield _sse({"type": "done", "brief_id": brief_id})
    yield _sse({"type": "_brief_payload", "brief": brief})
