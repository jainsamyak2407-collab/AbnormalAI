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
from analytics.evidence_index import EvidenceIndex
from analytics.metrics import MetricsBundle
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
    metrics: MetricsBundle = session["metrics"]
    evidence: EvidenceIndex = session["evidence"]
    account: dict = session["account"]
    anomalies: list = session.get("anomalies", [])
    trends = session.get("trends")
    tenant_drift = session.get("tenant_drift")

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
        yield _sse({"type": "error", "stage": 1, "message": "Stage 1 failed."})
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
        yield _sse({"type": "error", "stage": 2, "message": "Stage 2 failed."})
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
        yield _sse({"type": "error", "stage": 3, "message": "Section writing failed."})
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
    # Assemble final brief
    # -----------------------------------------------------------------------
    success_summary = {
        k: {"met": v["met"], "target": v["target"], "actual": v["actual"]}
        for k, v in metrics.success_criteria_status.items()
    }

    brief = {
        "brief_id": brief_id,
        "session_id": request.session_id,
        "audience": request.audience,
        "emphasis": request.emphasis,
        "length": request.length,
        "period": metrics.period,
        "company_name": metrics.company_name,
        "thesis": outline.get("thesis", ""),
        "closing_ask": outline.get("closing_ask", ""),
        "sections": sections,
        "recommendations": recommendations,
        "risks": [],
        "success_criteria": success_summary,
        "benchmarks_summary": metrics.benchmarks_summary,
        "audit": {
            "passed": audit.get("audit_passed", True),
            "issues": len(audit.get("issues", [])),
        },
        "observations": observations,
        "outline": outline,
    }

    yield _sse({"type": "done", "brief_id": brief_id})
    yield _sse({"type": "_brief_payload", "brief": brief})
