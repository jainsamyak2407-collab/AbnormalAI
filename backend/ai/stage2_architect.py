"""
Stage 2: Narrative Architect
Model: Claude Opus 4.6
Input: observations + audience profile + emphasis + length
Output: brief outline dict (thesis with evidence_refs, executive_summary, pillars,
        exhibits_plan, closing_ask)
"""

from __future__ import annotations

import logging

from anthropic import AsyncAnthropic

from ai.client import OPUS_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json
from ai.skill_loader import inject_skill

logger = logging.getLogger(__name__)


async def run(
    observations: list[dict],
    audience_profile: dict,
    audience: str,
    emphasis: str,
    length: str,
    period: str,
    company_name: str,
    client: AsyncAnthropic,
) -> dict:
    """
    Run Stage 2: Narrative Architect.
    Returns the brief outline with thesis, executive_summary, pillars,
    exhibits_plan, and closing_ask.
    """
    system_prompt, user_template = load_prompt("architect.md")
    system_prompt = inject_skill(system_prompt, "mckinsey_writing")

    user_message = fill_template(user_template, {
        "audience": audience,
        "period": period,
        "company_name": company_name,
        "audience_profile_json": audience_profile,
        "emphasis": emphasis,
        "length": length,
        "observations_json": observations,
    })

    response = await client.messages.create(
        model=OPUS_MODEL,
        max_tokens=2500,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text
    outline = extract_json(raw)

    if not isinstance(outline, dict):
        logger.warning("Stage 2 returned non-dict; using empty outline.")
        outline = {}

    # Ensure required keys exist with safe defaults
    outline.setdefault("thesis", f"Abnormal protected {company_name} in {period}.")
    outline.setdefault("thesis_evidence_refs", [])
    outline.setdefault("executive_summary", [])
    outline.setdefault("pillars", [])
    outline.setdefault("exhibits_plan", [])
    outline.setdefault("closing_ask", "")
    outline.setdefault("demoted_observations", [])

    # Normalise executive_summary to 3 items
    if len(outline["executive_summary"]) != 3:
        logger.warning(
            "Stage 2 produced %d exec summary bullets; expected 3.",
            len(outline["executive_summary"]),
        )

    logger.info(
        "Stage 2: %d pillars, %d exec summary bullets, %d exhibits planned.",
        len(outline["pillars"]),
        len(outline["executive_summary"]),
        len(outline["exhibits_plan"]),
    )
    return outline
