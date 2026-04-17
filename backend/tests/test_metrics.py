"""
Integration tests for the analytics engine against real sample data.

Assertions are aligned to the documented narrative threads:
  - VIP inbox attacks: 3 in Jan, 1 in Feb, 1 in Mar
  - User reporting rate: ~27% Jan, ~37% Feb, ~45% Mar
  - Credential submission rate rising each month
  - Auto-remediation rate: ~67.6%
  - Median MTTR: ~2.3 min
  - Posture pass rate: T-001 > T-002
  - Success criteria: user_reporting_rate_min met in March
  - ATO SOC notified rate >= 55%
"""

from __future__ import annotations

import pytest

from ingest.schema_detector import detect_all, DetectedSchema
from ingest.validator import validate_and_parse
from analytics.evidence_index import EvidenceIndex
from analytics.benchmarks import load_benchmarks
from analytics.metrics import compute_all, MetricsBundle
from analytics.anomalies import detect_anomalies
from analytics.trends import compute_trends
from analytics.tenant_drift import compute_tenant_drift


# ---------------------------------------------------------------------------
# Fixtures: build the full pipeline from sample data once per session
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def detected(sample_data):
    """Run schema detection on all sample files."""
    return detect_all(sample_data)


@pytest.fixture(scope="session")
def parsed_dfs(sample_data, detected):
    """Validate and parse all sample files into DataFrames."""
    return validate_and_parse(sample_data, detected)


@pytest.fixture(scope="session")
def metrics_bundle(parsed_dfs, sample_account) -> MetricsBundle:
    """Run compute_all and return the MetricsBundle."""
    evidence = EvidenceIndex()
    bench_df = parsed_dfs.get("industry_benchmarks")
    benchmarks = load_benchmarks(bench_df)
    return compute_all(parsed_dfs, sample_account, benchmarks, evidence)


@pytest.fixture(scope="session")
def evidence_index(parsed_dfs, sample_account) -> EvidenceIndex:
    """Return a populated EvidenceIndex (runs compute_all)."""
    evidence = EvidenceIndex()
    bench_df = parsed_dfs.get("industry_benchmarks")
    benchmarks = load_benchmarks(bench_df)
    compute_all(parsed_dfs, sample_account, benchmarks, evidence)
    return evidence


# ---------------------------------------------------------------------------
# Schema detection tests
# ---------------------------------------------------------------------------

class TestSchemaDetection:
    def test_threat_log_detected(self, detected):
        types = {d.filename: d.file_type for d in detected}
        assert types.get("threat_log.csv") == "threat_log"

    def test_posture_checks_detected(self, detected):
        types = {d.filename: d.file_type for d in detected}
        assert types.get("posture_checks.csv") == "posture_checks"

    def test_remediation_log_detected(self, detected):
        types = {d.filename: d.file_type for d in detected}
        assert types.get("remediation_log.csv") == "remediation_log"

    def test_user_reporting_detected(self, detected):
        types = {d.filename: d.file_type for d in detected}
        assert types.get("user_reporting.csv") == "user_reporting"

    def test_ato_events_detected(self, detected):
        types = {d.filename: d.file_type for d in detected}
        assert types.get("ato_events.csv") == "ato_events"

    def test_industry_benchmarks_detected(self, detected):
        types = {d.filename: d.file_type for d in detected}
        assert types.get("industry_benchmarks.csv") == "industry_benchmarks"

    def test_account_json_detected(self, detected):
        types = {d.filename: d.file_type for d in detected}
        assert types.get("account.json") == "account_json"

    def test_no_unknown_files(self, detected):
        unknowns = [d.filename for d in detected if d.file_type == "unknown"]
        assert unknowns == [], f"Unexpected unknown files: {unknowns}"


# ---------------------------------------------------------------------------
# Validator / parsing tests
# ---------------------------------------------------------------------------

