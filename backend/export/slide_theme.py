"""
Palette and typography constants for the presentation export pipeline.
These are the single source of truth — both chart_renderer and pptx_renderer import from here.
Frontend CSS vars are derived from the same hex values (see PresentationModal).
"""

from __future__ import annotations

# RGB tuples for python-pptx and matplotlib
SLIDE_THEME: dict[str, tuple[int, int, int]] = {
    "bg_primary":    (250, 248, 243),   # warm off-white
    "bg_alt":        (18, 26, 42),      # deep navy for title / closing slides
    "ink_primary":   (16, 22, 34),      # near-black navy
    "ink_secondary": (85, 92, 106),     # muted slate
    "ink_on_dark":   (246, 244, 238),   # off-white on navy
    "accent":        (217, 74, 56),     # coral
    "accent_soft":   (240, 172, 158),   # muted coral for chart secondaries
    "success":       (74, 130, 92),     # restrained green, only for positive metrics
    "warning":       (194, 140, 56),    # restrained amber
    "rule":          (220, 214, 202),   # hairline separator
    "chart_neutral": (148, 148, 148),   # benchmark median lines
}

# Hex versions for CSS and metadata
SLIDE_THEME_HEX: dict[str, str] = {
    k: "#{:02X}{:02X}{:02X}".format(*v) for k, v in SLIDE_THEME.items()
}

# Typography fallback stack (python-pptx cannot embed custom fonts on all platforms)
FONTS = {
    "serif": "Georgia",       # cross-platform
    "sans":  "Arial",         # cross-platform (was "Helvetica Neue", macOS-only)
    "mono":  "Courier New",   # cross-platform (was "Menlo", macOS-only)
}

# Slide geometry (inches)
SLIDE_WIDTH_IN  = 13.333
SLIDE_HEIGHT_IN = 7.5
MARGIN_TOP_IN   = 0.6
MARGIN_LR_IN    = 0.7
MARGIN_BOT_IN   = 0.5

# Coral accent rule that appears on every non-title slide
ACCENT_RULE_X_IN    = 0.7    # same as left margin
ACCENT_RULE_Y_IN    = 0.45
ACCENT_RULE_W_IN    = 1.2
ACCENT_RULE_H_IN    = 0.035  # ~0.5pt visual weight

FOOTER_Y_IN         = 7.1
FOOTER_H_IN         = 0.25
FOOTER_FONT_PT      = 9

# Dark footer band on slide 5
DARK_BAND_H_IN      = 1.5
