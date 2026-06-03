from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Literal

import pandas as pd
import plotly.graph_objects as go

from elliott_wave.models.pivot import Pivot
from elliott_wave.models.signal import TradeRegion
from elliott_wave.models.wave import ElliottScenario

if TYPE_CHECKING:
    from elliott_wave.engines.base import AnalysisContext

ChartTheme = Literal["dark", "light"]


@dataclass(frozen=True)
class _Theme:
    template: str
    bg: str
    paper: str
    grid: str
    axis: str
    font: str
    candle_up: str
    candle_down: str
    pivot: str
    zone_long: str
    zone_short: str
    scenario_colors: tuple[str, ...]


_DARK = _Theme(
    template="plotly_dark",
    bg="#131722",
    paper="#131722",
    grid="#2a2e39",
    axis="#363a45",
    font="#d1d4dc",
    candle_up="#26a69a",
    candle_down="#ef5350",
    pivot="#b2b5be",
    zone_long="rgba(38,166,154,0.18)",
    zone_short="rgba(239,83,80,0.18)",
    scenario_colors=("#00bcd4", "#ff9800", "#e91e63", "#8bc34a", "#ce93d8"),
)

_LIGHT = _Theme(
    template="plotly_white",
    bg="#fafafa",
    paper="#ffffff",
    grid="#e0e0e0",
    axis="#bdbdbd",
    font="#212121",
    candle_up="#2e7d32",
    candle_down="#c62828",
    pivot="#546e7a",
    zone_long="rgba(46,125,50,0.12)",
    zone_short="rgba(198,40,40,0.12)",
    scenario_colors=("#1565c0", "#e65100", "#558b2f", "#ad1457", "#6a1b9a"),
)

_THEMES: dict[ChartTheme, _Theme] = {"dark": _DARK, "light": _LIGHT}


