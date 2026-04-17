"""
Load and query industry benchmark percentiles.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

# Ordered percentile labels for ranking
_PERCENTILE_ORDER = ["p25", "p50", "p75", "p90", "p99"]

# For metrics where lower is better, comparison direction is reversed
_LOWER_IS_BETTER = {"mttr_minutes", "credential_submission_rate", "vip_inbox_attacks_per_month"}


@dataclass
class BenchmarkLookup:
    """Queryable wrapper around industry benchmark data."""

    _df: pd.DataFrame

    def _filter(self, metric_name: str, industry: str, segment: str) -> pd.DataFrame:
        mask = (
            (self._df["metric_name"] == metric_name)
            & (self._df["industry"].str.lower() == industry.lower())
            & (self._df["segment"].str.lower() == segment.lower())
        )
        return self._df[mask].copy()

    def get_percentile(
        self,
        metric_name: str,
        value: float,
        industry: str = "Healthcare",
        segment: str = "mid_market",
    ) -> dict:
        """
        Given a metric value, determine where it ranks among benchmark percentiles.

        Returns a dict with:
          - percentile_label: e.g. "p75"
          - percentile_rank: e.g. 75
          - p25, p50, p75, p90 values (when available)
          - unit: from benchmark data
        """
        subset = self._filter(metric_name, industry, segment)
        if subset.empty:
            return {
                "percentile_label": None,
                "percentile_rank": None,
                "note": f"No benchmarks found for {metric_name}/{industry}/{segment}",
            }

        # Build percentile -> value mapping
        pct_map: dict[str, float] = {}
        for _, row in subset.iterrows():
            pct_label = str(row["percentile"]).strip()
            pct_map[pct_label] = float(row["value"])

        lower_is_better = metric_name in _LOWER_IS_BETTER

        # Determine where value sits
        matched_label: str | None = None
        matched_rank: int | None = None

        ordered_available = [p for p in _PERCENTILE_ORDER if p in pct_map]

        if lower_is_better:
            # Lower value = better = higher percentile
            # e.g. if MTTR is 2.3 min and p90 threshold is 3.2 min,
            # beating p90 means you're at or above p90 quality
            for pct_label in reversed(ordered_available):
                threshold = pct_map[pct_label]
                rank = int(pct_label[1:])
                if value <= threshold:
                    matched_label = pct_label
                    matched_rank = rank
                    break
        else:
            # Higher value = better = higher percentile
            for pct_label in reversed(ordered_available):
                threshold = pct_map[pct_label]
                rank = int(pct_label[1:])
                if value >= threshold:
                    matched_label = pct_label
                    matched_rank = rank
                    break

        unit = subset["unit"].iloc[0] if "unit" in subset.columns else ""

        result: dict = {
            "percentile_label": matched_label,
            "percentile_rank": matched_rank,
            "unit": unit,
        }
        for p in ["p25", "p50", "p75", "p90", "p99"]:
            if p in pct_map:
                result[p] = pct_map[p]

        return result

    def get_value_at_percentile(
        self,
        metric_name: str,
        percentile: str,
        industry: str = "Healthcare",
        segment: str = "mid_market",
    ) -> float | None:
        """Return the benchmark value at a specific percentile, or None if not found."""
        subset = self._filter(metric_name, industry, segment)
        if subset.empty:
            return None
        row = subset[subset["percentile"] == percentile]
        if row.empty:
            return None
        return float(row["value"].iloc[0])

    def get_all_percentiles(
        self,
        metric_name: str,
        industry: str = "Healthcare",
        segment: str = "mid_market",
    ) -> dict[str, float]:
        """Return all percentile->value pairs for a given metric/industry/segment."""
        subset = self._filter(metric_name, industry, segment)
        if subset.empty:
            return {}
        return {
            str(row["percentile"]): float(row["value"])
            for _, row in subset.iterrows()
        }


def load_benchmarks(df: pd.DataFrame) -> BenchmarkLookup:
    """
    Load a benchmarks DataFrame into a BenchmarkLookup.

    The DataFrame must have columns: metric_name, industry, segment, percentile, value.
    """
    required = {"metric_name", "industry", "segment", "percentile", "value"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Benchmarks DataFrame missing columns: {missing}")

    df = df.copy()
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df["percentile"] = df["percentile"].astype(str).str.strip()

    return BenchmarkLookup(_df=df)
