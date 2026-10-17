"""API tests — FastAPI endpoints exercised through the TestClient."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import STATE, app


@pytest.fixture(autouse=True)
def clean_state():
    STATE.registry.learning_store.reset("seed")
    STATE.registry.get("model_based").reset_state()  # type: ignore[attr-defined]
    STATE.scenario_store.delete  # no-op reference
    yield
    STATE.registry.learning_store.reset("seed")


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


class TestHealthAndMeta:
    def test_health(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["agents"] == 7

    def test_agents_endpoint(self, client):
        r = client.get("/api/agents")
        assert r.status_code == 200
        agents = r.json()
        assert len(agents) == 7
        assert {a["id"] for a in agents} == {
            "simple_reflex", "model_based", "goal_based", "utility_based",
            "learning", "hierarchical", "contextual"}
        for a in agents:
            assert a["description"] and a["color"] and a["strengths"]

    def test_architecture_single_and_all(self, client):
        r = client.get("/api/architecture/simple_reflex")
        assert r.status_code == 200
        arch = r.json()
        assert len(arch["nodes"]) >= 5 and len(arch["edges"]) >= 5
        r2 = client.get("/api/architecture")
        assert r2.status_code == 200
        assert len(r2.json()) == 7

    def test_architecture_unknown_agent(self, client):
        r = client.get("/api/architecture/nope")
        assert r.status_code == 404


class TestScenarios:
    def test_list_scenarios(self, client):
        r = client.get("/api/scenarios")
        assert r.status_code == 200
        scenarios = r.json()
        assert len(scenarios) >= 3
        assert scenarios[0]["id"] == "s1-normal"

    def test_validate_endpoint(self, client):
        r = client.post("/api/scenarios/validate", json={"name": "", "deadline_min": -1, "routes": []})
        assert r.status_code == 200
        assert r.json()["valid"] is False

    def test_create_custom_scenario(self, client):
        payload = {
            "name": "API custom", "weather": "rain", "priority": "normal", "deadline_min": 35,
            "routes": [
                {"id": "A", "name": "A", "distance_km": 3, "travel_time_min": 22,
                 "traffic_level": "moderate", "cost": 110},
                {"id": "B", "name": "B", "distance_km": 4, "travel_time_min": 28,
                 "traffic_level": "light", "cost": 90},
            ],
        }
        r = client.post("/api/scenarios", json=payload)
        assert r.status_code == 200
        assert r.json()["valid"] is True
        listing = client.get("/api/scenarios").json()
        assert any(s["name"] == "API custom" for s in listing)
        custom = next(s for s in listing if s["name"] == "API custom")
        assert client.delete(f"/api/scenarios/{custom['id']}").status_code == 200

    def test_create_rejects_invalid(self, client):
        r = client.post("/api/scenarios", json={"name": "", "deadline_min": -5, "routes": []})
        assert r.status_code == 422
        assert "errors" in r.json()["detail"]


class TestSimulation:
    def test_simulate_agent(self, client):
        r = client.post("/api/simulate/agent", json={"agent_id": "goal_based", "scenario_id": "s1-normal"})
        assert r.status_code == 200
        body = r.json()
        assert body["selected_route_id"] == "A"
        assert body["eta_min"] == 15
        assert len(body["reasoning"]) >= 4

    def test_simulate_agent_unknown(self, client):
        r = client.post("/api/simulate/agent", json={"agent_id": "magic", "scenario_id": "s1-normal"})
        assert r.status_code == 404

    def test_simulate_agent_missing_scenario(self, client):
        r = client.post("/api/simulate/agent", json={"agent_id": "goal_based", "scenario_id": "ghost"})
        assert r.status_code == 404

    def test_simulate_agent_inline_scenario(self, client):
        inline = {
            "id": "inline", "name": "Inline", "weather": "rain", "priority": "urgent",
            "deadline_min": 18,
            "routes": [
                {"id": "A", "name": "A", "distance_km": 3, "travel_time_min": 25,
                 "traffic_level": "heavy", "cost": 100},
                {"id": "B", "name": "B", "distance_km": 5, "travel_time_min": 24,
                 "traffic_level": "light", "cost": 130},
            ],
        }
        r = client.post("/api/simulate/agent", json={"agent_id": "goal_based", "scenario": inline})
        assert r.status_code == 200
        body = r.json()
        assert body["selected_route_id"] == "B"  # A (25) infeasible vs 18 min deadline

    def test_simulate_all(self, client):
        r = client.post("/api/simulate/all", json={"scenario_id": "s2-traffic"})
        assert r.status_code == 200
        body = r.json()
        assert len(body["results"]) == 7

    def test_batch_21(self, client):
        r = client.post("/api/simulate/batch", json={})
        assert r.status_code == 200
        body = r.json()
        assert body["count"] == 21
        assert len(body["records"]) == 21
        assert len(body["summary"]["per_agent"]) == 7

    def test_batch_subset(self, client):
        r = client.post("/api/simulate/batch", json={"scenario_ids": ["s3-urgent-rain"]})
        assert r.status_code == 200
        assert r.json()["count"] == 7


class TestLearning:
    def test_memory_endpoint(self, client):
        r = client.get("/api/learning/memory")
        assert r.status_code == 200
        assert isinstance(r.json()["deliveries"], list)

    def test_reset_clears_experience(self, client):
        r = client.post("/api/learning/reset", json={"mode": "empty"})
        assert r.status_code == 200
        assert r.json()["deliveries"] == []
        r = client.post("/api/learning/reset", json={"mode": "seed"})
        assert r.status_code == 200
        assert r.json()["deliveries"] == []


class TestDiagnostics:
    def test_diagnostics_all_pass(self, client):
        r = client.post("/api/diagnostics/run")
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 10
        assert body["failed"] == 0, f"failed checks: {[c for c in body['checks'] if not c['passed']]}"
