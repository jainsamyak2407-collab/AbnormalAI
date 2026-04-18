import logging
from typing import Optional

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, ValidationError

from ai import stage3_writer
from ai.client import get_async_client
from ai.prompt_utils import load_prompt, fill_template
from analytics.evidence_index import EvidenceIndex, EvidenceRecord as EvidenceDataclass
from models import Brief, EvidenceResponse, BreakdownSegment
from store import store

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_evidence_response(record: EvidenceDataclass) -> EvidenceResponse:
    """Convert an EvidenceRecord dataclass into a typed EvidenceResponse."""
    mt = record.metric_type

    if mt == "criteria_table":
        return EvidenceResponse(
            evidence_id=record.evidence_id,
            metric_label=record.metric_name,
            metric_type="criteria_table",
            calculation_description=record.calculation,
            source_row_count=record.source_row_count,
            criteria_rows=record.source_rows,
        )

    if mt == "row_list":
        return EvidenceResponse(
            evidence_id=record.evidence_id,
            metric_label=record.metric_name,
            metric_type="row_list",
            calculation_description=record.calculation,
            source_row_count=record.source_row_count,
            rows=record.source_rows,
        )

    if mt == "breakdown" and isinstance(record.value, dict):
        numeric_vals = {k: v for k, v in record.value.items() if isinstance(v, (int, float))}
        total = sum(numeric_vals.values())
        segments = [
            BreakdownSegment(
                label=str(k),
                value=float(v),
                share=round(v / total, 4) if total > 0 else 0.0,
            )
            for k, v in numeric_vals.items()
        ]
        return EvidenceResponse(
            evidence_id=record.evidence_id,
            metric_label=record.metric_name,
            metric_type="breakdown",
            calculation_description=record.calculation,
            source_row_count=record.source_row_count,
            segments=segments,
        )

    # scalar (also fallback for anything unexpected)
    raw = record.value
    if isinstance(raw, (int, float)):
        scalar_val = raw
    elif isinstance(raw, str):
        scalar_val = raw
    else:
        scalar_val = str(raw)

    return EvidenceResponse(
        evidence_id=record.evidence_id,
        metric_label=record.metric_name,
        metric_type="scalar",
        calculation_description=record.calculation,
        source_row_count=record.source_row_count,
        value=scalar_val,
    )


def _get_evidence_index(brief_id: str) -> EvidenceIndex:
    """Look up the EvidenceIndex for a brief via its session."""
    brief_entry = store.get(brief_id)
    if brief_entry is None:
        raise HTTPException(status_code=404, detail="Brief not found.")
    session_id = brief_entry.get("session_id")
    if not session_id:
        raise HTTPException(status_code=404, detail="Brief has no linked session.")
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    evidence: EvidenceIndex | None = session.get("evidence")
    if evidence is None:
        raise HTTPException(status_code=404, detail="Session has no evidence index.")
    return evidence


@router.get("/evidence/{brief_id}/{evidence_id}", response_model=EvidenceResponse)
async def get_evidence(brief_id: str, evidence_id: str) -> EvidenceResponse:
    """Return a single typed evidence record from the live evidence index."""
    evidence = _get_evidence_index(brief_id)
    record = evidence.get(evidence_id)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Evidence {evidence_id} not found.")
    return _build_evidence_response(record)


@router.get("/brief/{brief_id}/evidence-index", response_model=list[EvidenceResponse])
async def get_brief_evidence_index(brief_id: str) -> list[EvidenceResponse]:
    """Return all evidence records referenced in a brief's sections (for print appendix)."""
    brief_entry = store.get(brief_id)
    if brief_entry is None:
        raise HTTPException(status_code=404, detail="Brief not found.")
    brief = brief_entry.get("brief", brief_entry)

    # Collect all unique evidence refs across sections, in document order
    seen: set[str] = set()
    ordered_refs: list[str] = []
    for section in brief.get("sections", []):
        for ref in section.get("evidence_refs", []):
            if ref not in seen:
                seen.add(ref)
                ordered_refs.append(ref)

    evidence = _get_evidence_index(brief_id)
    results: list[EvidenceResponse] = []
    for eid in ordered_refs:
        rec = evidence.get(eid)
        if rec:
            results.append(_build_evidence_response(rec))
    return results


@router.get("/brief/{brief_id}")
async def get_brief(brief_id: str) -> dict:
    """Return the stored brief JSON, validated against the Brief contract.

    Returns 500 if the stored brief is missing required fields so that callers
    know the pipeline produced an incomplete artifact rather than silently
    receiving a partial response.
    """
    brief_entry = store.get(brief_id)
    if brief_entry is None:
        raise HTTPException(status_code=404, detail="Brief not found.")
    raw = brief_entry.get("brief", brief_entry)
    try:
        validated = Brief.model_validate(raw)
        return validated.model_dump(mode="json")
    except ValidationError as exc:
        missing = [e["loc"] for e in exc.errors()]
        logger.error("Brief %s failed contract validation: %s", brief_id, missing)
        raise HTTPException(
            status_code=500,
            detail=f"Brief contract violation — missing fields: {missing}",
        )


