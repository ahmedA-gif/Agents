"""Shared environment helpers used by every agent.

The route list carries *effective* travel times (the environment state), so
agents reason over the same observed world; only their internal processing
differs.
"""
from __future__ import annotations

from typing import Dict, List

from app.schemas import Route, Scenario

TRAFFIC_RANK = {"light": 0, "moderate": 1, "heavy": 2}
TRAFFIC_SCORE = {"light": 1.0, "moderate": 0.6, "heavy": 0.2}


def available_routes(scenario: Scenario) -> List[Route]:
    """Filter unavailable routes before any agent reasons about them."""
    return [r for r in scenario.routes if r.available]


def fastest_route(routes: List[Route]) -> Route:
    return min(routes, key=lambda r: (r.travel_time_min, r.id))


def on_time(eta: float, deadline: float) -> bool:
    return eta <= deadline


def min_max_scores(values: List[float]) -> List[float]:
    """Normalise so best (lowest) raw value -> 1.0, worst -> 0.0.

    If every value is equal (or a single candidate) all candidates score 1.0.
    """
    if not values:
        return []
    lo, hi = min(values), max(values)
    if hi - lo < 1e-9:
        return [1.0 for _ in values]
    return [round(1.0 - (v - lo) / (hi - lo), 4) for v in values]


def simulate_actual_arrival(route: Route, scenario: Scenario) -> float:
    """Deterministic 'real world' outcome the Learning Agent observes.

    Deliberately harsher than the ETA under bad conditions so experience
    accumulates a real, visible signal (heavy traffic and rain cause delays).
    """
    traffic_delay = {"light": 0.0, "moderate": 1.0, "heavy": 3.0}[route.traffic_level]
    weather_delay = 0.0 if scenario.weather == "clear" else 1.0 + 0.1 * route.distance_km
    return round(route.travel_time_min + traffic_delay + weather_delay, 2)


def route_report(scenario: Scenario) -> Dict[str, Dict[str, float]]:
    """Small numeric snapshot of every route, used in traces and tests."""
    report: Dict[str, Dict[str, float]] = {}
    for r in scenario.routes:
        report[r.id] = {
            "distance_km": r.distance_km,
            "travel_time_min": r.travel_time_min,
            "cost": r.cost,
            "traffic_score": TRAFFIC_SCORE[r.traffic_level],
            "available": 1.0 if r.available else 0.0,
        }
    return report
