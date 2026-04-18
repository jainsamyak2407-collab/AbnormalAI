"""
Integration test: generate a CISO and CSM brief from Meridian sample data and
assert every field in the Brief contract (Part 2 of spec) is populated.

Requires ANTHROPIC_API_KEY.  Run with:
    pytest backend/tests/test_brief_contract.py -v --run-integration
"""
from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest

from models import (
    Brief, BriefMetadata, ThesisBlock, ExecutiveSummaryItem,
    Section, Exhibit, Recommendation, RiskItem, Closing, BriefEvidenceRecord,
)

# Mark so normal CI skips unless explicitly opted in
pytestmark = pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set; skipping integration test",
)

SAMPLE_DIR = Path(__file__).parent.parent.parent / "data" / "sample"


def _run_pipeline(audience: str) -> dict:
    """Run the full ingest + generate pipeline synchronously and return the brief dict."""
    import asyncio
    from ingest.schema_detector import detect_schemas
    from ingest.validator import parse_files
    from analytics.metrics import compute_all
    from analytics.evidence_index import EvidenceIndex
    from analytics.benchmarks import BenchmarkLookup
    from analytics.anomalies import detect_anomalies
    from analytics.trends import compute_trends
    from analytics.tenant_drift import compute_tenant_drift
    from ai.orchestrator import run_pipeline
    from models import GenerateRequest

    # Load sample files
    sample_files = list(SAMPLE_DIR.glob("*.csv")) + list(SAMPLE_DIR.glob("*.json"))
    schemas = detect_schemas(sample_files)
    dfs, account = parse_files(sample_files, schemas)

    benchmarks = BenchmarkLookup(SAMPLE_DIR / "industry_benchmarks.csv")
    evidence = EvidenceIndex()
    metrics = compute_all(dfs, account, benchmarks, evidence)
    anomalies = detect_anomalies(metrics, account)
    trends = compute_trends(metrics)
    tenant_drift = compute_tenant_drift(metrics, dfs)

    session = {
        "metrics": metrics,
        "evidence": evidence,
        "account": account,
        "anomalies": anomalies,
        "trends": trends,
        "tenant_drift": tenant_drift,
        "dfs": dfs,
    }

    request = GenerateRequest(
        session_id="test-session",
        audience=audience,
        emphasis="balanced",
        length="standard",
    )
    brief_id = str(uuid.uuid4())
    brief_dict: dict = {}

    async def collect():
        nonlocal brief_dict
        async for event_str in run_pipeline(brief_id, request, session):
            import json
            if event_str.startswith("data: "):
                evt = json.loads(event_str[6:])
                if evt.get("type") == "_brief_payload":
                    brief_dict = evt["brief"]

    asyncio.run(collect())
    return brief_dict


