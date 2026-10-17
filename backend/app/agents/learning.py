"""Learning Agent — persistent experience memory that changes decisions.

Workflow per run:
 1. Load experience memory (per-route stats by similar context).
 2. Adjust raw ETAs with observed mean delay for that route/context.
 3. Score routes: U = 0.5·speed + 0.3·cost + 0.2·reliability (Laplace-smoothed).
 4. Deliver (simulated deterministic world) and observe actual arrival.
 5. Write the new delivery back to memory → future decisions change.

The memory lives in a JSON file so it survives restarts. It starts empty and
can be cleared; only simulated delivery outcomes are recorded.
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.agents.base import BaseAgent
from app.schemas import Route, Scenario
from app.simulation.evaluator import available_routes, min_max_scores, simulate_actual_arrival

WEIGHTS = {"speed": 0.50, "cost": 0.30, "reliability": 0.20}


class LearningAgent(BaseAgent):
    id = "learning"
    name = "Learning Agent"
    tagline = "Experience memory adjusts predictions, outcomes update memory"
    description = ("Keeps a persistent experience memory of simulated deliveries. Observed delays "
                   "raise time predictions for that route/context, reliability scores feed the "
                   "utility, and every run writes its outcome back — so decisions evolve.")
    color = "#f472b6"

    def __init__(self, store: Any) -> None:
        super().__init__()
        self.store = store

    def decide(self, scenario: Scenario) -> Any:
        self.reset_trace()
        t = self.trace
        routes = available_routes(scenario)
        stats_before = self.store.stats()

        t.add("memory", "perceive", "Load experience memory",
              _stats_text(stats_before),
              {"stats_before": stats_before})

        if not routes:
            t.add("action", "decide", "No available route", "Nothing to learn from this run.")
            return self.result(scenario, None, "abort_no_route", None, None,
                               "No available route; experience unchanged.", {})

        # --- prediction adjustment from experience --------------------------
        predictions: List[Dict[str, Any]] = []
        for r in routes:
            mean_delay, samples = self.store.mean_delay_for(r.id, scenario)
            predicted = round(r.travel_time_min + mean_delay, 2)
            rel = self.store.reliability_for(r.id, scenario)
            predictions.append({
                "route": r.id, "name": r.name, "eta": r.travel_time_min,
                "mean_delay": mean_delay, "predicted_time": predicted,
                "samples": samples, "reliability": rel,
                "cost": r.cost,
            })
        t.add("predict", "reason", "Adjust ETA predictions with experience",
              "; ".join(f"{p['name']}: {p['eta']:g} + {p['mean_delay']:g} "
                        f"({p['samples']} similar delivery samples) = {p['predicted_time']:g} min"
                        for p in predictions),
              {"predictions": predictions})

        # --- scoring ---------------------------------------------------------
        speeds = min_max_scores([p["predicted_time"] for p in predictions])
        costs = min_max_scores([p["cost"] for p in predictions])
        for p, sp, cs in zip(predictions, speeds, costs):
            p["speed_score"], p["cost_score"] = sp, cs
            p["utility"] = round(
                WEIGHTS["speed"] * sp + WEIGHTS["cost"] * cs +
                WEIGHTS["reliability"] * p["reliability"], 4)
        t.add("scorer", "reason", "Score with experience-weighted utility",
              "U = 0.5·speed + 0.3·cost + 0.2·reliability — " +
              "; ".join(f"{p['name']}: U {p['utility']:g}" for p in predictions),
              {"scores": [{k: p[k] for k in ("route", "speed_score", "cost_score",
                                             "reliability", "utility")} for p in predictions]})

        best = max(predictions, key=lambda p: (p["utility"], p["reliability"], -p["predicted_time"]))
        chosen_id = best["route"]
        chosen = next(r for r in routes if r.id == chosen_id)
        t.add("action", "decide", f"Experience points to {chosen.name}",
              f"Highest utility {best['utility']:g} (reliability {best['reliability']:g}) → "
              f"deliver via {chosen.name}.", {"chosen_route": chosen_id})

        # --- act + observe outcome ------------------------------------------
        actual = simulate_actual_arrival(chosen, scenario)
        on_time = actual <= scenario.deadline_min
        t.add("outcome", "act", "Deliver and observe outcome",
              f"Expected {chosen.travel_time_min:g} min, observed {actual:g} min → "
              f"{'ON TIME' if on_time else 'LATE'} (deadline {scenario.deadline_min:g} min).",
              {"expected_min": chosen.travel_time_min, "actual_min": actual, "on_time": on_time})

        stats_after = self.store.record(
            route_id=chosen.id, traffic=chosen.traffic_level, weather=scenario.weather,
            eta_min=chosen.travel_time_min, actual_min=actual, on_time=on_time)
        t.add("memory", "learn", "Update experience memory",
              _delta_text(stats_before, stats_after),
              {"stats_after": stats_after})

        summary = (f"Experience (before: {_counts(stats_before)}) predicted {chosen.name} at "
                   f"{best['predicted_time']:g} min → delivered in {actual:g} min "
                   f"({'on time' if on_time else 'LATE'}); memory updated "
                   f"(after: {_counts(stats_after)}).")
        return self.result(scenario, chosen.id, f"deliver_via_route_{chosen.id}",
                           chosen.travel_time_min, chosen.cost, summary,
                           {"stats_before": stats_before, "stats_after": stats_after,
                            "predictions": predictions, "outcome": {
                                "expected_min": chosen.travel_time_min,
                                "actual_min": actual, "on_time": on_time}})


def _counts(stats: Dict[str, Any]) -> str:
    return ", ".join(f"{rid}: {v['count']} deliveries" for rid, v in sorted(stats.items())) or "empty"


def _stats_text(stats: Dict[str, Any]) -> str:
    if not stats:
        return "Experience memory is EMPTY — cold start, neutral priors (reliability 0.5)."
    parts = []
    for rid, v in sorted(stats.items()):
        parts.append(f"{rid}: {v['count']} deliveries, on-time {v['on_time_rate'] * 100:.0f}%, "
                     f"mean observed delay {v['mean_delay']:g} min")
    return " · ".join(parts)


def _delta_text(before: Dict[str, Any], after: Dict[str, Any]) -> str:
    parts = []
    for rid, v in sorted(after.items()):
        b = before.get(rid, {"count": 0, "on_time_rate": None, "mean_delay": 0.0})
        parts.append(f"{rid}: {b['count']}→{v['count']} deliveries, "
                     f"on-time {v['on_time_rate'] * 100:.0f}%, mean delay {v['mean_delay']:g} min")
    return " · ".join(parts)
