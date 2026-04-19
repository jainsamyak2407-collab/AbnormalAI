"""
Stage 4: Recommendation Reasoner
Model: Claude Opus 4.6
Input: gap observations + audience profile + evidence index
Output: list of 3-5 structured recommendation dicts
"""

from __future__ import annotations

import logging

from anthropic import AsyncAnthropic

from ai.client import SONNET_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json
from analytics.evidence_index import EvidenceIndex

logger = logging.getLogger(__name__)

# Directions and categories that signal a gap
_GAP_DIRECTIONS = {"degrading", "mixed"}
_GAP_CATEGORIES = {"posture", "human_layer", "benchmark"}


def _extract_gaps(observations: list[dict], sections: list[dict]) -> list[dict]:
    """
    Extract gap-signal observations from the full observation list.
    Includes: degrading/mixed observations, posture/human_layer/benchmark category items.
    """
    gaps = []
    seen_ids = set()
    for obs in observations:
        obs_id = obs.get("observation_id", "")
        direction = obs.get("direction", "")
        category = obs.get("narrative_category", "")
        if direction in _GAP_DIRECTIONS or category in _GAP_CATEGORIES:
            if obs_id not in seen_ids:
                gaps.append(obs)
                seen_ids.add(obs_id)
    return gaps


async def run(
    observations: list[dict],
    sections: list[dict],
    evidence: EvidenceIndex,
    audience: str,
    emphasis: str,
    period: str,
    company_name: str,
    audience_profile: dict,
    client: AsyncAnthropic,
) -> list[dict]:
    """
    Run Stage 4: Recommendation Reasoner.
    Returns a list of recommendation dicts.
    """
    prompt_file = f"recommender_{audience}.md"
    system_prompt, user_template = load_prompt(prompt_file)

    gaps = _extract_gaps(observations, sections)
    if not gaps:
        # Fall back to all observations if no gaps found
        gaps = observations

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
        "gaps_json": gaps,
        "audience_profile_json": audience_profile,
        "emphasis": emphasis,
        "evidence_index_json": evidence_for_prompt,
    })

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=1000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text
    recommendations = extract_json(raw)

    if not isinstance(recommendations, list):
        logger.warning("Stage 4 returned non-list; wrapping.")
        recommendations = [recommendations] if isinstance(recommendations, dict) else []

    logger.info("Stage 4 produced %d recommendations.", len(recommendations))
    return recommendations