class TestBriefContractCISO:
    @pytest.fixture(scope="class")
    def brief(self):
        raw = _run_pipeline("ciso")
        return Brief.model_validate(raw)

    def test_metadata_populated(self, brief: Brief):
        m = brief.metadata
        assert m.customer_name, "metadata.customer_name is empty"
        assert m.period.label, "metadata.period.label is empty"
        assert m.audience == "ciso"
        assert m.emphasis in ("risk", "balanced", "value")
        assert m.prepared_by
        assert m.prepared_for
        assert m.generated_at

    def test_thesis_has_sentence_and_evidence(self, brief: Brief):
        assert brief.thesis.sentence, "thesis.sentence is empty"
        assert len(brief.thesis.evidence_refs) >= 1, "thesis has no evidence_refs"

    def test_executive_summary_has_three_bullets(self, brief: Brief):
        assert len(brief.executive_summary) == 3, (
            f"executive_summary has {len(brief.executive_summary)} bullets; expected 3"
        )
        for item in brief.executive_summary:
            assert item.bullet, "exec summary bullet is empty"
            assert len(item.evidence_refs) >= 1, f"exec summary bullet has no evidence_refs: {item.bullet}"

    def test_sections_populated(self, brief: Brief):
        assert len(brief.sections) >= 3, f"only {len(brief.sections)} sections; expected >= 3"
        for s in brief.sections:
            assert s.headline, f"section {s.section_id} has no headline"
            assert s.prose_inline, f"section {s.section_id} has no prose_inline"
            assert s.prose_print, f"section {s.section_id} has no prose_print"
            assert s.so_what, f"section {s.section_id} has no so_what"
            assert s.order >= 1, f"section {s.section_id} has invalid order"

    def test_exhibits_populated(self, brief: Brief):
        assert len(brief.exhibits) >= 2, f"only {len(brief.exhibits)} exhibits"
        for ex in brief.exhibits:
            assert ex.title, f"exhibit {ex.exhibit_id} has no title"
            assert ex.caption, f"exhibit {ex.exhibit_id} has no caption"
            assert ex.data, f"exhibit {ex.exhibit_id} has empty data"
            assert ex.type in ("trend_line", "benchmark_bars", "department_bars", "vip_cards", "criteria_scorecard")

    def test_recommendations_populated(self, brief: Brief):
        assert 3 <= len(brief.recommendations) <= 5
        for r in brief.recommendations:
            assert r.headline, f"rec {r.rec_id} has no headline"
            assert r.expected_impact, f"rec {r.rec_id} has no expected_impact"
            assert r.rationale, f"rec {r.rec_id} has no rationale"
            assert r.evidence_refs, f"rec {r.rec_id} has no evidence_refs"
            assert r.risk_if_unaddressed, f"rec {r.rec_id} has no risk_if_unaddressed"
            assert r.kind in ("POLICY", "BUDGET", "HEADCOUNT", "EXPANSION", "TRAINING", "RENEWAL")

    def test_closing_populated(self, brief: Brief):
        assert brief.closing.ask, "closing.ask is empty"

    def test_evidence_index_populated(self, brief: Brief):
        assert len(brief.evidence_index) >= 5, "evidence_index has fewer than 5 entries"
        for eid, rec in brief.evidence_index.items():
            assert rec.metric_label, f"evidence {eid} has no metric_label"
            assert rec.calculation_description, f"evidence {eid} has no calculation_description"
            assert rec.metric_type in ("scalar", "criteria_table", "row_list", "breakdown", "timeseries")

    def test_evidence_chips_resolve(self, brief: Brief):
        """Every [E{n}] token in every section prose must resolve in evidence_index."""
        import re
        chip_re = re.compile(r"\[E(\d+)\]")
        for s in brief.sections:
            for match in chip_re.finditer(s.prose_inline):
                eid = f"E{match.group(1)}"
                assert eid in brief.evidence_index, (
                    f"section {s.section_id} references {eid} which is not in evidence_index"
                )

    def test_ciso_framing(self, brief: Brief):
        """CISO briefs should have BUDGET/POLICY/HEADCOUNT recommendations, not EXPANSION/RENEWAL."""
        kinds = {r.kind for r in brief.recommendations}
        assert kinds & {"BUDGET", "POLICY", "HEADCOUNT", "TRAINING"}, (
            f"CISO brief has no BUDGET/POLICY/HEADCOUNT recs: {kinds}"
        )


class TestBriefContractCSM:
    @pytest.fixture(scope="class")
    def brief(self):
        raw = _run_pipeline("csm")
        return Brief.model_validate(raw)

    def test_metadata_audience(self, brief: Brief):
        assert brief.metadata.audience == "csm"

    def test_csm_framing(self, brief: Brief):
        """CSM briefs should have EXPANSION/RENEWAL recommendations."""
        kinds = {r.kind for r in brief.recommendations}
        assert kinds & {"EXPANSION", "RENEWAL"}, (
            f"CSM brief has no EXPANSION/RENEWAL recs: {kinds}"
        )

    def test_sections_populated(self, brief: Brief):
        assert len(brief.sections) >= 3

    def test_evidence_chips_resolve(self, brief: Brief):
        import re
        chip_re = re.compile(r"\[E(\d+)\]")
        for s in brief.sections:
            for match in chip_re.finditer(s.prose_inline):
                eid = f"E{match.group(1)}"
                assert eid in brief.evidence_index, (
                    f"section {s.section_id} references {eid} not in evidence_index"
                )
