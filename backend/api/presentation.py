"""
Presentation API — 4 endpoints:

POST /api/brief/{brief_id}/presentation        SSE stream → {presentation_id}
GET  /api/presentation/{presentation_id}        full Presentation JSON
POST /api/presentation/{presentation_id}/slide/{n}/revise   one-slide revise
GET  /api/presentation/{presentation_id}/download           .pptx bytes
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import StreamingResponse

from ai import presentation_composer, slide_writer
from ai.client import get_async_client
from export.chart_renderer import render_chart
from export.presentation_store import presentation_store
from export.pptx_renderer import render_presentation
from models import Presentation, SlideContent
from store import store

router = APIRouter()
logger = logging.getLogger(__name__)

PROFILES_DIR = Path(__file__).parent.parent / "profiles"


def _load_profile(audience: str) -> dict:
    return json.loads((PROFILES_DIR / f"{audience}.json").read_text(encoding="utf-8"))


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _get_brief(brief_id: str) -> dict:
    """Retrieve brief dict from store or raise 404."""
    record = store.get(brief_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Brief not found.")
    brief = record if isinstance(record, dict) and "audience" in record else record.get("brief")
    if not brief:
        raise HTTPException(status_code=404, detail="Brief payload missing.")
    return brief


def _get_metrics(brief: dict):
    """Retrieve MetricsBundle from the session that produced this brief."""
    session_id = brief.get("session_id")
    if not session_id:
        raise HTTPException(status_code=422, detail="Brief has no session_id.")
    session = store.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    metrics = session.get("metrics")
    if not metrics:
        raise HTTPException(status_code=422, detail="Session has no metrics.")
    return metrics


def _render_all_charts(slides: list[dict]) -> dict[int, bytes]:
    """Render chart PNGs for every slide that has a chart spec."""
    charts: dict[int, bytes] = {}
    for s in slides:
        chart_spec = s.get("chart")
        if chart_spec:
            sn = s.get("slide_number", 0)
            try:
                charts[sn] = render_chart(chart_spec, dpi=200)
            except Exception as exc:
                logger.error("Chart render failed for slide %d: %s", sn, exc)
    return charts


_VALID_SLIDE_TYPES = {"title", "thesis", "what_happened", "what_needs_attention", "the_ask"}
_VALID_COLORS     = {"ink", "accent", "success", "warning"}
_VALID_REC_KINDS  = {"POLICY", "BUDGET", "HEADCOUNT", "EXPANSION", "TRAINING", "RENEWAL"}


def _sanitize_slide(raw: dict) -> dict:
    """Clamp enum fields to their Literal values so Pydantic validation never fails."""
    d = dict(raw)
    if d.get("slide_type") not in _VALID_SLIDE_TYPES:
        d["slide_type"] = "title"
    # callouts
    for c in d.get("callouts") or []:
        if isinstance(c, dict) and c.get("color") not in _VALID_COLORS:
            c["color"] = "ink"
    # recommendations
    for r in d.get("recommendations") or []:
        if isinstance(r, dict) and r.get("kind") not in _VALID_REC_KINDS:
            r["kind"] = "POLICY"
    # chart type
    chart = d.get("chart")
    if isinstance(chart, dict):
        _VALID_CHART_TYPES = {"trend_line", "benchmark_bars", "department_bars", "criteria_scorecard"}
        if chart.get("type") not in _VALID_CHART_TYPES:
            d["chart"] = None
    return d


def _coerce_slide(raw: dict) -> dict:
    """
    Sanitize then validate a slide dict against SlideContent pydantic model.
    Returns the model's canonical dict; falls back to sanitized raw on error.
    """
    sanitized = _sanitize_slide(raw)
    try:
        return SlideContent(**sanitized).model_dump()
    except Exception as exc:
        logger.warning("SlideContent validation warning: %s", exc)
        return sanitized


async def _generate_stream(brief_id: str, user_context: Optional[str]):
    """Async generator: runs the two presentation AI stages and yields SSE strings."""
    try:
        brief = _get_brief(brief_id)
        metrics = _get_metrics(brief)
    except HTTPException as exc:
        yield _sse({"type": "error", "message": exc.detail})
        return

    audience = brief.get("audience", "ciso")
    audience_profile = _load_profile(audience)
    client = get_async_client()

    # ── Stage P1: Presentation Composer ──────────────────────────────────────
    yield _sse({"type": "stage_start", "stage": "compose", "label": "Composing slide plan"})
    try:
        slide_plan = await presentation_composer.run(
            brief=brief,
            user_context=user_context,
            audience_profile=audience_profile,
            metrics=metrics,
            client=client,
        )
    except Exception as exc:
        logger.error("Presentation Composer failed: %s", exc)
        yield _sse({"type": "error", "message": "Failed to compose slide plan."})
        return
    yield _sse({"type": "stage_complete", "stage": "compose", "label": "Composing slide plan"})

    # ── Stage P2: Slide Writer (5 parallel calls) ─────────────────────────────
    yield _sse({"type": "stage_start", "stage": "write", "label": "Writing slides"})

    try:
        raw_slides = await slide_writer.run(
            slide_plan=slide_plan,
            brief=brief,
            audience_profile=audience_profile,
            user_context=user_context,
            client=client,
        )
    except Exception as exc:
        logger.error("Slide Writer failed: %s", exc)
        yield _sse({"type": "error", "message": "Failed to write slides."})
        return

    slides = [_coerce_slide(s) for s in raw_slides]
    yield _sse({"type": "stage_complete", "stage": "write", "label": "Writing slides"})

    # ── Stage P3: Chart rendering (deterministic) ─────────────────────────────
    yield _sse({"type": "stage_start", "stage": "charts", "label": "Rendering charts"})
    charts = _render_all_charts(slides)
    yield _sse({"type": "stage_complete", "stage": "charts", "label": "Rendering charts"})

    # ── Assemble and store ────────────────────────────────────────────────────
    presentation_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    presentation = Presentation(
        presentation_id=presentation_id,
        brief_id=brief_id,
        audience=audience,
        user_context=user_context,
        slides=slides,
        generated_at=now,
    )

    presentation_store.save(presentation)
    presentation_store.save_charts(presentation_id, charts)

    yield _sse({"type": "done", "presentation_id": presentation_id})


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("/brief/{brief_id}/presentation")
async def generate_presentation(
    brief_id: str,
    user_context: Optional[str] = Body(None, embed=True),
) -> StreamingResponse:
    """Stream SSE progress for presentation generation. Final event has presentation_id."""
    # Validate brief exists before starting the stream
    _get_brief(brief_id)

    return StreamingResponse(
        _generate_stream(brief_id, user_context),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/presentation/{presentation_id}")
async def get_presentation(presentation_id: str) -> dict:
    """Return the full Presentation JSON (slides in structured form for HTML preview)."""
    p = presentation_store.get(presentation_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Presentation not found.")
    return p.model_dump()


@router.post("/presentation/{presentation_id}/slide/{slide_number}/revise")
async def revise_slide(
    presentation_id: str,
    slide_number: int,
    instruction: str = Body(..., embed=True),
) -> dict:
    """Regenerate one slide given a free-text revision instruction. Returns updated SlideContent."""
    p = presentation_store.get(presentation_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Presentation not found.")

    # Find the slide and its plan entry (we reconstruct a minimal plan entry)
    target = next((s for s in p.slides if s.slide_number == slide_number), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"Slide {slide_number} not found.")

    brief = _get_brief(p.brief_id)
    metrics = _get_metrics(brief)
    audience_profile = _load_profile(p.audience)
    client = get_async_client()

    # Rebuild exhibit registry from current metrics
    exhibits = presentation_composer._build_exhibits_registry(metrics)
    exhibits_registry = {e["exhibit_id"]: e for e in exhibits}

    # Reconstruct a minimal plan entry for this slide type
    plan_entry = {
        "slide_number": slide_number,
        "slide_type": target.slide_type,
        "intent": f"Revise per user instruction: {instruction}",
    }
    # If slide had a chart, try to re-use the same exhibit id from the existing chart spec
    existing_chart = target.chart
    if existing_chart is not None:
        existing_type = existing_chart.type if hasattr(existing_chart, "type") else (existing_chart.get("type") if isinstance(existing_chart, dict) else None)
        if existing_type:
            match = next(
                (eid for eid, e in exhibits_registry.items() if e["type"] == existing_type), None
            )
            if match:
                plan_entry["chart_choice"] = {"exhibit_id": match, "reason": "Re-using existing chart"}

    combined_context = f"{p.user_context or ''}\n\nRevision instruction for slide {slide_number}: {instruction}".strip()

    # Wrap exhibits in the plan shape slide_writer.run expects
    mini_plan = {
        "slide_plan": [plan_entry],
        "_exhibits_registry": exhibits_registry,
    }

    try:
        raw_slides = await slide_writer.run(
            slide_plan=mini_plan,
            brief=brief,
            audience_profile=audience_profile,
            user_context=combined_context,
            client=client,
        )
    except Exception as exc:
        logger.error("Slide revise failed for slide %d: %s", slide_number, exc)
        raise HTTPException(status_code=500, detail=f"Slide {slide_number} failed to regenerate.")

    if not raw_slides:
        raise HTTPException(status_code=500, detail=f"Slide {slide_number} returned no content.")

    new_slide_dict = _coerce_slide(raw_slides[0])

    # Re-render chart if present
    chart_spec = new_slide_dict.get("chart")
    if chart_spec:
        try:
            new_png = render_chart(chart_spec, dpi=200)
            presentation_store.update_slide_chart(presentation_id, slide_number, new_png)
        except Exception as exc:
            logger.error("Chart re-render failed for slide %d: %s", slide_number, exc)

    # Patch the stored presentation
    updated_slides = []
    for s in p.slides:
        if s.slide_number == slide_number:
            try:
                updated_slides.append(SlideContent(**new_slide_dict))
            except Exception:
                updated_slides.append(s)
        else:
            updated_slides.append(s)

    updated = p.model_copy(update={"slides": updated_slides})
    presentation_store.save(updated)

    return new_slide_dict


@router.get("/presentation/{presentation_id}/download")
async def download_presentation(presentation_id: str) -> StreamingResponse:
    """Stream the compiled .pptx file. Filename derived from brief metadata."""
    p = presentation_store.get(presentation_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Presentation not found.")

    brief = _get_brief(p.brief_id)

    # Build .pptx
    charts = presentation_store.get_charts(presentation_id)
    slides_dicts = [s.model_dump() if hasattr(s, "model_dump") else s for s in p.slides]

    try:
        pptx_bytes = render_presentation(slides_dicts, charts)
    except Exception as exc:
        logger.error("PPTX compile failed for presentation %s: %s", presentation_id, exc)
        raise HTTPException(status_code=500, detail="Failed to compile presentation.")

    company_slug = brief.get("company_name", "brief").lower().replace(" ", "-")
    period_slug = brief.get("period", "").lower().replace(" ", "-")
    audience_slug = p.audience
    filename = f"{company_slug}-{period_slug}-{audience_slug}.pptx"

    return StreamingResponse(
        iter([pptx_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
