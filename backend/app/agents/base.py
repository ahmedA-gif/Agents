"""Base agent class + registry helpers.

Every agent returns an :class:`AgentDecision` whose `reasoning` trace is a
list of :class:`TraceStep` objects. Each trace step carries a `node_id` that
exists in that agent's architecture graph (see ``architectures.py``) — the
frontend animates exactly those steps over that graph.
"""
from __future__ import annotations

from typing import Any, Dict, List

from app.schemas import AgentDecision, Scenario, TraceStep

PHASE_PREFIX = {
    "perceive": "Perceive",
    "reason": "Reason",
    "decide": "Decide",
    "plan": "Plan",
    "act": "Act",
    "learn": "Learn",
    "outcome": "Outcome",
}


class TraceBuilder:
    """Accumulates ordered reasoning steps with auto-incrementing index."""

    def __init__(self) -> None:
        self.steps: List[TraceStep] = []

    def add(self, node_id: str, phase: str, label: str, detail: str,
            data: Dict[str, Any] | None = None) -> None:
        self.steps.append(
            TraceStep(
                index=len(self.steps),
                node_id=node_id,
                phase=phase,  # type: ignore[arg-type]
                label=label,
                detail=detail,
                data=data or {},
            )
        )

    @property
    def count(self) -> int:
        return len(self.steps)


class BaseAgent:
    """Subclass and set the class metadata; implement :meth:`decide`."""

    id: str = "base"
    name: str = "Base Agent"
    tagline: str = ""
    description: str = ""
    color: str = "#38bdf8"

    def __init__(self) -> None:
        self.trace = TraceBuilder()

    def reset_trace(self) -> None:
        self.trace = TraceBuilder()

    def decide(self, scenario: Scenario) -> AgentDecision:
        raise NotImplementedError

    # -- shared helpers ---------------------------------------------------
    def result(self, scenario: Scenario, route_id: str | None, action: str,
               eta: float | None, cost: float | None, summary: str,
               extra: Dict[str, Any] | None = None) -> AgentDecision:
        selected = next((r for r in scenario.routes if r.id == route_id), None)
        eta_val = eta if eta is not None else (selected.travel_time_min if selected else None)
        return AgentDecision(
            agent_id=self.id,
            agent_name=self.name,
            scenario_id=scenario.id,
            scenario_name=scenario.name,
            action=action,
            selected_route_id=route_id,
            eta_min=round(eta_val, 2) if eta_val is not None else None,
            cost=cost,
            deadline_min=scenario.deadline_min,
            on_time=(eta_val <= scenario.deadline_min) if eta_val is not None else None,
            summary=summary,
            reasoning=self.trace.steps,
            data=extra or {},
        )
