"""
Exhibit Builder: turns exhibit plans from Stage 2 into fully-populated Exhibit objects.

AI plans exhibits (type, title, caption, which section it anchors).
Pandas computes exhibit data from the MetricsBundle.
AI never emits chart values.
"""
from __future__ import annotations

import logging
from typing import Any

from analytics.metrics import MetricsBundle, MONTH_ORDER
from models import Exhibit

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Available exhibit registry — the architect prompt lists these exact names
# ---------------------------------------------------------------------------

AVAILABLE_EXHIBITS = {
    "VIP Inbox Attacks by Month": "trend_line",
    "Reporting Rate Trend": "trend_line",
    "Credential Submission Trend": "trend_line",
    "ATO Risk Score Trend": "trend_line",
    "Threats by Month": "trend_line",
    "Remediation Benchmark": "benchmark_bars",
    "MTTR Benchmark": "benchmark_bars",
    "Reporting Rate by Department": "department_bars",
    "Success Criteria Scorecard": "criteria_scorecard",
    "Posture Pass Rate by Tenant": "department_bars",
}


def _ordered_months(data: dict[str, Any]) -> list[dict]:
    """Return {month, value} pairs in calendar order for months present in data."""
    return [
        {"month": m, "value": data[m]}
        for m in MONTH_ORDER
        if m in data
    ]


def _build_trend_line(plan: dict, metrics: MetricsBundle) -> dict:
    title = plan.get("title", "")

    if "VIP" in title:
        months = _ordered_months(metrics.vip_inbox_attacks_by_month)
        series = [{"name": "VIP Attacks", "data": months, "color": "coral"}]
        y_label = "Attacks"
        source = "threat_log.csv"
        evidence_ids = ["vip_inbox_attacks_by_month"]

    elif "Reporting Rate" in title and "Department" not in title:
        raw = {k: round(v * 100, 1) for k, v in metrics.reporting_rate_by_month.items()}
        months = _ordered_months(raw)
        cred = {k: round(v * 100, 1) for k, v in metrics.credential_submission_rate_by_month.items()}
        cred_months = _ordered_months(cred)
        series = [
            {"name": "User Reporting Rate", "data": months, "color": "coral"},
            {"name": "Credential Submission Rate", "data": cred_months, "color": "muted"},
        ]
        y_label = "Rate (%)"
        source = "user_reporting.csv"
        evidence_ids = ["reporting_rate_by_month", "credential_submission_rate_by_month"]

    elif "Credential" in title:
        raw = {k: round(v * 100, 1) for k, v in metrics.credential_submission_rate_by_month.items()}
        months = _ordered_months(raw)
        series = [{"name": "Credential Submission Rate", "data": months, "color": "coral"}]
        y_label = "Rate (%)"
        source = "user_reporting.csv"
        evidence_ids = ["credential_submission_rate_by_month"]

    elif "ATO" in title or "Risk" in title:
        months = _ordered_months(metrics.ato_mean_risk_by_month)
        series = [{"name": "Mean ATO Risk Score", "data": months, "color": "coral"}]
        y_label = "Risk Score"
        source = "ato_events.csv"
        evidence_ids = ["ato_mean_risk_by_month"]

    else:
        # "Threats by Month" fallback
        months = _ordered_months(metrics.threats_by_month)
        series = [{"name": "Threats Detected", "data": months, "color": "coral"}]
        y_label = "Threats"
        source = "threat_log.csv"
        evidence_ids = ["threats_by_month"]

    return {
        "type": "trend_line",
        "data": {"series": series, "y_label": y_label, "x_label": "Month"},
        "source_note": f"Source: {source} ({metrics.period})",
        "evidence_ids": evidence_ids,
    }


