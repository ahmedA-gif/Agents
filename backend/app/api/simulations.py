"""Simulation endpoints: single agent, all agents, full batch, learning memory."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.schemas import AgentDecision, Scenario
from app.simulation.engine import SimulationEngine

router = APIRouter(prefix="/api/simulate", tags=["simulation"])


class SimulateAgentRequest(BaseModel):
    agent_id: str
    scenario_id: Optional[str] = None
    scenario: Optional[Scenario] = None


class SimulateAllRequest(BaseModel):
    scenario_id: Optional[str] = None
    scenario: Optional[Scenario] = None


class BatchRequest(BaseModel):
    scenario_ids: Optional[List[str]] = None  # default: the three assignment scenarios


def _resolve_scenario(body_scenario: Optional[Scenario], scenario_id: Optional[str]) -> Scenario:
    from app.main import STATE
    if body_scenario is not None:
        if scenario_id:
            merged = body_scenario.model_copy(update={"id": scenario_id})
            return merged
        return body_scenario.model_copy(update={"custom": False})
    if scenario_id:
        found = STATE.scenario_store.get(scenario_id)
        if found is None:
            raise HTTPException(status_code=404, detail=f"Unknown scenario '{scenario_id}'")
        return found
    raise HTTPException(status_code=400, detail="Provide either scenario_id or inline scenario.")


@router.post("/agent", response_model=AgentDecision)
def simulate_agent(body: SimulateAgentRequest) -> AgentDecision:
    from app.main import STATE
    from app.agents import AGENT_ORDER
    if body.agent_id not in AGENT_ORDER:
        raise HTTPException(status_code=404, detail=f"Unknown agent '{body.agent_id}'")
    scenario = _resolve_scenario(body.scenario, body.scenario_id)
    return STATE.engine.run_agent(body.agent_id, scenario)


@router.post("/all")
def simulate_all(body: SimulateAllRequest) -> dict:
    from app.main import STATE
    scenario = _resolve_scenario(body.scenario, body.scenario_id)
    results = STATE.engine.run_all(scenario)
    return {"scenario": scenario, "results": results}


@router.post("/batch")
def simulate_batch(body: BatchRequest) -> dict:
    from app.main import STATE
    if body.scenario_ids:
        scenarios: List[Scenario] = []
        for sid in body.scenario_ids:
            found = STATE.scenario_store.get(sid)
            if found is None:
                raise HTTPException(status_code=404, detail=f"Unknown scenario '{sid}'")
            scenarios.append(found)
    else:
        scenarios = STATE.scenario_store.defaults()
    result = STATE.engine.run_batch(scenarios)
    return {
        "count": result["count"],
        "records": result["records"],
        "summary": result["summary"],
        "scenarios": scenarios,
    }
