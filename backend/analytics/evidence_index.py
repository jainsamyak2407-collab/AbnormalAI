"""
Central evidence registry. All metrics write evidence here.
Each registered metric gets an auto-incremented evidence_id ("E1", "E2", ...).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

MAX_SOURCE_ROWS = 50

MetricType = Literal["scalar", "criteria_table", "row_list", "breakdown"]


def _infer_metric_type(value: Any) -> MetricType:
    if isinstance(value, dict):
        return "breakdown"
    if isinstance(value, list):
        return "row_list"
    return "scalar"


@dataclass
class EvidenceRecord:
    evidence_id: str
    metric_id: str
    metric_name: str
    value: Any
    calculation: str
    source_row_count: int
    source_rows: list[dict]  # capped at MAX_SOURCE_ROWS
    metric_type: MetricType = "scalar"


class EvidenceIndex:
    """
    Registry that maps metric calculations to evidence records.

    Usage::

        evidence = EvidenceIndex()
        eid = evidence.register(
            metric_id="total_threats",
            metric_name="Total Threats Detected",
            value=62,
            calculation="count of all rows in threat_log",
            source_rows=df.to_dict(orient='records'),
        )
        # eid -> "E1"
    """

    def __init__(self) -> None:
        self._store: dict[str, EvidenceRecord] = {}
        self._counter: int = 0

    def _next_id(self) -> str:
        self._counter += 1
        return f"E{self._counter}"

    def register(
        self,
        metric_id: str,
        metric_name: str,
        value: Any,
        calculation: str,
        source_rows: list[dict],
        metric_type: MetricType | None = None,
    ) -> str:
        """
        Register a metric and its supporting evidence.

        Parameters
        ----------
        metric_id:
            Machine-readable metric identifier (e.g. "total_threats").
        metric_name:
            Human-readable metric name.
        value:
            The computed metric value.
        calculation:
            Human-readable description of how value was derived.
        source_rows:
            List of dicts representing the rows that produced this metric.
            Capped internally at MAX_SOURCE_ROWS.

        Returns
        -------
        str
            The assigned evidence_id (e.g. "E1").
        """
        evidence_id = self._next_id()
        capped_rows = source_rows[:MAX_SOURCE_ROWS]
        resolved_type = metric_type if metric_type is not None else _infer_metric_type(value)
        record = EvidenceRecord(
            evidence_id=evidence_id,
            metric_id=metric_id,
            metric_name=metric_name,
            value=value,
            calculation=calculation,
            source_row_count=len(source_rows),
            source_rows=capped_rows,
            metric_type=resolved_type,
        )
        self._store[evidence_id] = record
        return evidence_id

    def get(self, evidence_id: str) -> EvidenceRecord | None:
        """Return the EvidenceRecord for a given evidence_id, or None."""
        return self._store.get(evidence_id)

    def all(self) -> dict[str, EvidenceRecord]:
        """Return all registered evidence records."""
        return dict(self._store)

    def to_dict(self) -> dict:
        """Serialise all evidence records to a plain dict."""
        return {
            eid: {
                "evidence_id": rec.evidence_id,
                "metric_id": rec.metric_id,
                "metric_name": rec.metric_name,
                "metric_type": rec.metric_type,
                "value": rec.value,
                "calculation": rec.calculation,
                "source_row_count": rec.source_row_count,
                "source_rows": rec.source_rows,
            }
            for eid, rec in self._store.items()
        }

    @classmethod
    def from_dict(cls, data: dict) -> "EvidenceIndex":
        """Reconstruct an EvidenceIndex from a to_dict() payload."""
        idx = cls()
        for eid, rec in data.items():
            idx._store[eid] = EvidenceRecord(
                evidence_id=rec["evidence_id"],
                metric_id=rec["metric_id"],
                metric_name=rec["metric_name"],
                value=rec["value"],
                calculation=rec["calculation"],
                source_row_count=rec["source_row_count"],
                source_rows=rec["source_rows"],
                metric_type=rec.get("metric_type", "scalar"),
            )
        if idx._store:
            max_n = max(int(k[1:]) for k in idx._store)
            idx._counter = max_n
        return idx
