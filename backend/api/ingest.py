import json
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from analytics.anomalies import detect_anomalies
from analytics.benchmarks import load_benchmarks
from analytics.evidence_index import EvidenceIndex
from analytics.metrics import compute_all
from analytics.tenant_drift import compute_tenant_drift
from analytics.trends import compute_trends
from ingest.schema_detector import detect_all
from ingest.validator import validate_and_parse
from models import IngestResponse
from store import store

router = APIRouter()

SAMPLE_DIR = Path(__file__).parent.parent.parent / "data" / "sample"


def _load_sample_files() -> dict[str, bytes]:
    """Load all files from the sample data directory."""
    files: dict[str, bytes] = {}
    for path in sorted(SAMPLE_DIR.iterdir()):
        if path.suffix in {".csv", ".json"}:
            files[path.name] = path.read_bytes()
    return files


def _run_pipeline(raw_files: dict[str, bytes]) -> dict:
    """
    Run schema detection, validation, analytics, anomalies, trends, and tenant drift.
    Returns a session payload dict ready to store.
    """
    # Schema detection
    detected = detect_all(raw_files)

    warnings: list[str] = []
    detected_schemas: list[str] = []
    for det in detected:
        if det.file_type != "unknown":
            detected_schemas.append(det.file_type)
        for w in det.warnings:
            warnings.append(f"[{det.filename}] {w}")

    # Parse account.json
    account: dict = {}
    for filename, content in raw_files.items():
        if filename.endswith(".json"):
            try:
                account = json.loads(content.decode("utf-8"))
            except Exception:
                warnings.append(f"[{filename}] Failed to parse account JSON.")
    if not account:
        raise HTTPException(
            status_code=422,
            detail="account.json is required. Include it with your CSV uploads."
        )

    # Validate + parse CSVs into DataFrames
    dfs = validate_and_parse(raw_files, detected)

    bench_df = dfs.get("industry_benchmarks")
    if bench_df is None or bench_df.empty:
        raise HTTPException(status_code=422, detail="industry_benchmarks.csv is required.")
    benchmarks = load_benchmarks(bench_df)

    # Core analytics
    evidence = EvidenceIndex()
    metrics = compute_all(dfs, account, benchmarks, evidence)

    # Extended analytics
    anomalies = detect_anomalies(metrics, account)
    trends = compute_trends(metrics)
    tenant_drift = compute_tenant_drift(metrics, dfs)

    period_detected: str | None = account.get("period_label")

    return {
        "account": account,
        "dfs": dfs,
        "metrics": metrics,
        "evidence": evidence,
        "anomalies": anomalies,
        "trends": trends,
        "tenant_drift": tenant_drift,
        "detected_schemas": detected_schemas,
        "warnings": warnings,
        "period_detected": period_detected,
    }


@router.post("/ingest", response_model=IngestResponse)
async def ingest(
    files: list[UploadFile] = File(default=[]),
    sample: bool = Form(default=False),
) -> IngestResponse:
    """Accept uploaded files or load sample data. Runs full analytics pipeline."""
    session_id = str(uuid.uuid4())

    if sample:
        raw_files = _load_sample_files()
    else:
        if not files:
            raise HTTPException(status_code=422, detail="Provide files or set sample=true.")
        raw_files = {}
        for f in files:
            content = await f.read()
            raw_files[f.filename or f"file_{len(raw_files)}"] = content

    session = _run_pipeline(raw_files)
    store.set(session_id, session)

    return IngestResponse(
        session_id=session_id,
        detected_schemas=session["detected_schemas"],
        warnings=session["warnings"],
        period_detected=session["period_detected"],
    )
