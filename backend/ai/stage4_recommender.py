"""
Stage 4: Recommendation Reasoner
Model: Claude Opus 4.6
Input: gap observations + audience profile + evidence index
Output: list of 3-5 Recommendation dicts conforming to the Brief schema
"""

from __future__ import annotations

import logging

from anthropic import AsyncAnthropic

from ai.client import OPUS_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json
from ai.skill_loader import inject_skill
from analytics.evidence_index import EvidenceIndex

logger = logging.getLogger(__name__)

_GAP_DIRECTIONS = {"degrading", "mixed"}
_GAP_CATEGORIES = {"posture", "human_layer", "benchmark"}

_CISO_KINDS = {"BUDGET", "POLICY", "HEADCOUNT", "TRAINING"}
_CSM_KINDS = {"EXPANSION", "RENEWAL", "TRAINING", "POLICY"}


def _extract_gaps(observations: list[dict], sections: list[dict]) -> list[dict]:
    """Extract gap-signal observations from the full observation list."""
    gaps = []
    seen: set[str] = set()
    for obs in observations:
        oid = obs.get("observation_id", "")
        direction = obs.get("direction", "")
        category = obs.get("narrative_category", "")
        if direction in _GAP_DIRECTIONS or category in _GAP_CATEGORIES:
            if oid not in seen:
                gaps.append(obs)
                seen.add(oid)
    return gaps


def _normalize_recommendation(raw: dict, idx: int, audience: str) -> dict:
    """Normalize a raw recommendation dict to the Brief Recommendation schema."""
    valid_kinds = _CISO_KINDS if audience == "ciso" else _CSM_KINDS

    # Support old schema field names as fallbacks
    rec_id = raw.get("rec_id") or raw.get("recommendation_id") or f"REC-{idx + 1:02d}"
    kind = (raw.get("kind") or raw.get("ask_type", "").upper() or raw.get("commercial_angle", "").upper())
    if kind not in valid_kinds:
        kind = "BUDGET" if audience == "ciso" else "EXPANSION"

    # headline
    headline = raw.get("headline") or raw.get("action", "")

    # expected_impact
    expected_impact = raw.get("expected_impact", "")

    # rationale: build from old schema if new field absent
    rationale = raw.get("rationale", "")
    if not rationale:
        chain = raw.get("rationale_chain", [])
        rationale = " ".join(chain) if chain else raw.get("gap", raw.get("gap_or_signal", ""))

    # evidence_refs
    evidence_refs = raw.get("evidence_refs", [])

    # risk_if_unaddressed
    risk_if_unaddressed = raw.get("risk_if_unaddressed", "")
    if not risk_if_unaddressed:
        # fallback from old "next_step" or urgency_context
        risk_if_unaddressed = raw.get("next_step") or raw.get("urgency_context", "")

    return {
        "rec_id": rec_id,
        "kind": kind,
        "headline": headline,
        "expected_impact": expected_impact,
        "rationale": rationale,
        "evidence_refs": evidence_refs,
        "risk_if_unaddressed": risk_if_unaddressed,
    }


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
    Returns a list of normalized recommendation dicts.
    """
    prompt_file = f"recommender_{audience}.md"
    system_prompt, user_template = load_prompt(prompt_file)
    system_prompt = inject_skill(system_prompt, "mckinsey_writing")

    gaps = _extract_gaps(observations, sections)
    if not gaps:
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
        model=OPUS_MODEL,
        max_tokens=1500,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text
    recs_raw = extract_json(raw)

    if not isinstance(recs_raw, list):
        logger.warning("Stage 4 returned non-list; wrapping.")
        recs_raw = [recs_raw] if isinstance(recs_raw, dict) else []

    recs = [_normalize_recommendation(r, i, audience) for i, r in enumerate(recs_raw)]
    logger.info("Stage 4 produced %d recommendations.", len(recs))
    return recs
