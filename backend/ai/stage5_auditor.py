"""
Stage 5: Evidence Auditor
Programmatic pass only: verifies every [E{n}] token resolves to a real evidence record.
AI value-match pass removed to save tokens and latency.
"""

from __future__ import annotations

import logging
import re

from analytics.evidence_index import EvidenceIndex

logger = logging.getLogger(__name__)

_CHIP_RE = re.compile(r"\[E(\d+)\]")


def _programmatic_check(sections: list[dict], evidence: EvidenceIndex) -> dict:
    result: dict[str, bool] = {}
    for section in sections:
        content = section.get("content", "")
        headline = section.get("headline", "")
        combined = f"{headline}\n{content}"
        for n in _CHIP_RE.findall(combined):
            eid = f"E{n}"
            result[eid] = evidence.get(eid) is not None
    return result


def run(
    sections: list[dict],
    evidence: EvidenceIndex,
    period: str,
    company_name: str,
) -> dict:
    """
    Run Stage 5: programmatic evidence check only.
    Returns audit result dict with issues and sections_to_regenerate.
    """
    prog_check = _programmatic_check(sections, evidence)
    unresolved = [eid for eid, ok in prog_check.items() if not ok]

    if unresolved:
        logger.warning("Stage 5: unresolved evidence refs: %s", unresolved)

    issues = [
        {
            "section_id": "unknown",
            "issue_type": "unresolved_ref",
            "severity": "blocking",
            "description": f"Unresolved ref: {eid}",
            "evidence_id": eid,
        }
        for eid in unresolved
    ]

    audit = {
        "audit_passed": len(unresolved) == 0,
        "sections_checked": len(sections),
        "issues": issues,
        "sections_to_regenerate": [],
        "audit_summary": "Programmatic check only.",
    }

    logger.info(
        "Stage 5 audit: passed=%s, unresolved_refs=%d",
        audit["audit_passed"],
        len(unresolved),
    )
    return audit
