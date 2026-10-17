"""Goal-Based Agent — explicit goal, feasibility testing, documented fallback.

The goal is a hard deadline. Every AVAILABLE route is tested for feasibility
(travel_time ≤ deadline). If at least one is feasible the agent picks the
fastest feasible one; if none is, it honestly reports infeasibility and
executes a documented fallback (minimum-overrun route + customer warning).
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.agents.base import BaseAgent
from app.schemas import Route, Scenario
from app.simulation.evaluator import available_routes


class GoalBasedAgent(BaseAgent):
    id = "goal_based"
    name = "Goal-Based Agent"
    tagline = "Deadline feasibility → fastest feasible route"
    description = ("Tests each available route against the hard deadline goal, selects the "
                   "fastest feasible route, and reports honestly (with a documented fallback) "
                   "when the goal cannot be achieved.")
    color = "#10b981"

    def decide(self, scenario: Scenario) -> Any:
        self.reset_trace()
        t = self.trace
        routes = available_routes(scenario)

        t.add("goal", "perceive", "Adopt explicit goal",
              f"Goal: deliver food within {scenario.deadline_min:g} min "
              f"(priority: {scenario.priority}, weather: {scenario.weather}).",
              {"goal": {"deadline_min": scenario.deadline_min, "priority": scenario.priority}})

        t.add("candidates", "plan", "Enumerate candidate routes",
              "Available: " + ", ".join(f"{r.name} ({r.travel_time_min:g} min)"
                                        for r in routes) +
              ("." if len(scenario.routes) == len(routes) else
               f" — filtered out unavailable: {[r.name for r in scenario.routes if not r.available]}."),
              {"candidates": [{"id": r.id, "name": r.name, "time": r.travel_time_min} for r in routes]})

        feasibility: List[Dict[str, Any]] = []
        feasible: List[Route] = []
        for r in routes:
            ok = r.travel_time_min <= scenario.deadline_min
            feasibility.append({
                "route": r.id, "name": r.name, "travel_time_min": r.travel_time_min,
                "deadline_min": scenario.deadline_min, "feasible": ok,
                "slack_min": round(scenario.deadline_min - r.travel_time_min, 2),
            })
            if ok:
                feasible.append(r)
            t.add("checks", "reason", f"Feasibility test — {r.name}",
                  f"{r.travel_time_min:g} min ≤ {scenario.deadline_min:g} min → "
                  f"{'FEASIBLE' if ok else 'INFEASIBLE'} "
                  f"(slack {round(scenario.deadline_min - r.travel_time_min, 2):g} min).",
                  {"route": r.id, "feasible": ok})

        if feasible:
            chosen = min(feasible, key=lambda r: (r.travel_time_min, r.id))
            t.add("decision", "decide", f"Goal achievable → {chosen.name}",
                  f"{len(feasible)} feasible route(s): {[r.id for r in feasible]}. "
                  f"Choosing fastest feasible: {chosen.name} "
                  f"(arrives {chosen.travel_time_min:g} ≤ {scenario.deadline_min:g} min).",
                  {"feasible": [r.id for r in feasible]})
            t.add("action", "act", f"Deliver via {chosen.name}",
                  "Committing to the fastest feasible route.", {"chosen_route": chosen.id})
            summary = (f"Goal analysis: {len(feasible)}/{len(routes)} available route(s) meet the "
                       f"{scenario.deadline_min:g} min deadline → deliver via {chosen.name} "
                       f"({chosen.travel_time_min:g} min).")
            return self.result(scenario, chosen.id, f"deliver_via_route_{chosen.id}",
                               chosen.travel_time_min, chosen.cost, summary,
                               {"feasibility": feasibility, "goal_achievable": True})

        # --- documented fallback: goal infeasible ----------------------------
        best = min(routes, key=lambda r: (r.travel_time_min - scenario.deadline_min, r.id))
        overrun = round(best.travel_time_min - scenario.deadline_min, 2)
        t.add("fallback", "decide", "Deadline infeasible — documented fallback",
              f"No available route meets the {scenario.deadline_min:g} min deadline. "
              f"FALLBACK: take {best.name} (minimum overrun {overrun:g} min) and warn the "
              f"customer about the late delivery. The goal is NOT claimed achieved.",
              {"goal_achievable": False, "min_overrun_min": overrun, "fallback_route": best.id})
        t.add("action", "act", f"Fallback: deliver via {best.name} with delay warning",
              f"Action: deliver_via_route_{best.id}_late (overruns by {overrun:g} min).",
              {"chosen_route": best.id, "late": True})
        summary = (f"Deadline infeasible (best route {best.name} arrives in "
                   f"{best.travel_time_min:g} min vs {scenario.deadline_min:g} min deadline, "
                   f"overrun {overrun:g} min) → documented fallback with customer warning.")
        return self.result(scenario, best.id, f"deliver_via_route_{best.id}_late",
                           best.travel_time_min, best.cost, summary,
                           {"feasibility": feasibility, "goal_achievable": False,
                            "fallback": {"route": best.id, "overrun_min": overrun}})
