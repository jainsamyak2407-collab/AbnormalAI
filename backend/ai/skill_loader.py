"""
Loads skill files and injects them into prompt system messages.
Skills live in /backend/skills/{skill_name}/SKILL.md.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

SKILLS_DIR = Path(__file__).parent.parent / "skills"


@lru_cache(maxsize=16)
def load_skill(skill_name: str) -> str:
    """Return the raw markdown content of a skill file."""
    path = SKILLS_DIR / skill_name / "SKILL.md"
    return path.read_text(encoding="utf-8")


def inject_skill(system_prompt: str, skill_name: str) -> str:
    """
    Append the skill block to a system prompt under a clear heading.
    Idempotent: if the heading is already present the skill is not doubled.
    """
    skill_content = load_skill(skill_name)
    heading = f"\n\n---\n# Skill: {skill_name}\n\n"
    if heading.strip() in system_prompt:
        return system_prompt
    return system_prompt + heading + skill_content
