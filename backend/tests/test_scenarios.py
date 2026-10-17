"""Tests for scenario defaults, the custom-scenario store and validation."""
from __future__ import annotations

import pytest

from app.simulation.scenarios import ScenarioStore, default_scenarios, validate_scenario_payload


class TestDefaults:
    def test_three_default_scenarios(self):
        scenarios = default_scenarios()
        assert len(scenarios) == 3
        ids = [s.id for s in scenarios]
        assert ids == ["s1-normal", "s2-traffic", "s3-urgent-rain"]

    def test_deadlines_and_conditions(self):
        s1, s2, s3 = default_scenarios()
        assert s1.deadline_min == 40 and s1.weather == "clear" and s1.priority == "normal"
        assert s2.deadline_min == 40 and s2.weather == "clear"
        assert s3.deadline_min == 25 and s3.weather == "rain" and s3.priority == "urgent"

    def test_route_measurements_match_plan(self):
        s1, s2, s3 = default_scenarios()
        a1, b1 = s1.routes
        assert (a1.distance_km, a1.travel_time_min, a1.cost) == (3, 15, 100)
        assert (b1.distance_km, b1.travel_time_min, b1.cost) == (5, 20, 130)
        a2 = s2.routes[0]
        assert a2.travel_time_min == 30 and a2.traffic_level == "heavy"
        b3 = s3.routes[1]
        assert b3.travel_time_min == 23 and b3.traffic_level == "light"

    def test_store_lists_defaults_and_get(self):
        store = ScenarioStore()
        assert len(store.all()) == 3
        assert store.get("s2-traffic").name.startswith("Scenario 2")  # type: ignore[union-attr]
        assert store.get("missing") is None
        assert store.delete("s1-normal") is False  # defaults cannot be deleted


class TestValidation:
    def test_valid_payload_passes(self):
        payload = {
            "name": "My test", "weather": "rain", "priority": "urgent", "deadline_min": 25,
            "routes": [{"id": "A", "name": "A", "distance_km": 3, "travel_time_min": 20,
                        "traffic_level": "light", "cost": 90}],
        }
        result = validate_scenario_payload(payload)
        assert result.valid is True
        assert result.errors == []

    def test_rejects_bad_fields(self):
        payload = {
            "name": "", "weather": "storm", "priority": "whenever", "deadline_min": 0,
            "routes": [{"id": "A", "name": "", "distance_km": -1, "travel_time_min": 0,
                        "traffic_level": "chaos", "cost": -5}],
        }
        result = validate_scenario_payload(payload)
        assert result.valid is False
        text = " ".join(result.errors)
        for fragment in ("name", "weather", "priority", "deadline", "travel_time_min",
                         "traffic_level", "cost"):
            assert fragment in text.lower()

    def test_rejects_duplicate_route_ids(self):
        payload = {
            "name": "dupe", "weather": "clear", "priority": "normal", "deadline_min": 30,
            "routes": [
                {"id": "A", "name": "A", "distance_km": 1, "travel_time_min": 10,
                 "traffic_level": "light", "cost": 10},
                {"id": "A", "name": "A2", "distance_km": 2, "travel_time_min": 12,
                 "traffic_level": "light", "cost": 10},
            ],
        }
        assert validate_scenario_payload(payload).valid is False

    def test_rejects_all_routes_unavailable(self):
        payload = {
            "name": "blocked", "weather": "clear", "priority": "normal", "deadline_min": 30,
            "routes": [{"id": "A", "name": "A", "distance_km": 1, "travel_time_min": 10,
                        "traffic_level": "light", "cost": 10, "available": False}],
        }
        result = validate_scenario_payload(payload)
        assert result.valid is False
        assert any("available" in e for e in result.errors)

    def test_warns_when_no_route_meets_deadline(self):
        payload = {
            "name": "late", "weather": "clear", "priority": "normal", "deadline_min": 5,
            "routes": [{"id": "A", "name": "A", "distance_km": 1, "travel_time_min": 30,
                        "traffic_level": "light", "cost": 10}],
        }
        result = validate_scenario_payload(payload)
        assert result.valid is True  # structurally fine...
        assert result.warnings, "...but warns about infeasible deadline"


class TestCustomStore:
    def test_add_get_delete_custom(self, tmp_path, monkeypatch):
        from app.simulation import scenarios as scenarios_module
        monkeypatch.setattr(scenarios_module, "CUSTOM_PATH", tmp_path / "custom.json")
        store = ScenarioStore()
        payload = {
            "name": "Night shift", "weather": "clear", "priority": "urgent", "deadline_min": 22,
            "routes": [
                {"id": "A", "name": "Express", "distance_km": 2, "travel_time_min": 18,
                 "traffic_level": "moderate", "cost": 150},
                {"id": "B", "name": "Ring road", "distance_km": 6, "travel_time_min": 25,
                 "traffic_level": "light", "cost": 80},
            ],
        }
        result = store.add_custom(payload)
        assert result.valid is True
        sid = list(store._custom.keys())[0]
        assert store.get(sid) is not None
        assert store.get(sid).deadline_min == 22  # type: ignore[union-attr]
        # persistence round-trip
        store2 = ScenarioStore()
        assert store2.get(sid) is not None
        assert store.delete(sid) is True
        assert store.get(sid) is None

    def test_invalid_custom_rejected(self):
        store = ScenarioStore()
        before = len(store.all())
        result = store.add_custom({"name": "", "weather": "fog", "deadline_min": -1, "routes": []})
        assert result.valid is False
        assert len(store.all()) == before
