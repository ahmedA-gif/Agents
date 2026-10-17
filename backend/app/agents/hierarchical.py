"""Hierarchical Agent — executes the six assignment subtasks in sequence.

    1 Accept Order → 2 Evaluate Conditions → 3 Select Route →
    4 Pick Up Food → 5 Deliver Food → 6 Confirm Delivery

Route selection inside task 3 delegates to a simple min-ETA policy over
available routes; the point of this agent is the observable task pipeline.
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.agents.base import BaseAgent
from app.schemas import Scenario
from app.simulation.evaluator import available_routes, fastest_route

TASK_LABELS = [
    ("accept_order", "Accept Order"),
    ("evaluate_conditions", "Evaluate Conditions"),
    ("select_route", "Select Route"),
    ("pickup_food", "Pick Up Food"),
    ("deliver_food", "Deliver Food"),
    ("confirm_delivery", "Confirm Delivery"),
]
TASK_NODE = {"accept_order": "t1", "evaluate_conditions": "t2", "select_route": "t3",
             "pickup_food": "t4", "deliver_food": "t5", "confirm_delivery": "t6"}


class HierarchicalAgent(BaseAgent):
    id = "hierarchical"
    name = "Hierarchical Agent"
    tagline = "Six delivery subtasks executed in strict order"
    description = ("Decomposes the delivery into six sequential subtasks and executes them one by "
                   "one, tracking progress. Route selection is a delegated simple policy; the "
                   "agent can abort cleanly if no route is available.")
    color = "#fbbf24"

    def decide(self, scenario: Scenario) -> Any:
        self.reset_trace()
        t = self.trace
        routes = available_routes(scenario)

        t.add("planner", "plan", "Decompose into 6 subtasks",
              "Plan: " + " → ".join(label for _, label in TASK_LABELS),
              {"tasks": [tid for tid, _ in TASK_LABELS]})

        tasks: List[Dict[str, Any]] = []
        chosen = None
        aborted = not routes

        def finish(task_id: str, status: str, detail: str, data: Dict[str, Any] | None = None):
            tasks.append({"id": task_id, "label": dict(TASK_LABELS)[task_id],
                          "status": status, "detail": detail, "data": data or {}})
            t.add(TASK_NODE[task_id], "act" if task_id != "select_route" else "decide",
                  f"{dict(TASK_LABELS)[task_id]} — {status}",
                  detail, data)

        # 1 — accept order
        finish("accept_order", "completed",
               f"Order accepted (value Rs.{scenario.order_value:g}, priority {scenario.priority}).",
               {"order_value": scenario.order_value})

        # 2 — evaluate conditions
        cond = (f"Weather {scenario.weather}; priority {scenario.priority}; "
                f"deadline {scenario.deadline_min:g} min; routes: "
                + "; ".join(f"{r.name} {r.travel_time_min:g}m/{r.traffic_level}"
                            f"{'' if r.available else ' (UNAVAILABLE)'}" for r in scenario.routes) + ".")
        finish("evaluate_conditions", "completed", cond,
               {"weather": scenario.weather, "priority": scenario.priority,
                "deadline_min": scenario.deadline_min})

        # 3 — select route (simple delegated policy)
        if aborted:
            finish("select_route", "failed",
                   "No available route — aborting the task chain. Remaining tasks cancelled.")
            t.add("abort", "decide", "Abort delivery",
                  "All routes unavailable; planner cancelled tasks 4–6.")
            return self.result(scenario, None, "abort_no_route", None, None,
                               "Aborted at task 3: no available route.",
                               {"tasks": tasks, "completed_count": sum(1 for x in tasks if x["status"] == "completed")})
        chosen = fastest_route(routes)
        finish("select_route", "completed",
               f"Delegated policy (min ETA among available) → {chosen.name} "
               f"({chosen.travel_time_min:g} min).",
               {"chosen_route": chosen.id})

        # 4 — pick up food (preparation folded into ETA)
        finish("pickup_food", "completed",
               f"Food picked up from restaurant via {chosen.name}; handoff time folded into ETA.")

        # 5 — deliver food
        eta = chosen.travel_time_min
        on_time = eta <= scenario.deadline_min
        finish("deliver_food", "completed",
               f"Delivered in {eta:g} min → "
               f"{'within' if on_time else 'OVER'} the {scenario.deadline_min:g} min deadline.",
               {"eta_min": eta, "on_time": on_time})

        # 6 — confirm delivery
        status = "on-time" if on_time else "late"
        finish("confirm_delivery", "completed",
               f"Delivery confirmed ({status}); customer notified. Order closed.")

        summary = (f"Completed 6/6 subtasks in order → deliver via {chosen.name} "
                   f"(ETA {eta:g} min, {status} vs {scenario.deadline_min:g} min deadline).")
        return self.result(scenario, chosen.id, f"deliver_via_route_{chosen.id}",
                           eta, chosen.cost, summary,
                           {"tasks": tasks, "completed_count": 6, "total_tasks": 6})
