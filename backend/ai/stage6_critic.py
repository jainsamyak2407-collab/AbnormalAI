"""
Stage 6: Narrative Critic
Model: Claude Sonnet 4.6
Input: assembled sections + thesis + closing_ask + thesis_contracts per pillar
Output: critique dict with narrative score, issues, sections to regenerate
"""

from __future__ import annotations

import logging

from anthropic import AsyncAnthropic

from ai.client import SONNET_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json

logger = logging.getLogger(__name__)


def _sections_to_markdown(sections: list[dict]) -> str:
    parts = []
    for sec in sections:
        parts.append(
            f"### Section ID: {sec.get('id', 'unknown')}\n\n## {sec.get('headline', '')}\n\n{sec.get('content', '')}"
        )
    return "\n\n---\n\n".join(parts)


def _build_thesis_contracts(outline: dict) -> dict:
    """Extract thesis_contract per section from the outline pillars."""
    contracts = {}
    for pillar in outline.get("pillars", []):
        section_id = pillar.get("pillar_id", "").lower().replace("-", "_")
        contracts[section_id] = {
            "thesis_contract": pillar.get("thesis_contract", pillar.get("section_intent", "")),
            "dominant_tension": pillar.get("dominant_tension", ""),
        }
    return contracts


async def run(
    sections: list[dict],
    outline: dict,
    period: str,
    company_name: str,
    audience: str,
    client: AsyncAnthropic,
) -> dict:
    """
    Run Stage 6: Narrative Critic.
    Returns critique dict with narrative_score, issues, sections_to_regenerate.
    Non-fatal: returns empty critique on failure.
    """
    thesis = outline.get("thesis", "")
    closing_ask = outline.get("closing_ask", "")
    thesis_contracts = _build_thesis_contracts(outline)

    system_prompt, user_template = load_prompt("critic.md")

    user_message = fill_template(user_template, {
        "company_name": company_name,
        "period": period,
        "audience": audience,
        "thesis": thesis,
        "closing_ask": closing_ask,
        "thesis_contracts_json": thesis_contracts,
        "sections_markdown": _sections_to_markdown(sections),
    })

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text
    critique = extract_json(raw)

    if not isinstance(critique, dict):
        logger.warning("Stage 6 returned non-dict; using empty critique.")
        critique = {}

    critique.setdefault("narrative_score", 75)
    critique.setdefault("thesis_honored", True)
    critique.setdefault("arc_coherent", True)
    critique.setdefault("issues", [])
    critique.setdefault("sections_to_regenerate", [])
    critique.setdefault("critique_summary", "")

    score = critique.get("narrative_score", 75)
    issues_count = len(critique.get("issues", []))
    regen_count = len(critique.get("sections_to_regenerate", []))
    logger.info(
        "Stage 6 critique: score=%d, issues=%d, sections_to_regenerate=%d",
        score, issues_count, regen_count,
    )
    return critique
