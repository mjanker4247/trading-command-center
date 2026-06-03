export type ChartTheme = "dark" | "light";

export interface ThemeColors {
  bg: string;
  paper: string;
  grid: string;
  axis: string;
  font: string;
  candleUp: string;
  candleDown: string;
  pivot: string;
  zoneLong: string;
  zoneShort: string;
  scenario: string[];
}

export const THEMES: Record<ChartTheme, ThemeColors> = {
  dark: {
    bg: "#131722",
    paper: "#131722",
    grid: "#2a2e39",
    axis: "#363a45",
    font: "#d1d4dc",
    candleUp: "#26a69a",
    candleDown: "#ef5350",
    pivot: "#b2b5be",
    zoneLong: "rgba(38,166,154,0.18)",
    zoneShort: "rgba(239,83,80,0.18)",
    scenario: ["#00bcd4", "#ff9800", "#e91e63", "#8bc34a", "#ce93d8"],
  },
  light: {
    bg: "#fafafa",
    paper: "#ffffff",
    grid: "#e0e0e0",
    axis: "#bdbdbd",
    font: "#212121",
    candleUp: "#2e7d32",
    candleDown: "#c62828",
    pivot: "#546e7a",
    zoneLong: "rgba(46,125,50,0.12)",
    zoneShort: "rgba(198,40,40,0.12)",
    scenario: ["#1565c0", "#e65100", "#558b2f", "#ad1457", "#6a1b9a"],
  },
};
