"""
Stage 2: Narrative Architect
Model: Claude Opus 4.6
Input: observations + audience profile + emphasis + length
Output: brief outline dict (thesis, pillars, closing ask)
"""

from __future__ import annotations

import logging

from anthropic import AsyncAnthropic

from ai.client import SONNET_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json

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
    Returns the brief outline dict with thesis, pillars, closing_ask.
    """
    system_prompt, user_template = load_prompt("architect.md")

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
        model=SONNET_MODEL,
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text
    outline = extract_json(raw)

    if not isinstance(outline, dict):
        logger.warning("Stage 2 returned non-dict; using empty outline.")
        outline = {}

    outline.setdefault("thesis", f"Abnormal protected {company_name} in {period}.")
    outline.setdefault("pillars", [])
    outline.setdefault("closing_ask", "")
    outline.setdefault("demoted_observations", [])

    logger.info("Stage 2 produced outline with %d pillars.", len(outline["pillars"]))
    return outline