class TestParsing:
    def test_threat_log_loaded(self, parsed_dfs):
        assert "threat_log" in parsed_dfs
        df = parsed_dfs["threat_log"]
        assert len(df) == 62

    def test_threat_log_is_vip_bool(self, parsed_dfs):
        import pandas as pd
        df = parsed_dfs["threat_log"]
        assert "is_vip" in df.columns
        # Should have been coerced to bool/BooleanDtype
        assert df["is_vip"].dtype.name in ("bool", "boolean")

    def test_threat_log_timestamp_parsed(self, parsed_dfs):
        import pandas as pd
        df = parsed_dfs["threat_log"]
        assert pd.api.types.is_datetime64_any_dtype(df["timestamp"])

    def test_remediation_log_loaded(self, parsed_dfs):
        assert "remediation_log" in parsed_dfs
        assert len(parsed_dfs["remediation_log"]) == 62

    def test_user_reporting_loaded(self, parsed_dfs):
        assert "user_reporting" in parsed_dfs
        assert len(parsed_dfs["user_reporting"]) == 39

    def test_posture_checks_loaded(self, parsed_dfs):
        assert "posture_checks" in parsed_dfs
        assert len(parsed_dfs["posture_checks"]) == 157

    def test_ato_events_loaded(self, parsed_dfs):
        assert "ato_events" in parsed_dfs
        assert len(parsed_dfs["ato_events"]) == 37

    def test_industry_benchmarks_loaded(self, parsed_dfs):
        assert "industry_benchmarks" in parsed_dfs
        assert len(parsed_dfs["industry_benchmarks"]) == 33


# ---------------------------------------------------------------------------
# Core metrics: VIP inbox attacks
# ---------------------------------------------------------------------------

class TestVIPAttacks:
    def test_vip_january_count(self, metrics_bundle):
        """3 VIP inbox attacks in January."""
        assert metrics_bundle.vip_inbox_attacks_by_month.get("January") == 3

    def test_vip_february_count(self, metrics_bundle):
        """1 VIP inbox attack in February."""
        assert metrics_bundle.vip_inbox_attacks_by_month.get("February") == 1

    def test_vip_march_count(self, metrics_bundle):
        """1 VIP inbox attack in March."""
        assert metrics_bundle.vip_inbox_attacks_by_month.get("March") == 1

    def test_vip_total(self, metrics_bundle):
        """Total VIP attacks = 5 (3+1+1)."""
        assert metrics_bundle.vip_inbox_attacks == 5


# ---------------------------------------------------------------------------
# Core metrics: User reporting rate
# ---------------------------------------------------------------------------

class TestUserReportingRate:
    def test_january_reporting_rate(self, metrics_bundle):
        """January reporting rate ~27% (26-30%)."""
        rate = metrics_bundle.reporting_rate_by_month.get("January", 0)
        assert 0.26 <= rate <= 0.30, f"Expected 26-30%, got {rate * 100:.2f}%"

    def test_february_reporting_rate(self, metrics_bundle):
        """February reporting rate ~37% (35-40%)."""
        rate = metrics_bundle.reporting_rate_by_month.get("February", 0)
        assert 0.35 <= rate <= 0.40, f"Expected 35-40%, got {rate * 100:.2f}%"

    def test_march_reporting_rate(self, metrics_bundle):
        """March reporting rate ~45% (43-48%)."""
        rate = metrics_bundle.reporting_rate_by_month.get("March", 0)
        assert 0.43 <= rate <= 0.48, f"Expected 43-48%, got {rate * 100:.2f}%"

    def test_reporting_rate_trending_up(self, metrics_bundle):
        """Reporting rate increases each month."""
        jan = metrics_bundle.reporting_rate_by_month.get("January", 0)
        feb = metrics_bundle.reporting_rate_by_month.get("February", 0)
        mar = metrics_bundle.reporting_rate_by_month.get("March", 0)
        assert jan < feb < mar

    def test_legal_dept_low_reporting(self, metrics_bundle):
        """Legal department has a notably low reporting rate (~19.7%)."""
        legal_rate = metrics_bundle.reporting_rate_by_department.get("Legal", 1.0)
        assert legal_rate < 0.25, f"Legal rate should be below 25%, got {legal_rate * 100:.1f}%"

    def test_legal_in_low_reporting_departments(self, metrics_bundle):
        """Legal department should appear in low_reporting_departments list."""
        assert "Legal" in metrics_bundle.low_reporting_departments


# ---------------------------------------------------------------------------
# Core metrics: Credential submission rate
# ---------------------------------------------------------------------------

