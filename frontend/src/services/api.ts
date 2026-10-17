// Typed HTTP client for the FastAPI backend (single source of agent truth).
import type {
  AgentDecision, AgentInfo, Architecture, BatchResult, DiagnosticReport,
  Health, LearningMemoryState, Scenario,
} from '../types';

const BASE: string =
  ((import.meta as any).env?.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${path}: ${detail.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface ValidateResultLike {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export const api = {
  health: () => req<Health>('/api/health'),

  agents: () => req<AgentInfo[]>('/api/agents'),

  architectures: () => req<Architecture[]>('/api/architecture'),
  architecture: (agentId: string) => req<Architecture>(`/api/architecture/${agentId}`),

  scenarios: () => req<Scenario[]>('/api/scenarios'),

  validateScenario: (payload: unknown) =>
    req<ValidateResultLike>('/api/scenarios/validate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createScenario: (payload: unknown) =>
    req<ValidateResultLike>('/api/scenarios', { method: 'POST', body: JSON.stringify(payload) }),

  deleteScenario: (id: string) =>
    req<{ deleted: string }>(`/api/scenarios/${id}`, { method: 'DELETE' }),

  simulateAgent: (agentId: string, scenarioId?: string, scenario?: unknown) =>
    req<AgentDecision>('/api/simulate/agent', {
      method: 'POST',
      body: JSON.stringify({ agent_id: agentId, scenario_id: scenarioId, scenario }),
    }),

  simulateAll: (scenarioId?: string, scenario?: unknown) =>
    req<{ scenario: Scenario; results: AgentDecision[] }>('/api/simulate/all', {
      method: 'POST',
      body: JSON.stringify({ scenario_id: scenarioId, scenario }),
    }),

  simulateBatch: (scenarioIds?: string[]) =>
    req<BatchResult>('/api/simulate/batch', {
      method: 'POST',
      body: JSON.stringify({ scenario_ids: scenarioIds ?? null }),
    }),

  learningMemory: () => req<LearningMemoryState>('/api/learning/memory'),
  resetLearning: (mode: 'seed' | 'empty' = 'seed') =>
    req<LearningMemoryState>('/api/learning/reset', {
      method: 'POST',
      body: JSON.stringify({ mode }),
    }),

  runDiagnostics: () =>
    req<DiagnosticReport>('/api/diagnostics/run', { method: 'POST' }),
};
