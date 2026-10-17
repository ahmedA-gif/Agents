// TypeScript mirrors of the backend Pydantic schemas.

export type TrafficLevel = 'light' | 'moderate' | 'heavy';
export type WeatherKind = 'clear' | 'rain';
export type PriorityKind = 'normal' | 'urgent';

export interface Route {
  id: string;
  name: string;
  distance_km: number;
  travel_time_min: number;
  traffic_level: TrafficLevel;
  cost: number;
  available: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  weather: WeatherKind;
  priority: PriorityKind;
  deadline_min: number;
  order_value: number;
  routes: Route[];
  custom: boolean;
}

export interface TraceStep {
  index: number;
  node_id: string;
  phase: 'perceive' | 'reason' | 'decide' | 'plan' | 'act' | 'learn' | 'outcome';
  label: string;
  detail: string;
  data: Record<string, unknown>;
}

export interface AgentDecision {
  agent_id: string;
  agent_name: string;
  scenario_id: string;
  scenario_name: string;
  action: string;
  selected_route_id: string | null;
  eta_min: number | null;
  cost: number | null;
  deadline_min: number;
  on_time: boolean | null;
  summary: string;
  plain_explanation: string;
  reasoning: TraceStep[];
  data: Record<string, any>;
}

export interface ArchNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  detail: string;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  dashed: boolean;
}

export interface Architecture {
  agent_id: string;
  title: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  nodes: ArchNode[];
  edges: ArchEdge[];
}

export interface AgentInfo {
  id: string;
  name: string;
  tagline: string;
  description: string;
  color: string;
  strengths: string[];
  weaknesses: string[];
}

export interface DiagnosticCheck {
  name: string;
  group: string;
  passed: boolean;
  detail: string;
  duration_ms: number;
}

export interface DiagnosticReport {
  total: number;
  passed: number;
  failed: number;
  duration_ms: number;
  checks: DiagnosticCheck[];
}

export interface LearningRecord {
  route_id: string;
  traffic: string;
  weather: string;
  eta_min: number;
  actual_min: number;
  on_time: boolean;
  seq: number;
}

export interface LearningMemoryState {
  deliveries: LearningRecord[];
  route_stats: Record<string, { count: number; on_time_rate: number; mean_delay: number }>;
  source: string;
}

export interface BatchSummary {
  per_scenario: Record<
    string,
    {
      name: string;
      deadline_min: number;
      runs: number;
      on_time_count: number;
      fastest_agent: string | null;
      fastest_route: string | null;
      fastest_eta_min: number | null;
    }
  >;
  per_agent: Record<
    string,
    { runs: number; on_time: number; on_time_rate: number; mean_eta_min: number | null }
  >;
}

export interface BatchResult {
  count: number;
  records: AgentDecision[];
  summary: BatchSummary;
  scenarios: Scenario[];
}

export interface Health {
  status: string;
  service: string;
  version: string;
  agents: number;
  python_engine: string;
}

export const AGENT_COLORS: Record<string, string> = {
  simple_reflex: '#f97316',
  model_based: '#a78bfa',
  goal_based: '#10b981',
  utility_based: '#38bdf8',
  learning: '#f472b6',
  hierarchical: '#fbbf24',
  contextual: '#22d3ee',
};

export const PHASE_COLORS: Record<string, string> = {
  perceive: '#38bdf8',
  reason: '#a78bfa',
  decide: '#10b981',
  plan: '#fbbf24',
  act: '#fb923c',
  learn: '#f472b6',
  outcome: '#f87171',
};

export const NODE_TYPE_STYLES: Record<string, { fill: string; stroke: string }> = {
  environment: { fill: 'rgba(34,197,94,0.10)', stroke: '#22c55e' },
  percept: { fill: 'rgba(56,189,248,0.10)', stroke: '#38bdf8' },
  sensor: { fill: 'rgba(250,204,21,0.10)', stroke: '#facc15' },
  rule: { fill: 'rgba(245,158,11,0.10)', stroke: '#f59e0b' },
  state: { fill: 'rgba(167,139,250,0.10)', stroke: '#a78bfa' },
  memory: { fill: 'rgba(244,114,182,0.10)', stroke: '#f472b6' },
  model: { fill: 'rgba(192,132,252,0.10)', stroke: '#c084fc' },
  goal: { fill: 'rgba(16,185,129,0.10)', stroke: '#10b981' },
  plan: { fill: 'rgba(251,191,36,0.10)', stroke: '#fbbf24' },
  utility: { fill: 'rgba(34,211,238,0.10)', stroke: '#22d3ee' },
  task: { fill: 'rgba(251,191,36,0.10)', stroke: '#fbbf24' },
  context: { fill: 'rgba(125,211,252,0.10)', stroke: '#7dd3fc' },
  decision: { fill: 'rgba(74,222,128,0.10)', stroke: '#4ade80' },
  action: { fill: 'rgba(251,146,60,0.10)', stroke: '#fb923c' },
  feedback: { fill: 'rgba(96,165,250,0.10)', stroke: '#60a5fa' },
};
