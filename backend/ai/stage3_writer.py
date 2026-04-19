"""
Stage 3: Section Writer
Model: Claude Sonnet 4.6
Input: one pillar intent + observations + evidence index + audience
Output: rendered markdown section
Runs in parallel across all pillars.
"""

from __future__ import annotations

import asyncio
import logging
import re

from anthropic import AsyncAnthropic

from ai.client import SONNET_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json
from analytics.evidence_index import EvidenceIndex

logger = logging.getLogger(__name__)

# Evidence chip pattern used to extract refs from written prose
_CHIP_RE = re.compile(r"\[E(\d+)\]")


def _parse_section(pillar: dict, raw: str) -> dict:
    """
    Parse JSON output from the section writer into a structured section dict.
    Falls back gracefully if JSON parsing fails.
    """
    section_id = pillar.get("pillar_id", "section").lower().replace("-", "_")

    try:
        data = extract_json(raw)
    except Exception:
        data = {}

    if not isinstance(data, dict):
        data = {}

    headline = data.get("headline") or pillar.get("headline", "")
    prose_inline = data.get("prose_inline", "")
    prose_print = data.get("prose_print", prose_inline)
    so_what = data.get("so_what", "")
    exhibit_refs = data.get("exhibit_refs") or []
    if not isinstance(exhibit_refs, list):
        exhibit_refs = []

    # Extract evidence chips from inline prose
    evidence_refs = [f"E{n}" for n in _CHIP_RE.findall(prose_inline)]
    evidence_refs = list(dict.fromkeys(evidence_refs))

    return {
        "id": section_id,
        "section_id": section_id,
        "order": pillar.get("order", 0),
        "headline": headline,
        "prose_inline": prose_inline,
        "prose_print": prose_print,
        "so_what": so_what,
        "content": prose_inline,   # legacy compat for brief page
        "exhibit_refs": exhibit_refs,
        "exhibits": exhibit_refs,  # legacy compat
        "evidence_refs": evidence_refs,
    }


async def write_one_section(
    pillar: dict,
    observations_for_pillar: list[dict],
    evidence: EvidenceIndex,
    audience: str,
    length: str,
    period: str,
    company_name: str,
    client: AsyncAnthropic,
) -> dict:
    """Write one section and return a structured section dict."""
    prompt_file = f"writer_{audience}.md"
    system_prompt, user_template = load_prompt(prompt_file)

    # Provide trimmed evidence index (metric_id, metric_name, value, calculation only)
    evidence_for_prompt = {
        eid: {
            "metric_id": rec.metric_id,
            "metric_name": rec.metric_name,
            "value": rec.value,
            "calculation": rec.calculation,
        }
        for eid, rec in evidence.all().items()
    }

    user_message = fill_template(user_template, {
        "company_name": company_name,
        "period": period,
        "section_intent": pillar.get("section_intent", pillar.get("headline", "")),
        "thesis_contract": pillar.get("thesis_contract", pillar.get("section_intent", "")),
        "dominant_tension": pillar.get("dominant_tension", ""),
        "observations_json": observations_for_pillar,
        "evidence_index_json": evidence_for_prompt,
        "exhibit_name": pillar.get("exhibit") or "none",
        "length": length,
    })

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=1500,
        system=[{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": user_message}],
        extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
    )

    raw = response.content[0].text
    return _parse_section(pillar, raw)


async def run(
    outline: dict,
    observations: list[dict],
    evidence: EvidenceIndex,
    audience: str,
    length: str,
    period: str,
    company_name: str,
    client: AsyncAnthropic,
) -> list[dict]:
    """
    Run Stage 3: write all sections in parallel.
    Returns list of section dicts.
    """
    pillars = outline.get("pillars", [])
    if not pillars:
        logger.warning("Stage 3: no pillars in outline; returning empty sections.")
        return []

    # Build observation lookup by id
    obs_by_id = {o.get("observation_id", ""): o for o in observations}

    async def _task(pillar: dict) -> dict:
        obs_ids = pillar.get("observation_ids", [])
        pillar_obs = [obs_by_id[oid] for oid in obs_ids if oid in obs_by_id]
        # Fall back to all observations if none matched (e.g. id format mismatch)
        if not pillar_obs:
            pillar_obs = observations
        return await write_one_section(
            pillar=pillar,
            observations_for_pillar=pillar_obs,
            evidence=evidence,
            audience=audience,
            length=length,
            period=period,
            company_name=company_name,
            client=client,
        )

    sections = await asyncio.gather(*[_task(p) for p in pillars])
    logger.info("Stage 3 wrote %d sections.", len(sections))
    return list(sections)