class TestCredentialSubmissionRate:
    def test_january_cred_sub_rate(self, metrics_bundle):
        """January credential submission rate ~2.1%."""
        rate = metrics_bundle.credential_submission_rate_by_month.get("January", 0)
        assert 0.015 <= rate <= 0.030, f"Expected ~2.1%, got {rate * 100:.2f}%"

    def test_february_cred_sub_rate(self, metrics_bundle):
        """February credential submission rate ~4.0%."""
        rate = metrics_bundle.credential_submission_rate_by_month.get("February", 0)
        assert 0.030 <= rate <= 0.055, f"Expected ~4.0%, got {rate * 100:.2f}%"

    def test_march_cred_sub_rate(self, metrics_bundle):
        """March credential submission rate ~6.4%."""
        rate = metrics_bundle.credential_submission_rate_by_month.get("March", 0)
        assert 0.055 <= rate <= 0.080, f"Expected ~6.4%, got {rate * 100:.2f}%"

    def test_cred_sub_rate_trending_up(self, metrics_bundle):
        """Credential submission rate rises each month (growing concern)."""
        jan = metrics_bundle.credential_submission_rate_by_month.get("January", 0)
        feb = metrics_bundle.credential_submission_rate_by_month.get("February", 0)
        mar = metrics_bundle.credential_submission_rate_by_month.get("March", 0)
        assert jan < feb < mar


# ---------------------------------------------------------------------------
# Core metrics: Auto-remediation rate and MTTR
# ---------------------------------------------------------------------------

class TestRemediationMetrics:
    def test_auto_remediation_rate_range(self, metrics_bundle):
        """Auto-remediation rate ~67.6% (60-72%)."""
        rate = metrics_bundle.auto_remediation_rate
        assert 60 <= rate <= 72, f"Expected 60-72%, got {rate:.2f}%"

    def test_median_mttr_range(self, metrics_bundle):
        """Median MTTR ~2.3 min (2.0-2.7 min)."""
        mttr = metrics_bundle.median_mttr_minutes
        assert 2.0 <= mttr <= 2.7, f"Expected 2.0-2.7 min, got {mttr:.2f} min"

    def test_mttr_beats_p75_benchmark(self, metrics_bundle):
        """Median MTTR of ~2.3 min beats industry p75 of 7.4 min."""
        mttr = metrics_bundle.median_mttr_minutes
        assert mttr < 7.4, f"MTTR {mttr} should beat p75 benchmark of 7.4 min"

    def test_manual_remediation_count_positive(self, metrics_bundle):
        """Some manual remediations exist (not fully automated)."""
        assert metrics_bundle.manual_remediation_count > 0


# ---------------------------------------------------------------------------
# Core metrics: Posture checks
# ---------------------------------------------------------------------------

class TestPostureMetrics:
    def test_t001_pass_rate_higher_than_t002(self, metrics_bundle):
        """T-001 posture pass rate > T-002 posture pass rate."""
        t001 = metrics_bundle.posture_pass_rate_by_tenant.get("T-001", 0)
        t002 = metrics_bundle.posture_pass_rate_by_tenant.get("T-002", 0)
        assert t001 > t002, (
            f"T-001 ({t001 * 100:.1f}%) should exceed T-002 ({t002 * 100:.1f}%)"
        )

    def test_t001_pass_rate_near_79pct(self, metrics_bundle):
        """T-001 posture pass rate ~79.8%."""
        t001 = metrics_bundle.posture_pass_rate_by_tenant.get("T-001", 0)
        assert 0.75 <= t001 <= 0.85, f"T-001 pass rate expected ~79.8%, got {t001 * 100:.1f}%"

    def test_t002_pass_rate_near_72pct(self, metrics_bundle):
        """T-002 posture pass rate ~72.1%."""
        t002 = metrics_bundle.posture_pass_rate_by_tenant.get("T-002", 0)
        assert 0.67 <= t002 <= 0.77, f"T-002 pass rate expected ~72.1%, got {t002 * 100:.1f}%"

    def test_mfa_enforcement_failures_exist(self, metrics_bundle):
        """MFA enforcement failures should be detected (persistent failing checks)."""
        assert len(metrics_bundle.mfa_enforcement_failures) > 0

    def test_mfa_failures_on_t001(self, metrics_bundle):
        """MFA enforcement failures should include T-001 checks."""
        tenant_ids = {f.get("tenant_id") for f in metrics_bundle.mfa_enforcement_failures}
        assert "T-001" in tenant_ids

    def test_critical_unresolved_checks_exist(self, metrics_bundle):
        """Critical unresolved checks should be present."""
        assert len(metrics_bundle.critical_unresolved_checks) > 0


