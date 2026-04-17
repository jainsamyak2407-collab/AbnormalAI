"""
Tenant-level metric comparisons. Surfaces drift between tenants.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from analytics.metrics import MetricsBundle


@dataclass
class TenantComparison:
    metric: str
    tenant_values: dict[str, float]  # {tenant_id: value}
    delta: float                      # max - min
    delta_pp: float                   # in percentage points (delta * 100)
    drifting: bool                    # True if delta > threshold
    worse_tenant: str                 # tenant with worse (lower for pass-rate, higher for risk) value


@dataclass
class TenantDriftBundle:
    comparisons: list[TenantComparison]
    has_significant_drift: bool
    summary: str  # one-sentence human-readable summary


# Thresholds above which drift is flagged
_DRIFT_THRESHOLDS: dict[str, float] = {
    "posture_pass_rate": 0.05,        # 5pp
    "reporting_rate": 0.05,           # 5pp
    "auto_remediation_rate": 0.05,    # 5pp
    "ato_per_1000_mailboxes": 2.0,    # 2 events per 1000 mailboxes
}

# For these metrics, the lower value is worse
_LOWER_IS_WORSE = {"posture_pass_rate", "reporting_rate", "auto_remediation_rate"}


def _worse_tenant(metric: str, tenant_values: dict[str, float]) -> str:
    """Return the tenant id with the worse value for the given metric."""
    if not tenant_values:
        return ""
    if metric in _LOWER_IS_WORSE:
        return min(tenant_values, key=tenant_values.get)
    else:
        return max(tenant_values, key=tenant_values.get)


def compute_tenant_drift(
    bundle: MetricsBundle,
    dfs: dict[str, pd.DataFrame],
) -> TenantDriftBundle:
    """
    Compare key metrics across tenants and surface significant drift.

    Parameters
    ----------
    bundle:
        MetricsBundle from compute_all().
    dfs:
        Parsed DataFrames dict (from validator), used for metrics that require
        per-tenant raw computation (e.g. auto_remediation_rate per tenant,
        ATO counts per mailbox).

    Returns
    -------
    TenantDriftBundle
    """
    comparisons: list[TenantComparison] = []

    # Extract tenant mailbox counts for per-mailbox normalisation
    mailbox_counts: dict[str, int] = {}
    for t in bundle.tenants:
        tid = t.get("tenant_id", "")
        mb = t.get("mailbox_count", 0)
        if tid:
            mailbox_counts[tid] = int(mb)

    # -------------------------------------------------------------------
    # 1. Posture pass rate (from bundle)
    # -------------------------------------------------------------------
    posture_by_tenant = bundle.posture_pass_rate_by_tenant
    if len(posture_by_tenant) >= 2:
        vals = list(posture_by_tenant.values())
        delta = max(vals) - min(vals)
        threshold = _DRIFT_THRESHOLDS["posture_pass_rate"]
        comparisons.append(TenantComparison(
            metric="posture_pass_rate",
            tenant_values=posture_by_tenant,
            delta=round(delta, 4),
            delta_pp=round(delta * 100, 2),
            drifting=delta > threshold,
            worse_tenant=_worse_tenant("posture_pass_rate", posture_by_tenant),
        ))

    # -------------------------------------------------------------------
    # 2. Reporting rate per tenant (computed from user_reporting df)
    # -------------------------------------------------------------------
    report_df = dfs.get("user_reporting", pd.DataFrame())
    if not report_df.empty and "tenant_id" in report_df.columns:
        for col in ["reported_count", "total_received_suspicious"]:
            if col in report_df.columns:
                report_df = report_df.copy()
                report_df[col] = pd.to_numeric(report_df[col], errors="coerce").fillna(0)

        tenant_reporting: dict[str, float] = {}
        for tid, grp in report_df.groupby("tenant_id"):
            total_num = grp["reported_count"].sum() if "reported_count" in grp else 0
            total_denom = grp["total_received_suspicious"].sum() if "total_received_suspicious" in grp else 0
            if total_denom > 0:
                tenant_reporting[str(tid)] = round(float(total_num / total_denom), 4)

        if len(tenant_reporting) >= 2:
            vals = list(tenant_reporting.values())
            delta = max(vals) - min(vals)
            threshold = _DRIFT_THRESHOLDS["reporting_rate"]
            comparisons.append(TenantComparison(
                metric="reporting_rate",
                tenant_values=tenant_reporting,
                delta=round(delta, 4),
                delta_pp=round(delta * 100, 2),
                drifting=delta > threshold,
                worse_tenant=_worse_tenant("reporting_rate", tenant_reporting),
            ))

    # -------------------------------------------------------------------
    # 3. Auto-remediation rate per tenant (computed from remediation_log df)
    # -------------------------------------------------------------------
    rem_df = dfs.get("remediation_log", pd.DataFrame())
    if not rem_df.empty and "tenant_id" in rem_df.columns:
        tenant_auto_rem: dict[str, float] = {}
        for tid, grp in rem_df.groupby("tenant_id"):
            total = len(grp)
            if total == 0:
                continue
            auto_success = (
                (grp["method"].str.strip() == "auto") & (grp["outcome"].str.strip() == "success")
            ).sum() if "method" in grp.columns and "outcome" in grp.columns else 0
            tenant_auto_rem[str(tid)] = round(float(auto_success / total), 4)

        if len(tenant_auto_rem) >= 2:
            vals = list(tenant_auto_rem.values())
            delta = max(vals) - min(vals)
            threshold = _DRIFT_THRESHOLDS["auto_remediation_rate"]
            comparisons.append(TenantComparison(
                metric="auto_remediation_rate",
                tenant_values=tenant_auto_rem,
                delta=round(delta, 4),
                delta_pp=round(delta * 100, 2),
                drifting=delta > threshold,
                worse_tenant=_worse_tenant("auto_remediation_rate", tenant_auto_rem),
            ))

    # -------------------------------------------------------------------
    # 4. ATO count per 1000 mailboxes per tenant
    # -------------------------------------------------------------------
    ato_df = dfs.get("ato_events", pd.DataFrame())
    if not ato_df.empty and "tenant_id" in ato_df.columns:
        tenant_ato_counts: dict[str, int] = ato_df["tenant_id"].value_counts().to_dict()
        tenant_ato_per1k: dict[str, float] = {}
        for tid, count in tenant_ato_counts.items():
            mb = mailbox_counts.get(str(tid), 0)
            if mb > 0:
                tenant_ato_per1k[str(tid)] = round(float(count) / mb * 1000, 2)
            else:
                tenant_ato_per1k[str(tid)] = float(count)

        if len(tenant_ato_per1k) >= 2:
            vals = list(tenant_ato_per1k.values())
            delta = max(vals) - min(vals)
            threshold = _DRIFT_THRESHOLDS["ato_per_1000_mailboxes"]
            comparisons.append(TenantComparison(
                metric="ato_per_1000_mailboxes",
                tenant_values=tenant_ato_per1k,
                delta=round(delta, 2),
                delta_pp=round(delta, 2),  # not a rate; delta_pp == delta
                drifting=delta > threshold,
                worse_tenant=_worse_tenant("ato_per_1000_mailboxes", tenant_ato_per1k),
            ))

    # -------------------------------------------------------------------
    # Summarise
    # -------------------------------------------------------------------
    has_drift = any(c.drifting for c in comparisons)

    if not comparisons:
        summary = "Insufficient tenant data to compare."
    elif has_drift:
        drifting_metrics = [c.metric for c in comparisons if c.drifting]
        worse_tenants = list({c.worse_tenant for c in comparisons if c.drifting and c.worse_tenant})
        summary = (
            f"Significant tenant drift detected in: {', '.join(drifting_metrics)}; "
            f"lagging tenant(s): {', '.join(worse_tenants)}."
        )
    else:
        summary = "No significant metric drift detected between tenants."

    return TenantDriftBundle(
        comparisons=comparisons,
        has_significant_drift=has_drift,
        summary=summary,
    )
