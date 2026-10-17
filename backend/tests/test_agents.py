"""Unit tests for the seven agent implementations.

Each test pins down the architecture-specific behaviour that the assignment
requires — not just "returns something".
"""
from __future__ import annotations

import pytest

from app.agents import AgentRegistry
from app.agents.goal_based import GoalBasedAgent
from app.agents.hierarchical import HierarchicalAgent
from app.agents.learning import LearningAgent
from app.agents.model_based import ModelBasedAgent
from app.agents.simple_reflex import SimpleReflexAgent
from app.agents.utility_based import UtilityBasedAgent
from app.agents.contextual import ContextualAgent, adapt_weights
from app.schemas import Route, Scenario
from app.simulation.scenarios import default_scenarios


@pytest.fixture()
def scenarios() -> list[Scenario]:
    return default_scenarios()


@pytest.fixture()
def registry() -> AgentRegistry:
    reg = AgentRegistry()
    reg.learning_store.reset("seed")
    reg.get("model_based").reset_state()  # type: ignore[attr-defined]
    return reg


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def make_scenario(**overrides) -> Scenario:
    base = dict(
        id="t", name="Test", description="", weather="clear", priority="normal",
        deadline_min=40, order_value=500,
        routes=[
            Route(id="A", name="A", distance_km=3, travel_time_min=15, traffic_level="light", cost=100),
            Route(id="B", name="B", distance_km=5, travel_time_min=20, traffic_level="light", cost=130),
        ],
    )
    base.update(overrides)
    return Scenario(**base)


# --------------------------------------------------------------------------
# simple reflex
# --------------------------------------------------------------------------
class TestSimpleReflex:
    def test_default_rule_picks_fastest(self, scenarios):
        d = SimpleReflexAgent().decide(scenarios[0])
        assert d.selected_route_id == "A"  # 15 min < 20 min
        assert d.data["fired_rule"] == "R3"

    def test_traffic_scenario_still_reflexes_to_fastest(self, scenarios):
        d = SimpleReflexAgent().decide(scenarios[1])
        assert d.selected_route_id == "B"  # 20 min < 30 min (fastest percept wins)

    def test_urgent_rule_fires_first(self, scenarios):
        d = SimpleReflexAgent().decide(scenarios[2])
        assert d.data["fired_rule"] == "R1"  # urgent short-circuits rain rule
        assert d.selected_route_id == "B"

    def test_trace_shows_the_fired_rule(self, scenarios):
        d = SimpleReflexAgent().decide(scenarios[0])
        fired = [s for s in d.reasoning if s.data.get("matched") is True]
        assert len(fired) == 1


# --------------------------------------------------------------------------
# model based
# --------------------------------------------------------------------------
class TestModelBased:
    def test_state_updates_between_runs(self, scenarios):
        agent = ModelBasedAgent()
        d1 = agent.decide(scenarios[1])
        assert d1.data["state_before"]["runs_seen"] == 0
        assert d1.data["state_after"]["runs_seen"] == 1
        d2 = agent.decide(scenarios[1])
        assert d2.data["state_before"]["runs_seen"] == 1
        assert d2.data["state_after"]["runs_seen"] == 2

    def test_chronic_congestion_detected(self, scenarios):
        agent = ModelBasedAgent()
        agent.decide(scenarios[1])  # A heavy (1st observation)
        d2 = agent.decide(scenarios[1])  # A heavy again → chronic
        assert "A" in d2.data["chronic_congestion"]

    def test_never_picks_unavailable(self):
        s = make_scenario(routes=[
            Route(id="A", name="A", distance_km=3, travel_time_min=10, traffic_level="light", cost=100, available=False),
            Route(id="B", name="B", distance_km=5, travel_time_min=20, traffic_level="light", cost=130),
        ])
        d = ModelBasedAgent().decide(s)
        assert d.selected_route_id == "B"


