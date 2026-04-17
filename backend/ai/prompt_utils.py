"""
Utilities for loading, parsing, and filling prompt templates.
All prompts live in /backend/prompts/ as markdown files.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def load_prompt(filename: str) -> tuple[str, str]:
    """
    Load a prompt markdown file and return (system_prompt, user_template).

    The file must contain a '## System prompt' section and a
    '## User prompt template' section with a fenced code block.
    """
    content = (PROMPTS_DIR / filename).read_text(encoding="utf-8")

    # Extract system prompt: everything between "## System prompt" and the next "---" or "## "
    sys_match = re.search(
        r"## System prompt\n+(.*?)(?=\n---|\n## [A-Z])",
        content,
        re.DOTALL,
    )
    system_prompt = sys_match.group(1).strip() if sys_match else ""

    # Extract user prompt template: code block immediately under "## User prompt template"
    FENCE = "```"
    tmpl_match = re.search(
        r"## User prompt template\n+" + FENCE + r"\n(.*?)\n" + FENCE,
        content,
        re.DOTALL,
    )
    user_template = tmpl_match.group(1).strip() if tmpl_match else ""

    return system_prompt, user_template


def fill_template(template: str, variables: dict[str, Any]) -> str:
    """
    Replace {variable_name} placeholders in template.
    Unknown keys are left unchanged. Values are JSON-serialized if not str/int/float.
    """
    def replacer(m: re.Match) -> str:
        key = m.group(1)
        if key not in variables:
            return m.group(0)
        val = variables[key]
        if isinstance(val, str):
            return val
        if isinstance(val, (int, float, bool)):
            return str(val)
        return json.dumps(val, indent=2, default=str)

    return re.sub(r"\{(\w+)\}", replacer, template)


def extract_json(text: str) -> Any:
    """
    Parse JSON from a Claude response, handling markdown fences, trailing commas,
    and truncated arrays (caused by max_tokens being hit mid-response).
    Raises json.JSONDecodeError only if all recovery attempts fail.
    """
    text = text.strip()

    # Strip markdown fences if present
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()

    # Remove trailing commas before ] or } (common Claude mistake)
    text = re.sub(r",\s*([}\]])", r"\1", text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Recovery: if we have a truncated JSON array, close it at the last complete object
    if text.lstrip().startswith("["):
        # Find last complete } and close the array there
        last_close = text.rfind("}")
        if last_close != -1:
            recovered = text[: last_close + 1] + "]"
            recovered = re.sub(r",\s*([}\]])", r"\1", recovered)
            try:
                return json.loads(recovered)
            except json.JSONDecodeError:
                pass

    raise json.JSONDecodeError("Could not parse JSON from response", text, 0)
