from __future__ import annotations


def traffic_delay_factor(hour_of_day: int) -> float:
    if hour_of_day in {7, 8, 17, 18}:
        return 1.5
    return 1.0
