"""
Stage 5: Evidence Auditor
Model: Claude Sonnet 4.6
Two-pass: programmatic check first, then AI value-match check.
Returns audit result dict. Identifies sections requiring regeneration.
"""

from __future__ import annotations

import logging
import re

from anthropic import AsyncAnthropic

from ai.client import SONNET_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json
from analytics.evidence_index import EvidenceIndex

logger = logging.getLogger(__name__)

_CHIP_RE = re.compile(r"\[E(\d+)\]")


def _programmatic_check(sections: list[dict], evidence: EvidenceIndex) -> dict:
    """
    Check that every [E{n}] token in section content resolves to a real evidence record.
    Returns {evidence_id: resolved_bool}.
    """
    result: dict[str, bool] = {}
    for section in sections:
        content = section.get("content", "")
        headline = section.get("headline", "")
        combined = f"{headline}\n{content}"
        for n in _CHIP_RE.findall(combined):
            eid = f"E{n}"
            result[eid] = evidence.get(eid) is not None
    return result


def _sections_to_markdown(sections: list[dict]) -> str:
    """Convert sections list to markdown string for the auditor prompt."""
    parts = []
    for sec in sections:
        headline = sec.get("headline", "")
        content = sec.get("content", "")
        parts.append(f"### Section: {sec.get('id', 'unknown')}\n\n## {headline}\n\n{content}")
    return "\n\n---\n\n".join(parts)


async def run(
    sections: list[dict],
    evidence: EvidenceIndex,
    period: str,
    company_name: str,
    client: AsyncAnthropic,
) -> dict:
    """
    Run Stage 5: Evidence Auditor.
    Returns audit result dict with issues and sections_to_regenerate.
    """
    # Pass 1: programmatic check
    prog_check = _programmatic_check(sections, evidence)
    unresolved = [eid for eid, ok in prog_check.items() if not ok]

    if unresolved:
        logger.warning("Stage 5 programmatic check found unresolved refs: %s", unresolved)

    # Pass 2: AI value-match check
    system_prompt, user_template = load_prompt("auditor.md")

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
        "programmatic_check_json": {
            "checked": prog_check,
            "unresolved_refs": unresolved,
        },
        "evidence_index_json": evidence_for_prompt,
        "brief_markdown": _sections_to_markdown(sections),
    })

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=1500,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text

    try:
        audit = extract_json(raw)
    except Exception as e:
        logger.warning("Stage 5 JSON parse failed (%s); returning clean audit.", e)
        audit = {
            "audit_passed": len(unresolved) == 0,
            "sections_checked": len(sections),
            "issues": [
                {"section_id": "unknown", "issue_type": "unresolved_ref",
                 "severity": "blocking", "description": f"Unresolved ref: {eid}",
                 "evidence_id": eid}
                for eid in unresolved
            ],
            "sections_to_regenerate": [],
            "audit_summary": "Programmatic check only (AI pass failed to parse).",
        }

    audit.setdefault("audit_passed", True)
    audit.setdefault("sections_to_regenerate", [])
    audit.setdefault("issues", [])

    logger.info(
        "Stage 5 audit: passed=%s, issues=%d, regen=%s",
        audit["audit_passed"],
        len(audit["issues"]),
        audit["sections_to_regenerate"],
    )
    return audit
