"""
Rule-based anomaly detection. Takes MetricsBundle + account data.
Returns a list of Anomaly dataclasses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from analytics.metrics import MetricsBundle, MONTH_ORDER


@dataclass
class Anomaly:
    anomaly_id: str
    rule: str
    severity: str  # "critical" | "warning" | "info"
    title: str
    detail: str
    metric_ids: list[str]
    evidence_ids: list[str]
    tenant_id: str | None = None


def _sorted_months(month_dict: dict[str, Any]) -> list[str]:
    """Return month keys sorted in calendar order."""
    return [m for m in MONTH_ORDER if m in month_dict]


def detect_anomalies(
    bundle: MetricsBundle,
    account: dict,
) -> list[Anomaly]:
    """
    Run all anomaly detection rules against the MetricsBundle.

    Parameters
    ----------
    bundle:
        Computed MetricsBundle from compute_all().
    account:
        Parsed account.json dict.

    Returns
    -------
    list[Anomaly] — one entry per triggered rule.
    """
    anomalies: list[Anomaly] = []
    aid_counter = [0]

    def _next_id() -> str:
        aid_counter[0] += 1
        return f"A{aid_counter[0]:03d}"

    success_criteria = account.get("success_criteria", {})

    # -----------------------------------------------------------------------
    # Rule 1: VIP attack in current month exceeding success criterion
    # -----------------------------------------------------------------------
    vip_max_target = success_criteria.get("vip_inbox_attacks_per_month_max", 1)
    vip_by_month = bundle.vip_inbox_attacks_by_month
    months_sorted = _sorted_months(vip_by_month)
    for month in months_sorted:
        count = vip_by_month[month]
        if count > vip_max_target:
            anomalies.append(Anomaly(
                anomaly_id=_next_id(),
                rule="vip_attack_exceeds_target",
                severity="critical",
                title=f"VIP inbox attacks exceeded target in {month}",
                detail=(
                    f"{count} VIP inbox attack(s) detected in {month}, "
                    f"exceeding the success criterion of {vip_max_target} per month."
                ),
                metric_ids=["vip_inbox_attacks_by_month"],
                evidence_ids=[],
                tenant_id=None,
            ))

    # -----------------------------------------------------------------------
    # Rule 2: Credential submission rate trending up each month
    # -----------------------------------------------------------------------
    cred_by_month = bundle.credential_submission_rate_by_month
    cred_months = _sorted_months(cred_by_month)
    if len(cred_months) >= 2:
        rates = [cred_by_month[m] for m in cred_months]
        trending_up = all(rates[i] < rates[i + 1] for i in range(len(rates) - 1))
        if trending_up:
            latest_rate = rates[-1]
            pct_str = f"{latest_rate * 100:.1f}%"
            anomalies.append(Anomaly(
                anomaly_id=_next_id(),
                rule="credential_submission_trending_up",
                severity="critical",
                title="Credential submission rate rising every month",
                detail=(
                    f"Credential submission rate has increased each month: "
                    f"{', '.join(f'{cred_by_month[m]*100:.1f}%' for m in cred_months)}. "
                    f"Latest month is {pct_str}, indicating a growing user risk."
                ),
                metric_ids=["credential_submission_rate_by_month"],
                evidence_ids=[],
                tenant_id=None,
            ))

    # -----------------------------------------------------------------------
    # Rule 3: Auto-remediation below industry p50 benchmark
    # -----------------------------------------------------------------------
    auto_rate_pct = bundle.auto_remediation_rate
    auto_rate_ratio = auto_rate_pct / 100.0
    # p50 for auto_remediation_rate in Healthcare mid_market = 0.75
    bm = bundle.benchmarks_summary.get("auto_remediation_rate", {})
    p50 = bm.get("p50")
    if p50 is not None and auto_rate_ratio < p50:
        anomalies.append(Anomaly(
            anomaly_id=_next_id(),
            rule="auto_remediation_below_p50",
            severity="warning",
            title="Auto-remediation rate below industry median",
            detail=(
                f"Auto-remediation rate is {auto_rate_pct:.1f}% "
                f"(industry p50: {p50 * 100:.1f}%). "
                "More threats require manual analyst intervention than peers at the median."
            ),
            metric_ids=["auto_remediation_rate"],
            evidence_ids=[],
            tenant_id=None,
        ))

    # -----------------------------------------------------------------------
    # Rule 4: Critical posture check unresolved
    # -----------------------------------------------------------------------
    crit_checks = bundle.critical_unresolved_checks
    if crit_checks:
        check_names = list({c.get("check_name", "unknown") for c in crit_checks})
        tenant_ids = list({c.get("tenant_id", "") for c in crit_checks if c.get("tenant_id")})
        anomalies.append(Anomaly(
            anomaly_id=_next_id(),
            rule="critical_posture_check_unresolved",
            severity="critical",
            title=f"{len(crit_checks)} critical posture check(s) remain unresolved",
            detail=(
                f"Unresolved critical checks: {', '.join(check_names[:5])}. "
                f"Affected tenants: {', '.join(tenant_ids) if tenant_ids else 'unknown'}."
            ),
            metric_ids=["critical_unresolved_checks"],
            evidence_ids=[],
            tenant_id=tenant_ids[0] if len(tenant_ids) == 1 else None,
        ))

    # -----------------------------------------------------------------------
    # Rule 5: MFA enforcement persistent failure (same check failing multiple dates)
    # -----------------------------------------------------------------------
    mfa_failures = bundle.mfa_enforcement_failures
    if len(mfa_failures) > 1:
        check_dates = list({f.get("check_date", "") for f in mfa_failures})
        tenant_ids = list({f.get("tenant_id", "") for f in mfa_failures if f.get("tenant_id")})
        affected_counts = [f.get("affected_users", 0) for f in mfa_failures if f.get("affected_users")]
        max_affected = max(affected_counts) if affected_counts else 0
        anomalies.append(Anomaly(
            anomaly_id=_next_id(),
            rule="mfa_enforcement_persistent_failure",
            severity="critical",
            title=f"MFA enforcement failing across {len(check_dates)} check dates",
            detail=(
                f"MFA Enforcement has failed on {len(mfa_failures)} checks "
                f"across {len(check_dates)} distinct check dates. "
                f"Up to {max_affected} users are affected at once. "
                "This is a persistent critical unresolved finding."
            ),
            metric_ids=["mfa_enforcement_failures"],
            evidence_ids=[],
            tenant_id=tenant_ids[0] if len(tenant_ids) == 1 else None,
        ))

    # -----------------------------------------------------------------------
    # Rule 6: Department reporting rate below 25%
    # -----------------------------------------------------------------------
    LOW_DEPT_THRESHOLD = 0.25
    dept_rates = bundle.reporting_rate_by_department
    for dept, rate in dept_rates.items():
        if rate < LOW_DEPT_THRESHOLD:
            anomalies.append(Anomaly(
                anomaly_id=_next_id(),
                rule="department_low_reporting_rate",
                severity="warning",
                title=f"{dept} department reporting rate critically low",
                detail=(
                    f"{dept} department has a user reporting rate of {rate * 100:.1f}%, "
                    f"below the {LOW_DEPT_THRESHOLD * 100:.0f}% concern threshold. "
                    "Low reporting rates indicate potential phishing susceptibility."
                ),
                metric_ids=["reporting_rate_by_department"],
                evidence_ids=[],
                tenant_id=None,
            ))

    # -----------------------------------------------------------------------
    # Rule 7: ATO risk score trending up month-over-month
    # -----------------------------------------------------------------------
    ato_risk_by_month = bundle.ato_mean_risk_by_month
    risk_months = _sorted_months(ato_risk_by_month)
    if len(risk_months) >= 2:
        risk_scores = [ato_risk_by_month[m] for m in risk_months]
        risk_trending_up = all(risk_scores[i] < risk_scores[i + 1] for i in range(len(risk_scores) - 1))
        if risk_trending_up:
            anomalies.append(Anomaly(
                anomaly_id=_next_id(),
                rule="ato_risk_score_trending_up",
                severity="warning",
                title="ATO mean risk score rising each month",
                detail=(
                    f"Mean ATO risk score has increased each month: "
                    f"{', '.join(f'{ato_risk_by_month[m]:.1f}' for m in risk_months)}. "
                    "Rising scores indicate increasingly sophisticated account takeover attempts."
                ),
                metric_ids=["ato_mean_risk_by_month"],
                evidence_ids=[],
                tenant_id=None,
            ))

    # -----------------------------------------------------------------------
    # Rule 8: Tenant posture gap > 5 percentage points
    # -----------------------------------------------------------------------
    POSTURE_GAP_THRESHOLD = 0.05  # 5pp
    posture_by_tenant = bundle.posture_pass_rate_by_tenant
    if len(posture_by_tenant) >= 2:
        rates_list = list(posture_by_tenant.values())
        gap = max(rates_list) - min(rates_list)
        if gap > POSTURE_GAP_THRESHOLD:
            worse_tenant = min(posture_by_tenant, key=posture_by_tenant.get)
            better_tenant = max(posture_by_tenant, key=posture_by_tenant.get)
            anomalies.append(Anomaly(
                anomaly_id=_next_id(),
                rule="tenant_posture_gap",
                severity="warning",
                title=f"Posture gap of {gap * 100:.1f}pp between tenants",
                detail=(
                    f"{worse_tenant} posture pass rate ({posture_by_tenant[worse_tenant] * 100:.1f}%) "
                    f"lags {better_tenant} ({posture_by_tenant[better_tenant] * 100:.1f}%) "
                    f"by {gap * 100:.1f} percentage points, "
                    "suggesting a post-acquisition hygiene gap."
                ),
                metric_ids=["posture_pass_rate_by_tenant"],
                evidence_ids=[],
                tenant_id=worse_tenant,
            ))

    # -----------------------------------------------------------------------
    # Rule 9: SOC manual load high (soc_notified_rate > 50%)
    # -----------------------------------------------------------------------
    SOC_LOAD_THRESHOLD = 50.0
    soc_rate = bundle.ato_soc_notified_rate
    if soc_rate > SOC_LOAD_THRESHOLD:
        anomalies.append(Anomaly(
            anomaly_id=_next_id(),
            rule="soc_manual_load_high",
            severity="warning",
            title=f"SOC manual load high: {soc_rate:.1f}% of ATOs require analyst review",
            detail=(
                f"{soc_rate:.1f}% of ATO events resolve as 'soc_notified', "
                f"meaning analysts must manually review and respond. "
                "This indicates limited automation coverage for account takeover cases."
            ),
            metric_ids=["ato_soc_notified_rate"],
            evidence_ids=[],
            tenant_id=None,
        ))

    return anomalies
