"""Tests for the simulation engine: runs, batch of 21, summaries."""
from __future__ import annotations

import pytest

from app.agents import AgentRegistry
from app.simulation.engine import SimulationEngine
from app.simulation.evaluator import min_max_scores, simulate_actual_arrival
from app.schemas import Route, Scenario


@pytest.fixture()
def engine() -> SimulationEngine:
    reg = AgentRegistry()
    reg.learning_store.reset("seed")
    reg.get("model_based").reset_state()  # type: ignore[attr-defined]
    return SimulationEngine(reg)


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


class TestEngine:
    def test_run_all_returns_seven(self, engine):
        from app.simulation.scenarios import default_scenarios
        results = engine.run_all(default_scenarios()[0])
        assert len(results) == 7
        assert {r.agent_id for r in results} == {
            "simple_reflex", "model_based", "goal_based", "utility_based",
            "learning", "hierarchical", "contextual"}

    def test_batch_returns_21(self, engine):
        from app.simulation.scenarios import default_scenarios
        batch = engine.run_batch(default_scenarios())
        assert batch["count"] == 21
        combos = {(r.scenario_id, r.agent_id) for r in batch["records"]}
        assert len(combos) == 21
        for r in batch["records"]:
            assert r.action
            assert r.summary
            assert r.plain_explanation
            assert "U =" not in r.plain_explanation
            assert len(r.reasoning) >= 3  # reflex short-circuits at 3 on urgent scenarios
            assert r.eta_min is not None or r.action == "abort_no_route"

    def test_summary_structure(self, engine):
        from app.simulation.scenarios import default_scenarios
        summary = engine.run_batch(default_scenarios())["summary"]
        assert set(summary["per_scenario"].keys()) == {"s1-normal", "s2-traffic", "s3-urgent-rain"}
        assert set(summary["per_agent"].keys()) == {
            "simple_reflex", "model_based", "goal_based", "utility_based",
            "learning", "hierarchical", "contextual"}
        for a in summary["per_agent"].values():
            assert 0.0 <= a["on_time_rate"] <= 1.0

    def test_on_time_consistency(self, engine):
        from app.simulation.scenarios import default_scenarios
        for r in engine.run_batch(default_scenarios())["records"]:
            if r.eta_min is not None:
                assert r.on_time == (r.eta_min <= r.deadline_min)


class TestEvaluator:
    def test_min_max_scores(self):
        assert min_max_scores([10, 20, 30]) == [1.0, 0.5, 0.0]
        assert min_max_scores([5, 5]) == [1.0, 1.0]  # degenerate range
        assert min_max_scores([7]) == [1.0]

    def test_simulated_arrival_penalises_bad_conditions(self):
        from app.simulation.scenarios import default_scenarios
        s3 = default_scenarios()[2]
        a, b = s3.routes
        actual_a = simulate_actual_arrival(a, s3)
        actual_b = simulate_actual_arrival(b, s3)
        assert actual_a > a.travel_time_min  # heavy + rain delays
        assert actual_b > b.travel_time_min
        assert actual_a - a.travel_time_min > actual_b - b.travel_time_min  # A suffers more
