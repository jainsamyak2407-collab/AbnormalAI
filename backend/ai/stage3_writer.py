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
from ai.prompt_utils import load_prompt, fill_template
from analytics.evidence_index import EvidenceIndex

logger = logging.getLogger(__name__)

# Evidence chip pattern used to extract refs from written prose
_CHIP_RE = re.compile(r"\[E(\d+)\]")


def _parse_section(pillar: dict, raw_markdown: str) -> dict:
    """
    Parse raw markdown from the writer into a structured section dict.
    Extracts the headline (first ## line), body prose, evidence refs, and exhibit.
    """
    lines = raw_markdown.strip().splitlines()

    headline = ""
    content_lines: list[str] = []
    exhibit: str | None = None

    for line in lines:
        if line.startswith("## ") and not headline:
            headline = line[3:].strip()
        elif line.startswith("{{EXHIBIT:"):
            exhibit_match = re.match(r"\{\{EXHIBIT:\s*(.+?)\}\}", line)
            if exhibit_match:
                exhibit = exhibit_match.group(1).strip()
        else:
            content_lines.append(line)

    content = "\n".join(content_lines).strip()

    # Extract all evidence refs from the written prose
    evidence_refs = [f"E{n}" for n in _CHIP_RE.findall(raw_markdown)]
    evidence_refs = list(dict.fromkeys(evidence_refs))  # deduplicate, preserve order

    return {
        "id": pillar.get("pillar_id", "section").lower().replace("-", "_"),
        "headline": headline or pillar.get("headline", ""),
        "content": content,
        "exhibits": [exhibit] if exhibit else [],
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
        "observations_json": observations_for_pillar,
        "evidence_index_json": evidence_for_prompt,
        "exhibit_name": pillar.get("exhibit") or "none",
        "length": length,
    })

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=800,
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