# ---------------------------------------------------------------------------
# Core metrics: ATO events
# ---------------------------------------------------------------------------

class TestATOMetrics:
    def test_ato_soc_notified_rate(self, metrics_bundle):
        """SOC notified rate >= 55% (target ~62%)."""
        assert metrics_bundle.ato_soc_notified_rate >= 55, (
            f"SOC notified rate expected >= 55%, got {metrics_bundle.ato_soc_notified_rate:.1f}%"
        )

    def test_ato_risk_trending_up(self, metrics_bundle):
        """ATO mean risk score increases month over month."""
        jan = metrics_bundle.ato_mean_risk_by_month.get("January", 0)
        feb = metrics_bundle.ato_mean_risk_by_month.get("February", 0)
        mar = metrics_bundle.ato_mean_risk_by_month.get("March", 0)
        assert jan < feb < mar, (
            f"Risk scores should trend up: Jan={jan:.1f}, Feb={feb:.1f}, Mar={mar:.1f}"
        )

    def test_ato_jan_risk_near_62(self, metrics_bundle):
        """January mean ATO risk score ~62."""
        jan = metrics_bundle.ato_mean_risk_by_month.get("January", 0)
        assert 58 <= jan <= 66, f"Jan ATO risk expected ~62, got {jan:.2f}"

    def test_ato_count_positive_all_months(self, metrics_bundle):
        """ATO events present in all 3 months."""
        for month in ["January", "February", "March"]:
            assert metrics_bundle.ato_count_by_month.get(month, 0) > 0


# ---------------------------------------------------------------------------
# Cross-metric: Success criteria evaluation
# ---------------------------------------------------------------------------

class TestSuccessCriteria:
    def test_user_reporting_rate_min_met(self, metrics_bundle):
        """March reporting rate crosses the 40% success criterion."""
        assert metrics_bundle.success_criteria_status["user_reporting_rate_min"]["met"] is True

    def test_auto_remediation_rate_not_met(self, metrics_bundle):
        """Auto-remediation rate ~67.6% does NOT meet the 75% target."""
        assert metrics_bundle.success_criteria_status["auto_remediation_rate_min"]["met"] is False

    def test_mttr_criterion_met(self, metrics_bundle):
        """Median MTTR ~2.3 min meets the <= 10 min target."""
        assert metrics_bundle.success_criteria_status["mttr_minutes_max"]["met"] is True

    def test_vip_attacks_not_met(self, metrics_bundle):
        """Max monthly VIP attacks = 3 (Jan), exceeds criterion of 1 per month."""
        assert metrics_bundle.success_criteria_status["vip_inbox_attacks_per_month_max"]["met"] is False


# ---------------------------------------------------------------------------
# Evidence index
# ---------------------------------------------------------------------------

class TestEvidenceIndex:
    def test_evidence_registered(self, evidence_index):
        """Evidence index should have entries after compute_all."""
        assert len(evidence_index.all()) > 0

    def test_evidence_ids_incremental(self, evidence_index):
        """Evidence IDs should be E1, E2, ... in sequence."""
        all_ids = list(evidence_index.all().keys())
        assert all_ids[0] == "E1"
        assert all_ids[-1] == f"E{len(all_ids)}"

    def test_evidence_get(self, evidence_index):
        """Can retrieve evidence record by ID."""
        rec = evidence_index.get("E1")
        assert rec is not None
        assert rec.evidence_id == "E1"
        assert rec.metric_id != ""

    def test_evidence_source_rows_capped(self, evidence_index):
        """Source rows never exceed 50 entries."""
        for rec in evidence_index.all().values():
            assert len(rec.source_rows) <= 50

    def test_evidence_to_dict(self, evidence_index):
        """to_dict() returns serialisable structure."""
        d = evidence_index.to_dict()
        assert isinstance(d, dict)
        first = next(iter(d.values()))
        assert "evidence_id" in first
        assert "value" in first
        assert "calculation" in first


