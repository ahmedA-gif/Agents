"""Utility-Based Agent — documented weighted scoring with min-max normalization.

    U(route) = 0.50·time_score + 0.30·cost_score + 0.20·comfort_score

Unavailable routes are filtered out BEFORE scoring. Weights are fixed by
design (context adaptation is the Contextual Agent's job).
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.agents.base import BaseAgent
from app.schemas import Route, Scenario
from app.simulation.evaluator import available_routes, min_max_scores, TRAFFIC_SCORE

WEIGHTS = {"time": 0.50, "cost": 0.30, "comfort": 0.20}
FORMULA = "U = 0.50·time + 0.30·cost + 0.20·comfort  (each factor min-max normalized 0–1, higher is better)"


class UtilityBasedAgent(BaseAgent):
    id = "utility_based"
    name = "Utility-Based Agent"
    tagline = "Weighted utility: U = 0.50·time + 0.30·cost + 0.20·comfort"
    description = ("Computes an explicit utility score for every available route from "
                   "normalised time, cost and traffic-comfort factors with fixed weights, "
                   "then selects the argmax.")
    color = "#38bdf8"

    def decide(self, scenario: Scenario) -> Any:
        self.reset_trace()
        t = self.trace
        routes = available_routes(scenario)

        t.add("percept", "perceive", "Read percept",
              f"Scoring {len(routes)} available route(s) with FIXED weights "
              f"(weights do not change with context — that is the Contextual Agent's job).",
              {"weights": WEIGHTS})

        if not routes:
            t.add("action", "decide", "No available route", "Nothing to score.")
            return self.result(scenario, None, "abort_no_route", None, None,
                               "No available route to score.", {"weights": WEIGHTS})

        factors: List[Dict[str, Any]] = []
        for r in routes:
            factors.append({
                "route": r.id, "name": r.name, "time": r.travel_time_min,
                "cost": r.cost, "comfort": TRAFFIC_SCORE[r.traffic_level],
            })
        t.add("factors", "perceive", "Extract raw factors",
              "; ".join(f"{f['name']}: time {f['time']:g}m, cost Rs.{f['cost']:g}, "
                        f"comfort {f['comfort']:g}" for f in factors),
              {"factors": factors})

        times = min_max_scores([f["time"] for f in factors])
        costs = min_max_scores([f["cost"] for f in factors])
        for f, ts, cs in zip(factors, times, costs):
            f["time_score"], f["cost_score"] = ts, cs

        t.add("normalize", "reason", "Normalize factors (min-max)",
              "Lower time/cost is better → best-in-set scores 1.0. "
              + "; ".join(f"{f['name']}: time {f['time_score']:g}, cost {f['cost_score']:g}"
                          for f in factors),
              {"normalized": [{"route": f["route"], "time": f["time_score"],
                               "cost": f["cost_score"]} for f in factors]})

        for f in factors:
            f["utility"] = round(
                WEIGHTS["time"] * f["time_score"] +
                WEIGHTS["cost"] * f["cost_score"] +
                WEIGHTS["comfort"] * f["comfort"], 4)
        t.add("scorer", "reason", "Apply weighted formula", FORMULA,
              {"formula": FORMULA,
               "scores": [{k: f[k] for k in ("route", "time_score", "cost_score",
                                             "comfort", "utility")} for f in factors]})

        best = max(factors, key=lambda f: (f["utility"], -f["time"]))
        chosen_id = best["route"]
        chosen = next(r for r in routes if r.id == chosen_id)
        t.add("compare", "decide", f"Winner: {chosen.name} (U = {best['utility']:g})",
              "; ".join(f"{f['name']} → U {f['utility']:g}" for f in factors),
              {"winner": chosen_id, "scores": {f["route"]: f["utility"] for f in factors}})

        t.add("action", "act", f"Deliver via {chosen.name}",
              f"Highest utility {best['utility']:g} → deliver via {chosen.name}.",
              {"chosen_route": chosen_id})

        summary = (f"Utilities: " + ", ".join(f"{f['name']} {f['utility']:g}" for f in factors) +
                   f" → {chosen.name} wins (ETA {chosen.travel_time_min:g} min, Rs.{chosen.cost:g}).")
        return self.result(scenario, chosen.id, f"deliver_via_route_{chosen_id}",
                           chosen.travel_time_min, chosen.cost, summary,
                           {"weights": WEIGHTS, "formula": FORMULA,
                            "factors": factors, "winner": chosen_id})
