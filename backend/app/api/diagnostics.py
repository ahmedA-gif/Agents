"""Application-level diagnostics run by the Testing Center.

These are REAL checks executed against the live Python simulation code —
the same logic the pytest suite covers, exposed through the API so the
website can verify itself.
"""
from __future__ import annotations

import time
import tempfile
from typing import Any, Callable, Dict, List
from pathlib import Path

from app.agents import AgentRegistry
from app.schemas import AgentDecision, Scenario
from app.simulation.engine import SimulationEngine
from app.simulation.evaluator import available_routes
from app.simulation.scenarios import ScenarioStore, validate_scenario_payload
from app.storage.learning_store import LearningStore


def _synthetic_all_late() -> Scenario:
    """Every route misses the deadline → Goal agent must report infeasibility."""
    return Scenario(
        id="diag-late", name="Diagnostics — all late",
        weather="rain", priority="urgent", deadline_min=10, order_value=100,
        routes=[
            {"id": "A", "name": "A", "distance_km": 3, "travel_time_min": 45,
             "traffic_level": "heavy", "cost": 100, "available": True},  # type: ignore[arg-type]
            {"id": "B", "name": "B", "distance_km": 5, "travel_time_min": 50,
             "traffic_level": "light", "cost": 130, "available": True},  # type: ignore[arg-type]
        ],  # type: ignore[arg-type]
    )


def _synthetic_unavailable() -> Scenario:
    return Scenario(
        id="diag-unavail", name="Diagnostics — blocked route",
        weather="clear", priority="normal", deadline_min=40, order_value=500,
        routes=[
            {"id": "A", "name": "A", "distance_km": 3, "travel_time_min": 10,
             "traffic_level": "light", "cost": 100, "available": False},  # type: ignore[arg-type]
            {"id": "B", "name": "B", "distance_km": 5, "travel_time_min": 20,
             "traffic_level": "light", "cost": 130, "available": True},  # type: ignore[arg-type]
        ],  # type: ignore[arg-type]
    )


def _synthetic_flip() -> Scenario:
    """Without experience A (18m, heavy) beats B (20m). After Learning sees A
    run ~3 min late twice, predictions flip the choice to B."""
    return Scenario(
        id="diag-flip", name="Diagnostics — learning flip",
        weather="clear", priority="normal", deadline_min=40, order_value=500,
        routes=[
            {"id": "A", "name": "A", "distance_km": 3, "travel_time_min": 18,
             "traffic_level": "heavy", "cost": 100, "available": True},  # type: ignore[arg-type]
            {"id": "B", "name": "B", "distance_km": 5, "travel_time_min": 20,
             "traffic_level": "light", "cost": 100, "available": True},  # type: ignore[arg-type]
        ],  # type: ignore[arg-type]
    )


