"""
AI Orchestrator: wires all 5 stages, streams SSE progress, builds final brief.
Called by api/generate.py.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import AsyncGenerator

from ai import stage1_interpreter, stage2_architect, stage3_writer, stage4_recommender, stage5_auditor
from ai.client import get_async_client
from analytics.anomalies import Anomaly
from analytics.evidence_index import EvidenceIndex
from analytics.metrics import MetricsBundle
from analytics.tenant_drift import TenantComparison, TenantDriftBundle
from analytics.trends import TrendBundle, TrendPoint
from models import GenerateRequest

logger = logging.getLogger(__name__)

PROFILES_DIR = Path(__file__).parent.parent / "profiles"

STAGE_NAMES = [
    "Data Interpreter",
    "Narrative Architect",
    "Section Writer & Recommendations",
    "Evidence Auditor",
]


def _load_profile(audience: str) -> dict:
    path = PROFILES_DIR / f"{audience}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


async def run_pipeline(
    brief_id: str,
    request: GenerateRequest,
    session: dict,
) -> AsyncGenerator[str, None]:
    """
    Async generator that runs the 4-stage AI pipeline and yields SSE event strings.
    Stages 3 and 4 run in parallel.
    Final event: {"type": "done", "brief_id": "..."}
    """
    raw_metrics = session["metrics"]
    metrics: MetricsBundle = (
        raw_metrics if isinstance(raw_metrics, MetricsBundle)
        else MetricsBundle(**raw_metrics)
    )

    raw_evidence = session["evidence"]
    evidence: EvidenceIndex = (
        raw_evidence if isinstance(raw_evidence, EvidenceIndex)
        else EvidenceIndex.from_dict(raw_evidence)
    )

    account: dict = session["account"]

    raw_anomalies = session.get("anomalies") or []
    anomalies: list[Anomaly] = [
        a if isinstance(a, Anomaly) else Anomaly(**a)
        for a in raw_anomalies
    ]

    raw_trends = session.get("trends")
    if isinstance(raw_trends, TrendBundle):
        trends = raw_trends
    elif isinstance(raw_trends, dict):
        trends = TrendBundle(**{
            k: [TrendPoint(**p) for p in v]
            for k, v in raw_trends.items()
        })
    else:
        trends = None

    raw_drift = session.get("tenant_drift")
    if isinstance(raw_drift, TenantDriftBundle):
        tenant_drift = raw_drift
    elif isinstance(raw_drift, dict):
        tenant_drift = TenantDriftBundle(
            comparisons=[TenantComparison(**c) for c in raw_drift.get("comparisons", [])],
            has_significant_drift=raw_drift.get("has_significant_drift", False),
            summary=raw_drift.get("summary", ""),
        )
    else:
        tenant_drift = None

    audience_profile = _load_profile(request.audience)
    client = get_async_client()

    # -----------------------------------------------------------------------
    # Stage 1: Data Interpreter
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 1, "stage_name": STAGE_NAMES[0], "total_stages": 4})
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
        yield _sse({"type": "error", "stage": 1, "message": f"Stage 1 failed: {e}"})
        raise

    yield _sse({"type": "stage_complete", "stage": 1, "stage_name": STAGE_NAMES[0], "total_stages": 4})

    # -----------------------------------------------------------------------
    # Stage 2: Narrative Architect
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 2, "stage_name": STAGE_NAMES[1], "total_stages": 4})
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
        yield _sse({"type": "error", "stage": 2, "message": f"Stage 2 failed: {e}"})
        raise

    yield _sse({"type": "stage_complete", "stage": 2, "stage_name": STAGE_NAMES[1], "total_stages": 4})

    # -----------------------------------------------------------------------
    # Stage 3 + Stage 4 in parallel
    # Stage 3: Section Writer (per-pillar parallel internally)
    # Stage 4: Recommendation Reasoner (only needs observations, not sections)
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 3, "stage_name": STAGE_NAMES[2], "total_stages": 4})
    try:
        sections, recommendations = await asyncio.gather(
            stage3_writer.run(
                outline=outline,
                observations=observations,
                evidence=evidence,
                audience=request.audience,
                length=request.length,
                period=metrics.period,
                company_name=metrics.company_name,
                client=client,
            ),
            stage4_recommender.run(
                observations=observations,
                sections=[],  # not available yet; stage4 uses gap observations, not sections
                evidence=evidence,
                audience=request.audience,
                emphasis=request.emphasis,
                period=metrics.period,
                company_name=metrics.company_name,
                audience_profile=audience_profile,
                client=client,
            ),
        )
    except Exception as e:
        import traceback
        logger.error("Stage 3/4 failed: %s\n%s", e, traceback.format_exc())
        yield _sse({"type": "error", "stage": 3, "message": f"Section writing failed: {e}"})
        raise

    yield _sse({"type": "stage_complete", "stage": 3, "stage_name": STAGE_NAMES[2], "total_stages": 4})

    # -----------------------------------------------------------------------
    # Stage 5: Evidence Auditor (programmatic only — no AI call)
    # -----------------------------------------------------------------------
    yield _sse({"type": "stage_start", "stage": 4, "stage_name": STAGE_NAMES[3], "total_stages": 4})
    try:
        audit = stage5_auditor.run(
            sections=sections,
            evidence=evidence,
            period=metrics.period,
            company_name=metrics.company_name,
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
                rewritten_by_id = {s["id"]: s for s in rewritten}
                sections = [rewritten_by_id.get(s["id"], s) for s in sections]
            except Exception as e:
                logger.error("Section regeneration failed: %s", e)

    yield _sse({"type": "stage_complete", "stage": 4, "stage_name": STAGE_NAMES[3], "total_stages": 4})

    # -----------------------------------------------------------------------
    # Assemble final brief — nested schema matching models.Brief
    # -----------------------------------------------------------------------
    from datetime import datetime, timezone as _tz
    import uuid as _uuid

    thesis_str = outline.get("thesis", "")
    prepared_for = "CISO" if request.audience == "ciso" else "Customer Success"

    # Build evidence_index from EvidenceIndex object
    evidence_index = {
        eid: {
            "evidence_id": rec.evidence_id,
            "metric_id": rec.metric_id,
            "metric_label": rec.metric_name,
            "metric_type": rec.metric_type,
            "value": rec.value,
            "unit": None,
            "calculation_description": rec.calculation,
            "source_rows": rec.source_rows,
            "source_files": [],
        }
        for eid, rec in evidence.all().items()
    }

    # Normalise recommendations — ensure required fields exist
    normalised_recs = []
    for i, r in enumerate(recommendations):
        if not isinstance(r, dict):
            continue
        normalised_recs.append({
            "rec_id": r.get("rec_id") or f"R{i+1}",
            "kind": r.get("kind", "POLICY"),
            "headline": r.get("headline") or r.get("action", ""),
            "expected_impact": r.get("expected_impact", ""),
            "rationale": r.get("rationale", ""),
            "evidence_refs": r.get("evidence_refs", []),
            "risk_if_unaddressed": r.get("risk_if_unaddressed", ""),
        })

    # Normalise sections — ensure required fields exist
    normalised_sections = []
    for i, s in enumerate(sections):
        if not isinstance(s, dict):
            continue
        prose = s.get("prose_inline") or s.get("content", "")
        normalised_sections.append({
            "section_id": s.get("section_id") or s.get("id") or f"s{i+1}",
            "id": s.get("section_id") or s.get("id") or f"s{i+1}",
            "order": s.get("order", i),
            "headline": s.get("headline", ""),
            "prose_inline": prose,
            "prose_print": s.get("prose_print", prose),
            "exhibit_refs": s.get("exhibit_refs", []),
            "so_what": s.get("so_what", ""),
            "content": prose,
            "evidence_refs": s.get("evidence_refs", []),
        })

    brief = {
        "brief_id": brief_id,
        "session_id": request.session_id,
        # Nested metadata block
        "metadata": {
            "customer_name": metrics.company_name,
            "period": {"label": metrics.period, "start": None, "end": None},
            "audience": request.audience,
            "emphasis": request.emphasis,
            "length": request.length,
            "prepared_by": "Abnormal Brief Studio",
            "prepared_for": prepared_for,
            "generated_at": datetime.now(_tz.utc).isoformat(),
        },
        # Nested thesis block
        "thesis": {
            "sentence": thesis_str,
            "evidence_refs": outline.get("thesis_evidence_refs", []),
        },
        "executive_summary": outline.get("executive_summary", []),
        "sections": normalised_sections,
        "exhibits": [],
        "recommendations": normalised_recs,
        "risks_open_items": [],
        "closing": {"ask": outline.get("closing_ask", ""), "audience_specific": True},
        "evidence_index": evidence_index,
        # Extra fields used by brief page and re-generation
        "success_criteria": {
            k: {"met": v["met"], "target": v["target"], "actual": v["actual"]}
            for k, v in metrics.success_criteria_status.items()
        },
        "benchmarks_summary": metrics.benchmarks_summary,
        "tension_arc": outline.get("tension_arc", ""),
        "audit": {
            "passed": audit.get("audit_passed", True),
            "issues": len(audit.get("issues", [])),
        },
        "observations": observations,
        "outline": outline,
    }

    # _brief_payload MUST come before done so generate.py stores the brief
    # in Redis before the frontend navigates to /brief/{id}
    yield _sse({"type": "_brief_payload", "brief": brief})
    yield _sse({"type": "done", "brief_id": brief_id})
