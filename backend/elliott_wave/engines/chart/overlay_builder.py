"""Translates abstract ChartOverlay objects into Plotly traces and shapes."""
from __future__ import annotations

from dataclasses import dataclass

import plotly.graph_objects as go

from elliott_wave.models.overlay import (
    AnnotationOverlay,
    ChartOverlay,
    HorizontalLevelOverlay,
    PivotOverlay,
    WaveLegOverlay,
    ZoneOverlay,
)


@dataclass(frozen=True)
class _Colors:
    pivot: str
    zone_long: str
    zone_short: str
    stop: str
    target: str
    invalidation: str
    fib: str
    font: str
    scenario: tuple[str, ...]


_DARK_COLORS = _Colors(
    pivot="#b2b5be",
    zone_long="rgba(38,166,154,0.18)",
    zone_short="rgba(239,83,80,0.18)",
    stop="rgba(239,83,80,0.8)",
    target="rgba(38,166,154,0.8)",
    invalidation="rgba(255,193,7,0.8)",
    fib="rgba(120,120,200,0.5)",
    font="#d1d4dc",
    scenario=("#00bcd4", "#ff9800", "#e91e63", "#8bc34a", "#ce93d8"),
)

_LIGHT_COLORS = _Colors(
    pivot="#546e7a",
    zone_long="rgba(46,125,50,0.12)",
    zone_short="rgba(198,40,40,0.12)",
    stop="rgba(198,40,40,0.8)",
    target="rgba(46,125,50,0.8)",
    invalidation="rgba(230,150,0,0.8)",
    fib="rgba(80,80,160,0.5)",
    font="#212121",
    scenario=("#1565c0", "#e65100", "#558b2f", "#ad1457", "#6a1b9a"),
)


def apply_overlays(
    fig: go.Figure,
    overlays: list[ChartOverlay],
    theme: str = "dark",
) -> go.Figure:
    """Render all abstract overlays onto an existing Plotly figure."""
    colors = _DARK_COLORS if theme == "dark" else _LIGHT_COLORS

    scenario_color_map: dict[str, str] = {}
    scenario_idx = 0

    for overlay in overlays:
        if isinstance(overlay, PivotOverlay):
            _render_pivot(fig, overlay, colors)
        elif isinstance(overlay, WaveLegOverlay):
            if overlay.scenario_label not in scenario_color_map:
                scenario_color_map[overlay.scenario_label] = colors.scenario[
                    scenario_idx % len(colors.scenario)
                ]
                scenario_idx += 1
            color = scenario_color_map[overlay.scenario_label]
            _render_wave_leg(fig, overlay, color)
        elif isinstance(overlay, ZoneOverlay):
            _render_zone(fig, overlay, colors)
        elif isinstance(overlay, HorizontalLevelOverlay):
            _render_level(fig, overlay, colors)
        elif isinstance(overlay, AnnotationOverlay):
            _render_annotation(fig, overlay, colors)

    return fig


def _render_pivot(fig: go.Figure, o: PivotOverlay, c: _Colors) -> None:
    fig.add_trace(
        go.Scatter(
            x=o.times,
            y=o.prices,
            mode="lines+markers+text",
            text=o.labels,
            textposition="top center",
            name="Pivots",
            line={"color": c.pivot, "width": 1, "dash": "dot"},
            marker={"color": c.pivot, "size": 6},
            textfont={"color": c.pivot, "size": 10},
        )
    )


def _render_wave_leg(fig: go.Figure, o: WaveLegOverlay, color: str) -> None:
    first_for_group = not any(
        t.legendgroup == o.scenario_label for t in fig.data
    )
    fig.add_trace(
        go.Scatter(
            x=[o.start_time, o.end_time],
            y=[o.start_price, o.end_price],
            mode="lines+text",
            text=[None, o.label],
            textposition="top center",
            line={"color": color, "width": 2},
            textfont={"color": color, "size": 11},
            name=o.scenario_label,
            legendgroup=o.scenario_label,
            showlegend=first_for_group,
        )
    )


def _render_zone(fig: go.Figure, o: ZoneOverlay, c: _Colors) -> None:
    fill = c.zone_long if o.direction == "long" else c.zone_short
    fig.add_hrect(
        y0=o.y0,
        y1=o.y1,
        fillcolor=fill,
        line_width=0,
        annotation_text=o.label,
        annotation_position="top left",
        annotation_font_color=c.font,
        annotation_font_size=11,
    )


def _render_level(fig: go.Figure, o: HorizontalLevelOverlay, c: _Colors) -> None:
    color_map: dict[str | None, str] = {
        "stop": c.stop,
        "target": c.target,
        "invalidation": c.invalidation,
        "fib": c.fib,
        None: c.fib,
    }
    color = color_map.get(o.color_hint, c.fib)
    dash_map = {"solid": "solid", "dashed": "dash", "dotted": "dot"}
    fig.add_hline(
        y=o.price,
        line_color=color,
        line_dash=dash_map.get(o.style, "dash"),
        line_width=1,
        annotation_text=o.label,
        annotation_position="top right",
        annotation_font_color=color,
        annotation_font_size=10,
    )


def _render_annotation(fig: go.Figure, o: AnnotationOverlay, c: _Colors) -> None:
    fig.add_annotation(
        x=o.time,
        y=o.price,
        text=o.text,
        showarrow=True,
        arrowhead=2,
        font={"color": c.font, "size": 11},
    )