# --------------------------------------------------------------------------
# goal based
# --------------------------------------------------------------------------
class TestGoalBased:
    def test_picks_fastest_feasible(self, scenarios):
        d = GoalBasedAgent().decide(scenarios[0])
        assert d.selected_route_id == "A"
        assert d.on_time is True
        assert all(f["feasible"] for f in d.data["feasibility"])

    def test_infeasible_route_rejected(self, scenarios):
        d = GoalBasedAgent().decide(scenarios[2])
        feas = {f["route"]: f["feasible"] for f in d.data["feasibility"]}
        assert feas["A"] is False and feas["B"] is True
        assert d.selected_route_id == "B"
        assert d.data["goal_achievable"] is True

    def test_infeasible_deadline_declared_not_claimed(self):
        s = make_scenario(deadline_min=10, routes=[
            Route(id="A", name="A", distance_km=3, travel_time_min=45, traffic_level="light", cost=100),
            Route(id="B", name="B", distance_km=5, travel_time_min=50, traffic_level="light", cost=130),
        ])
        d = GoalBasedAgent().decide(s)
        assert d.data["goal_achievable"] is False
        assert d.action.endswith("_late")
        assert "infeasible" in d.summary.lower()
        assert d.data["fallback"]["overrun_min"] == 35.0  # 45 - 10


# --------------------------------------------------------------------------
# utility based
# --------------------------------------------------------------------------
class TestUtilityBased:
    def test_traffic_scenario_prefers_light_route(self, scenarios):
        d = UtilityBasedAgent().decide(scenarios[1])
        scores = {f["route"]: f["utility"] for f in d.data["factors"]}
        assert scores["B"] > scores["A"]  # congestion destroys A's comfort
        assert d.selected_route_id == "B"

    def test_normalisation_range(self, scenarios):
        d = UtilityBasedAgent().decide(scenarios[0])
        for f in d.data["factors"]:
            assert 0.0 <= f["time_score"] <= 1.0
            assert 0.0 <= f["cost_score"] <= 1.0
        best = max(f["utility"] for f in d.data["factors"])
        worst = min(f["utility"] for f in d.data["factors"])
        assert best > worst

    def test_unavailable_routes_excluded_before_scoring(self):
        s = make_scenario(routes=[
            Route(id="A", name="A", distance_km=3, travel_time_min=10, traffic_level="light", cost=10, available=False),
            Route(id="B", name="B", distance_km=5, travel_time_min=25, traffic_level="light", cost=200),
        ])
        d = UtilityBasedAgent().decide(s)
        assert [f["route"] for f in d.data["factors"]] == ["B"]  # A filtered BEFORE scoring
        assert d.selected_route_id == "B"

    def test_single_candidate_full_score(self):
        s = make_scenario(routes=[
            Route(id="A", name="A", distance_km=3, travel_time_min=30, traffic_level="heavy", cost=100),
        ])
        d = UtilityBasedAgent().decide(s)
        assert d.selected_route_id == "A"
        # time 1.0 + cost 1.0 + comfort 0.2 (heavy) = 0.84 — comfort stays an absolute score
        assert d.data["factors"][0]["utility"] == 0.84


# --------------------------------------------------------------------------
# learning
# --------------------------------------------------------------------------
class TestLearning:
    def test_cold_start_and_memory_growth(self, registry, scenarios):
        registry.learning_store.reset("empty")
        agent: LearningAgent = registry.get("learning")  # type: ignore[assignment]
        d1 = agent.decide(scenarios[0])
        assert d1.data["stats_before"] == {}
        assert len(d1.data["stats_after"]) == 1
        d2 = agent.decide(scenarios[0])
        assert d2.data["stats_before"]["A"]["count"] == 1
        assert d2.data["stats_after"]["A"]["count"] == 2

    def test_experience_changes_prediction(self, registry):
        # Flip scenario: A is faster on paper (18m) but suffers heavy traffic,
        # so cold-start picks A; observed delay raises A's future prediction.
        flip = make_scenario(routes=[
            Route(id="A", name="A", distance_km=3, travel_time_min=18, traffic_level="heavy", cost=100),
            Route(id="B", name="B", distance_km=5, travel_time_min=20, traffic_level="light", cost=100),
        ])
        registry.learning_store.reset("empty")
        agent: LearningAgent = registry.get("learning")  # type: ignore[assignment]
        d1 = agent.decide(flip)
        assert d1.selected_route_id == "A"
        first_pred = next(p for p in d1.data["predictions"] if p["route"] == "A")["predicted_time"]
        d2 = agent.decide(flip)
        second_pred = next(p for p in d2.data["predictions"] if p["route"] == "A")["predicted_time"]
        assert second_pred > first_pred  # observed delay raised the prediction
        # ...and the changed prediction flips the decision to B
        assert d2.selected_route_id == "B"
        assert d2.data["stats_before"]["A"]["mean_delay"] == 3.0  # heavy-traffic lesson learned

    def test_outcome_recorded_on_time_flag(self, registry, scenarios):
        agent: LearningAgent = registry.get("learning")  # type: ignore[assignment]
        d = agent.decide(scenarios[2])  # urgent + rain, picks B
        assert d.data["outcome"]["on_time"] is True
        assert len(registry.learning_store.deliveries) >= 1  # only simulated deliveries are stored


