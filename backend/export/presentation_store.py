"""
In-memory store for Presentation objects and their rendered chart PNGs.
Survives only for the lifetime of the server process — same pattern as store.py.
"""

from __future__ import annotations

from typing import Any


class PresentationStore:
    def __init__(self) -> None:
        self._presentations: dict[str, Any] = {}    # presentation_id -> Presentation
        self._chart_pngs: dict[str, dict[int, bytes]] = {}  # presentation_id -> {slide_number -> png_bytes}

    # ---- Presentation CRUD ----

    def save(self, presentation: Any) -> None:
        self._presentations[presentation.presentation_id] = presentation

    def get(self, presentation_id: str) -> Any | None:
        return self._presentations.get(presentation_id)

    def exists(self, presentation_id: str) -> bool:
        return presentation_id in self._presentations

    def delete(self, presentation_id: str) -> None:
        self._presentations.pop(presentation_id, None)
        self._chart_pngs.pop(presentation_id, None)

    # ---- Chart PNG cache ----

    def save_charts(self, presentation_id: str, charts: dict[int, bytes]) -> None:
        self._chart_pngs[presentation_id] = charts

    def get_charts(self, presentation_id: str) -> dict[int, bytes]:
        return self._chart_pngs.get(presentation_id, {})

    def update_slide_chart(self, presentation_id: str, slide_number: int, png: bytes) -> None:
        if presentation_id not in self._chart_pngs:
            self._chart_pngs[presentation_id] = {}
        self._chart_pngs[presentation_id][slide_number] = png


presentation_store = PresentationStore()
