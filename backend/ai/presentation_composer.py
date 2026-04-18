"""
Stage P1: Presentation Composer
Model: Claude Opus 4.7
Input: full brief dict + audience profile + MetricsBundle (for deterministic exhibit registry)
Output: slide_plan dict with 5 entries + embedded exhibit registry
"""

from __future__ import annotations

import logging
from typing import Optional

from anthropic import AsyncAnthropic

from ai.client import SONNET_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json
from analytics.metrics import MetricsBundle

logger = logging.getLogger(__name__)


def _build_exhibits_registry(metrics: MetricsBundle) -> list[dict]:
    """
    Construct a deterministic exhibit list from MetricsBundle.
    AI never generates exhibit data — it only selects exhibit IDs.
    """
    exhibits: list[dict] = []

    # VIP inbox attacks monthly trend
    if metrics.vip_inbox_attacks_by_month:
        months = sorted(metrics.vip_inbox_attacks_by_month.keys())
        exhibits.append({
            "exhibit_id": "ex_vip_trend",
            "type": "trend_line",
            "title": "VIP Inbox Attacks by Month",
            "description": "Monthly count of threats reaching VIP inboxes. Shows trajectory toward the board success criterion of fewer than 1 per month.",
            "data": {
                "x_labels": [m[:3] for m in months],
                "series": [{"label": "VIP attacks", "values": [metrics.vip_inbox_attacks_by_month[m] for m in months]}],
                "target": None,
            },
            "best_for": "slide_3_what_happened",
        })

    # User reporting rate monthly trend
    if metrics.reporting_rate_by_month:
        months = sorted(metrics.reporting_rate_by_month.keys())
        cred_vals = metrics.credential_submission_rate_by_month or {}
        series = [{"label": "Reporting rate %", "values": [round(metrics.reporting_rate_by_month[m] * 100, 1) for m in months]}]
        if cred_vals:
            series.append({"label": "Credential submission %", "values": [round(cred_vals.get(m, 0) * 100, 1) for m in months]})
        exhibits.append({
            "exhibit_id": "ex_reporting_trend",
            "type": "trend_line",
            "title": "User Reporting Rate by Month (%)",
            "description": "Monthly user reporting rate with credential submission rate overlay. Shows bifurcated human-layer story.",
            "data": {
                "x_labels": [m[:3] for m in months],
                "series": series,
                "target": 40.0,
                "target_label": "Success criterion (40%)",
            },
            "best_for": "slide_3_what_happened",
        })

    # Benchmark comparison bars
    if metrics.benchmarks_summary:
        bm = metrics.benchmarks_summary
        bm_metrics: list[dict] = []
        if "auto_remediation_rate" in bm:
            b = bm["auto_remediation_rate"]
            bm_metrics.append({
                "label": "Auto-remediation rate",
                "value": round(metrics.auto_remediation_rate * 100 if metrics.auto_remediation_rate <= 1 else metrics.auto_remediation_rate, 1),
                "p25": b.get("p25"), "p50": b.get("p50"), "p75": b.get("p75"),
                "unit": "%", "higher_is_better": True,
            })
        if "median_mttr_minutes" in bm:
            b = bm["median_mttr_minutes"]
            bm_metrics.append({
                "label": "Median MTTR",
                "value": round(metrics.median_mttr_minutes, 1),
                "p25": b.get("p25"), "p50": b.get("p50"), "p75": b.get("p75"),
                "unit": "min", "higher_is_better": False,
            })
        if bm_metrics:
            exhibits.append({
                "exhibit_id": "ex_benchmark",
                "type": "benchmark_bars",
                "title": "Meridian vs. Healthcare Peer Benchmarks",
                "description": "How key KPIs rank against industry peers at p25/p50/p75. Below-p50 bars indicate gaps.",
                "data": {"metrics": bm_metrics},
                "best_for": "slide_4_what_needs_attention",
            })

    # Department reporting breakdown
    if metrics.reporting_rate_by_department:
        depts = sorted(metrics.reporting_rate_by_department.items(), key=lambda x: x[1])
        exhibits.append({
            "exhibit_id": "ex_department",
            "type": "department_bars",
            "title": "Reporting Rate by Department",
            "description": "Department-level reporting rates sorted ascending. Bars below 40% threshold indicate training targets.",
            "data": {
                "categories": [{"label": k, "value": round(v * 100 if v <= 1 else v, 1)} for k, v in depts],
                "threshold": 40.0,
                "threshold_label": "Success criterion (40%)",
            },
            "best_for": "slide_4_what_needs_attention",
        })

    # ATO risk score trend
    if metrics.ato_mean_risk_by_month:
        months = sorted(metrics.ato_mean_risk_by_month.keys())
        exhibits.append({
            "exhibit_id": "ex_ato_trend",
            "type": "trend_line",
            "title": "Mean ATO Risk Score by Month",
            "description": "Rising ATO risk score signals growing account takeover exposure and increasing SOC load.",
            "data": {
                "x_labels": [m[:3] for m in months],
                "series": [{"label": "Mean ATO risk score", "values": [round(metrics.ato_mean_risk_by_month[m], 1) for m in months]}],
                "target": None,
            },
            "best_for": "slide_4_what_needs_attention",
        })

    # Success criteria scorecard
    if metrics.success_criteria_status:
        rows = [
            {
                "criterion": k.replace("_", " ").title(),
                "target": str(v.get("target", "")),
                "actual": str(v.get("actual", "")),
                "met": bool(v.get("met", False)),
            }
            for k, v in metrics.success_criteria_status.items()
        ]
        exhibits.append({
            "exhibit_id": "ex_criteria",
            "type": "criteria_scorecard",
            "title": "Success Criteria Scorecard",
            "description": "Pass/fail status against board-level success criteria for the quarter.",
            "data": {"rows": rows},
            "best_for": "either_slide_3_or_4",
        })

    return exhibits


