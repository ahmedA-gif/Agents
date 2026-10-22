import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  Layers,
  Sparkles,
  TrendingUp,
  Truck,
  Zap,
} from 'lucide-react';
import type { AgentDecision, AgentInfo, Scenario } from '../types';
import { AGENT_PERSONAS } from './ExplainableJourney';

interface BehaviorMatrixProps {
  agents: AgentInfo[];
  decisions: AgentDecision[];
  scenario: Scenario | null;
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onRunSimulation: () => void;
  isBusy: boolean;
}

export const BehaviorMatrix: React.FC<BehaviorMatrixProps> = ({
  agents,
  decisions,
  scenario,
  selectedAgentId,
  onSelectAgent,
  onRunSimulation,
  isBusy,
}) => {
  return (
    <div className="behavior-matrix-card">
      <div className="behavior-matrix-header">
        <div>
          <div className="section-kicker">
            <Layers size={15} />
            <span>AGENT BEHAVIOR BREAKDOWN</span>
          </div>
          <h3>How Each Agent Behaves in this Scenario</h3>
          <p className="behavior-intro">
            Every agent has a different internal brain architecture. See how their distinct philosophies lead to different route decisions.
          </p>
        </div>

        <button className="primary-btn" onClick={onRunSimulation} disabled={isBusy}>
          <Zap size={14} fill="currentColor" />
          <span>{isBusy ? 'Evaluating…' : 'Compare All 7 In Real Time'}</span>
        </button>
      </div>

      <div className="behavior-cards-grid">
        {agents.map((agent) => {
          const decision = decisions.find((d) => d.agent_id === agent.id);
          const persona = AGENT_PERSONAS[agent.id];
          const isSelected = agent.id === selectedAgentId;

          return (
            <div
              key={agent.id}
              className={`behavior-card ${isSelected ? 'active-agent' : ''}`}
              style={{
                borderColor: isSelected ? agent.color : '#25342d',
                boxShadow: isSelected ? `0 0 20px ${agent.color}25` : undefined,
              }}
            >
              {/* Agent Persona Top */}
              <div className="behavior-card-top">
                <div className="agent-avatar" style={{ background: `${agent.color}20`, borderColor: agent.color }}>
                  <span>{persona?.icon || '🤖'}</span>
                </div>
                <div className="agent-text-meta">
                  <div className="agent-title-row">
                    <b>{agent.name}</b>
                    {isSelected && (
                      <span className="current-indicator" style={{ background: agent.color }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <span className="agent-archetype" style={{ color: agent.color }}>
                    {persona?.archetype}
                  </span>
                </div>
              </div>

              {/* Behavioral Philosophy */}
              <p className="behavior-philosophy">"{persona?.plainMindset}"</p>

              {/* Decision Outcome (If run) */}
              {decision ? (
                <div className="behavior-result-box">
                  <div className="result-route-row">
                    <span className="route-chosen-badge" style={{ background: `${agent.color}20`, color: agent.color }}>
                      <Truck size={13} /> Route {decision.selected_route_id || 'None'}
                    </span>
                    <span className={`on-time-tag ${decision.on_time ? 'good' : 'late'}`}>
                      {decision.on_time ? (
                        <>
                          <CheckCircle2 size={12} /> ON TIME
                        </>
                      ) : (
                        <>
                          <AlertTriangle size={12} /> LATE
                        </>
                      )}
                    </span>
                  </div>

                  <div className="result-metrics">
                    <span>
                      ETA: <b>{decision.eta_min ?? '—'}m</b>
                    </span>
                    <span>
                      Deadline: <b>{decision.deadline_min}m</b>
                    </span>
                    <span>
                      Cost: <b>Rs. {decision.cost ?? '—'}</b>
                    </span>
                  </div>

                  {/* Why this choice? */}
                  <div className="result-explanation">
                    <b>Why it behaved this way:</b>
                    <p>{decision.plain_explanation || decision.summary}</p>
                  </div>
                </div>
              ) : (
                <div className="behavior-awaiting-box">
                  <span>Awaiting simulation run</span>
                </div>
              )}

              {/* Inspect Button */}
              <button
                type="button"
                className="inspect-agent-btn"
                onClick={() => onSelectAgent(agent.id)}
                style={{
                  color: isSelected ? agent.color : '#cbd5e1',
                }}
              >
                <span>{isSelected ? 'Currently Viewing in 3D' : 'Inspect 3D & Reasoning'}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
