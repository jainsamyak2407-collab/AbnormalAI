"""
Core analytics engine. Takes parsed DataFrames + BenchmarkLookup + EvidenceIndex.
Returns a MetricsBundle dataclass with all computed metrics.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from analytics.benchmarks import BenchmarkLookup
from analytics.evidence_index import EvidenceIndex

# Month ordering for consistent display
MONTH_ORDER = ["January", "February", "March", "April", "May", "June",
               "July", "August", "September", "October", "November", "December"]


# ---------------------------------------------------------------------------
# MetricsBundle dataclass
# ---------------------------------------------------------------------------

@dataclass
class MetricsBundle:
    # Meta
    company_name: str
    period: str
    tenants: list[dict]

    # Threat log
    total_threats: int
    threats_by_month: dict[str, int]
    vip_inbox_attacks: int
    vip_inbox_attacks_by_month: dict[str, int]
    attack_type_breakdown: dict[str, int]
    threats_by_tenant: dict[str, int]

    # Remediation log
    auto_remediation_rate: float          # 0-100 (percent)
    manual_remediation_count: int
    median_mttr_minutes: float
    mttr_p90_minutes: float
    mttr_by_month: dict[str, float]

    # User reporting
    reporting_rate_by_month: dict[str, float]    # 0-1 ratio
    reporting_rate_overall: float                 # 0-1 ratio
    credential_submission_rate_by_month: dict[str, float]
    credential_submission_rate_overall: float
    reporting_rate_by_department: dict[str, float]
    low_reporting_departments: list[str]

    # Posture checks
    posture_pass_rate_by_tenant: dict[str, float]
    posture_pass_rate_overall: float
    critical_unresolved_checks: list[dict]
    mfa_enforcement_failures: list[dict]

    # ATO events
    ato_count_by_month: dict[str, int]
    ato_mean_risk_by_month: dict[str, float]
    ato_soc_notified_rate: float    # 0-100 (percent)
    ato_mean_ttd_minutes: float
    ato_mean_ttr_minutes: float

    # Cross-metric
    success_criteria_status: dict[str, dict]
    benchmarks_summary: dict[str, dict]

    # Evidence IDs (populated as side effect of compute_all)
    evidence_ids: dict[str, str] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _safe_rows(df: pd.DataFrame, max_rows: int = 50) -> list[dict]:
    """Convert DataFrame to list of dicts, capped, with NA-safe serialisation."""
    subset = df.head(max_rows)
    records = []
    for rec in subset.to_dict(orient="records"):
        safe = {}
        for k, v in rec.items():
            if pd.isna(v) if not isinstance(v, (list, dict)) else False:
                safe[k] = None
            elif isinstance(v, (np.integer,)):
                safe[k] = int(v)
            elif isinstance(v, (np.floating,)):
                safe[k] = float(v)
            elif isinstance(v, pd.Timestamp):
                safe[k] = str(v)
            else:
                safe[k] = v
        records.append(safe)
    return records


def _month_from_ts(ts_series: pd.Series) -> pd.Series:
    """Extract month name from a datetime series."""
    return ts_series.dt.month_name()


def _weighted_rate(group: pd.DataFrame, num_col: str, denom_col: str) -> float:
    """Compute weighted average rate: sum(num) / sum(denom)."""
    total_num = group[num_col].sum()
    total_denom = group[denom_col].sum()
    if total_denom == 0:
        return 0.0
    return float(total_num / total_denom)


# ---------------------------------------------------------------------------
# Individual metric computers
# ---------------------------------------------------------------------------

def _compute_threat_metrics(
    df: pd.DataFrame,
    evidence: EvidenceIndex,
) -> dict[str, Any]:
    """Compute all threat_log-derived metrics."""
    out: dict[str, Any] = {}

    # total threats
    total = len(df)
    out["total_threats"] = total
    evidence.register(
        metric_id="total_threats",
        metric_name="Total Threats Detected",
        value=total,
        calculation="count of all rows in threat_log",
        source_rows=_safe_rows(df),
    )

    # Add month column
    if "timestamp" in df.columns and pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
        df = df.copy()
        df["_month"] = _month_from_ts(df["timestamp"])
    else:
        df = df.copy()
        df["_month"] = "Unknown"

    # threats by month
    tby_month = (
        df.groupby("_month").size()
        .reindex(MONTH_ORDER, fill_value=0)
        .dropna()
        .astype(int)
        .to_dict()
    )
    # Only keep months that appear in data
    tby_month = {k: v for k, v in tby_month.items() if v > 0}
    out["threats_by_month"] = tby_month
    evidence.register(
        metric_id="threats_by_month",
        metric_name="Threats Detected by Month",
        value=tby_month,
        calculation="count of threat_log rows grouped by calendar month (extracted from timestamp)",
        source_rows=_safe_rows(df[["event_id", "_month"]]) if "event_id" in df.columns else [],
    )

    # VIP attacks
    vip_mask = df["is_vip"].astype(bool) if "is_vip" in df.columns else pd.Series(False, index=df.index)
    vip_df = df[vip_mask]
    vip_count = len(vip_df)
    out["vip_inbox_attacks"] = vip_count
    evidence.register(
        metric_id="vip_inbox_attacks",
        metric_name="VIP Inbox Attacks",
        value=vip_count,
        calculation="count of threat_log rows where is_vip=True (any disposition — threat reached or targeted VIP)",
        source_rows=_safe_rows(vip_df),
    )

    # VIP attacks by month
    vip_by_month_series = (
        vip_df.groupby("_month").size()
        .reindex(MONTH_ORDER, fill_value=0)
        .astype(int)
    )
    vip_by_month = {k: v for k, v in vip_by_month_series.to_dict().items() if k in tby_month or v > 0}
    out["vip_inbox_attacks_by_month"] = vip_by_month
    evidence.register(
        metric_id="vip_inbox_attacks_by_month",
        metric_name="VIP Inbox Attacks by Month",
        value=vip_by_month,
        calculation="count of threat_log rows where is_vip=True, grouped by calendar month",
        source_rows=_safe_rows(vip_df),
    )

    # Attack type breakdown
    if "attack_type" in df.columns:
        atk_breakdown = df["attack_type"].value_counts().to_dict()
        atk_breakdown = {str(k): int(v) for k, v in atk_breakdown.items()}
    else:
        atk_breakdown = {}
    out["attack_type_breakdown"] = atk_breakdown
    evidence.register(
        metric_id="attack_type_breakdown",
        metric_name="Attack Type Breakdown",
        value=atk_breakdown,
        calculation="count of threat_log rows grouped by attack_type",
        source_rows=_safe_rows(df[["event_id", "attack_type"]] if "attack_type" in df.columns else df),
    )

    # Threats by tenant
    if "tenant_id" in df.columns:
        tby_tenant = df["tenant_id"].value_counts().to_dict()
        tby_tenant = {str(k): int(v) for k, v in tby_tenant.items()}
    else:
        tby_tenant = {}
    out["threats_by_tenant"] = tby_tenant
    evidence.register(
        metric_id="threats_by_tenant",
        metric_name="Threats by Tenant",
        value=tby_tenant,
        calculation="count of threat_log rows grouped by tenant_id",
        source_rows=_safe_rows(df[["event_id", "tenant_id"]] if "tenant_id" in df.columns else df),
    )

    return out


def _compute_remediation_metrics(
    df: pd.DataFrame,
    threat_df: pd.DataFrame | None,
    evidence: EvidenceIndex,
) -> dict[str, Any]:
    """Compute all remediation_log-derived metrics."""
    out: dict[str, Any] = {}

    total = len(df)

    # Auto-remediation rate
    if "method" in df.columns and "outcome" in df.columns:
        auto_success_mask = (df["method"].str.strip() == "auto") & (df["outcome"].str.strip() == "success")
        auto_success_count = int(auto_success_mask.sum())
        auto_rate = (auto_success_count / total * 100) if total > 0 else 0.0
    else:
        auto_success_count = 0
        auto_rate = 0.0

    out["auto_remediation_rate"] = round(auto_rate, 2)
    evidence.register(
        metric_id="auto_remediation_rate",
        metric_name="Auto-Remediation Rate",
        value=out["auto_remediation_rate"],
        calculation=f"count(method='auto' AND outcome='success') / total * 100 = {auto_success_count}/{total} * 100",
        source_rows=_safe_rows(df),
    )

    # Manual remediation count
    if "method" in df.columns:
        manual_count = int((df["method"].str.strip() == "manual").sum())
    else:
        manual_count = 0
    out["manual_remediation_count"] = manual_count
    evidence.register(
        metric_id="manual_remediation_count",
        metric_name="Manual Remediation Count",
        value=manual_count,
        calculation="count of remediation_log rows where method='manual'",
        source_rows=_safe_rows(df[df["method"].str.strip() == "manual"] if "method" in df.columns else df),
    )

    # Median MTTR
    if "mttr_minutes" in df.columns:
        mttr_series = pd.to_numeric(df["mttr_minutes"], errors="coerce").dropna()
        median_mttr = float(mttr_series.median()) if len(mttr_series) > 0 else 0.0
        p90_mttr = float(mttr_series.quantile(0.90)) if len(mttr_series) > 0 else 0.0
    else:
        median_mttr = 0.0
        p90_mttr = 0.0

    out["median_mttr_minutes"] = round(median_mttr, 2)
    out["mttr_p90_minutes"] = round(p90_mttr, 2)
    evidence.register(
        metric_id="median_mttr_minutes",
        metric_name="Median MTTR (minutes)",
        value=out["median_mttr_minutes"],
        calculation="median of mttr_minutes across all remediation_log rows",
        source_rows=_safe_rows(df[["remediation_id", "method", "mttr_minutes"]] if "remediation_id" in df.columns else df),
    )
    evidence.register(
        metric_id="mttr_p90_minutes",
        metric_name="MTTR 90th Percentile (minutes)",
        value=out["mttr_p90_minutes"],
        calculation="90th percentile of mttr_minutes across all remediation_log rows",
        source_rows=_safe_rows(df[["remediation_id", "method", "mttr_minutes"]] if "remediation_id" in df.columns else df),
    )

    # MTTR by month — join with threat timestamps if available
    mttr_by_month: dict[str, float] = {}
    if threat_df is not None and "started_at" in df.columns:
        df2 = df.copy()
        if pd.api.types.is_datetime64_any_dtype(df2["started_at"]):
            df2["_month"] = _month_from_ts(df2["started_at"])
            for month, grp in df2.groupby("_month"):
                if "mttr_minutes" in grp.columns:
                    vals = pd.to_numeric(grp["mttr_minutes"], errors="coerce").dropna()
                    if len(vals) > 0:
                        mttr_by_month[str(month)] = round(float(vals.median()), 2)
    out["mttr_by_month"] = mttr_by_month
    evidence.register(
        metric_id="mttr_by_month",
        metric_name="Median MTTR by Month",
        value=mttr_by_month,
        calculation="median of mttr_minutes per calendar month (from started_at)",
        source_rows=_safe_rows(df[["remediation_id", "started_at", "mttr_minutes"]] if "started_at" in df.columns else df),
    )

    return out


def _compute_user_reporting_metrics(
    df: pd.DataFrame,
    evidence: EvidenceIndex,
    low_threshold: float = 0.30,
) -> dict[str, Any]:
    """Compute all user_reporting-derived metrics."""
    out: dict[str, Any] = {}

    # Reporting rate by month (weighted: sum reported_count / sum total_received_suspicious)
    reporting_by_month: dict[str, float] = {}
    cred_sub_by_month: dict[str, float] = {}

    if "month" in df.columns:
        for month, grp in df.groupby("month"):
            reporting_by_month[str(month)] = round(
                _weighted_rate(grp, "reported_count", "total_received_suspicious"), 4
            )
            cred_sub_by_month[str(month)] = round(
                _weighted_rate(grp, "credential_submitted", "total_received_suspicious"), 4
            )

    out["reporting_rate_by_month"] = reporting_by_month
    evidence.register(
        metric_id="reporting_rate_by_month",
        metric_name="User Reporting Rate by Month",
        value=reporting_by_month,
        calculation="sum(reported_count) / sum(total_received_suspicious) per month, aggregated across all tenants and departments",
        source_rows=_safe_rows(df),
    )

    out["credential_submission_rate_by_month"] = cred_sub_by_month
    evidence.register(
        metric_id="credential_submission_rate_by_month",
        metric_name="Credential Submission Rate by Month",
        value=cred_sub_by_month,
        calculation="sum(credential_submitted) / sum(total_received_suspicious) per month, aggregated across all tenants and departments",
        source_rows=_safe_rows(df),
    )

    # Overall rates
    overall_reporting = round(
        _weighted_rate(df, "reported_count", "total_received_suspicious"), 4
    )
    overall_cred = round(
        _weighted_rate(df, "credential_submitted", "total_received_suspicious"), 4
    )
    out["reporting_rate_overall"] = overall_reporting
    out["credential_submission_rate_overall"] = overall_cred
    evidence.register(
        metric_id="reporting_rate_overall",
        metric_name="Overall User Reporting Rate",
        value=overall_reporting,
        calculation="sum(reported_count) / sum(total_received_suspicious) across all months, tenants, departments",
        source_rows=_safe_rows(df),
    )
    evidence.register(
        metric_id="credential_submission_rate_overall",
        metric_name="Overall Credential Submission Rate",
        value=overall_cred,
        calculation="sum(credential_submitted) / sum(total_received_suspicious) across all months, tenants, departments",
        source_rows=_safe_rows(df),
    )

    # Reporting rate by department (weighted across months + tenants)
    dept_rates: dict[str, float] = {}
    if "department" in df.columns:
        for dept, grp in df.groupby("department"):
            dept_rates[str(dept)] = round(
                _weighted_rate(grp, "reported_count", "total_received_suspicious"), 4
            )

    out["reporting_rate_by_department"] = dept_rates
    evidence.register(
        metric_id="reporting_rate_by_department",
        metric_name="User Reporting Rate by Department",
        value=dept_rates,
        calculation="sum(reported_count) / sum(total_received_suspicious) per department, aggregated across all months and tenants",
        source_rows=_safe_rows(df),
    )

    # Low-reporting departments
    low_depts = [d for d, r in dept_rates.items() if r < low_threshold]
    out["low_reporting_departments"] = sorted(low_depts)
    evidence.register(
        metric_id="low_reporting_departments",
        metric_name="Low-Reporting Departments (below 30%)",
        value=low_depts,
        calculation=f"departments where reporting_rate < {low_threshold} (weighted across all months/tenants)",
        source_rows=_safe_rows(df[df["department"].isin(low_depts)] if "department" in df.columns else df),
    )

    return out


def _compute_posture_metrics(
    df: pd.DataFrame,
    evidence: EvidenceIndex,
) -> dict[str, Any]:
    """Compute all posture_checks-derived metrics."""
    out: dict[str, Any] = {}

    # Normalise status column
    if "status" in df.columns:
        df = df.copy()
        df["_status_lower"] = df["status"].str.strip().str.lower()
    else:
        df = df.copy()
        df["_status_lower"] = ""

    # Pass rate by tenant
    pass_by_tenant: dict[str, float] = {}
    if "tenant_id" in df.columns:
        for tid, grp in df.groupby("tenant_id"):
            total = len(grp)
            passed = int((grp["_status_lower"] == "pass").sum())
            pass_by_tenant[str(tid)] = round(passed / total, 4) if total > 0 else 0.0

    out["posture_pass_rate_by_tenant"] = pass_by_tenant
    evidence.register(
        metric_id="posture_pass_rate_by_tenant",
        metric_name="Posture Pass Rate by Tenant",
        value=pass_by_tenant,
        calculation="count(status='pass') / total checks per tenant_id",
        source_rows=_safe_rows(df[["check_id", "tenant_id", "status"]] if "check_id" in df.columns else df),
    )

    # Overall pass rate
    total_all = len(df)
    passed_all = int((df["_status_lower"] == "pass").sum())
    pass_rate_overall = round(passed_all / total_all, 4) if total_all > 0 else 0.0
    out["posture_pass_rate_overall"] = pass_rate_overall
    evidence.register(
        metric_id="posture_pass_rate_overall",
        metric_name="Overall Posture Pass Rate",
        value=pass_rate_overall,
        calculation=f"count(status='pass') / total = {passed_all}/{total_all}",
        source_rows=_safe_rows(df[["check_id", "status"]] if "check_id" in df.columns else df),
    )

    # Critical unresolved checks
    severity_col = "severity"
    resolved_col = "resolved"
    critical_unresolved: list[dict] = []
    if severity_col in df.columns and resolved_col in df.columns:
        crit_mask = df[severity_col].str.strip().str.lower() == "critical"
        # resolved may be bool or string
        def _is_resolved(val: Any) -> bool:
            if isinstance(val, bool):
                return val
            if pd.isna(val):
                return False
            s = str(val).strip().lower()
            return s in {"true", "yes", "1", "t"}

        resolved_bool = df[resolved_col].map(_is_resolved)
        unresolved_mask = ~resolved_bool
        crit_unresolved_df = df[crit_mask & unresolved_mask]
        critical_unresolved = _safe_rows(crit_unresolved_df)

    out["critical_unresolved_checks"] = critical_unresolved
    evidence.register(
        metric_id="critical_unresolved_checks",
        metric_name="Critical Unresolved Posture Checks",
        value=len(critical_unresolved),
        calculation="posture_checks rows where severity='critical' AND resolved=False",
        source_rows=critical_unresolved,
        metric_type="row_list",
    )

    # MFA enforcement failures
    mfa_failures: list[dict] = []
    if "check_name" in df.columns and "_status_lower" in df.columns:
        mfa_mask = df["check_name"].str.lower().str.contains("mfa", na=False)
        fail_mask = df["_status_lower"] == "fail"
        mfa_fail_df = df[mfa_mask & fail_mask]
        mfa_failures = _safe_rows(mfa_fail_df)

    out["mfa_enforcement_failures"] = mfa_failures
    evidence.register(
        metric_id="mfa_enforcement_failures",
        metric_name="MFA Enforcement Failures",
        value=len(mfa_failures),
        calculation="posture_checks rows where check_name contains 'MFA' (case-insensitive) AND status='fail'",
        source_rows=mfa_failures,
        metric_type="row_list",
    )

    return out


def _compute_ato_metrics(
    df: pd.DataFrame,
    evidence: EvidenceIndex,
) -> dict[str, Any]:
    """Compute all ato_events-derived metrics."""
    out: dict[str, Any] = {}

    if "detected_at" in df.columns and pd.api.types.is_datetime64_any_dtype(df["detected_at"]):
        df = df.copy()
        df["_month"] = _month_from_ts(df["detected_at"])
    else:
        df = df.copy()
        df["_month"] = "Unknown"

    # ATO count by month
    ato_by_month = df.groupby("_month").size().to_dict()
    ato_by_month = {str(k): int(v) for k, v in ato_by_month.items()}
    out["ato_count_by_month"] = ato_by_month
    evidence.register(
        metric_id="ato_count_by_month",
        metric_name="ATO Events by Month",
        value=ato_by_month,
        calculation="count of ato_events rows grouped by calendar month (from detected_at)",
        source_rows=_safe_rows(df[["ato_id", "_month"]] if "ato_id" in df.columns else df),
    )

    # Mean risk score by month
    ato_risk_by_month: dict[str, float] = {}
    if "risk_score" in df.columns:
        for month, grp in df.groupby("_month"):
            risk_vals = pd.to_numeric(grp["risk_score"], errors="coerce").dropna()
            if len(risk_vals) > 0:
                ato_risk_by_month[str(month)] = round(float(risk_vals.mean()), 2)
    out["ato_mean_risk_by_month"] = ato_risk_by_month
    evidence.register(
        metric_id="ato_mean_risk_by_month",
        metric_name="ATO Mean Risk Score by Month",
        value=ato_risk_by_month,
        calculation="mean(risk_score) per calendar month",
        source_rows=_safe_rows(df[["ato_id", "_month", "risk_score"]] if "risk_score" in df.columns else df),
    )

    # SOC notified rate
    total = len(df)
    if "outcome" in df.columns:
        soc_count = int((df["outcome"].str.strip() == "soc_notified").sum())
    else:
        soc_count = 0
    soc_rate = round(soc_count / total * 100, 2) if total > 0 else 0.0
    out["ato_soc_notified_rate"] = soc_rate
    evidence.register(
        metric_id="ato_soc_notified_rate",
        metric_name="ATO SOC-Notified Rate",
        value=soc_rate,
        calculation=f"count(outcome='soc_notified') / total * 100 = {soc_count}/{total} * 100",
        source_rows=_safe_rows(df[["ato_id", "outcome"]] if "ato_id" in df.columns else df),
    )

    # Mean TTD and TTR
    mean_ttd = 0.0
    mean_ttr = 0.0
    if "ttd_minutes" in df.columns:
        ttd_vals = pd.to_numeric(df["ttd_minutes"], errors="coerce").dropna()
        if len(ttd_vals) > 0:
            mean_ttd = round(float(ttd_vals.mean()), 2)
    if "ttr_minutes" in df.columns:
        ttr_vals = pd.to_numeric(df["ttr_minutes"], errors="coerce").dropna()
        if len(ttr_vals) > 0:
            mean_ttr = round(float(ttr_vals.mean()), 2)

    out["ato_mean_ttd_minutes"] = mean_ttd
    out["ato_mean_ttr_minutes"] = mean_ttr
    evidence.register(
        metric_id="ato_mean_ttd_minutes",
        metric_name="ATO Mean Time-to-Detect (minutes)",
        value=mean_ttd,
        calculation="mean(ttd_minutes) across all ATO events",
        source_rows=_safe_rows(df[["ato_id", "ttd_minutes"]] if "ttd_minutes" in df.columns else df),
    )
    evidence.register(
        metric_id="ato_mean_ttr_minutes",
        metric_name="ATO Mean Time-to-Remediate (minutes)",
        value=mean_ttr,
        calculation="mean(ttr_minutes) across all ATO events",
        source_rows=_safe_rows(df[["ato_id", "ttr_minutes"]] if "ttr_minutes" in df.columns else df),
    )

    return out


def _compute_success_criteria(
    account: dict,
    metrics: dict[str, Any],
    evidence: EvidenceIndex,
) -> dict[str, dict]:
    """Evaluate success criteria from account.json against computed metrics."""
    criteria = account.get("success_criteria", {})
    status: dict[str, dict] = {}

    # vip_inbox_attacks_per_month_max
    if "vip_inbox_attacks_per_month_max" in criteria:
        target = criteria["vip_inbox_attacks_per_month_max"]
        vip_by_month = metrics.get("vip_inbox_attacks_by_month", {})
        # Latest month value
        months_in_order = [m for m in MONTH_ORDER if m in vip_by_month]
        actual_latest = vip_by_month.get(months_in_order[-1], None) if months_in_order else None
        actual_max = max(vip_by_month.values()) if vip_by_month else 0
        met = actual_max <= target
        status["vip_inbox_attacks_per_month_max"] = {
            "target": target,
            "actual": actual_max,
            "actual_latest_month": actual_latest,
            "description": "Max VIP inbox attacks per month",
            "met": met,
        }

    # user_reporting_rate_min
    if "user_reporting_rate_min" in criteria:
        target = criteria["user_reporting_rate_min"]
        reporting_by_month = metrics.get("reporting_rate_by_month", {})
        months_in_order = [m for m in MONTH_ORDER if m in reporting_by_month]
        latest_rate = reporting_by_month.get(months_in_order[-1], 0.0) if months_in_order else 0.0
        # Met if the latest month crosses the threshold
        met = latest_rate >= target
        status["user_reporting_rate_min"] = {
            "target": target,
            "actual": latest_rate,
            "actual_month": months_in_order[-1] if months_in_order else None,
            "description": "User reporting rate minimum (latest month)",
            "met": met,
        }

    # auto_remediation_rate_min
    if "auto_remediation_rate_min" in criteria:
        target = criteria["auto_remediation_rate_min"]
        actual = metrics.get("auto_remediation_rate", 0.0) / 100.0  # stored as %, compare as ratio
        met = actual >= target
        status["auto_remediation_rate_min"] = {
            "target": target,
            "actual": round(actual, 4),
            "description": "Auto-remediation rate minimum",
            "met": met,
        }

    # mttr_minutes_max
    if "mttr_minutes_max" in criteria:
        target = criteria["mttr_minutes_max"]
        actual = metrics.get("median_mttr_minutes", float("inf"))
        met = actual <= target
        status["mttr_minutes_max"] = {
            "target": target,
            "actual": actual,
            "description": "Median MTTR maximum (minutes)",
            "met": met,
        }

    evidence.register(
        metric_id="success_criteria_status",
        metric_name="Success Criteria Status",
        value={k: v["met"] for k, v in status.items()},
        calculation="each criterion evaluated against computed metrics vs account.json target",
        source_rows=[{"criterion": k, **v} for k, v in status.items()],
        metric_type="criteria_table",
    )

    return status


def _compute_benchmarks_summary(
    metrics: dict[str, Any],
    benchmarks: BenchmarkLookup,
) -> dict[str, dict]:
    """Compare key metrics against industry benchmarks."""
    summary: dict[str, dict] = {}

    metric_benchmark_map = [
        ("auto_remediation_rate", "auto_remediation_rate", lambda v: v / 100.0),
        ("median_mttr_minutes", "mttr_minutes", lambda v: v),
        ("reporting_rate_overall", "user_reporting_rate", lambda v: v),
        ("credential_submission_rate_overall", "credential_submission_rate", lambda v: v),
        ("posture_pass_rate_overall", "posture_pass_rate", lambda v: v),
    ]

    for metric_key, benchmark_name, transform in metric_benchmark_map:
        raw_val = metrics.get(metric_key)
        if raw_val is None:
            continue
        bench_val = transform(raw_val)
        pct_info = benchmarks.get_percentile(benchmark_name, bench_val)
        summary[metric_key] = {
            "value": raw_val,
            "benchmark_value_used": bench_val,
            "benchmark_metric": benchmark_name,
            **pct_info,
        }

    return summary


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def compute_all(
    dfs: dict[str, pd.DataFrame],
    account: dict,
    benchmarks: BenchmarkLookup,
    evidence: EvidenceIndex,
) -> MetricsBundle:
    """
    Compute all analytics metrics from parsed DataFrames.

    Parameters
    ----------
    dfs:
        Mapping of schema_type -> parsed DataFrame (from validator).
    account:
        Parsed account.json dict.
    benchmarks:
        Loaded BenchmarkLookup.
    evidence:
        EvidenceIndex instance to register all evidence into.

    Returns
    -------
    MetricsBundle with all metrics populated.
    """
    threat_df = dfs.get("threat_log", pd.DataFrame())
    rem_df = dfs.get("remediation_log", pd.DataFrame())
    report_df = dfs.get("user_reporting", pd.DataFrame())
    posture_df = dfs.get("posture_checks", pd.DataFrame())
    ato_df = dfs.get("ato_events", pd.DataFrame())

    # Accumulate all metric values into a flat dict, then pass to
    # cross-metric functions that need them.
    all_metrics: dict[str, Any] = {}

    # --- Threat metrics ---
    if not threat_df.empty:
        all_metrics.update(_compute_threat_metrics(threat_df, evidence))
    else:
        all_metrics.update({
            "total_threats": 0,
            "threats_by_month": {},
            "vip_inbox_attacks": 0,
            "vip_inbox_attacks_by_month": {},
            "attack_type_breakdown": {},
            "threats_by_tenant": {},
        })

    # --- Remediation metrics ---
    if not rem_df.empty:
        all_metrics.update(_compute_remediation_metrics(rem_df, threat_df, evidence))
    else:
        all_metrics.update({
            "auto_remediation_rate": 0.0,
            "manual_remediation_count": 0,
            "median_mttr_minutes": 0.0,
            "mttr_p90_minutes": 0.0,
            "mttr_by_month": {},
        })

    # --- User reporting metrics ---
    if not report_df.empty:
        # Ensure numeric coercion for required columns
        for col in ["reported_count", "total_received_suspicious", "credential_submitted"]:
            if col in report_df.columns:
                report_df = report_df.copy()
                report_df[col] = pd.to_numeric(report_df[col], errors="coerce").fillna(0)
        all_metrics.update(_compute_user_reporting_metrics(report_df, evidence))
    else:
        all_metrics.update({
            "reporting_rate_by_month": {},
            "reporting_rate_overall": 0.0,
            "credential_submission_rate_by_month": {},
            "credential_submission_rate_overall": 0.0,
            "reporting_rate_by_department": {},
            "low_reporting_departments": [],
        })

    # --- Posture metrics ---
    if not posture_df.empty:
        all_metrics.update(_compute_posture_metrics(posture_df, evidence))
    else:
        all_metrics.update({
            "posture_pass_rate_by_tenant": {},
            "posture_pass_rate_overall": 0.0,
            "critical_unresolved_checks": [],
            "mfa_enforcement_failures": [],
        })

    # --- ATO metrics ---
    if not ato_df.empty:
        all_metrics.update(_compute_ato_metrics(ato_df, evidence))
    else:
        all_metrics.update({
            "ato_count_by_month": {},
            "ato_mean_risk_by_month": {},
            "ato_soc_notified_rate": 0.0,
            "ato_mean_ttd_minutes": 0.0,
            "ato_mean_ttr_minutes": 0.0,
        })

    # --- Cross-metric ---
    success_criteria = _compute_success_criteria(account, all_metrics, evidence)
    all_metrics["success_criteria_status"] = success_criteria

    benchmarks_summary = _compute_benchmarks_summary(all_metrics, benchmarks)
    all_metrics["benchmarks_summary"] = benchmarks_summary

    return MetricsBundle(
        company_name=account.get("company_name", ""),
        period=account.get("period_label", ""),
        tenants=account.get("tenants", []),
        total_threats=all_metrics["total_threats"],
        threats_by_month=all_metrics["threats_by_month"],
        vip_inbox_attacks=all_metrics["vip_inbox_attacks"],
        vip_inbox_attacks_by_month=all_metrics["vip_inbox_attacks_by_month"],
        attack_type_breakdown=all_metrics["attack_type_breakdown"],
        threats_by_tenant=all_metrics["threats_by_tenant"],
        auto_remediation_rate=all_metrics["auto_remediation_rate"],
        manual_remediation_count=all_metrics["manual_remediation_count"],
        median_mttr_minutes=all_metrics["median_mttr_minutes"],
        mttr_p90_minutes=all_metrics["mttr_p90_minutes"],
        mttr_by_month=all_metrics["mttr_by_month"],
        reporting_rate_by_month=all_metrics["reporting_rate_by_month"],
        reporting_rate_overall=all_metrics["reporting_rate_overall"],
        credential_submission_rate_by_month=all_metrics["credential_submission_rate_by_month"],
        credential_submission_rate_overall=all_metrics["credential_submission_rate_overall"],
        reporting_rate_by_department=all_metrics["reporting_rate_by_department"],
        low_reporting_departments=all_metrics["low_reporting_departments"],
        posture_pass_rate_by_tenant=all_metrics["posture_pass_rate_by_tenant"],
        posture_pass_rate_overall=all_metrics["posture_pass_rate_overall"],
        critical_unresolved_checks=all_metrics["critical_unresolved_checks"],
        mfa_enforcement_failures=all_metrics["mfa_enforcement_failures"],
        ato_count_by_month=all_metrics["ato_count_by_month"],
        ato_mean_risk_by_month=all_metrics["ato_mean_risk_by_month"],
        ato_soc_notified_rate=all_metrics["ato_soc_notified_rate"],
        ato_mean_ttd_minutes=all_metrics["ato_mean_ttd_minutes"],
        ato_mean_ttr_minutes=all_metrics["ato_mean_ttr_minutes"],
        success_criteria_status=success_criteria,
        benchmarks_summary=benchmarks_summary,
    )
