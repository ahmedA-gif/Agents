"""Scenario defaults, custom-scenario store (JSON persisted) and validation."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.schemas import Route, Scenario, ValidateResult
from app.storage.paths import storage_directory

STORAGE_DIR = storage_directory()
CUSTOM_PATH = STORAGE_DIR / "custom_scenarios.json"


def default_scenarios() -> List[Scenario]:
    return [
        Scenario(
            id="s1-normal", name="Scenario 1 — Normal Day",
            description="Clear weather, normal priority, generous deadline. "
                        "Route A is fast and cheap; Route B is longer and pricier.",
            weather="clear", priority="normal", deadline_min=40, order_value=500,
            routes=[
                Route(id="A", name="Route A — Short", distance_km=3, travel_time_min=15,
                      traffic_level="light", cost=100, available=True),
                Route(id="B", name="Route B — Long", distance_km=5, travel_time_min=20,
                      traffic_level="light", cost=130, available=True),
            ],
        ),
        Scenario(
            id="s2-traffic", name="Scenario 2 — Traffic Jam",
            description="Clear weather but heavy traffic builds on Route A, doubling its "
                        "travel time; Route B stays light.",
            weather="clear", priority="normal", deadline_min=40, order_value=500,
            routes=[
                Route(id="A", name="Route A — Short", distance_km=3, travel_time_min=30,
                      traffic_level="heavy", cost=100, available=True),
                Route(id="B", name="Route B — Long", distance_km=5, travel_time_min=20,
                      traffic_level="light", cost=130, available=True),
            ],
        ),
        Scenario(
            id="s3-urgent-rain", name="Scenario 3 — Urgent + Rain",
            description="Rain, urgent order and a tight 25-minute deadline. Route A is both "
                        "congested and slow; Route B is the only feasible option.",
            weather="rain", priority="urgent", deadline_min=25, order_value=800,
            routes=[
                Route(id="A", name="Route A — Short", distance_km=3, travel_time_min=35,
                      traffic_level="heavy", cost=100, available=True),
                Route(id="B", name="Route B — Long", distance_km=5, travel_time_min=23,
                      traffic_level="light", cost=130, available=True),
            ],
        ),
    ]


def validate_scenario_payload(data: Dict[str, Any]) -> ValidateResult:
    """Friendly validation used by /api/scenarios/validate and POST /api/scenarios."""
    errors: List[str] = []
    warnings: List[str] = []

    if not isinstance(data, dict):
        return ValidateResult(valid=False, errors=["Payload must be a JSON object."])

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append("Scenario 'name' is required.")
    if not isinstance(data.get("deadline_min"), (int, float)) or data.get("deadline_min", 0) <= 0:
        errors.append("'deadline_min' must be a positive number.")
    if data.get("weather") not in ("clear", "rain"):
        errors.append("'weather' must be 'clear' or 'rain'.")
    if data.get("priority") not in ("normal", "urgent"):
        errors.append("'priority' must be 'normal' or 'urgent'.")

    routes = data.get("routes")
    if not isinstance(routes, list) or len(routes) < 1:
        errors.append("At least one route is required.")
    else:
        if len(routes) > 5:
            errors.append("A scenario supports at most 5 routes.")
        ids: List[str] = []
        for i, r in enumerate(routes):
            label = f"Route #{i + 1}"
            if not isinstance(r, dict):
                errors.append(f"{label} must be an object.")
                continue
            rid = str(r.get("id", "")).strip()[:3]
            if not rid:
                errors.append(f"{label} needs a short id (e.g. 'A').")
            elif rid in ids:
                errors.append(f"Duplicate route id '{rid}'.")
            ids.append(rid)
            if not isinstance(r.get("name"), str) or not str(r.get("name", "")).strip():
                errors.append(f"{label} needs a name.")
            for field in ("distance_km", "travel_time_min", "cost"):
                v = r.get(field)
                if not isinstance(v, (int, float)) or v < 0:
                    errors.append(f"{label}: '{field}' must be a non-negative number.")
            if isinstance(r.get("travel_time_min"), (int, float)) and r.get("travel_time_min", 0) <= 0:
                errors.append(f"{label}: 'travel_time_min' must be positive.")
            if r.get("traffic_level") not in ("light", "moderate", "heavy"):
                errors.append(f"{label}: 'traffic_level' must be light/moderate/heavy.")
            if r.get("available") not in (True, False, None):
                errors.append(f"{label}: 'available' must be true or false.")
        available = [r for r in routes if isinstance(r, dict) and r.get("available", True)]
        if routes and not available:
            errors.append("At least one route must be available.")

    if not errors:
        d = float(data.get("deadline_min", 0))
        times = [float(r.get("travel_time_min", 0)) for r in routes if isinstance(r, dict)]
        if times and min(times) > d:
            warnings.append("No route can meet the deadline — agents will report infeasibility.")
        if isinstance(routes, list) and len(routes) == 1:
            warnings.append("Only one route — comparisons between routes are trivial.")
        if data.get("order_value") is not None and (not isinstance(data.get("order_value"), (int, float)) or data["order_value"] < 0):
            errors.append("'order_value' must be a non-negative number.")

    return ValidateResult(valid=not errors, errors=errors, warnings=warnings)


class ScenarioStore:
    """Default scenarios (immutable) + user-created scenarios (JSON persisted)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._defaults = default_scenarios()
        self._custom: Dict[str, Scenario] = {}
        self._load_custom()

    def _load_custom(self) -> None:
        if CUSTOM_PATH.exists():
            try:
                raw = json.loads(CUSTOM_PATH.read_text())
                for item in raw:
                    try:
                        s = Scenario(**item)
                        self._custom[s.id] = s
                    except Exception:  # noqa: BLE001 — corrupt entries are skipped
                        continue
            except (json.JSONDecodeError, OSError):
                pass

    def _persist_custom(self) -> None:
        CUSTOM_PATH.write_text(
            json.dumps([s.model_dump(mode="json") for s in self._custom.values()], indent=2))

    def all(self) -> List[Scenario]:
        with self._lock:
            return list(self._defaults) + list(self._custom.values())

    def defaults(self) -> List[Scenario]:
        return list(self._defaults)

    def get(self, scenario_id: str) -> Optional[Scenario]:
        with self._lock:
            if scenario_id in self._custom:
                return self._custom[scenario_id]
            return next((s for s in self._defaults if s.id == scenario_id), None)

    def add_custom(self, payload: Dict[str, Any]) -> ValidateResult:
        with self._lock:
            result = validate_scenario_payload(payload)
            if not result.valid:
                return result
            sid = payload.get("id") or self._next_id()
            # mutate payload with the final id, then build the model
            payload = {**payload, "id": sid, "custom": True}
            payload["routes"] = [{**r, "id": str(r["id"]).strip()[:3],
                                  "available": bool(r.get("available", True))}
                                 for r in payload["routes"]]
            scenario = Scenario(**payload)
            self._custom[sid] = scenario
            self._persist_custom()
            return ValidateResult(valid=True, warnings=result.warnings)

    def delete(self, scenario_id: str) -> bool:
        with self._lock:
            if scenario_id in self._custom:
                del self._custom[scenario_id]
                self._persist_custom()
                return True
            return False

    def _next_id(self) -> str:
        n = len(self._custom) + 1
        while f"custom-{n}" in self._custom:
            n += 1
        return f"custom-{n}"
