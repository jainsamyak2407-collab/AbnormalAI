"""
chart_renderer.py — renders SlideChartSpec dicts to PNG bytes via matplotlib.
All charts are styled per SLIDE_THEME. AI never touches this layer.
"""

from __future__ import annotations

import io
import logging
from typing import Any

import matplotlib
matplotlib.use("Agg")  # headless, no display needed
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.ticker as mticker
import numpy as np

from export.slide_theme import SLIDE_THEME, SLIDE_THEME_HEX

logger = logging.getLogger(__name__)

# ── helpers ──────────────────────────────────────────────────────────────────

def _rgb01(key: str) -> tuple[float, float, float]:
    """Return 0-1 float RGB for a theme key."""
    r, g, b = SLIDE_THEME[key]
    return r / 255, g / 255, b / 255


def _base_fig(size: tuple[float, float], bg_key: str = "bg_primary") -> tuple[plt.Figure, plt.Axes]:
    bg = _rgb01(bg_key)
    fig, ax = plt.subplots(figsize=size, facecolor=bg)
    ax.set_facecolor(bg)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_visible(False)
    ax.spines["bottom"].set_color(_rgb01("rule"))
    ax.spines["bottom"].set_linewidth(0.5)
    ax.tick_params(colors=_rgb01("ink_secondary"), labelsize=10)
    ax.yaxis.set_visible(False)
    ax.xaxis.tick_bottom()
    return fig, ax


def _save(fig: plt.Figure, dpi: int) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf.read()


# ── chart types ──────────────────────────────────────────────────────────────

def _render_trend_line(data: dict, theme: dict, size: tuple, dpi: int) -> bytes:
    fig, ax = _base_fig(size)
    x_labels: list[str] = data.get("x_labels", [])
    series: list[dict] = data.get("series", [])
    target: float | None = data.get("target")
    target_label: str = data.get("target_label", "Target")

    x = list(range(len(x_labels)))
    colors = [_rgb01("accent"), _rgb01("accent_soft"), _rgb01("chart_neutral")]

    for i, s in enumerate(series):
        values = s.get("values", [])
        color = colors[i % len(colors)]
        lw = 2.5 if i == 0 else 1.5
        ax.plot(x, values, color=color, linewidth=lw, marker="o",
                markersize=6, markerfacecolor=color, markeredgewidth=0, zorder=3)
        # Data labels on primary series only
        if i == 0:
            for xi, yi in zip(x, values):
                ax.annotate(
                    str(yi),
                    (xi, yi),
                    textcoords="offset points", xytext=(0, 8),
                    ha="center", fontsize=9,
                    color=_rgb01("ink_secondary"),
                    fontfamily="sans-serif",
                )

    if target is not None:
        ax.axhline(target, color=_rgb01("rule"), linewidth=1.0, linestyle="--", zorder=2)
        if x:
            ax.text(x[-1] + 0.1, target, target_label,
                    color=_rgb01("ink_secondary"), fontsize=8, va="center")

    ax.set_xticks(x)
    ax.set_xticklabels(x_labels, fontsize=10, color=_rgb01("ink_secondary"))
    ax.yaxis.set_visible(False)

    # Baseline
    ax.axhline(0, color=_rgb01("rule"), linewidth=0.5)

    if len(series) > 1:
        patches = [mpatches.Patch(color=colors[i % len(colors)], label=s.get("label", f"Series {i+1}"))
                   for i, s in enumerate(series)]
        ax.legend(handles=patches, loc="upper left", frameon=False,
                  fontsize=9, labelcolor=_rgb01("ink_secondary"))

    fig.tight_layout(pad=0.4)
    return _save(fig, dpi)


def _render_benchmark_bars(data: dict, theme: dict, size: tuple, dpi: int) -> bytes:
    metrics_list: list[dict] = data.get("metrics", [])
    if not metrics_list:
        return _empty_png(size, dpi)

    n = len(metrics_list)
    fig, ax = _base_fig(size)
    y = np.arange(n)
    bar_h = 0.55

    for i, m in enumerate(metrics_list):
        val = m.get("value", 0)
        p50 = m.get("p50")
        higher = m.get("higher_is_better", True)
        above = (val >= p50) if (p50 is not None and higher) else (val <= p50 if p50 is not None else True)
        bar_color = _rgb01("success") if above else _rgb01("accent")

        ax.barh(y[i], val, height=bar_h, color=bar_color, zorder=3)

        # Benchmark lines
        for pct_key, ls in [("p25", ":"), ("p50", "-"), ("p75", "--")]:
            pv = m.get(pct_key)
            if pv is not None:
                ax.plot([pv, pv], [y[i] - bar_h / 2, y[i] + bar_h / 2],
                        color=_rgb01("chart_neutral"), linewidth=1.2, linestyle=ls, zorder=4)

        # Value label
        unit = m.get("unit", "")
        ax.text(val + max(val * 0.02, 0.5), y[i], f"{val}{unit}",
                va="center", ha="left", fontsize=10,
                color=_rgb01("ink_primary"), fontfamily="sans-serif")

    ax.set_yticks(y)
    ax.set_yticklabels([m.get("label", "") for m in metrics_list],
                       fontsize=10, color=_rgb01("ink_secondary"))
    ax.yaxis.set_visible(True)
    ax.spines["left"].set_visible(False)
    ax.xaxis.set_visible(False)

    # Legend for benchmark lines
    legend_items = [
        mpatches.Patch(color=_rgb01("chart_neutral"), label="p25 / p50 / p75"),
    ]
    ax.legend(handles=legend_items, loc="lower right", frameon=False,
              fontsize=8, labelcolor=_rgb01("ink_secondary"))

    fig.tight_layout(pad=0.4)
    return _save(fig, dpi)


