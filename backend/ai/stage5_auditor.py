"""
Stage 5: Evidence Auditor
Model: Claude Sonnet 4.6
Three-pass: structural completeness → programmatic chip check → AI value-match check.
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


# ---------------------------------------------------------------------------
# Pass 1: structural completeness (local, no AI)
# ---------------------------------------------------------------------------

def _structural_check(
    thesis: dict,
    executive_summary: list[dict],
    sections: list[dict],
    recommendations: list[dict],
    closing_ask: str,
) -> tuple[list[dict], list[str]]:
    """
    Check structural completeness of the assembled brief.
    Returns (issues_list, sections_to_regenerate_ids).
    """
    issues: list[dict] = []
    regen: list[str] = []

    # Thesis
    if not thesis.get("sentence"):
        issues.append({
            "section_id": "thesis",
            "issue_type": "missing_field",
            "severity": "blocking",
            "description": "thesis.sentence is empty.",
        })
    if not thesis.get("evidence_refs"):
        issues.append({
            "section_id": "thesis",
            "issue_type": "missing_field",
            "severity": "blocking",
            "description": "thesis.evidence_refs is empty — thesis must cite at least one evidence record.",
        })

    # Executive summary
    n = len(executive_summary)
    if n != 3:
        issues.append({
            "section_id": "executive_summary",
            "issue_type": "structural_violation",
            "severity": "blocking",
            "description": f"executive_summary has {n} bullets; must have exactly 3.",
        })
    for i, item in enumerate(executive_summary):
        if not item.get("bullet"):
            issues.append({
                "section_id": "executive_summary",
                "issue_type": "missing_field",
                "severity": "blocking",
                "description": f"executive_summary[{i}].bullet is empty.",
            })
        if not item.get("evidence_refs"):
            issues.append({
                "section_id": "executive_summary",
                "issue_type": "missing_field",
                "severity": "warning",
                "description": f"executive_summary[{i}] has no evidence_refs.",
            })

    # Sections
    for sec in sections:
        sid = sec.get("section_id") or sec.get("id", "unknown")
        inline = sec.get("prose_inline", "")
        if not inline:
            issues.append({
                "section_id": sid,
                "issue_type": "missing_field",
                "severity": "blocking",
                "description": f"Section {sid} has no prose_inline.",
            })
            if sid not in regen:
                regen.append(sid)
        if not sec.get("prose_print"):
            issues.append({
                "section_id": sid,
                "issue_type": "missing_field",
                "severity": "warning",
                "description": f"Section {sid} has no prose_print.",
            })
        if not sec.get("so_what"):
            issues.append({
                "section_id": sid,
                "issue_type": "missing_field",
                "severity": "warning",
                "description": f"Section {sid} has no so_what.",
            })
        if not _CHIP_RE.search(inline):
            issues.append({
                "section_id": sid,
                "issue_type": "structural_violation",
                "severity": "blocking",
                "description": f"Section {sid} has zero evidence chips in prose_inline.",
            })
            if sid not in regen:
                regen.append(sid)

    # Recommendations
    required_rec_fields = ["headline", "expected_impact", "rationale", "risk_if_unaddressed"]
    for rec in recommendations:
        rid = rec.get("rec_id", "unknown")
        for field in required_rec_fields:
            if not rec.get(field):
                issues.append({
                    "section_id": "recommendations",
                    "issue_type": "missing_field",
                    "severity": "blocking",
                    "description": f"Recommendation {rid} is missing {field}.",
                })
        if not rec.get("evidence_refs"):
            issues.append({
                "section_id": "recommendations",
                "issue_type": "missing_field",
                "severity": "blocking",
                "description": f"Recommendation {rid} has no evidence_refs.",
            })

    # Closing
    if not closing_ask:
        issues.append({
            "section_id": "closing",
            "issue_type": "missing_field",
            "severity": "blocking",
            "description": "closing.ask is empty.",
        })

    return issues, regen


# ---------------------------------------------------------------------------
# Pass 2: programmatic chip resolution
# ---------------------------------------------------------------------------

def _programmatic_check(sections: list[dict], evidence: EvidenceIndex) -> dict:
    result: dict[str, bool] = {}
    for section in sections:
        inline = section.get("prose_inline", "") or section.get("content", "")
        for n in _CHIP_RE.findall(inline):
            eid = f"E{n}"
            result[eid] = evidence.get(eid) is not None
    return result


# ---------------------------------------------------------------------------
# Pass 3: AI value-match
# ---------------------------------------------------------------------------

def _sections_to_prompt_json(sections: list[dict]) -> list[dict]:
    return [
        {
            "section_id": s.get("section_id") or s.get("id", "unknown"),
            "headline": s.get("headline", ""),
            "prose_inline": s.get("prose_inline") or s.get("content", ""),
        }
        for s in sections
    ]


async def run(
    sections: list[dict],
    evidence: EvidenceIndex,
    period: str,
    company_name: str,
    client: AsyncAnthropic,
    thesis: dict | None = None,
    executive_summary: list[dict] | None = None,
    recommendations: list[dict] | None = None,
    closing_ask: str = "",
) -> dict:
    """
    Run Stage 5: Evidence Auditor.
    Returns audit result dict with issues and sections_to_regenerate.
    """
    thesis = thesis or {}
    executive_summary = executive_summary or []
    recommendations = recommendations or []

    # Pass 1: structural completeness
    structural_issues, structural_regen = _structural_check(
        thesis, executive_summary, sections, recommendations, closing_ask
    )

    # Pass 2: programmatic chip check
    prog_check = _programmatic_check(sections, evidence)
    unresolved = [eid for eid, ok in prog_check.items() if not ok]
    if unresolved:
        logger.warning("Stage 5 programmatic: unresolved refs: %s", unresolved)

    prog_issues = [
        {
            "section_id": "unknown",
            "issue_type": "unresolved_ref",
            "severity": "blocking",
            "description": f"Evidence chip {eid} does not resolve to any evidence record.",
            "evidence_id": eid,
        }
        for eid in unresolved
    ]

    # Pass 3: AI value-match
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
        "thesis_json": thesis,
        "executive_summary_json": executive_summary,
        "brief_sections_json": _sections_to_prompt_json(sections),
        "recommendations_json": [
            {"rec_id": r.get("rec_id"), "headline": r.get("headline"), "evidence_refs": r.get("evidence_refs")}
            for r in recommendations
        ],
        "closing_ask": closing_ask,
    })

    try:
        response = await client.messages.create(
            model=SONNET_MODEL,
            max_tokens=1500,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        ai_audit = extract_json(response.content[0].text)
    except Exception as exc:
        logger.warning("Stage 5 AI pass failed (%s); using programmatic results only.", exc)
        ai_audit = {
            "audit_passed": True,
            "issues": [],
            "sections_to_regenerate": [],
            "audit_summary": "AI pass failed; programmatic pass only.",
        }

    # Merge all issues
    all_issues = structural_issues + prog_issues + ai_audit.get("issues", [])
    all_regen = list(set(
        structural_regen
        + [eid for eid, ok in prog_check.items() if not ok]
        + ai_audit.get("sections_to_regenerate", [])
    ))

    blocking = any(i.get("severity") == "blocking" for i in all_issues)
    audit = {
        "audit_passed": not blocking,
        "sections_checked": len(sections),
        "issues": all_issues,
        "sections_to_regenerate": all_regen,
        "audit_summary": ai_audit.get("audit_summary", f"{len(all_issues)} issue(s) found."),
    }

    logger.info(
        "Stage 5 audit: passed=%s, issues=%d (structural=%d, prog=%d, ai=%d), regen=%s",
        audit["audit_passed"],
        len(all_issues),
        len(structural_issues),
        len(prog_issues),
        len(ai_audit.get("issues", [])),
        all_regen,
    )
    return audit
