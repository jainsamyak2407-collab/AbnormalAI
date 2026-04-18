"""
Stage P2: Slide Writer
Model: Claude Sonnet 4.6
Input: slide plan entry + full brief + audience profile + exhibit registry
Output: SlideContent-compatible dict (5 calls run in parallel)
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any, Callable, Coroutine, Optional

from anthropic import AsyncAnthropic

from ai.client import SONNET_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json

logger = logging.getLogger(__name__)

SKILLS_DIR = Path(__file__).parent.parent / "skills"


def _load_skill(name: str) -> str:
    path = SKILLS_DIR / name / "SKILL.md"
    return path.read_text(encoding="utf-8")


def _make_footer(brief: dict, slide_number: int) -> str:
    company = brief.get("company_name", "")
    period = brief.get("period", "")
    audience = brief.get("audience", "ciso").upper()
    label = "CISO View" if audience == "CISO" else "CSM View"
    return f"{company} · {period} · {label} · Slide {slide_number} of 5"


def _inject_chart_data(slide_dict: dict, plan_entry: dict, exhibits_registry: dict) -> dict:
    """
    Replace any AI-generated chart data with deterministic exhibit data.
    AI picks the exhibit type; we own the numbers.
    """
    chart = slide_dict.get("chart")
    if not chart:
        return slide_dict

    chart_choice = plan_entry.get("chart_choice") or {}
    exhibit_id = chart_choice.get("exhibit_id", "")
    exhibit = exhibits_registry.get(exhibit_id)

    if exhibit:
        chart["type"] = exhibit["type"]
        chart["data"] = exhibit["data"]
        if not chart.get("title"):
            chart["title"] = exhibit["title"]

    slide_dict["chart"] = chart
    return slide_dict


async def write_one_slide(
    slide_plan_entry: dict,
    brief: dict,
    audience_profile: dict,
    user_context: Optional[str],
    exhibits_registry: dict,
    client: AsyncAnthropic,
) -> dict:
    """Write one slide and return a SlideContent-compatible dict."""
    system_prompt, user_template = load_prompt("slide_writer.md")

    presentation_skill = _load_skill("mckinsey_presentation")
    writing_skill = _load_skill("mckinsey_writing")

    slide_number: int = slide_plan_entry.get("slide_number", 1)
    slide_type: str = slide_plan_entry.get("slide_type", "title")

    # Attach exhibit data inline so Claude can reference it without fabricating numbers
    plan_with_data = dict(slide_plan_entry)
    chart_choice = slide_plan_entry.get("chart_choice") or {}
    exhibit_id = chart_choice.get("exhibit_id", "")
    if exhibit_id and exhibit_id in exhibits_registry:
        plan_with_data["chart_data_for_reference"] = exhibits_registry[exhibit_id]

    # Trim brief: skip outline (large) but keep sections, thesis, recommendations, observations
    brief_for_prompt = {
        k: v for k, v in brief.items()
        if k not in ("outline",)
    }

    user_message = fill_template(user_template, {
        "slide_number": slide_number,
        "slide_type": slide_type,
        "audience": brief.get("audience", "ciso"),
        "slide_plan_entry_json": plan_with_data,
        "brief_json": brief_for_prompt,
        "audience_profile_json": audience_profile,
        "user_context": user_context or "No additional context provided.",
        "presentation_skill": presentation_skill,
        "writing_skill": writing_skill,
    })

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=1500,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text
    slide_dict: dict[str, Any] = {}

    try:
        parsed = extract_json(raw)
        if isinstance(parsed, dict):
            slide_dict = parsed
        else:
            logger.warning("Slide %d returned non-dict JSON; using fallback.", slide_number)
    except Exception as exc:
        logger.warning("Slide %d JSON parse failed (%s); using fallback.", slide_number, exc)

    # Deterministic fields always win
    slide_dict["slide_number"] = slide_number
    slide_dict["slide_type"] = slide_type
    slide_dict["footer"] = _make_footer(brief, slide_number)
    slide_dict.setdefault("evidence_refs", [])

    # Override chart data with deterministic values
    slide_dict = _inject_chart_data(slide_dict, slide_plan_entry, exhibits_registry)

    logger.info("Slide Writer produced slide %d (%s).", slide_number, slide_type)
    return slide_dict


async def run(
    slide_plan: dict,
    brief: dict,
    audience_profile: dict,
    user_context: Optional[str],
    client: AsyncAnthropic,
    progress_callback: Optional[Callable[[int], Coroutine]] = None,
) -> list[dict]:
    """
    Stage P2: Write all 5 slides in parallel via asyncio.gather.
    Returns list of SlideContent-compatible dicts sorted by slide_number.
    """
    plan_entries: list[dict] = slide_plan.get("slide_plan", [])
    exhibits_registry: dict = slide_plan.get("_exhibits_registry", {})

    if not plan_entries:
        logger.error("No slide plan entries found; returning empty list.")
        return []

    async def _task(entry: dict) -> dict:
        result = await write_one_slide(
            slide_plan_entry=entry,
            brief=brief,
            audience_profile=audience_profile,
            user_context=user_context,
            exhibits_registry=exhibits_registry,
            client=client,
        )
        if progress_callback:
            await progress_callback(entry.get("slide_number", 0))
        return result

    raw_slides = await asyncio.gather(*[_task(e) for e in plan_entries], return_exceptions=True)

    slides: list[dict] = []
    for i, result in enumerate(raw_slides):
        if isinstance(result, Exception):
            entry = plan_entries[i] if i < len(plan_entries) else {}
            sn = entry.get("slide_number", i + 1)
            st = entry.get("slide_type", "title")
            logger.error("Slide %d write failed: %s", sn, result)
            slides.append({
                "slide_number": sn,
                "slide_type": st,
                "headline": "Slide unavailable. Click Revise to regenerate.",
                "footer": _make_footer(brief, sn),
                "evidence_refs": [],
            })
        else:
            slides.append(result)

    slides.sort(key=lambda s: s.get("slide_number", 0))
    logger.info("Stage P2 produced %d slides.", len(slides))
    return slides
