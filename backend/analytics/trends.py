"""
Month-over-month trend calculation. Takes MetricsBundle. Returns TrendBundle.
"""

from __future__ import annotations

from dataclasses import dataclass

from analytics.metrics import MetricsBundle, MONTH_ORDER


@dataclass
class TrendPoint:
    month: str
    value: float
    delta_abs: float | None   # vs prior month
    delta_pct: float | None   # vs prior month (fraction, not %)
    direction: str            # "up" | "down" | "flat"


@dataclass
class TrendBundle:
    vip_attacks: list[TrendPoint]
    reporting_rate: list[TrendPoint]
    credential_submission_rate: list[TrendPoint]
    ato_risk_score: list[TrendPoint]
    mttr: list[TrendPoint]


_FLAT_THRESHOLD = 0.001  # treat changes smaller than this as flat


def _build_trend(month_dict: dict[str, float | int]) -> list[TrendPoint]:
    """
    Build an ordered list of TrendPoints from a {month: value} dict.

    Months are sorted in calendar order. Delta and direction are computed
    relative to the previous month in the series.
    """
    # Sort months in calendar order, keep only those present in dict
    ordered = [(m, float(month_dict[m])) for m in MONTH_ORDER if m in month_dict]

    points: list[TrendPoint] = []
    for i, (month, value) in enumerate(ordered):
        if i == 0:
            points.append(TrendPoint(
                month=month,
                value=value,
                delta_abs=None,
                delta_pct=None,
                direction="flat",
            ))
        else:
            prior_value = ordered[i - 1][1]
            delta_abs = value - prior_value
            if prior_value != 0:
                delta_pct = delta_abs / abs(prior_value)
            else:
                delta_pct = None

            if abs(delta_abs) < _FLAT_THRESHOLD:
                direction = "flat"
            elif delta_abs > 0:
                direction = "up"
            else:
                direction = "down"

            points.append(TrendPoint(
                month=month,
                value=round(value, 4),
                delta_abs=round(delta_abs, 4),
                delta_pct=round(delta_pct, 4) if delta_pct is not None else None,
                direction=direction,
            ))

    return points


def compute_trends(bundle: MetricsBundle) -> TrendBundle:
    """
    Compute month-over-month trend series for key metrics.

    Parameters
    ----------
    bundle:
        A MetricsBundle produced by compute_all().

    Returns
    -------
    TrendBundle with trend point lists for each key metric.
    """
    vip_attacks = _build_trend(bundle.vip_inbox_attacks_by_month)
    reporting_rate = _build_trend(bundle.reporting_rate_by_month)
    credential_submission_rate = _build_trend(bundle.credential_submission_rate_by_month)
    ato_risk_score = _build_trend(bundle.ato_mean_risk_by_month)
    mttr = _build_trend(bundle.mttr_by_month)

    return TrendBundle(
        vip_attacks=vip_attacks,
        reporting_rate=reporting_rate,
        credential_submission_rate=credential_submission_rate,
        ato_risk_score=ato_risk_score,
        mttr=mttr,
    )