def _render_department_bars(data: dict, theme: dict, size: tuple, dpi: int) -> bytes:
    cats: list[dict] = data.get("categories", [])
    threshold: float | None = data.get("threshold")
    threshold_label: str = data.get("threshold_label", "Threshold")

    if not cats:
        return _empty_png(size, dpi)

    fig, ax = _base_fig(size)
    n = len(cats)
    y = np.arange(n)
    bar_h = 0.6

    for i, cat in enumerate(cats):
        val = cat.get("value", 0)
        below = (threshold is not None and val < threshold)
        color = _rgb01("accent") if below else _rgb01("success")
        ax.barh(y[i], val, height=bar_h, color=color, zorder=3)
        ax.text(val + 0.8, y[i], f"{val}%",
                va="center", ha="left", fontsize=9,
                color=_rgb01("ink_primary"), fontfamily="sans-serif")

    if threshold is not None:
        ax.axvline(threshold, color=_rgb01("warning"), linewidth=1.2, linestyle="--", zorder=4)
        ax.text(threshold + 0.3, n - 0.1, threshold_label,
                color=_rgb01("warning"), fontsize=8, va="top")

    ax.set_yticks(y)
    ax.set_yticklabels([c.get("label", "") for c in cats],
                       fontsize=9, color=_rgb01("ink_secondary"))
    ax.yaxis.set_visible(True)
    ax.spines["left"].set_visible(False)
    ax.xaxis.set_visible(False)

    fig.tight_layout(pad=0.4)
    return _save(fig, dpi)


def _render_criteria_scorecard(data: dict, theme: dict, size: tuple, dpi: int) -> bytes:
    rows: list[dict] = data.get("rows", [])
    if not rows:
        return _empty_png(size, dpi)

    fig, ax = plt.subplots(figsize=size, facecolor=_rgb01("bg_primary"))
    ax.set_facecolor(_rgb01("bg_primary"))
    ax.axis("off")

    col_labels = ["Criterion", "Target", "Actual", "Status"]
    col_widths = [0.45, 0.18, 0.18, 0.19]
    row_h = 0.18
    header_y = 0.92

    # Header
    x = 0.02
    for lbl, w in zip(col_labels, col_widths):
        ax.text(x, header_y, lbl.upper(),
                transform=ax.transAxes, fontsize=8,
                color=_rgb01("ink_secondary"), fontfamily="monospace",
                fontweight="bold")
        x += w

    # Rows
    for ri, row in enumerate(rows):
        y = header_y - (ri + 1) * row_h
        met = row.get("met", False)
        status_sym = "✓" if met else "✗"
        status_color = _rgb01("success") if met else _rgb01("accent")
        vals = [row.get("criterion", ""), str(row.get("target", "")),
                str(row.get("actual", "")), status_sym]
        x = 0.02
        for vi, (val, w) in enumerate(zip(vals, col_widths)):
            color = status_color if vi == 3 else _rgb01("ink_primary")
            ax.text(x, y, val, transform=ax.transAxes,
                    fontsize=9, color=color, fontfamily="sans-serif")
            x += w

        # Row separator
        ax.axhline(y - 0.02, xmin=0.01, xmax=0.99,
                   color=_rgb01("rule"), linewidth=0.4,
                   transform=ax.transAxes)

    fig.tight_layout(pad=0.3)
    return _save(fig, dpi)


def _empty_png(size: tuple, dpi: int) -> bytes:
    fig, ax = _base_fig(size)
    ax.text(0.5, 0.5, "Chart unavailable for this slice.",
            transform=ax.transAxes, ha="center", va="center",
            fontsize=10, color=_rgb01("ink_secondary"))
    return _save(fig, dpi)


# ── public API ────────────────────────────────────────────────────────────────

def render_chart(
    chart_spec: dict,
    *,
    theme: dict | None = None,
    size: tuple[float, float] = (8.8, 4.2),
    dpi: int = 200,
) -> bytes:
    """
    Render a chart spec dict to PNG bytes.
    chart_spec must have 'type' and 'data' keys.
    Returns a placeholder PNG if the type is unknown or data is empty.
    """
    if theme is None:
        theme = SLIDE_THEME

    chart_type: str = chart_spec.get("type", "")
    chart_data: dict = chart_spec.get("data") or {}

    try:
        if chart_type == "trend_line":
            return _render_trend_line(chart_data, theme, size, dpi)
        if chart_type == "benchmark_bars":
            return _render_benchmark_bars(chart_data, theme, size, dpi)
        if chart_type == "department_bars":
            return _render_department_bars(chart_data, theme, size, dpi)
        if chart_type == "criteria_scorecard":
            return _render_criteria_scorecard(chart_data, theme, size, dpi)
        logger.warning("Unknown chart type '%s'; returning placeholder.", chart_type)
        return _empty_png(size, dpi)
    except Exception as exc:
        logger.error("Chart render failed for type '%s': %s", chart_type, exc)
        return _empty_png(size, dpi)
