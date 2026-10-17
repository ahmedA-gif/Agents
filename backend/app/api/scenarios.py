"""Scenario endpoints: list, validate, create custom, delete custom."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from app.schemas import Scenario, ValidateResult
from app.simulation.scenarios import ScenarioStore

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


@router.get("", response_model=List[Scenario])
def list_scenarios() -> List[Scenario]:
    from app.main import STATE
    return STATE.scenario_store.all()


@router.post("/validate", response_model=ValidateResult)
def validate_endpoint(payload: Dict[str, Any]) -> ValidateResult:
    return validate_scenario(payload)


def validate_scenario(payload: Dict[str, Any]) -> ValidateResult:
    from app.simulation.scenarios import validate_scenario_payload
    return validate_scenario_payload(payload)


@router.post("", response_model=ValidateResult)
def create(payload: Dict[str, Any]) -> ValidateResult:
    from app.main import STATE
    result: ValidateResult = validate_scenario(payload)
    if not result.valid:
        raise HTTPException(status_code=422, detail={"message": "Invalid scenario", "errors": result.errors})
    created = STATE.scenario_store.add_custom(payload)
    return ValidateResult(valid=True, warnings=created.warnings)


@router.delete("/{scenario_id}")
def delete(scenario_id: str) -> Dict[str, Any]:
    from app.main import STATE
    removed = STATE.scenario_store.delete(scenario_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Custom scenario not found (defaults cannot be deleted).")
    return {"deleted": scenario_id}