def _build_benchmark_bars(plan: dict, metrics: MetricsBundle) -> dict:
    title = plan.get("title", "")
    bs = metrics.benchmarks_summary

    if "MTTR" in title:
        actual = round(metrics.median_mttr_minutes, 2)
        bkey = "median_mttr_minutes"
        b = bs.get(bkey, {})
        bars = [
            {
                "name": "Meridian Median MTTR",
                "value": actual,
                "unit": "min",
                "p50": b.get("p50"),
                "p75": b.get("p75"),
                "p99": b.get("p99"),
                "lower_is_better": True,
            }
        ]
        evidence_ids = ["median_mttr_minutes"]
        source = "remediation_log.csv"
    else:
        # Auto-remediation rate
        actual = round(metrics.auto_remediation_rate, 2)
        bkey = "auto_remediation_rate"
        b = bs.get(bkey, {})
        bars = [
            {
                "name": "Meridian Auto-Remediation",
                "value": actual,
                "unit": "%",
                "p50": b.get("p50"),
                "p75": b.get("p75"),
                "p99": b.get("p99"),
                "lower_is_better": False,
            }
        ]
        evidence_ids = ["auto_remediation_rate"]
        source = "remediation_log.csv"

    return {
        "type": "benchmark_bars",
        "data": {"bars": bars},
        "source_note": f"Source: {source}, industry_benchmarks.csv ({metrics.period})",
        "evidence_ids": evidence_ids,
    }


def _build_department_bars(plan: dict, metrics: MetricsBundle) -> dict:
    title = plan.get("title", "")

    if "Posture" in title or "Tenant" in title:
        bars = [
            {"name": k, "value": round(v, 1), "unit": "%"}
            for k, v in sorted(
                metrics.posture_pass_rate_by_tenant.items(),
                key=lambda x: x[1],
            )
        ]
        threshold = None
        evidence_ids = ["posture_pass_rate_by_tenant"]
        source = "posture_checks.csv"
    else:
        bars = [
            {"name": k, "value": round(v * 100, 1), "unit": "%"}
            for k, v in sorted(
                metrics.reporting_rate_by_department.items(),
                key=lambda x: x[1],
            )
        ]
        threshold = 40.0
        evidence_ids = ["reporting_rate_by_department"]
        source = "user_reporting.csv"

    return {
        "type": "department_bars",
        "data": {"bars": bars, "threshold": threshold},
        "source_note": f"Source: {source} ({metrics.period})",
        "evidence_ids": evidence_ids,
    }


def _build_criteria_scorecard(plan: dict, metrics: MetricsBundle) -> dict:
    rows = []
    for criterion_id, status in metrics.success_criteria_status.items():
        rows.append({
            "criterion": criterion_id.replace("_", " ").title(),
            "target": status.get("target"),
            "actual": status.get("actual"),
            "met": status.get("met", False),
        })

    return {
        "type": "criteria_scorecard",
        "data": {"rows": rows},
        "source_note": f"Source: multiple datasets ({metrics.period})",
        "evidence_ids": ["success_criteria_status"],
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_exhibits(
    exhibits_plan: list[dict],
    metrics: MetricsBundle,
) -> list[Exhibit]:
    """
    Build fully-populated Exhibit objects from architect-planned exhibit specs.

    AI provides: title, caption, exhibit_type, anchors_section_id.
    Pandas provides: data, source_note, evidence_refs.
    """
    results: list[Exhibit] = []
    for i, plan in enumerate(exhibits_plan):
        title = plan.get("title", f"Exhibit {i + 1}")
        exhibit_type = plan.get("type") or AVAILABLE_EXHIBITS.get(title)
        if not exhibit_type:
            logger.warning("Unknown exhibit title %r; skipping.", title)
            continue

        try:
            if exhibit_type == "trend_line":
                built = _build_trend_line(plan, metrics)
            elif exhibit_type == "benchmark_bars":
                built = _build_benchmark_bars(plan, metrics)
            elif exhibit_type == "department_bars":
                built = _build_department_bars(plan, metrics)
            elif exhibit_type == "criteria_scorecard":
                built = _build_criteria_scorecard(plan, metrics)
            else:
                logger.warning("Unimplemented exhibit type %r; skipping.", exhibit_type)
                continue
        except Exception as exc:
            logger.error("Failed to build exhibit %r: %s", title, exc)
            continue

        exhibit_id = plan.get("exhibit_id") or f"ex_{i + 1:02d}"
        caption = plan.get("caption") or ""
        evidence_refs = built.pop("evidence_ids", [])

        results.append(
            Exhibit(
                exhibit_id=exhibit_id,
                number=i + 1,
                type=built["type"],
                title=title,
                caption=caption,
                source_note=built["source_note"],
                data=built["data"],
                evidence_refs=evidence_refs,
            )
        )

    logger.info("Built %d exhibits from %d planned.", len(results), len(exhibits_plan))
    return results