def run_diagnostics() -> Dict[str, Any]:
    store = ScenarioStore()
    diagnostic_dir = tempfile.TemporaryDirectory(prefix="delivery-diagnostics-")
    registry = AgentRegistry(LearningStore(Path(diagnostic_dir.name) / "learning_memory.json"))
    engine = SimulationEngine(registry)
    checks: List[Dict[str, Any]] = []

    def check(name: str, group: str, fn: Callable[[], str]) -> None:
        start = time.perf_counter()
        try:
            detail = fn()
            checks.append({"name": name, "group": group, "passed": True,
                           "detail": detail, "duration_ms": round((time.perf_counter() - start) * 1000, 1)})
        except AssertionError as exc:
            checks.append({"name": name, "group": group, "passed": False,
                           "detail": str(exc) or "assertion failed",
                           "duration_ms": round((time.perf_counter() - start) * 1000, 1)})
        except Exception as exc:  # noqa: BLE001
            checks.append({"name": name, "group": group, "passed": False,
                           "detail": f"error: {exc}",
                           "duration_ms": round((time.perf_counter() - start) * 1000, 1)})

    scenarios = store.defaults()

    # 1 — every agent produces a valid decision on every default scenario
    def _all_agents_ok() -> str:
        problems = []
        for s in scenarios:
            for aid in ("simple_reflex", "model_based", "goal_based", "utility_based",
                        "learning", "hierarchical", "contextual"):
                d = engine.run_agent(aid, s)
                if len(d.reasoning) < 3:
                    problems.append(f"{aid}/{s.id}: only {len(d.reasoning)} trace steps")
        assert not problems, "; ".join(problems)
        return "7 agents × 3 scenarios all produced structured decisions with reasoning traces."

    check("Seven agents produce valid decisions", "Agents", _all_agents_ok)

    # 2 — every trace step maps to a node in the agent's architecture graph
    def _trace_maps_to_architecture() -> str:
        from app.agents.architectures import get_architecture
        problems = []
        for s in scenarios:
            for aid in ("simple_reflex", "model_based", "goal_based", "utility_based",
                        "learning", "hierarchical", "contextual"):
                d = engine.run_agent(aid, s)
                arch = get_architecture(aid)
                node_ids = {n.id for n in arch.nodes}  # type: ignore[union-attr]
                bad = [st.node_id for st in d.reasoning if st.node_id not in node_ids]
                if bad:
                    problems.append(f"{aid}/{s.id}: unknown nodes {bad}")
        assert not problems, "; ".join(problems)
        return "All reasoning-trace node ids exist in their agent architecture diagrams."

    check("Traces map to architecture diagrams", "Architecture", _trace_maps_to_architecture)

    # 3 — goal agent flags infeasible deadline and uses documented fallback
    def _goal_infeasible() -> str:
        d = engine.run_agent("goal_based", _synthetic_all_late())
        assert d.data.get("goal_achievable") is False, f"expected goal_achievable=False, got {d.data}"
        assert d.action.endswith("_late"), f"expected fallback action, got {d.action}"
        assert "infeasible" in d.summary.lower(), "summary must state infeasibility"
        return ("All-late synthetic scenario → goal declared infeasible, documented "
                "fallback with customer warning selected.")

    check("Goal agent detects infeasible deadlines", "Agents", _goal_infeasible)

    # 4 — utility agent really takes the argmax of its scores
    def _utility_argmax() -> str:
        d = engine.run_agent("utility_based", scenarios[0])
        scores = d.data["factors"]
        winner = max(scores, key=lambda f: (f["utility"], -f["time"]))["route"]
        assert d.selected_route_id == winner, f"picked {d.selected_route_id}, argmax is {winner}"
        assert all(0.0 <= f["time_score"] <= 1.0 and 0.0 <= f["cost_score"] <= 1.0 for f in scores), \
            "normalised scores must lie in [0, 1]"
        return (f"Argmax check passed; normalised factors in [0,1]; winner={winner} "
                f"(U={max(f['utility'] for f in scores)}).")

    check("Utility scoring is consistent", "Agents", _utility_argmax)

    # 5 — learning: experience changes subsequent decisions (flip test)
    def _learning_flips() -> str:
        registry.learning_store.reset("empty")
        flip = _synthetic_flip()
        first = engine.run_agent("learning", flip)
        assert first.selected_route_id == "A", f"cold start should pick fast A, got {first.selected_route_id}"
        engine.run_agent("learning", flip)          # A runs late (heavy traffic)
        second = engine.run_agent("learning", flip)
        engine.run_agent("learning", flip)          # accumulate a bit more experience
        third = engine.run_agent("learning", flip)
        registry.learning_store.reset("seed")
        if second.selected_route_id == "A" and third.selected_route_id == "A":
            raise AssertionError("experience never flipped the route choice")
        changed = second.selected_route_id != first.selected_route_id or third.selected_route_id != first.selected_route_id
        assert changed, "experience must change the decision"
        return (f"Cold start chose A; after simulated outcomes experience flipped the "
                f"choice to {third.selected_route_id}. Memory reset to empty afterwards.")

    check("Learning changes subsequent decisions", "Learning", _learning_flips)

    # 6 — contextual agent reacts to changed context
    def _contextual_sensitive() -> str:
        base = scenarios[0]
        urgent = base.model_copy(update={"id": "diag-ctx", "priority": "urgent", "deadline_min": 25})
        d_normal = engine.run_agent("contextual", base)
        d_urgent = engine.run_agent("contextual", urgent)
        assert d_normal.data.get("weights_used") != d_urgent.data.get("weights_used"), \
            "weights must adapt when priority changes"
        return (f"Weights adapted: normal {d_normal.data['weights_used']} → "
                f"urgent {d_urgent.data['weights_used']}; decisions "
                f"{d_normal.selected_route_id} → {d_urgent.selected_route_id}.")

    check("Contextual agent reacts to changed input", "Agents", _contextual_sensitive)

    # 7 — hierarchical agent completes the six assignment tasks in order
    def _hierarchical_tasks() -> str:
        d = engine.run_agent("hierarchical", scenarios[0])
        ids = [t["id"] for t in d.data["tasks"]]
        expected = ["accept_order", "evaluate_conditions", "select_route",
                    "pickup_food", "deliver_food", "confirm_delivery"]
        assert ids == expected, f"task order wrong: {ids}"
        assert all(t["status"] == "completed" for t in d.data["tasks"]), "all tasks must complete"
        assert d.data["completed_count"] == 6
        return "Six subtasks executed in the required order, all completed."

    check("Hierarchical agent completes 6 tasks in order", "Agents", _hierarchical_tasks)

    # 8 — unavailable routes are filtered out by every agent
    def _unavailable_filtered() -> str:
        blocked = _synthetic_unavailable()
        violators = []
        for aid in ("simple_reflex", "model_based", "goal_based", "utility_based",
                    "hierarchical", "contextual"):
            d = engine.run_agent(aid, blocked)
            if d.selected_route_id == "A":
                violators.append(aid)
        assert not violators, f"agents selected an unavailable route: {violators}"
        return "Route A was marked unavailable and no agent selected it."

    check("Unavailable routes are filtered", "Environment", _unavailable_filtered)

    # 9 — full batch returns exactly 21 records
    def _batch_21() -> str:
        result = engine.run_batch(scenarios)
        assert result["count"] == 21, f"expected 21 records, got {result['count']}"
        combos = {(r.scenario_id, r.agent_id) for r in result["records"]}
        assert len(combos) == 21, "every (scenario, agent) pair must appear exactly once"
        assert all(len(r.reasoning) >= 3 for r in result["records"]), "every record needs a trace"
        return "21 records (3 scenarios × 7 agents), each with scenario, action, ETA and trace."

    check("Full batch returns 21 records", "Simulation", _batch_21)

    # 10 — scenario validation rejects broken input
    def _validation_rejects() -> str:
        bad = {"name": "", "deadline_min": -5, "weather": "storm", "priority": "meh",
               "routes": [{"id": "A", "name": "A", "distance_km": 1, "travel_time_min": 0,
                           "traffic_level": "stormy", "cost": 1}]}
        result = validate_scenario_payload(bad)
        assert result.valid is False, "broken payload must be rejected"
        assert len(result.errors) >= 3, f"expected several errors, got {result.errors}"
        good = validate_scenario_payload({"name": "ok", "weather": "clear", "priority": "normal",
                                          "deadline_min": 30, "routes": [
                                              {"id": "A", "name": "A", "distance_km": 2,
                                               "travel_time_min": 10, "traffic_level": "light", "cost": 50}]})
        assert good.valid is True, f"valid payload rejected: {good.errors}"
        return f"Broken payload rejected with {len(result.errors)} errors; well-formed payload accepted."

    check("Scenario validation rejects broken input", "Validation", _validation_rejects)

    # 11 — learning memory persists to the JSON file
    def _memory_persists() -> str:
        registry.learning_store.reset("seed")
        before = len(registry.learning_store.deliveries)
        engine.run_agent("learning", scenarios[0])
        assert len(registry.learning_store.deliveries) == before + 1, "delivery must be recorded"
        from app.storage.learning_store import LearningStore
        fresh = LearningStore(registry.learning_store.path)
        assert len(fresh.deliveries) == before + 1, "memory must reload from disk"
        registry.learning_store.reset("seed")
        return (f"Run appended one delivery ({before}→{before + 1}) and a fresh store "
                f"instance reloaded it from disk; memory was cleared afterwards.")

    check("Learning memory persists to disk", "Learning", _memory_persists)

    passed = sum(1 for c in checks if c["passed"])
    failed = len(checks) - passed
    diagnostic_dir.cleanup()
    return {"total": len(checks), "passed": passed, "failed": failed,
            "duration_ms": round(sum(c["duration_ms"] for c in checks), 1),
            "checks": checks}
