"""Persistent experience memory for the Learning Agent (JSON file backed).

Stats are derived from the delivery records; predictions use
context-matched (same route + traffic + weather) mean delay with a
fallback to route-level mean delay.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.schemas import LearningRecord, LearningMemoryState, Scenario
from app.storage.paths import storage_directory

STORAGE_DIR = storage_directory()
MEMORY_PATH = STORAGE_DIR / "learning_memory.json"

class LearningStore:
    def __init__(self, path: Path = MEMORY_PATH) -> None:
        self.path = path
        self._lock = threading.Lock()
        self.deliveries: List[Dict[str, Any]] = self._load()

    # -- persistence ---------------------------------------------------------
    def _load(self) -> List[Dict[str, Any]]:
        if self.path.exists():
            try:
                raw = json.loads(self.path.read_text())
                return list(raw.get("deliveries", []))
            except (json.JSONDecodeError, OSError):
                pass
        return []

    def _save(self) -> None:
        self.path.write_text(json.dumps({"deliveries": self.deliveries, "version": 1}, indent=2))

    def reset(self, mode: str = "empty") -> Dict[str, Any]:
        with self._lock:
            self.deliveries = []
            self._save()
            return self.stats()

    def record(self, route_id: str, traffic: str, weather: str, eta_min: float,
               actual_min: float, on_time: bool) -> Dict[str, Any]:
        with self._lock:
            seq = max((d.get("seq", 0) for d in self.deliveries), default=0) + 1
            self.deliveries.append({
                "route_id": route_id, "traffic": traffic, "weather": weather,
                "eta_min": eta_min, "actual_min": actual_min, "on_time": on_time, "seq": seq,
            })
            self._save()
            return self.stats()

    # -- derived statistics ----------------------------------------------------
    def stats(self) -> Dict[str, Dict[str, Any]]:
        stats: Dict[str, Dict[str, Any]] = {}
        for d in self.deliveries:
            s = stats.setdefault(d["route_id"], {"count": 0, "on_time": 0, "delays": []})
            s["count"] += 1
            s["on_time"] += 1 if d["on_time"] else 0
            s["delays"].append(round(d["actual_min"] - d["eta_min"], 2))
        for rid, s in stats.items():
            s["on_time_rate"] = round(s["on_time"] / s["count"], 3)
            s["mean_delay"] = round(sum(s["delays"]) / len(s["delays"]), 2)
            del s["delays"], s["on_time"]
        return stats

    def mean_delay_for(self, route_id: str, scenario: Scenario) -> Tuple[float, int]:
        """Mean observed delay for the most specific matching context."""
        exact = [d for d in self.deliveries if d["route_id"] == route_id
                 and d["traffic"] == _traffic_of(scenario, route_id)
                 and d["weather"] == scenario.weather]
        if exact:
            return round(sum(d["actual_min"] - d["eta_min"] for d in exact) / len(exact), 2), len(exact)
        route_all = [d for d in self.deliveries if d["route_id"] == route_id]
        if route_all:
            return round(sum(d["actual_min"] - d["eta_min"] for d in route_all) / len(route_all), 2), len(route_all)
        return 0.0, 0

    def reliability_for(self, route_id: str, scenario: Scenario) -> float:
        exact = [d for d in self.deliveries if d["route_id"] == route_id
                 and d["weather"] == scenario.weather]
        pool = exact or [d for d in self.deliveries if d["route_id"] == route_id]
        successes = sum(1 for d in pool if d["on_time"])
        # Laplace-smoothed so cold start = 0.5, never 0/1 extremes
        return round((successes + 1) / (len(pool) + 2), 3)

    def state(self) -> LearningMemoryState:
        return LearningMemoryState(
            deliveries=[LearningRecord(**d) for d in self.deliveries],
            route_stats=self.stats(),
            source="file" if self.path.exists() else "empty",
        )


def _traffic_of(scenario: Scenario, route_id: str) -> str:
    for r in scenario.routes:
        if r.id == route_id:
            return r.traffic_level
    return "light"