# --------------------------------------------------------------------------
# hierarchical
# --------------------------------------------------------------------------
class TestHierarchical:
    def test_six_tasks_in_order(self, scenarios):
        d = HierarchicalAgent().decide(scenarios[0])
        ids = [t["id"] for t in d.data["tasks"]]
        assert ids == ["accept_order", "evaluate_conditions", "select_route",
                       "pickup_food", "deliver_food", "confirm_delivery"]
        assert all(t["status"] == "completed" for t in d.data["tasks"])
        assert d.data["completed_count"] == 6

    def test_task_progression_in_trace(self, scenarios):
        d = HierarchicalAgent().decide(scenarios[0])
        task_steps = [s for s in d.reasoning if s.node_id.startswith("t") and s.node_id != "task"]
        assert len(task_steps) == 6
        assert [s.index for s in task_steps] == sorted(s.index for s in task_steps)

    def test_abort_when_no_route(self):
        s = make_scenario(routes=[
            Route(id="A", name="A", distance_km=3, travel_time_min=15, traffic_level="light", cost=100, available=False),
        ])
        d = HierarchicalAgent().decide(s)
        assert d.action == "abort_no_route"
        assert d.data["tasks"][2]["status"] == "failed"  # select_route failed


# --------------------------------------------------------------------------
# contextual
# --------------------------------------------------------------------------
class TestContextual:
    def test_weights_adapt_to_urgency(self, scenarios):
        normal = adapt_weights(scenarios[0])
        urgent = adapt_weights(scenarios[2])
        assert urgent["time"] > normal["time"]
        assert urgent["cost"] < normal["cost"]

    def test_rain_adds_exposure(self, scenarios):
        clear = adapt_weights(scenarios[0])
        rain = adapt_weights(scenarios[2])
        assert rain["exposure"] > clear["exposure"]

    def test_decision_not_fixed_across_contexts(self, scenarios):
        agent = ContextualAgent()
        d1 = agent.decide(scenarios[0])   # clear/normal, light traffic → cheap fast A
        d2 = agent.decide(scenarios[1])   # heavy traffic on A → contextual comfort flips to B
        assert d1.selected_route_id == "A"
        assert d2.selected_route_id == "B"
        # the trace must explain the traffic context that changed the decision
        assert any("traffic" in c.lower() for c in d2.data["active_context"])

    def test_lists_active_context_fields(self, scenarios):
        d = ContextualAgent().decide(scenarios[2])
        fields = d.data["active_context"]
        assert any("weather=rain" in f for f in fields)
        assert any("priority=urgent" in f for f in fields)


# --------------------------------------------------------------------------
# cross-agent: every trace node must exist in that agent's diagram
# --------------------------------------------------------------------------
def test_all_traces_map_to_architecture(registry, scenarios):
    from app.agents.architectures import get_architecture
    engine_agents = [
        "simple_reflex", "model_based", "goal_based", "utility_based",
        "learning", "hierarchical", "contextual",
    ]
    for aid in engine_agents:
        arch = get_architecture(aid)
        node_ids = {n.id for n in arch.nodes}  # type: ignore[union-attr]
        for s in scenarios:
            d = registry.get(aid).decide(s)  # type: ignore[union-attr]
            bad = [step.node_id for step in d.reasoning if step.node_id not in node_ids]
            assert not bad, f"{aid}/{s.id}: trace references unknown nodes {bad}"
