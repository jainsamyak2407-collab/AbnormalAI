"""
Schema detection by column signature (not filename).
Detects file type from CSV column headers or JSON structure.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field


SCHEMA_SIGNATURES: dict[str, set[str]] = {
    "threat_log": {"event_id", "attack_type", "is_vip", "disposition"},
    "posture_checks": {"check_id", "check_name", "status", "severity"},
    "remediation_log": {"remediation_id", "method", "mttr_minutes", "outcome"},
    "user_reporting": {"reporting_rate", "credential_submission_rate", "department"},
    "ato_events": {"ato_id", "risk_score", "risk_factors", "outcome"},
    "industry_benchmarks": {"metric_name", "percentile", "value"},
    # v2 / new-format schemas — normalized to canonical schemas in validator
    "email_attacks": {"attack_id", "attack_type", "remediation_action", "recipient_email"},
    "security_posture": {"evaluation_id", "check_name", "status", "risk_level"},
    "account_takeover_events": {"event_id", "risk_score", "trigger_event_type", "resolution"},
    "phishing_simulations": {"simulation_id", "credentials_submitted", "reported_to_aism"},
    "employees": {"employee_id", "is_vip", "email", "department"},
    "benchmarks_wide": {"metric_name", "p25", "p50", "p75"},
    "aism_submissions": {"submission_id", "triage_result", "reporter_email"},
}

ACCOUNT_JSON_KEYS: set[str] = {"company_name", "tenants"}


@dataclass
class DetectedSchema:
    filename: str
    file_type: str  # one of the SCHEMA_SIGNATURES keys, "account_json", or "unknown"
    matched_columns: list[str] = field(default_factory=list)
    missing_columns: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _detect_csv(filename: str, content: bytes) -> DetectedSchema:
    """Detect schema type from CSV column headers."""
    try:
        text = content.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        header_row = next(reader, None)
    except Exception as exc:
        return DetectedSchema(
            filename=filename,
            file_type="unknown",
            warnings=[f"Failed to read CSV headers: {exc}"],
        )

    if not header_row:
        return DetectedSchema(
            filename=filename,
            file_type="unknown",
            warnings=["CSV file has no header row"],
        )

    actual_cols = {col.strip().lower() for col in header_row}

    best_type: str = "unknown"
    best_matched: list[str] = []
    best_missing: list[str] = []

    for schema_type, required_cols in SCHEMA_SIGNATURES.items():
        matched = sorted(actual_cols & required_cols)
        missing = sorted(required_cols - actual_cols)
        if len(missing) == 0:
            # All required columns present — definitive match
            if len(matched) > len(best_matched):
                best_type = schema_type
                best_matched = matched
                best_missing = missing

    if best_type == "unknown":
        # Partial match: pick schema with fewest missing required cols
        least_missing = float("inf")
        partial_type = "unknown"
        partial_matched: list[str] = []
        partial_missing: list[str] = []
        for schema_type, required_cols in SCHEMA_SIGNATURES.items():
            matched = sorted(actual_cols & required_cols)
            missing = sorted(required_cols - actual_cols)
            if matched and len(missing) < least_missing:
                least_missing = len(missing)
                partial_type = schema_type
                partial_matched = matched
                partial_missing = missing

        if partial_type != "unknown":
            warnings = [
                f"Partial schema match for '{partial_type}'; "
                f"missing required columns: {partial_missing}"
            ]
            return DetectedSchema(
                filename=filename,
                file_type="unknown",
                matched_columns=partial_matched,
                missing_columns=partial_missing,
                warnings=warnings,
            )

        return DetectedSchema(
            filename=filename,
            file_type="unknown",
            warnings=["No schema signature matched"],
        )

    warnings: list[str] = []
    extra = sorted(actual_cols - SCHEMA_SIGNATURES.get(best_type, set()))
    if extra:
        warnings.append(f"Extra columns not in schema definition: {extra}")

    return DetectedSchema(
        filename=filename,
        file_type=best_type,
        matched_columns=best_matched,
        missing_columns=best_missing,
        warnings=warnings,
    )


def _detect_json(filename: str, content: bytes) -> DetectedSchema:
    """Detect if JSON matches account schema."""
    try:
        data = json.loads(content.decode("utf-8"))
    except Exception as exc:
        return DetectedSchema(
            filename=filename,
            file_type="unknown",
            warnings=[f"Failed to parse JSON: {exc}"],
        )

    if not isinstance(data, dict):
        return DetectedSchema(
            filename=filename,
            file_type="unknown",
            warnings=["JSON is not a top-level object"],
        )

    actual_keys = set(data.keys())
    matched = sorted(actual_keys & ACCOUNT_JSON_KEYS)
    missing = sorted(ACCOUNT_JSON_KEYS - actual_keys)

    if len(missing) == 0:
        return DetectedSchema(
            filename=filename,
            file_type="account_json",
            matched_columns=matched,
            missing_columns=[],
            warnings=[],
        )

    return DetectedSchema(
        filename=filename,
        file_type="unknown",
        matched_columns=matched,
        missing_columns=missing,
        warnings=[f"JSON missing required keys: {missing}"],
    )


def detect_schema(filename: str, content: bytes) -> DetectedSchema:
    """Detect the schema type of a single file from its raw bytes."""
    stripped = filename.strip().lower()
    if stripped.endswith(".json"):
        return _detect_json(filename, content)
    elif stripped.endswith(".csv"):
        return _detect_csv(filename, content)
    else:
        # Try JSON first, then CSV
        try:
            result = _detect_json(filename, content)
            if result.file_type != "unknown":
                return result
        except Exception:
            pass
        return _detect_csv(filename, content)


def detect_all(files: dict[str, bytes]) -> list[DetectedSchema]:
    """
    Detect schema types for a dict of filename -> raw bytes.

    Returns a list of DetectedSchema (one per file), in the same
    order as the input dict.
    """
    results: list[DetectedSchema] = []
    for filename, content in files.items():
        results.append(detect_schema(filename, content))
    return results
