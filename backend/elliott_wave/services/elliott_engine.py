from elliott_wave.models.pivot import Pivot
from elliott_wave.models.wave import ElliottScenario, WaveLeg
from elliott_wave.services.fibonacci_engine import FibonacciEngine


class ElliottEngine:
    def __init__(self, fib_engine: FibonacciEngine) -> None:
        self.fib_engine = fib_engine

    def analyze(self, pivots: list[Pivot]) -> list[ElliottScenario]:
        scenarios: list[ElliottScenario] = []
        scenarios.extend(self._find_impulse_setups(pivots))
        scenarios.extend(self._find_impulses(pivots))
        scenarios.extend(self._find_abc_corrections(pivots))
        scenarios.sort(key=lambda s: s.score, reverse=True)
        return scenarios

    def _find_impulse_setups(self, pivots: list[Pivot]) -> list[ElliottScenario]:
        """Detect in-progress 5-wave impulses ending at Wave 4 (Wave 5 pending)."""
        scenarios: list[ElliottScenario] = []
        for i in range(len(pivots) - 4):
            seq = pivots[i : i + 5]
            kinds = [p.kind for p in seq]

            if kinds == ["low", "high", "low", "high", "low"]:
                scenario = self._build_bullish_impulse_setup(seq)
                if scenario:
                    scenarios.append(scenario)

            if kinds == ["high", "low", "high", "low", "high"]:
                scenario = self._build_bearish_impulse_setup(seq)
                if scenario:
                    scenarios.append(scenario)

        return scenarios

    def _find_impulses(self, pivots: list[Pivot]) -> list[ElliottScenario]:
        scenarios: list[ElliottScenario] = []
        for i in range(len(pivots) - 5):
            seq = pivots[i : i + 6]
            kinds = [p.kind for p in seq]

            if kinds == ["low", "high", "low", "high", "low", "high"]:
                scenario = self._build_bullish_impulse(seq)
                if scenario:
                    scenarios.append(scenario)

            if kinds == ["high", "low", "high", "low", "high", "low"]:
                scenario = self._build_bearish_impulse(seq)
                if scenario:
                    scenarios.append(scenario)

        return scenarios

    def _find_abc_corrections(self, pivots: list[Pivot]) -> list[ElliottScenario]:
        scenarios: list[ElliottScenario] = []
        for i in range(len(pivots) - 3):
            seq = pivots[i : i + 4]
            kinds = [p.kind for p in seq]

            if kinds == ["high", "low", "high", "low"]:
                scenario = self._detect_bearish_zigzag(seq)
                if scenario:
                    scenarios.append(scenario)

            if kinds == ["low", "high", "low", "high"]:
                scenario = self._detect_bullish_zigzag(seq)
                if scenario:
                    scenarios.append(scenario)

        return scenarios

    def _build_bullish_impulse_setup(self, seq: list[Pivot]) -> ElliottScenario | None:
        p0, p1, p2, p3, p4 = seq
        valid, notes = self._validate_bullish_impulse_setup([p.price for p in seq])
        if not valid:
            return None

        score = 50.0
        fib_w2 = self.fib_engine.retracements(p0.price, p1.price)
        fib_w3 = self.fib_engine.extensions(p0.price, p1.price, p2.price)
        fib_w4 = self.fib_engine.retracements(p2.price, p3.price)

        score += self._score_nearness(p2.price, fib_w2.levels["50.0%"], 10)
        score += self._score_nearness(p2.price, fib_w2.levels["61.8%"], 12)
        score += self._score_nearness(p3.price, fib_w3.levels["161.8%"], 15)
        score += self._score_nearness(p4.price, fib_w4.levels["23.6%"], 6)
        score += self._score_nearness(p4.price, fib_w4.levels["38.2%"], 8)

        legs = self._make_legs(seq, ["0", "1", "2", "3", "4"])
        notes.append("In-progress bullish impulse — Wave 5 pending")
        return ElliottScenario(
            trend="bullish",
            degree="primary",
            pattern="impulse",
            legs=legs,
            score=round(score, 2),
            status="in_progress",
            invalidation_level=p0.price,
            notes=notes,
        )

    def _build_bearish_impulse_setup(self, seq: list[Pivot]) -> ElliottScenario | None:
        p0, p1, p2, p3, p4 = seq
        valid, notes = self._validate_bearish_impulse_setup([p.price for p in seq])
        if not valid:
            return None

        score = 50.0
        w1_range = p0.price - p1.price

        target_w2_50 = p1.price + w1_range * 0.50
        target_w2_618 = p1.price + w1_range * 0.618
        score += self._score_nearness(p2.price, target_w2_50, 10)
        score += self._score_nearness(p2.price, target_w2_618, 12)

        target_w3_1618 = p2.price - w1_range * 1.618
        score += self._score_nearness(p3.price, target_w3_1618, 15)

        w3_range = p2.price - p3.price
        target_w4_236 = p3.price + w3_range * 0.236
        target_w4_382 = p3.price + w3_range * 0.382
        score += self._score_nearness(p4.price, target_w4_236, 6)
        score += self._score_nearness(p4.price, target_w4_382, 8)

        legs = self._make_legs(seq, ["0", "1", "2", "3", "4"])
        notes.append("In-progress bearish impulse — Wave 5 pending")
        return ElliottScenario(
            trend="bearish",
            degree="primary",
            pattern="impulse",
            legs=legs,
            score=round(score, 2),
            status="in_progress",
            invalidation_level=p0.price,
            notes=notes,
        )

    def _build_bullish_impulse(self, seq: list[Pivot]) -> ElliottScenario | None:
        p0, p1, p2, p3, p4, p5 = seq
        valid, notes = self._validate_bullish_impulse([p.price for p in seq])
        if not valid:
            return None

        score = 50.0
        fib_w2 = self.fib_engine.retracements(p0.price, p1.price)
        fib_w3 = self.fib_engine.extensions(p0.price, p1.price, p2.price)
        fib_w4 = self.fib_engine.retracements(p2.price, p3.price)

        score += self._score_nearness(p2.price, fib_w2.levels["50.0%"], 10)
        score += self._score_nearness(p2.price, fib_w2.levels["61.8%"], 12)
        score += self._score_nearness(p3.price, fib_w3.levels["161.8%"], 15)
        score += self._score_nearness(p4.price, fib_w4.levels["23.6%"], 6)
        score += self._score_nearness(p4.price, fib_w4.levels["38.2%"], 8)

        legs = self._make_legs(seq, ["0", "1", "2", "3", "4", "5"])
        return ElliottScenario(
            trend="bullish",
            degree="primary",
            pattern="impulse",
            legs=legs,
            score=round(score, 2),
            status="complete",
            invalidation_level=p0.price,
            notes=notes,
        )

    def _build_bearish_impulse(self, seq: list[Pivot]) -> ElliottScenario | None:
        p0, p1, p2, p3, p4, p5 = seq
        valid, notes = self._validate_bearish_impulse([p.price for p in seq])
        if not valid:
            return None

        score = 50.0
        w1_range = p0.price - p1.price

        target_w2_50 = p1.price + w1_range * 0.50
        target_w2_618 = p1.price + w1_range * 0.618
        score += self._score_nearness(p2.price, target_w2_50, 10)
        score += self._score_nearness(p2.price, target_w2_618, 12)

        target_w3_1618 = p2.price - w1_range * 1.618
        score += self._score_nearness(p3.price, target_w3_1618, 15)

        w3_range = p2.price - p3.price
        target_w4_236 = p3.price + w3_range * 0.236
        target_w4_382 = p3.price + w3_range * 0.382
        score += self._score_nearness(p4.price, target_w4_236, 6)
        score += self._score_nearness(p4.price, target_w4_382, 8)

        legs = self._make_legs(seq, ["0", "1", "2", "3", "4", "5"])
        return ElliottScenario(
            trend="bearish",
            degree="primary",
            pattern="impulse",
            legs=legs,
            score=round(score, 2),
            status="complete",
            invalidation_level=p0.price,
            notes=notes,
        )

    def _detect_bearish_zigzag(self, seq: list[Pivot]) -> ElliottScenario | None:
        """Detects a bearish ABC zigzag (A down, B up, C down). Signals a SHORT at C end."""
        a, b, c, d = seq
        if not (a.price > b.price < c.price > d.price):
            return None

        wave_a = a.price - b.price
        wave_c = c.price - d.price
        if wave_a <= 0 or wave_c <= 0:
            return None

        b_retrace, b_valid, b_notes = self._score_wave_b_retracement(
            wave_a_length=wave_a,
            b_retrace_amount=c.price - b.price,
            b_beyond_origin=c.price >= a.price,
        )
        if not b_valid:
            return None

        score = 40.0 + b_retrace
        ratio = wave_c / wave_a
        if 0.9 <= ratio <= 1.1:
            score += 15
        elif 1.2 <= ratio <= 1.7:
            score += 10

        legs = self._make_legs(seq, ["A", "B", "C", "end"])
        return ElliottScenario(
            trend="bearish",
            degree="primary",
            pattern="zigzag",
            legs=legs,
            score=round(score, 2),
            status="complete",
            invalidation_level=c.price,
            notes=["Bearish ABC zigzag candidate", *b_notes],
        )

    def _detect_bullish_zigzag(self, seq: list[Pivot]) -> ElliottScenario | None:
        """Detects a bullish ABC zigzag (A up, B down, C up). Signals a LONG at C end."""
        a, b, c, d = seq
        if not (a.price < b.price > c.price < d.price):
            return None

        wave_a = b.price - a.price
        wave_c = d.price - c.price
        if wave_a <= 0 or wave_c <= 0:
            return None

        b_retrace, b_valid, b_notes = self._score_wave_b_retracement(
            wave_a_length=wave_a,
            b_retrace_amount=b.price - c.price,
            b_beyond_origin=c.price <= a.price,
        )
        if not b_valid:
            return None

        score = 40.0 + b_retrace
        ratio = wave_c / wave_a
        if 0.9 <= ratio <= 1.1:
            score += 15
        elif 1.2 <= ratio <= 1.7:
            score += 10

        legs = self._make_legs(seq, ["A", "B", "C", "end"])
        return ElliottScenario(
            trend="bullish",
            degree="primary",
            pattern="zigzag",
            legs=legs,
            score=round(score, 2),
            status="complete",
            invalidation_level=c.price,
            notes=["Bullish ABC zigzag candidate", *b_notes],
        )

    def _score_wave_b_retracement(
        self,
        wave_a_length: float,
        b_retrace_amount: float,
        b_beyond_origin: bool,
    ) -> tuple[float, bool, list[str]]:
        """Score Wave B retracement of Wave A. Reject if B exceeds A origin."""
        if b_beyond_origin:
            return 0.0, False, ["Wave B retraced beyond Wave A origin"]

        ratio = b_retrace_amount / wave_a_length
        notes: list[str] = [f"Wave B retracement {ratio * 100:.1f}% of Wave A"]

        if 0.382 <= ratio <= 0.618:
            return 12.0, True, notes
        if 0.236 <= ratio <= 0.786:
            return 6.0, True, notes
        if ratio < 0.236 or ratio > 0.786:
            return 0.0, True, notes

        return 0.0, True, notes

    def _validate_bullish_impulse_setup(self, prices: list[float]) -> tuple[bool, list[str]]:
        p0, p1, p2, p3, p4 = prices
        notes: list[str] = []

        if p2 <= p0:
            return False, ["Wave 2 retraced beyond Wave 1 origin"]
        if p4 <= p1:
            return False, ["Wave 4 overlapped Wave 1 territory"]

        notes.append("Bullish impulse setup hard rules passed")
        return True, notes

    def _validate_bearish_impulse_setup(self, prices: list[float]) -> tuple[bool, list[str]]:
        p0, p1, p2, p3, p4 = prices
        notes: list[str] = []

        if p2 >= p0:
            return False, ["Wave 2 retraced beyond Wave 1 origin"]
        if p4 >= p1:
            return False, ["Wave 4 overlapped Wave 1 territory"]

        notes.append("Bearish impulse setup hard rules passed")
        return True, notes

    def _validate_bullish_impulse(self, prices: list[float]) -> tuple[bool, list[str]]:
        p0, p1, p2, p3, p4, p5 = prices
        notes: list[str] = []

        w1 = p1 - p0
        w3 = p3 - p2
        w5 = p5 - p4

        if p2 <= p0:
            return False, ["Wave 2 retraced beyond Wave 1 origin"]
        if p4 <= p1:
            return False, ["Wave 4 overlapped Wave 1 territory"]
        if abs(w3) < abs(w1) and abs(w3) < abs(w5):
            return False, ["Wave 3 is the shortest"]

        notes.append("Bullish impulse hard rules passed")
        return True, notes

    def _validate_bearish_impulse(self, prices: list[float]) -> tuple[bool, list[str]]:
        p0, p1, p2, p3, p4, p5 = prices
        notes: list[str] = []

        w1 = p0 - p1
        w3 = p2 - p3
        w5 = p4 - p5

        if p2 >= p0:
            return False, ["Wave 2 retraced beyond Wave 1 origin"]
        if p4 >= p1:
            return False, ["Wave 4 overlapped Wave 1 territory"]
        if abs(w3) < abs(w1) and abs(w3) < abs(w5):
            return False, ["Wave 3 is the shortest"]

        notes.append("Bearish impulse hard rules passed")
        return True, notes

    def _score_nearness(self, actual: float, target: float, max_points: float) -> float:
        if target == 0:
            return 0.0
        error = abs(actual - target) / abs(target)
        if error <= 0.01:
            return max_points
        if error <= 0.03:
            return max_points * 0.7
        if error <= 0.05:
            return max_points * 0.4
        return 0.0

    def _make_legs(self, seq: list[Pivot], labels: list[str]) -> list[WaveLeg]:
        legs: list[WaveLeg] = []
        for i in range(len(seq) - 1):
            legs.append(
                WaveLeg(
                    label=labels[i + 1],
                    start_idx=seq[i].index,
                    end_idx=seq[i + 1].index,
                    start_time=seq[i].time,
                    end_time=seq[i + 1].time,
                    start_price=seq[i].price,
                    end_price=seq[i + 1].price,
                )
            )
        return legs
