from fastapi import APIRouter, HTTPException

from models import EvidenceRecord
from store import store

router = APIRouter()


@router.get("/evidence/{brief_id}/{evidence_id}", response_model=EvidenceRecord)
async def get_evidence(brief_id: str, evidence_id: str) -> EvidenceRecord:
    """Stub: returns a placeholder evidence record. Phase 1 will populate the evidence index."""
    brief = store.get(brief_id)
    if brief is None:
        raise HTTPException(status_code=404, detail="Brief not found.")

    # TODO: look up real evidence index in Phase 1
    return EvidenceRecord(
        evidence_id=evidence_id,
        metric_name="stub_metric",
        value=0.0,
        calculation="Stub — analytics engine not yet wired.",
        source_row_count=0,
        source_rows=[],
    )


@router.get("/brief/{brief_id}")
async def get_brief(brief_id: str) -> dict:
    """Return the stored brief JSON."""
    brief = store.get(brief_id)
    if brief is None:
        raise HTTPException(status_code=404, detail="Brief not found.")
    return brief


@router.post("/brief/{brief_id}/section/{section_id}/regenerate")
async def regenerate_section(brief_id: str, section_id: str) -> dict:
    """Stub: section regeneration. Phase 4 will wire the AI rewrite."""
    brief = store.get(brief_id)
    if brief is None:
        raise HTTPException(status_code=404, detail="Brief not found.")
    return {"status": "stub", "section_id": section_id, "message": "Regeneration not yet implemented."}