class ChartService:
    def build_chart(
        self,
        df: pd.DataFrame,
        pivots: list[Pivot],
        scenarios: list[ElliottScenario],
        trade_regions: list[TradeRegion],
        title: str,
        theme: ChartTheme = "dark",
        hover: bool = True,
    ) -> go.Figure:
        t = _THEMES[theme]
        fig = go.Figure()

        fig.add_trace(
            go.Candlestick(
                x=df.index,
                open=df["Open"],
                high=df["High"],
                low=df["Low"],
                close=df["Close"],
                name="Price",
                increasing={"fillcolor": t.candle_up, "line": {"color": t.candle_up}},
                decreasing={"fillcolor": t.candle_down, "line": {"color": t.candle_down}},
            )
        )

        if pivots:
            fig.add_trace(
                go.Scatter(
                    x=[p.time for p in pivots],
                    y=[p.price for p in pivots],
                    mode="lines+markers+text",
                    text=[p.kind[0].upper() for p in pivots],
                    textposition="top center",
                    name="Pivots",
                    line={"color": t.pivot, "width": 1, "dash": "dot"},
                    marker={"color": t.pivot, "size": 6},
                    textfont={"color": t.pivot, "size": 10},
                )
            )

        for s_idx, scenario in enumerate(scenarios):
            color = t.scenario_colors[s_idx % len(t.scenario_colors)]
            label = f"{scenario.pattern}/{scenario.trend} (score={scenario.score})"
            first_leg = True
            for leg in scenario.legs:
                fig.add_trace(
                    go.Scatter(
                        x=[leg.start_time, leg.end_time],
                        y=[leg.start_price, leg.end_price],
                        mode="lines+text",
                        text=[None, leg.label],
                        textposition="top center",
                        line={"color": color, "width": 2},
                        textfont={"color": color, "size": 11},
                        name=label,
                        legendgroup=label,
                        showlegend=first_leg,
                    )
                )
                first_leg = False

        for region in trade_regions:
            zone_color = t.zone_long if region.direction == "long" else t.zone_short
            fig.add_hrect(
                y0=region.zone_low,
                y1=region.zone_high,
                fillcolor=zone_color,
                line_width=0,
                annotation_text=f"{region.direction} zone",
                annotation_position="top left",
                annotation_font_color=t.font,
                annotation_font_size=11,
            )

        fig.update_layout(
            title={"text": title, "font": {"size": 15}},
            xaxis_title="Date",
            yaxis_title="Price",
            xaxis_rangeslider_visible=False,
            template=t.template,
            paper_bgcolor=t.paper,
            plot_bgcolor=t.bg,
            font={"color": t.font},
            height=650,
            legend={
                "bgcolor": "rgba(0,0,0,0)",
                "borderwidth": 0,
                "font": {"size": 11},
            },
            margin={"l": 60, "r": 40, "t": 50, "b": 40},
            xaxis={
                "gridcolor": t.grid,
                "linecolor": t.axis,
                "tickcolor": t.axis,
                "showspikes": True,
                "spikecolor": t.pivot,
                "spikemode": "across",
                "spikesnap": "cursor",
            },
            yaxis={
                "gridcolor": t.grid,
                "linecolor": t.axis,
                "tickcolor": t.axis,
                "showspikes": True,
                "spikecolor": t.pivot,
                "spikemode": "across",
                "spikesnap": "cursor",
                "side": "right",
            },
            hovermode="x unified" if hover else False,
        )
        return fig

    def save_chart(
        self,
        df: pd.DataFrame,
        pivots: list[Pivot],
        scenarios: list[ElliottScenario],
        trade_regions: list[TradeRegion],
        output_path: Path,
        title: str,
        theme: ChartTheme = "dark",
        hover: bool = True,
    ) -> None:
        fig = self.build_chart(
            df=df,
            pivots=pivots,
            scenarios=scenarios,
            trade_regions=trade_regions,
            title=title,
            theme=theme,
            hover=hover,
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)
        fig.write_html(str(output_path))

    def build_from_context(
        self,
        context: AnalysisContext,
        title: str,
        theme: ChartTheme = "dark",
        hover: bool = True,
    ) -> go.Figure:
        """Build a chart from an AnalysisContext using abstract overlays.

        Renders the candlestick base from context.ohlcv then applies all
        abstract ChartOverlay objects accumulated by the engine pipeline.
        """
        from elliott_wave.engines.chart.overlay_builder import apply_overlays

        if context.ohlcv is None or context.ohlcv.empty:
            raise ValueError("No OHLCV data in context")

        t = _THEMES[theme]
        df = context.ohlcv
        fig = go.Figure()

        fig.add_trace(
            go.Candlestick(
                x=df.index,
                open=df["Open"],
                high=df["High"],
                low=df["Low"],
                close=df["Close"],
                name="Price",
                increasing={"fillcolor": t.candle_up, "line": {"color": t.candle_up}},
                decreasing={"fillcolor": t.candle_down, "line": {"color": t.candle_down}},
            )
        )

        apply_overlays(fig, context.overlays, theme=theme)

        fig.update_layout(
            title={"text": title, "font": {"size": 15}},
            xaxis_title="Date",
            yaxis_title="Price",
            xaxis_rangeslider_visible=False,
            template=t.template,
            paper_bgcolor=t.paper,
            plot_bgcolor=t.bg,
            font={"color": t.font},
            height=650,
            legend={
                "bgcolor": "rgba(0,0,0,0)",
                "borderwidth": 0,
                "font": {"size": 11},
            },
            margin={"l": 60, "r": 40, "t": 50, "b": 40},
            xaxis={
                "gridcolor": t.grid,
                "linecolor": t.axis,
                "tickcolor": t.axis,
                "showspikes": True,
                "spikecolor": t.pivot,
                "spikemode": "across",
                "spikesnap": "cursor",
            },
            yaxis={
                "gridcolor": t.grid,
                "linecolor": t.axis,
                "tickcolor": t.axis,
                "showspikes": True,
                "spikecolor": t.pivot,
                "spikemode": "across",
                "spikesnap": "cursor",
                "side": "right",
            },
            hovermode="x unified" if hover else False,
        )
        return fig

    def save_from_context(
        self,
        context: AnalysisContext,
        output_path: Path,
        title: str,
        theme: ChartTheme = "dark",
        hover: bool = True,
    ) -> None:
        fig = self.build_from_context(context=context, title=title, theme=theme, hover=hover)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        fig.write_html(str(output_path))
