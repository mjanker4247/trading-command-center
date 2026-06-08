from elliott_wave.models.signal import TradeRegion
from elliott_wave.models.wave import ElliottScenario
from elliott_wave.services.fibonacci_engine import FibonacciEngine


class SignalEngine:
    def __init__(self, fib_engine: FibonacciEngine) -> None:
        self.fib_engine = fib_engine

    def generate(self, scenarios: list[ElliottScenario]) -> list[TradeRegion]:
        regions: list[TradeRegion] = []

        for scenario in scenarios[:5]:
            if scenario.pattern == "impulse" and scenario.trend == "bullish":
                region = self._bullish_impulse_region(scenario)
                if region:
                    regions.append(region)

            elif scenario.pattern == "impulse" and scenario.trend == "bearish":
                region = self._bearish_impulse_region(scenario)
                if region:
                    regions.append(region)

            elif scenario.pattern == "zigzag" and scenario.trend == "bullish":
                region = self._bullish_zigzag_region(scenario)
                if region:
                    regions.append(region)

            elif scenario.pattern == "zigzag" and scenario.trend == "bearish":
                region = self._bearish_zigzag_region(scenario)
                if region:
                    regions.append(region)

        regions.sort(key=lambda r: r.confidence, reverse=True)
        return regions

    def _bullish_impulse_region(self, scenario: ElliottScenario) -> TradeRegion | None:
        if scenario.status != "in_progress" or len(scenario.legs) < 4:
            return None

        w1 = scenario.legs[0]   # p0 → p1  (LOW → HIGH)
        w3 = scenario.legs[2]   # p2 → p3  (LOW → HIGH)
        w4 = scenario.legs[3]   # p3 → p4  (HIGH → LOW)

        # Wave 4 retracement zone of Wave 3 — actionable entry for Wave 5
        fib = self.fib_engine.retracements(w3.start_price, w3.end_price)
        zone_low = min(fib.levels["23.6%"], fib.levels["38.2%"])
        zone_high = max(fib.levels["23.6%"], fib.levels["38.2%"])

        # Stop just below Wave 1 peak — Wave 4 cannot overlap Wave 1 territory
        stop = round(w1.end_price * 0.99, 4)

        # Wave 5 targets: Wave 1 length projected from Wave 4 end
        ext = self.fib_engine.extensions(w1.start_price, w1.end_price, w4.end_price)
        targets = [round(ext.levels["100%"], 4), round(ext.levels["161.8%"], 4)]

        return TradeRegion(
            direction="long",
            zone_low=round(zone_low, 4),
            zone_high=round(zone_high, 4),
            stop_level=stop,
            target_levels=targets,
            rationale=[
                "In-progress bullish impulse — Wave 5 entry",
                "Wave 4 retracement zone at 23.6%-38.2% of Wave 3",
                "Wave 5 targets from Wave 1 extension at Wave 4 end",
            ],
            confidence=min(100.0, round(scenario.score, 2)),
        )

    def _bearish_impulse_region(self, scenario: ElliottScenario) -> TradeRegion | None:
        if scenario.status != "in_progress" or len(scenario.legs) < 4:
            return None

        w1 = scenario.legs[0]   # p0 → p1  (HIGH → LOW)
        w3 = scenario.legs[2]   # p2 → p3  (HIGH → LOW)
        w4 = scenario.legs[3]   # p3 → p4  (LOW → HIGH)

        # Wave 4 retracement zone of Wave 3 — actionable short entry for Wave 5
        w3_range = w3.start_price - w3.end_price
        zone_low = round(w3.end_price + w3_range * 0.236, 4)
        zone_high = round(w3.end_price + w3_range * 0.382, 4)

        # Stop just above Wave 1 bottom — Wave 4 cannot exceed Wave 1 low
        stop = round(w1.end_price * 1.01, 4)

        # Wave 5 targets: Wave 1 length projected downward from Wave 4 end
        w1_range = w1.start_price - w1.end_price
        targets = [
            round(w4.end_price - w1_range * 1.0, 4),
            round(w4.end_price - w1_range * 1.618, 4),
        ]

        return TradeRegion(
            direction="short",
            zone_low=zone_low,
            zone_high=zone_high,
            stop_level=stop,
            target_levels=targets,
            rationale=[
                "In-progress bearish impulse — Wave 5 entry",
                "Wave 4 retracement zone at 23.6%-38.2% of Wave 3",
                "Wave 5 targets from Wave 1 length at Wave 4 end",
            ],
            confidence=min(100.0, round(scenario.score, 2)),
        )

    def _bullish_zigzag_region(self, scenario: ElliottScenario) -> TradeRegion | None:
        """LONG signal at the end of a bullish ABC zigzag (A up, B down, C up)."""
        if len(scenario.legs) < 3:
            return None

        a_leg = scenario.legs[0]   # A leg: LOW → HIGH
        b_leg = scenario.legs[1]   # B leg: HIGH → LOW (Wave B end = C start)
        c_leg = scenario.legs[2]   # C leg: LOW → HIGH

        a_length = a_leg.end_price - a_leg.start_price
        c_end = c_leg.end_price

        zone_low = round(c_end * 0.995, 4)
        zone_high = round(c_end * 1.005, 4)
        # Stop below the Wave B low (C wave start) — correction invalidated if breached
        stop = round(b_leg.end_price * 0.99, 4)
        targets = [
            round(c_end + a_length * 1.0, 4),
            round(c_end + a_length * 1.618, 4),
        ]

        return TradeRegion(
            direction="long",
            zone_low=zone_low,
            zone_high=zone_high,
            stop_level=stop,
            target_levels=targets,
            rationale=[
                "Bullish ABC zigzag candidate",
                "Entry at C wave completion",
                "Targets at 100% and 161.8% of Wave A above C end",
            ],
            confidence=min(100.0, round(scenario.score, 2)),
        )

    def _bearish_zigzag_region(self, scenario: ElliottScenario) -> TradeRegion | None:
        """SHORT signal at the end of a bearish ABC zigzag (A down, B up, C down)."""
        if len(scenario.legs) < 3:
            return None

        a_leg = scenario.legs[0]   # A leg: HIGH → LOW
        b_leg = scenario.legs[1]   # B leg: LOW → HIGH (Wave B end = C start)
        c_leg = scenario.legs[2]   # C leg: HIGH → LOW

        a_length = a_leg.start_price - a_leg.end_price
        c_end = c_leg.end_price

        zone_low = round(c_end * 0.995, 4)
        zone_high = round(c_end * 1.005, 4)
        # Stop above the Wave B high (C wave start) — correction invalidated if breached
        stop = round(b_leg.end_price * 1.01, 4)
        targets = [
            round(c_end - a_length * 1.0, 4),
            round(c_end - a_length * 1.618, 4),
        ]

        return TradeRegion(
            direction="short",
            zone_low=zone_low,
            zone_high=zone_high,
            stop_level=stop,
            target_levels=targets,
            rationale=[
                "Bearish ABC zigzag candidate",
                "Entry at C wave completion",
                "Targets at 100% and 161.8% of Wave A below C end",
            ],
            confidence=min(100.0, round(scenario.score, 2)),
        )