async def run(
    brief: dict,
    user_context: Optional[str],
    audience_profile: dict,
    metrics: MetricsBundle,
    client: AsyncAnthropic,
) -> dict:
    """
    Stage P1: Presentation Composer.
    Returns a slide_plan dict with 5 entries and an embedded _exhibits_registry.
    """
    system_prompt, user_template = load_prompt("presentation_composer.md")
    exhibits = _build_exhibits_registry(metrics)

    # Trim brief: omit fields that add tokens without helping structure decisions
    brief_for_prompt = {
        k: v for k, v in brief.items()
        if k not in ("outline", "sections", "observations")
    }

    user_message = fill_template(user_template, {
        "brief_json": brief_for_prompt,
        "audience": brief.get("audience", "ciso"),
        "audience_profile_json": audience_profile,
        "available_exhibits_json": exhibits,
        "observations_json": brief.get("observations", []),
        "recommendations_json": brief.get("recommendations", []),
        "user_context": user_context or "No additional context provided.",
    })

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=4000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = response.content[0].text
    plan = extract_json(raw)

    if not isinstance(plan, dict):
        logger.warning("Presentation Composer returned non-dict; building minimal fallback plan.")
        plan = _fallback_plan(brief, exhibits)

    plan.setdefault("slide_plan", [])
    plan.setdefault("narrative_through_line", "")
    plan.setdefault("user_context_applied", "No additional context provided.")

    # Embed exhibit registry so Slide Writer can inject data deterministically
    plan["_exhibits_registry"] = {e["exhibit_id"]: e for e in exhibits}

    logger.info("Stage P1 produced plan with %d slide entries.", len(plan["slide_plan"]))
    return plan


def _fallback_plan(brief: dict, exhibits: list[dict]) -> dict:
    """Minimal slide plan used when Claude returns unusable output."""
    slide3_exhibit = next((e for e in exhibits if "slide_3" in e.get("best_for", "")), exhibits[0] if exhibits else None)
    slide4_exhibit = next((e for e in exhibits if "slide_4" in e.get("best_for", "")), None)

    return {
        "slide_plan": [
            {"slide_number": 1, "slide_type": "title", "intent": "Establish document and customer", "anchor_evidence_refs": []},
            {"slide_number": 2, "slide_type": "thesis", "intent": "Deliver governing thesis", "anchor_evidence_refs": []},
            {
                "slide_number": 3, "slide_type": "what_happened",
                "intent": "Frame protection performance",
                "chart_choice": {"exhibit_id": slide3_exhibit["exhibit_id"], "reason": "Primary performance story"} if slide3_exhibit else None,
                "callout_seeds": [],
            },
            {
                "slide_number": 4, "slide_type": "what_needs_attention",
                "intent": "Frame gaps and exposures",
                "chart_choice": {"exhibit_id": slide4_exhibit["exhibit_id"], "reason": "Gap story"} if slide4_exhibit else None,
                "callout_seeds": [],
            },
            {"slide_number": 5, "slide_type": "the_ask", "intent": "Convert recommendations into ask",
             "recommendation_selection": [], "recommendation_reason": "Top recommendations"},
        ],
        "narrative_through_line": "Security performance held while gaps require Q2 investment.",
        "user_context_applied": "Fallback plan — Composer output was unparseable.",
    }
