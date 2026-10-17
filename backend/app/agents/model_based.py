"""Model-Based Reflex Agent — internal state + rules over the updated state.

The agent keeps a small internal state per scenario (last weather, congestion
history, run count), folds each new percept into it, and then applies rules
that can reference remembered information, not just the current percept.
"""
from __future__ import annotations

from collections import deque
from typing import Any, Dict, List

from app.agents.base import BaseAgent
from app.schemas import Route, Scenario
from app.simulation.evaluator import available_routes


class ModelBasedAgent(BaseAgent):
    id = "model_based"
    name = "Model-Based Reflex Agent"
    tagline = "Internal state + rules over the updated state"
    description = ("Stores percepts in internal state, updates the state with each observation, "
                   "and applies rules informed by the resulting world model (e.g. chronic congestion).")
    color = "#a78bfa"

    def __init__(self) -> None:
        super().__init__()
        # scenario_id -> internal state (persists between runs of the same scenario)
        self._states: Dict[str, Dict[str, Any]] = {}

    def reset_state(self) -> None:
        self._states = {}

    def decide(self, scenario: Scenario) -> Any:
        self.reset_trace()
        t = self.trace
        routes = available_routes(scenario)
        state = self._states.get(scenario.id, self._empty_state())

        t.add("percept", "perceive", "Read new percept",
              f"Weather: {scenario.weather} · priority: {scenario.priority} · "
              f"routes: {[(r.id, r.traffic_level, f'{r.travel_time_min:g}m') for r in scenario.routes]}",
              {"percept": {"weather": scenario.weather, "priority": scenario.priority}})

        t.add("memory", "reason", "Retrieve internal state",
              "Previous state: " + self._fmt_state(state),
              {"state_before": state})

        # --- state update: fold percept into memory ------------------------
        new_state = self._update_state(state, scenario)
        t.add("update", "reason", "Update internal state",
              "Updated: " + self._fmt_state(new_state),
              {"state_after": new_state})

        # --- world model inference -----------------------------------------
        chronic = [rid for rid, hist in new_state["congestion_history"].items()
                   if self._chronic(hist)]
        chronic_names = ", ".join(chronic) if chronic else "none"
        inference = (f"Congestion history: "
                     f"{ {rid: list(hist) for rid, hist in new_state['congestion_history'].items()} }. "
                     f"Chronically congested routes: {chronic_names}.")
        t.add("model", "reason", "Infer from world model", inference,
              {"chronic_congestion": chronic})

        # --- rules over the updated state -----------------------------------
        trusted = [r for r in routes if r.id not in chronic]
        pool = trusted or routes
        chosen = min(pool, key=lambda r: (r.travel_time_min, r.id))

        if chronic and trusted:
            rule_note = (f"R1 fired: {chronic_names} chronically congested — excluded. "
                         f"R2 fired: choose fastest trusted route.")
            rule = "R1+R2"
        elif chronic and not trusted:
            rule_note = ("All candidates chronically congested — exclusion ignored; "
                         "fallback to fastest available.")
            rule = "R3"
        else:
            rule_note = "No chronic congestion remembered; default rule: fastest available route."
            rule = "R2"

        t.add("rules", "reason", "Apply model-informed rules", rule_note, {"fired_rule": rule})

        t.add("action", "act", f"Deliver via {chosen.name}",
              f"Chosen {chosen.name} based on state-updated model "
              f"(ETA {chosen.travel_time_min:g} min vs deadline {scenario.deadline_min:g} min).",
              {"chosen_route": chosen.id})

        self._states[scenario.id] = new_state
        summary = (f"Updated internal state (run #{new_state['runs_seen']}), model says "
                   f"chronic congestion: {chronic_names} → deliver via {chosen.name} "
                   f"(ETA {chosen.travel_time_min:g} min).")
        return self.result(scenario, chosen.id, f"deliver_via_route_{chosen.id}",
                           chosen.travel_time_min, chosen.cost, summary,
                           {"state_before": state, "state_after": new_state,
                            "chronic_congestion": chronic, "fired_rule": rule})

    # -- internals ---------------------------------------------------------
    @staticmethod
    def _empty_state() -> Dict[str, Any]:
        return {"runs_seen": 0, "last_weather": None, "last_priority": None,
                "congestion_history": {}, "urgent_history": []}

    @staticmethod
    def _update_state(state: Dict[str, Any], scenario: Scenario) -> Dict[str, Any]:
        s: Dict[str, Any] = {
            "runs_seen": state["runs_seen"] + 1,
            "last_weather": scenario.weather,
            "last_priority": scenario.priority,
            "congestion_history": {rid: deque(h, maxlen=3) for rid, h in state["congestion_history"].items()},
            "urgent_history": list(state["urgent_history"])[-2:],
        }
        for r in scenario.routes:
            s["congestion_history"].setdefault(r.id, deque(maxlen=3))
            s["congestion_history"][r.id].append(r.traffic_level)
        s["urgent_history"].append(scenario.priority == "urgent")
        s["congestion_history"] = {rid: list(h) for rid, h in s["congestion_history"].items()}
        return s

    @staticmethod
    def _chronic(history: List[str]) -> bool:
        """Chronic = at least 2 consecutive 'heavy' observations."""
        run = 0
        for level in history:
            run = run + 1 if level == "heavy" else 0
            if run >= 2:
                return True
        return False

    @staticmethod
    def _fmt_state(state: Dict[str, Any]) -> str:
        hist = {rid: list(h) for rid, h in state["congestion_history"].items()}
        return (f"runs={state['runs_seen']}, weather={state['last_weather']}, "
                f"congestion={hist}")
