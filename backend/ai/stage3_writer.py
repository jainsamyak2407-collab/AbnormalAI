"""
Stage 3: Section Writer
Model: Claude Sonnet 4.6
Input: one pillar intent + observations + evidence index + audience
Output: structured section dict with prose_inline, prose_print, so_what, exhibit_refs
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

_CHIP_RE = re.compile(r"\[E(\d+)\]")


def _extract_evidence_refs(prose: str) -> list[str]:
    """Extract deduplicated [E{n}] refs from prose, in document order."""
    refs = [f"E{n}" for n in _CHIP_RE.findall(prose)]
    return list(dict.fromkeys(refs))


def _parse_section(pillar: dict, raw: str) -> dict:
    """
    Parse section output from the writer.

    Writer now emits structured JSON with headline, prose_inline, prose_print,
    so_what, exhibit_refs. Fall back to markdown parsing if JSON extraction fails.
    """
    section_id = pillar.get("pillar_id", "section").lower().replace("-", "_")

    # Attempt structured JSON parse first
    parsed = extract_json(raw)
    if isinstance(parsed, dict) and "prose_inline" in parsed:
        headline = parsed.get("headline") or pillar.get("headline", "")
        prose_inline = parsed.get("prose_inline", "")
        prose_print = parsed.get("prose_print", prose_inline)  # fallback to inline
        so_what = parsed.get("so_what", "")
        exhibit_refs = parsed.get("exhibit_refs", [])
        if not isinstance(exhibit_refs, list):
            exhibit_refs = []

        # Also compute evidence_refs from prose_inline for downstream auditing
        evidence_refs = _extract_evidence_refs(prose_inline)

        return {
            "section_id": section_id,
            "id": section_id,  # legacy compat for regenerate endpoint
            "order": pillar.get("_order", 1),
            "headline": headline,
            "prose_inline": prose_inline,
            "prose_print": prose_print,
            "exhibit_refs": exhibit_refs,
            "so_what": so_what,
            "evidence_refs": evidence_refs,
            # Legacy field kept for regenerate prompt rendering
            "content": prose_inline,
            "exhibits": exhibit_refs,
        }

    # Fallback: parse as markdown (old format)
    logger.warning("Section %r returned non-JSON; falling back to markdown parse.", section_id)
    lines = raw.strip().splitlines()
    headline = ""
    content_lines: list[str] = []
    exhibit_name: str | None = None

    for line in lines:
        if line.startswith("## ") and not headline:
            headline = line[3:].strip()
        elif line.startswith("{{EXHIBIT:"):
            m = re.match(r"\{\{EXHIBIT:\s*(.+?)\}\}", line)
            if m:
                exhibit_name = m.group(1).strip()
        else:
            content_lines.append(line)

    prose_inline = "\n".join(content_lines).strip()
    evidence_refs = _extract_evidence_refs(raw)

    return {
        "section_id": section_id,
        "id": section_id,
        "order": pillar.get("_order", 1),
        "headline": headline or pillar.get("headline", ""),
        "prose_inline": prose_inline,
        "prose_print": prose_inline,  # no superscript conversion in fallback
        "exhibit_refs": [exhibit_name] if exhibit_name else [],
        "so_what": "",
        "evidence_refs": evidence_refs,
        "content": prose_inline,
        "exhibits": [exhibit_name] if exhibit_name else [],
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

    evidence_for_prompt = {
        eid: {
            "metric_id": rec.metric_id,
            "metric_name": rec.metric_name,
            "value": rec.value,
            "calculation": rec.calculation,
        }
        for eid, rec in evidence.all().items()
    }

    # Resolve exhibit_id from pillar's exhibit name using the plan if available
    exhibit_ref = pillar.get("exhibit_id") or pillar.get("exhibit") or "none"

    user_message = fill_template(user_template, {
        "company_name": company_name,
        "period": period,
        "section_intent": pillar.get("section_intent", pillar.get("headline", "")),
        "thesis_contract": pillar.get("thesis_contract", pillar.get("section_intent", "")),
        "dominant_tension": pillar.get("dominant_tension", ""),
        "observations_json": observations_for_pillar,
        "evidence_index_json": evidence_for_prompt,
        "exhibit_name": exhibit_ref,
        "length": length,
    })

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=1000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
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

    # Annotate pillar order and attach exhibit_ids from exhibits_plan
    exhibits_plan = {ep.get("anchors_section"): ep for ep in outline.get("exhibits_plan", [])}
    for i, pillar in enumerate(pillars):
        pillar["_order"] = i + 1
        ep = exhibits_plan.get(pillar.get("pillar_id"))
        if ep:
            pillar["exhibit_id"] = ep.get("exhibit_id")

    obs_by_id = {o.get("observation_id", ""): o for o in observations}

    async def _task(pillar: dict) -> dict:
        obs_ids = pillar.get("observation_ids", [])
        pillar_obs = [obs_by_id[oid] for oid in obs_ids if oid in obs_by_id]
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
