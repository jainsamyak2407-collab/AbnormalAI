"""
Pytest configuration and shared fixtures for the analytics test suite.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# Path to the sample data directory (relative to the repo root)
_SAMPLE_DIR = Path(__file__).resolve().parents[2] / "data" / "sample"


@pytest.fixture(scope="session")
def sample_data() -> dict[str, bytes]:
    """
    Load all files from data/sample/ as raw bytes, keyed by filename.

    Returns
    -------
    dict[str, bytes]
        Mapping of filename (e.g. "account.json", "threat_log.csv") -> file bytes.
    """
    files: dict[str, bytes] = {}
    for path in sorted(_SAMPLE_DIR.iterdir()):
        if path.is_file() and path.suffix in {".csv", ".json"}:
            files[path.name] = path.read_bytes()
    return files


@pytest.fixture(scope="session")
def sample_account() -> dict:
    """Load and parse account.json from sample data."""
    account_path = _SAMPLE_DIR / "account.json"
    return json.loads(account_path.read_text(encoding="utf-8"))
