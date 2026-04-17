"""
Stage 1: Data Interpreter
Model: Claude Sonnet 4.6
Input: MetricsBundle + EvidenceIndex + Anomalies + TrendBundle + TenantDriftBundle
Output: list of 15-25 observation dicts
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict

from anthropic import AsyncAnthropic

from ai.client import SONNET_MODEL
from ai.prompt_utils import load_prompt, fill_template, extract_json
from analytics.anomalies import Anomaly
from analytics.evidence_index import EvidenceIndex
from analytics.metrics import MetricsBundle
from analytics.tenant_drift import TenantDriftBundle
from analytics.trends import TrendBundle

logger = logging.getLogger(__name__)


def _serialize_metrics(bundle: MetricsBundle) -> dict:
    """Create an AI-friendly summary of MetricsBundle. No source rows."""
    return {
        "company_name": bundle.company_name,
        "period": bundle.period,
        "tenants": bundle.tenants,
        "threat": {
            "total_threats": bundle.total_threats,
            "threats_by_month": bundle.threats_by_month,
            "vip_inbox_attacks": bundle.vip_inbox_attacks,
            "vip_inbox_attacks_by_month": bundle.vip_inbox_attacks_by_month,
            "attack_type_breakdown": bundle.attack_type_breakdown,
            "threats_by_tenant": bundle.threats_by_tenant,
        },
        "remediation": {
            "auto_remediation_rate_pct": bundle.auto_remediation_rate,
            "manual_remediation_count": bundle.manual_remediation_count,
            "median_mttr_minutes": bundle.median_mttr_minutes,
            "mttr_p90_minutes": bundle.mttr_p90_minutes,
            "mttr_by_month": bundle.mttr_by_month,
        },
        "user_reporting": {
            "reporting_rate_by_month": bundle.reporting_rate_by_month,
            "reporting_rate_overall": bundle.reporting_rate_overall,
            "credential_submission_rate_by_month": bundle.credential_submission_rate_by_month,
            "credential_submission_rate_overall": bundle.credential_submission_rate_overall,
            "reporting_rate_by_department": bundle.reporting_rate_by_department,
            "low_reporting_departments": bundle.low_reporting_departments,
        },
        "posture": {
            "posture_pass_rate_by_tenant": bundle.posture_pass_rate_by_tenant,
            "posture_pass_rate_overall": bundle.posture_pass_rate_overall,
            "critical_unresolved_count": len(bundle.critical_unresolved_checks),
            "critical_unresolved_names": sorted({
                c.get("check_name", "") for c in bundle.critical_unresolved_checks
            }),
            "mfa_failure_count": len(bundle.mfa_enforcement_failures),
            "mfa_failure_check_dates": sorted({
                f.get("check_date", "") for f in bundle.mfa_enforcement_failures
            })[:6],
            "mfa_max_affected_users": max(
                [f.get("affected_users") or 0 for f in bundle.mfa_enforcement_failures],
                default=0,
            ),
        },
        "ato": {
            "ato_count_by_month": bundle.ato_count_by_month,
            "ato_mean_risk_by_month": bundle.ato_mean_risk_by_month,
            "ato_soc_notified_rate_pct": bundle.ato_soc_notified_rate,
            "ato_mean_ttd_minutes": bundle.ato_mean_ttd_minutes,
            "ato_mean_ttr_minutes": bundle.ato_mean_ttr_minutes,
        },
        "success_criteria": bundle.success_criteria_status,
        "benchmarks": bundle.benchmarks_summary,
    }


def _serialize_anomalies(anomalies: list[Anomaly]) -> list[dict]:
    return [
        {
            "anomaly_id": a.anomaly_id,
            "rule": a.rule,
            "severity": a.severity,
            "title": a.title,
            "detail": a.detail,
            "metric_ids": a.metric_ids,
            "tenant_id": a.tenant_id,
        }
        for a in anomalies
    ]


def _serialize_tenant_drift(drift: TenantDriftBundle) -> dict:
    return {
        "has_significant_drift": drift.has_significant_drift,
        "summary": drift.summary,
        "comparisons": [
            {
                "metric": c.metric,
                "tenant_values": c.tenant_values,
                "delta_pp": c.delta_pp,
                "drifting": c.drifting,
                "worse_tenant": c.worse_tenant,
            }
            for c in drift.comparisons
        ],
    }


def _evidence_summary(evidence: EvidenceIndex) -> dict:
    return {
        eid: {"metric_id": rec.metric_id, "metric_name": rec.metric_name}
        for eid, rec in evidence.all().items()
    }


async def run(
    metrics: MetricsBundle,
    evidence: EvidenceIndex,
    anomalies: list[Anomaly],
    trends: TrendBundle,
    tenant_drift: TenantDriftBundle,
    client: AsyncAnthropic,
) -> list[dict]:
    """
    Run Stage 1: Data Interpreter.
    Returns a list of observation dicts.
    """
    system_prompt, user_template = load_prompt("interpreter.md")

    user_message = fill_template(user_template, {
        "company_name": metrics.company_name,
        "period": metrics.period,
        "metrics_bundle_json": _serialize_metrics(metrics),
        "benchmarks_summary_json": metrics.benchmarks_summary,
        "anomalies_json": _serialize_anomalies(anomalies),
        "tenant_drift_json": _serialize_tenant_drift(tenant_drift),
        "evidence_index_summary": _evidence_summary(evidence),
    })

    response = await client.messages.create(
        model=SONNET_MODEL,
        max_tokens=8000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )

    if not response.content or not response.content[0].text.strip():
        raise ValueError(f"Claude returned empty response (stop_reason={response.stop_reason})")
    raw = response.content[0].text
    observations = extract_json(raw)

    if not isinstance(observations, list):
        logger.warning("Stage 1 returned non-list; wrapping.")
        observations = [observations] if isinstance(observations, dict) else []

    logger.info("Stage 1 produced %d observations.", len(observations))
    return observations
