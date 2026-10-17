"""Simple Reflex Agent — condition-action rules on the CURRENT percept only.

Rule order matters: the FIRST matching rule fires and the agent acts. There
is no memory, no state, no feasibility check, no learning.
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.agents.base import BaseAgent
from app.schemas import Route, Scenario
from app.simulation.evaluator import available_routes, TRAFFIC_RANK


class SimpleReflexAgent(BaseAgent):
    id = "simple_reflex"
    name = "Simple Reflex Agent"
    tagline = "IF–THEN rules on the current percept"
    description = ("Matches condition–action rules against the current percept in a fixed "
                   "order and fires the first rule that matches. No memory, no goal, no utility.")
    color = "#f97316"

    def decide(self, scenario: Scenario) -> Any:
        self.reset_trace()
        t = self.trace
        routes = available_routes(scenario)

        t.add("percept", "perceive", "Read current percept",
              f"Weather: {scenario.weather} · priority: {scenario.priority} · "
              f"deadline: {scenario.deadline_min:g} min · routes seen: "
              f"{[r.id for r in scenario.routes]} (available: {[r.id for r in routes]})",
              {"percept": {"weather": scenario.weather, "priority": scenario.priority,
                            "deadline_min": scenario.deadline_min,
                            "routes": [r.id for r in scenario.routes]}})

        evaluations: List[Dict[str, Any]] = []
        chosen: Route | None = None
        fired = None

        # R1 — urgency fast-path (reflex ignores the deadline!)
        r1_match = scenario.priority == "urgent" and routes
        evaluations.append(self._eval("R1", "priority == urgent",
                                      "choose FASTEST available route (no deadline check)",
                                      r1_match))
        t.add("r1", "reason", "Test rule R1 (urgent → fastest)",
              ("FIRED — priority is urgent: reflex takes the fastest route, "
               "unaware of the deadline." if r1_match else
               "Not fired (priority is not urgent)."),
              {"matched": r1_match})
        if r1_match:
            fired, chosen = "R1", min(routes, key=lambda r: (r.travel_time_min, r.id))

        if fired is None:
            # R2 — rain avoidance on current percept
            r2_match = scenario.weather == "rain" and routes
            evaluations.append(self._eval("R2", "weather == rain",
                                          "choose lightest-traffic route, tie-break by time",
                                          r2_match))
            t.add("r2", "reason", "Test rule R2 (rain → lightest traffic)",
                  ("FIRED — weather is rain: avoid congested routes on this percept."
                   if r2_match else "Not fired (weather is not rain)."),
                  {"matched": r2_match})
            if r2_match:
                fired = "R2"
                chosen = min(routes, key=lambda r: (TRAFFIC_RANK[r.traffic_level], r.travel_time_min, r.id))

        if fired is None:
            # R3 — default fastest
            r3_match = bool(routes)
            evaluations.append(self._eval("R3", "any route available",
                                          "choose fastest available route", r3_match))
            t.add("r3", "reason", "Test rule R3 (default → fastest)",
                  (f"FIRED — defaulting to fastest available route "
                   f"({min(routes, key=lambda r: r.travel_time_min).name})."
                   if r3_match else "Not fired — no route available at all."),
                  {"matched": r3_match})
            if r3_match:
                fired = "R3"
                chosen = min(routes, key=lambda r: (r.travel_time_min, r.id))

        if chosen is None:
            t.add("action", "decide", "No action possible",
                  "No route is available; the agent has no rule for this case.")
            return self.result(scenario, None, "abort_no_route", None, None,
                               "Reflex found no available route and has no rule to cope.",
                               {"rules_evaluated": evaluations, "fired_rule": None})

        t.add("action", "act", f"Fire rule {fired} → deliver via {chosen.name}",
              f"Action: deliver food via {chosen.name} "
              f"(reflex does not verify the {scenario.deadline_min:g} min deadline).",
              {"fired_rule": fired})

        summary = (f"Rule {fired} fired on the current percept → deliver via {chosen.name} "
                   f"(ETA {chosen.travel_time_min:g} min). Reflex never checks feasibility or history.")
        return self.result(scenario, chosen.id, f"deliver_via_route_{chosen.id}",
                           chosen.travel_time_min, chosen.cost, summary,
                           {"rules_evaluated": evaluations, "fired_rule": fired})

    @staticmethod
    def _eval(rule: str, condition: str, action: str, matched: bool) -> Dict[str, Any]:
        return {"rule": rule, "condition": condition, "action": action, "matched": matched}
