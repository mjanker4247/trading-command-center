from elliott_wave.models.fib import FibLevels
from elliott_wave.utils.validation import ensure_positive


class FibonacciEngine:
    RETRACEMENTS = {
        "23.6%": 0.236,
        "38.2%": 0.382,
        "50.0%": 0.5,
        "61.8%": 0.618,
        "78.6%": 0.786,
    }

    EXTENSIONS = {
        "100%": 1.0,
        "127.2%": 1.272,
        "161.8%": 1.618,
        "200%": 2.0,
        "261.8%": 2.618,
    }

    def retracements(self, low: float, high: float) -> FibLevels:
        ensure_positive(high - low, "high - low")
        diff = high - low
        levels = {name: high - diff * ratio for name, ratio in self.RETRACEMENTS.items()}
        return FibLevels(anchor_a=low, anchor_b=high, levels=levels, kind="retracement")

    def extensions(self, low: float, high: float, retrace_end: float) -> FibLevels:
        ensure_positive(high - low, "high - low")
        move = high - low
        levels = {name: retrace_end + move * ratio for name, ratio in self.EXTENSIONS.items()}
        return FibLevels(anchor_a=low, anchor_b=high, levels=levels, kind="extension")