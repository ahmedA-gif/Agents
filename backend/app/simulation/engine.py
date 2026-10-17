"""Simulation engine — runs agents against scenarios and batches them."""
from __future__ import annotations

from typing import Any, Dict, List

from app.agents import AgentRegistry
from app.schemas import AgentDecision, Scenario
from app.simulation.evaluator import route_report


class SimulationEngine:
    def __init__(self, registry: AgentRegistry) -> None:
        self.registry = registry

    def run_agent(self, agent_id: str, scenario: Scenario) -> AgentDecision:
        agent = self.registry.get(agent_id)
        decision: AgentDecision = agent.decide(scenario)  # type: ignore[attr-defined]
        decision.plain_explanation = explain_for_customer(decision, scenario)
        return decision

    def run_all(self, scenario: Scenario) -> List[AgentDecision]:
        return [self.run_agent(aid, scenario) for aid in
                ("simple_reflex", "model_based", "goal_based", "utility_based",
                 "learning", "hierarchical", "contextual")]

    def run_batch(self, scenarios: List[Scenario]) -> Dict[str, Any]:
        records: List[AgentDecision] = []
        for scenario in scenarios:
            records.extend(self.run_all(scenario))
        summary = self.summarise(records, scenarios)
        return {"count": len(records), "records": records, "summary": summary}

    @staticmethod
    def summarise(records: List[AgentDecision], scenarios: List[Scenario]) -> Dict[str, Any]:
        per_scenario: Dict[str, Any] = {}
        for s in scenarios:
            subset = [r for r in records if r.scenario_id == s.id]
            delivered = [r for r in subset if r.selected_route_id is not None]
            on_time = [r for r in delivered if r.on_time]
            fastest = min(delivered, key=lambda r: (r.eta_min or 1e9)) if delivered else None
            per_scenario[s.id] = {
                "name": s.name,
                "deadline_min": s.deadline_min,
                "runs": len(subset),
                "on_time_count": len(on_time),
                "fastest_agent": fastest.agent_id if fastest else None,
                "fastest_route": fastest.selected_route_id if fastest else None,
                "fastest_eta_min": fastest.eta_min if fastest else None,
            }
        per_agent: Dict[str, Any] = {}
        for r in records:
            a = per_agent.setdefault(r.agent_id, {"runs": 0, "on_time": 0, "etamin": []})
            a["runs"] += 1
            if r.selected_route_id is not None:
                if r.on_time:
                    a["on_time"] += 1
                a["etamin"].append(r.eta_min or 0)
        for a in per_agent.values():
            etas = a.pop("etamin")
            a["on_time_rate"] = round(a["on_time"] / a["runs"], 3)
            a["mean_eta_min"] = round(sum(etas) / len(etas), 2) if etas else None
        return {"per_scenario": per_scenario, "per_agent": per_agent}

    @staticmethod
    def environment_report(scenario: Scenario) -> Dict[str, Any]:
        return route_report(scenario)


def explain_for_customer(decision: AgentDecision, scenario: Scenario) -> str:
    """Explain the result in everyday language while preserving the technical trace."""
    route = next((r for r in scenario.routes if r.id == decision.selected_route_id), None)
    if route is None:
        return "No delivery route was available, so the agent could not choose one."

    available = [r for r in scenario.routes if r.available]
    eta = route.travel_time_min
    deadline = scenario.deadline_min
    route_label = f"Route {route.id}"
    gap = abs(deadline - eta)
    timing = (f"The estimate is {eta:g} minutes, about {gap:g} minutes "
              f"{'inside' if eta <= deadline else 'past'} the {deadline:g}-minute deadline.")
    if decision.on_time is True:
        on_time_text = "In this simulation, the delivery arrived on time."
    elif decision.on_time is False:
        on_time_text = "In this simulation, the delivery arrived late."
    else:
        on_time_text = "The agent could not complete a delivery on this route."

    if decision.agent_id == "simple_reflex":
        if scenario.priority == "urgent":
            why = "This agent uses a quick rule: urgent orders go on the fastest available route."
        elif scenario.weather == "rain":
            why = "This agent uses a quick rule: in rain, prefer a route with lighter traffic."
        else:
            why = "This agent uses a quick rule: choose the available route with the shortest estimated trip."
        if eta > deadline:
            why += " It does not check the deadline before choosing."
    elif decision.agent_id == "model_based":
        chronic = decision.data.get("chronic_congestion", [])
        if chronic:
            why = ("It remembers repeated heavy traffic on " + ", ".join(f"Route {rid}" for rid in chronic)
                   + ", avoids those routes, then chooses the quickest remaining one.")
        else:
            runs = decision.data.get("state_after", {}).get("runs_seen", 1)
            why = ("It updates its picture of the trip from weather and traffic, then chooses the quickest available route. "
                   + ("It has no earlier run of this scenario to learn a traffic pattern from."
                   if runs == 1 else "It has not seen a repeated traffic pattern that would change this choice."))
    elif decision.agent_id == "goal_based":
        feasible = [r for r in available if r.travel_time_min <= deadline]
        if decision.data.get("goal_achievable") is False:
            why = (f"It checked each open route against the deadline. None can arrive within {deadline:g} minutes, "
                   f"so it chose {route_label}, which is the route expected to be least late, and flags the delay.")
        else:
            why = (f"It checked each available route against the {deadline:g}-minute deadline. "
                   f"{route_label} was the quickest of the {len(feasible)} route(s) that can arrive in time.")
    elif decision.agent_id == "utility_based":
        why = (f"It balances trip time, price, and traffic. {route_label} "
               f"({eta:g} minutes, Rs. {route.cost:g}, {route.traffic_level} traffic) was its best overall fit.")
    elif decision.agent_id == "learning":
        prediction = next((p for p in decision.data.get("predictions", []) if p.get("route") == route.id), {})
        samples = int(prediction.get("samples", 0) or 0)
        predicted = prediction.get("predicted_time", eta)
        if samples:
            why = (f"It learned from {samples} earlier simulated delivery result(s) for {route_label}. "
                   f"That experience puts its trip estimate at about {predicted:g} minutes, so it chose this route.")
        else:
            why = (f"It has no earlier delivery results yet, so this is a fresh start. It chose {route_label} "
                   "using the current trip estimates; this simulated outcome will teach it for next time.")
    elif decision.agent_id == "hierarchical":
        why = ("It breaks the job into six steps, then picks the available route with the shortest estimated trip. "
               f"That route was {route_label}.")
    elif decision.agent_id == "contextual":
        context = []
        if scenario.priority == "urgent":
            context.append("the urgent order makes arrival time more important")
        if scenario.weather == "rain":
            context.append("rain makes shorter, less exposed trips more attractive")
        if any(r.traffic_level == "heavy" for r in available):
            context.append("traffic conditions affect route comfort")
        why = ("It changes what it values to fit the situation" +
               (": " + "; ".join(context) if context else ": it balances speed, price, and traffic") +
               f". That made {route_label} the best fit.")
    else:
        why = f"The agent selected {route_label} based on the current delivery conditions."

    return f"{why} {timing} {on_time_text}"
