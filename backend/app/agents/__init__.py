"""Agent registry — wires implementations, architectures and metadata."""
from __future__ import annotations

from typing import Dict, List, Optional

from app.agents.architectures import AGENT_ORDER, all_architectures, get_architecture
from app.agents.contextual import ContextualAgent
from app.agents.goal_based import GoalBasedAgent
from app.agents.hierarchical import HierarchicalAgent
from app.agents.learning import LearningAgent
from app.agents.model_based import ModelBasedAgent
from app.agents.simple_reflex import SimpleReflexAgent
from app.agents.utility_based import UtilityBasedAgent
from app.schemas import AgentInfo, Scenario
from app.storage.learning_store import LearningStore


class AgentRegistry:
    """Holds one instance of each agent (model-based keeps internal state,
    learning keeps persistent memory) plus the shared learning store."""

    def __init__(self, learning_store: Optional[LearningStore] = None) -> None:
        self.learning_store = learning_store or LearningStore()
        self._agents: Dict[str, object] = {
            "simple_reflex": SimpleReflexAgent(),
            "model_based": ModelBasedAgent(),
            "goal_based": GoalBasedAgent(),
            "utility_based": UtilityBasedAgent(),
            "learning": LearningAgent(self.learning_store),
            "hierarchical": HierarchicalAgent(),
            "contextual": ContextualAgent(),
        }

    def get(self, agent_id: str):
        agent = self._agents.get(agent_id)
        if agent is None:
            raise KeyError(agent_id)
        return agent

    def info(self) -> List[AgentInfo]:
        out: List[AgentInfo] = []
        for aid in AGENT_ORDER:
            a = self.get(aid)
            arch = get_architecture(aid)
            out.append(AgentInfo(
                id=a.id, name=a.name, tagline=a.tagline,
                description=a.description, color=a.color,
                strengths=arch.strengths if arch else [],
                weaknesses=arch.weaknesses if arch else [],
            ))
        return out

    def reset_learning(self, mode: str = "empty") -> Dict[str, Any]:
        return self.learning_store.reset(mode)


def validate_agent_for_scenario(agent, scenario: Scenario) -> None:
    """Shared guard: agents must receive a valid scenario object."""
    if not scenario.routes:
        raise ValueError("Scenario has no routes")