# ---------------------------------------------------------------------------
# Anomaly detection
# ---------------------------------------------------------------------------

class TestAnomalyDetection:
    @pytest.fixture(scope="class")
    def anomalies(self, metrics_bundle, sample_account):
        return detect_anomalies(metrics_bundle, sample_account)

    def test_anomalies_detected(self, anomalies):
        """At least some anomalies should be detected from sample data."""
        assert len(anomalies) > 0

    def test_critical_anomaly_for_vip_attacks(self, anomalies):
        """VIP attack exceeding target should trigger critical anomaly."""
        rules = [a.rule for a in anomalies]
        assert "vip_attack_exceeds_target" in rules

    def test_anomaly_for_mfa_persistent_failure(self, anomalies):
        """MFA persistent failure should trigger an anomaly."""
        rules = [a.rule for a in anomalies]
        assert "mfa_enforcement_persistent_failure" in rules

    def test_anomaly_for_cred_sub_trending_up(self, anomalies):
        """Credential submission trend should trigger an anomaly."""
        rules = [a.rule for a in anomalies]
        assert "credential_submission_trending_up" in rules

    def test_anomaly_for_tenant_posture_gap(self, anomalies):
        """Tenant posture gap should trigger an anomaly."""
        rules = [a.rule for a in anomalies]
        assert "tenant_posture_gap" in rules

    def test_anomaly_severities_valid(self, anomalies):
        """All anomaly severities are valid values."""
        valid = {"critical", "warning", "info"}
        for a in anomalies:
            assert a.severity in valid, f"Invalid severity '{a.severity}' in anomaly {a.anomaly_id}"

    def test_anomaly_ids_unique(self, anomalies):
        """All anomaly IDs are unique."""
        ids = [a.anomaly_id for a in anomalies]
        assert len(ids) == len(set(ids))


# ---------------------------------------------------------------------------
# Trends
# ---------------------------------------------------------------------------

class TestTrends:
    @pytest.fixture(scope="class")
    def trends(self, metrics_bundle):
        return compute_trends(metrics_bundle)

    def test_vip_trends_exist(self, trends):
        assert len(trends.vip_attacks) == 3

    def test_reporting_rate_trend_up(self, trends):
        """Reporting rate trend shows 'up' direction in Feb and Mar."""
        directions = [p.direction for p in trends.reporting_rate[1:]]
        assert all(d == "up" for d in directions)

    def test_cred_sub_rate_trend_up(self, trends):
        """Credential submission rate trends up each month."""
        directions = [p.direction for p in trends.credential_submission_rate[1:]]
        assert all(d == "up" for d in directions)

    def test_ato_risk_trend_up(self, trends):
        """ATO risk score trends up each month."""
        directions = [p.direction for p in trends.ato_risk_score[1:]]
        assert all(d == "up" for d in directions)

    def test_first_month_no_delta(self, trends):
        """First month in each trend series has no delta."""
        for series in [
            trends.vip_attacks,
            trends.reporting_rate,
            trends.credential_submission_rate,
        ]:
            if series:
                assert series[0].delta_abs is None


# ---------------------------------------------------------------------------
# Tenant drift
# ---------------------------------------------------------------------------

class TestTenantDrift:
    @pytest.fixture(scope="class")
    def drift(self, metrics_bundle, parsed_dfs):
        return compute_tenant_drift(metrics_bundle, parsed_dfs)

    def test_posture_drift_detected(self, drift):
        """Posture pass rate gap between T-001 and T-002 should be flagged."""
        posture_comp = next(
            (c for c in drift.comparisons if c.metric == "posture_pass_rate"),
            None
        )
        assert posture_comp is not None
        assert posture_comp.drifting is True

    def test_drift_bundle_has_summary(self, drift):
        assert isinstance(drift.summary, str)
        assert len(drift.summary) > 0

    def test_has_significant_drift(self, drift):
        assert drift.has_significant_drift is True

    def test_worse_tenant_is_t002(self, drift):
        """T-002 should be the worse tenant for posture pass rate."""
        posture_comp = next(
            (c for c in drift.comparisons if c.metric == "posture_pass_rate"),
            None
        )
        assert posture_comp is not None
        assert posture_comp.worse_tenant == "T-002"
