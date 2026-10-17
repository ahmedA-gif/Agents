"""Contextual Agent — context-fused scoring; context changes the decision.

Base weights are blended with priority and weather adjustments, then routes
are scored on time, cost, comfort and rain-exposure (shorter distance =
less exposure). The trace explains exactly which context fields shifted
the weights.
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.agents.base import BaseAgent
from app.schemas import Route, Scenario
from app.simulation.evaluator import available_routes, min_max_scores, TRAFFIC_SCORE

BASE_WEIGHTS = {"time": 0.45, "cost": 0.35, "comfort": 0.20, "exposure": 0.0}
URGENT_WEIGHTS = {"time": 0.60, "cost": 0.15, "comfort": 0.05, "exposure": 0.20}
RAIN_WEIGHTS = {"time": 0.40, "cost": 0.10, "comfort": 0.30, "exposure": 0.20}


def adapt_weights(scenario: Scenario) -> Dict[str, float]:
    """Blend base → priority adjustment → weather adjustment, then normalise."""
    w = dict(BASE_WEIGHTS)
    if scenario.priority == "urgent":
        w = {k: (w[k] + URGENT_WEIGHTS[k]) / 2 for k in w}
    if scenario.weather == "rain":
        w = {k: (w[k] + RAIN_WEIGHTS[k]) / 2 for k in w}
    total = sum(w.values())
    return {k: round(v / total, 4) for k, v in w.items()}


class ContextualAgent(BaseAgent):
    id = "contextual"
    name = "Contextual Agent"
    tagline = "Fuses weather, priority and traffic into adapted weights"
    description = ("Extracts weather, priority and traffic context, blends them into "
                   "situation-adapted scoring weights, and picks the best route for THIS "
                   "situation. Change the context and the decision can change.")
    color = "#22d3ee"

    def decide(self, scenario: Scenario) -> Any:
        self.reset_trace()
        t = self.trace
        routes = available_routes(scenario)

        if not routes:
            t.add("action", "decide", "No available route", "No route to evaluate.")
            return self.result(scenario, None, "abort_no_route", None, None,
                               "No available route.", {})

        active_context = self._active_context(scenario)
        t.add("percept", "perceive", "Read situation context",
              "Active context fields: " + "; ".join(active_context) + ".",
              {"active_context": active_context})

        weights = adapt_weights(scenario)
        t.add("ctxp", "reason", "Priority context → weights",
              f"Priority '{scenario.priority}' "
              + ("boosts speed weight (urgent orders favour time)"
                 if scenario.priority == "urgent" else "keeps balanced weights"),
              {"priority": scenario.priority})

        t.add("ctxw", "reason", "Weather context → weights",
              f"Weather '{scenario.weather}' {'adds rain-exposure factor (shorter distance preferred)' if scenario.weather == 'rain' else 'no exposure factor needed'}",
              {"weather": scenario.weather})

        t.add("ctxt", "reason", "Traffic context → comfort scores",
              "Comfort per route: " + "; ".join(f"{r.name} {TRAFFIC_SCORE[r.traffic_level]:g}" for r in routes),
              {"traffic": {r.id: r.traffic_level for r in routes}})

        analysis = self._score(routes, scenario, weights)
        t.add("combiner", "reason", "Combine context into scoring profile",
              f"Adapted weights: " + ", ".join(f"{k} {v:g}" for k, v in weights.items()) +
              f" (base was " + ", ".join(f"{k} {v:g}" for k, v in BASE_WEIGHTS.items()) + ")",
              {"weights_used": weights, "weights_base": BASE_WEIGHTS})

        best = max(analysis, key=lambda a: (a["score"], -a["time"]))
        chosen_id = best["route"]
        chosen = next(r for r in routes if r.id == chosen_id)
        t.add("scorer", "reason", "Score routes in this context",
              "; ".join(f"{a['name']} → {a['score']:g}" for a in analysis),
              {"scores": {a["route"]: a["score"] for a in analysis},
               "per_route": analysis})

        t.add("action", "act", f"Context-best route: {chosen.name}",
              f"For context ({scenario.weather}, {scenario.priority}) → deliver via {chosen.name}.",
              {"chosen_route": chosen_id, "why": best["why"]})

        summary = (f"Context ({scenario.weather}/{scenario.priority}) adapted weights → "
                   f"{chosen.name} scores highest ({best['score']:g}); "
                   f"{best['why']}.")
        return self.result(scenario, chosen.id, f"deliver_via_route_{chosen.id}",
                           chosen.travel_time_min, chosen.cost, summary,
                           {"active_context": active_context, "weights_used": weights,
                            "weights_base": BASE_WEIGHTS, "per_route": analysis,
                            "winner": chosen_id})

    # -- internals ---------------------------------------------------------
    @staticmethod
    def _active_context(scenario: Scenario) -> List[str]:
        fields = [f"weather={scenario.weather}", f"priority={scenario.priority}",
                  f"deadline={scenario.deadline_min:g} min"]
        for r in scenario.routes:
            fields.append(f"{r.id}.traffic={r.traffic_level}")
        return fields

    @staticmethod
    def _score(routes: List[Route], scenario: Scenario,
               weights: Dict[str, float]) -> List[Dict[str, Any]]:
        times = min_max_scores([r.travel_time_min for r in routes])
        costs = min_max_scores([r.cost for r in routes])
        dists = min_max_scores([r.distance_km for r in routes])
        out: List[Dict[str, Any]] = []
        for r, ts, cs, ds in zip(routes, times, costs, dists):
            comfort = TRAFFIC_SCORE[r.traffic_level]
            exposure = ds  # shorter distance → less rain exposure
            score = round(weights["time"] * ts + weights["cost"] * cs +
                          weights["comfort"] * comfort + weights["exposure"] * exposure, 4)
            whys: List[str] = []
            if ts == 1.0:
                whys.append("fastest available")
            if cs == 1.0:
                whys.append("cheapest")
            if comfort == 1.0:
                whys.append("light traffic")
            if exposure == 1.0 and weights["exposure"] > 0:
                whys.append("least rain exposure")
            out.append({
                "route": r.id, "name": r.name, "time": r.travel_time_min,
                "time_score": ts, "cost_score": cs, "comfort": comfort,
                "exposure": exposure, "score": score,
                "why": " + ".join(whys) if whys else "balanced compromise",
            })
        return out