# ---------------------------------------------------------------------------
# Helpers shared by prompt-preview and regenerate
# ---------------------------------------------------------------------------

def _resolve_pillar(brief: dict, section_id: str) -> dict:
    pillars = brief.get("outline", {}).get("pillars", [])
    for p in pillars:
        pid = p.get("pillar_id", "").lower().replace("-", "_")
        if pid == section_id or p.get("pillar_id", "") == section_id:
            return p
    raise HTTPException(status_code=404, detail=f"Section '{section_id}' not found in outline.")


def _pillar_observations(brief: dict, pillar: dict) -> list[dict]:
    observations = brief.get("observations", [])
    obs_by_id = {o.get("observation_id", ""): o for o in observations}
    obs_ids = pillar.get("observation_ids", [])
    result = [obs_by_id[oid] for oid in obs_ids if oid in obs_by_id]
    return result or observations


# ---------------------------------------------------------------------------
# Prompt preview
# ---------------------------------------------------------------------------

@router.get("/brief/{brief_id}/section/{section_id}/prompt")
async def get_section_prompt(brief_id: str, section_id: str) -> dict:
    """Return the rendered system + user prompt that would be sent to the writer for this section."""
    brief_entry = store.get(brief_id)
    if brief_entry is None:
        raise HTTPException(status_code=404, detail="Brief not found.")
    brief = brief_entry.get("brief", brief_entry)

    session_id = brief_entry.get("session_id") or brief.get("session_id")
    session = store.get(session_id) if session_id else None
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    evidence: EvidenceIndex = session["evidence"]
    pillar = _resolve_pillar(brief, section_id)
    pillar_obs = _pillar_observations(brief, pillar)

    audience = brief.get("audience", "ciso")
    prompt_file = f"writer_{audience}.md"
    system_prompt, user_template = load_prompt(prompt_file)

    evidence_for_prompt = {
        eid: {
            "metric_id": rec.metric_id,
            "metric_name": rec.metric_name,
            "value": rec.value,
            "calculation": rec.calculation,
        }
        for eid, rec in evidence.all().items()
    }

    user_message = fill_template(user_template, {
        "company_name": brief.get("company_name", ""),
        "period": brief.get("period", ""),
        "section_intent": pillar.get("section_intent", pillar.get("headline", "")),
        "observations_json": pillar_obs,
        "evidence_index_json": evidence_for_prompt,
        "exhibit_name": pillar.get("exhibit") or "none",
        "length": brief.get("length", "standard"),
    })

    return {
        "section_id": section_id,
        "system_prompt": system_prompt,
        "user_prompt": user_message,
    }


# ---------------------------------------------------------------------------
# Regenerate section
# ---------------------------------------------------------------------------

class RegenerateRequest(BaseModel):
    steering: Optional[str] = None  # optional steering note from the user


@router.post("/brief/{brief_id}/section/{section_id}/regenerate")
async def regenerate_section(
    brief_id: str,
    section_id: str,
    body: RegenerateRequest = Body(default=RegenerateRequest()),
) -> dict:
    """Rewrite one section using the stored outline + observations. Returns the updated section."""
    brief_entry = store.get(brief_id)
    if brief_entry is None:
        raise HTTPException(status_code=404, detail="Brief not found.")
    brief = brief_entry.get("brief", brief_entry)

    session_id = brief_entry.get("session_id") or brief.get("session_id")
    session = store.get(session_id) if session_id else None
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    evidence: EvidenceIndex = session["evidence"]
    pillar = _resolve_pillar(brief, section_id)
    pillar_obs = _pillar_observations(brief, pillar)

    # Inject the steering note into the section intent when provided
    if body.steering:
        pillar = {**pillar, "section_intent": f"{pillar.get('section_intent', '')} Steering note: {body.steering}"}

    client = get_async_client()
    new_section = await stage3_writer.write_one_section(
        pillar=pillar,
        observations_for_pillar=pillar_obs,
        evidence=evidence,
        audience=brief.get("audience", "ciso"),
        length=brief.get("length", "standard"),
        period=brief.get("period", ""),
        company_name=brief.get("company_name", ""),
        client=client,
    )

    # Persist the updated section back into the store
    brief["sections"] = [
        new_section if s["id"] == section_id else s
        for s in brief.get("sections", [])
    ]
    brief_entry["brief"] = brief
    store.set(brief_id, brief_entry)

    return new_section
