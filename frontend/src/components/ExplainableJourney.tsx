import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  DollarSign,
  Eye,
  Flag,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  Route as RouteIcon,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import type { AgentDecision, AgentInfo, Scenario, TraceStep } from '../types';

interface ExplainableJourneyProps {
  decision: AgentDecision | null;
  agent: AgentInfo;
  scenario: Scenario | null;
  currentStepIndex: number;
  onStepChange: (index: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
}

export const AGENT_PERSONAS: Record<
  string,
  {
    archetype: string;
    tagline: string;
    plainMindset: string;
    decisionRule: string;
    icon: string;
  }
> = {
  simple_reflex: {
    archetype: 'The Strict Rule Follower',
    tagline: 'Executes IF-THEN rules instantly without checking future deadlines or remembering past trips.',
    plainMindset:
      'I don’t plan ahead or check if I will be late. I simply look at my first rule: If urgent, take fastest. If raining, avoid traffic. Otherwise, take the first open road.',
    decisionRule: 'First matching rule fires immediately — no feasibility calculation.',
    icon: '⚡',
  },
  model_based: {
    archetype: 'The City Historian',
    tagline: 'Maintains an internal mental map of road conditions and past traffic congestion.',
    plainMindset:
      'I remember previous deliveries. If Route A had heavy traffic earlier, I update my internal belief model to know that Route A is chronically clogged and prefer Route B.',
    decisionRule: 'Combines current observations with past memory before choosing.',
    icon: '🗺️',
  },
  goal_based: {
    archetype: 'The Deadline Hunter',
    tagline: 'Has one relentless target: arriving strictly before the deadline clock expires.',
    plainMindset:
      'Any route that takes longer than the deadline is automatically eliminated as a failure. Among on-time routes, I pick the quickest path to safety.',
    decisionRule: 'Hard constraint filter: ETA ≤ Deadline. Infeasible routes are discarded.',
    icon: '🎯',
  },
  utility_based: {
    archetype: 'The Smart Value Maximizer',
    tagline: 'Calculates a weighted mathematical score balancing Speed, Money Saved, and Reliability.',
    plainMindset:
      'I don’t just ask "is it fast?" — I also ask "is it worth the cost?". I compute: Utility = 50% Time + 30% Cost + 20% Reliability to find the optimal trade-off.',
    decisionRule: 'Maximizes overall multi-objective satisfaction formula.',
    icon: '⚖️',
  },
  learning: {
    archetype: 'The Experienced Veteran Driver',
    tagline: 'Draws on historical trip logs to correct estimates based on actual past delivery delays.',
    plainMindset:
      'On paper, Route A says 30 mins, but my memory shows deliveries on rainy days experienced an average delay of +5 mins! I adjust my estimate using real past outcomes.',
    decisionRule: 'Corrects nominal travel times using empirical historical error records.',
    icon: '🧠',
  },
  hierarchical: {
    archetype: 'The Structured Logistics Team',
    tagline: 'Decomposes complex delivery into 6 specialized operational tasks.',
    plainMindset:
      'I don’t rush. I follow a strict 6-stage operational pipeline: 1. Order Intake → 2. Route Feasibility → 3. Risk Mitigation → 4. Prep → 5. Dispatch → 6. Verification.',
    decisionRule: 'Layered hierarchical task network with validation at each tier.',
    icon: '🏢',
  },
  contextual: {
    archetype: 'The Weather & Urgency Chameleon',
    tagline: 'Heavily factors external conditions like rain storms and VIP priority surges.',
    plainMindset:
      'Rain makes roads 20% slicker, and urgent priority demands aggressive bypass routes. I compute custom dynamic penalties for each contextual factor.',
    decisionRule: 'Applies dynamic multipliers for weather friction, congestion, and priority.',
    icon: '🌦️',
  },
};

export const ExplainableJourney: React.FC<ExplainableJourneyProps> = ({
  decision,
  agent,
  scenario,
  currentStepIndex,
  onStepChange,
  isPlaying,
  onTogglePlay,
  playbackSpeed,
  onSpeedChange,
}) => {
  const persona = AGENT_PERSONAS[agent.id] || {
    archetype: 'Autonomous Agent',
    tagline: agent.description,
    plainMindset: agent.description,
    decisionRule: 'Autonomous policy',
    icon: '🤖',
  };

  const trace = decision?.reasoning ?? [];
  const currentStep = trace[Math.min(currentStepIndex, Math.max(0, trace.length - 1))];
  const selectedRoute = scenario?.routes.find((r) => r.id === decision?.selected_route_id);

  return (
    <div className="explainable-journey-card">
      {/* 1. Friendly Agent Persona Header */}
      <div className="persona-banner" style={{ borderLeftColor: agent.color }}>
        <div className="persona-avatar" style={{ background: `${agent.color}25`, borderColor: agent.color }}>
          <span className="persona-emoji">{persona.icon}</span>
        </div>
        <div className="persona-info">
          <div className="persona-title-row">
            <h3 className="persona-name">{agent.name}</h3>
            <span className="persona-badge" style={{ background: `${agent.color}20`, color: agent.color }}>
              {persona.archetype}
            </span>
          </div>
          <p className="persona-tagline">{persona.tagline}</p>
        </div>
      </div>

      {/* 2. Plain English "Mindset" Box for Non-Technical Users */}
      <div className="agent-mindset-box">
        <div className="mindset-header">
          <Brain size={16} style={{ color: agent.color }} />
          <span><b>How {agent.name.split(' ')[0]} Thinks</b> (In Plain English)</span>
        </div>
        <p className="mindset-text">"{persona.plainMindset}"</p>
        <div className="mindset-rule">
          <Sparkles size={14} style={{ color: agent.color }} />
          <span><b>Core Rule:</b> {persona.decisionRule}</span>
        </div>
      </div>

      {/* 3. Step-by-Step Reasoning Timeline Controls */}
      <div className="journey-timeline-section">
        <div className="timeline-header">
          <div className="timeline-title-wrap">
            <Flag size={16} className="text-emerald-400" />
            <h4>Reasoning Step-by-Step: How It Reached The Result</h4>
          </div>
          <div className="timeline-player-controls">
            <button
              className="player-btn"
              disabled={currentStepIndex <= 0}
              onClick={() => onStepChange(Math.max(0, currentStepIndex - 1))}
              title="Previous Step"
            >
              <ChevronLeft size={16} />
            </button>
            <button className="player-btn primary" onClick={onTogglePlay} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause size={14} /> : <Play size={14} fill="currentColor" />}
              <span>{isPlaying ? 'Pause' : 'Play Steps'}</span>
            </button>
            <button
              className="player-btn"
              disabled={currentStepIndex >= trace.length - 1}
              onClick={() => onStepChange(Math.min(trace.length - 1, currentStepIndex + 1))}
              title="Next Step"
            >
              <ChevronRight size={16} />
            </button>

            {/* Speed Selector */}
            <div className="speed-pills">
              {[0.5, 1, 2].map((spd) => (
                <button
                  key={spd}
                  className={`speed-pill ${playbackSpeed === spd ? 'active' : ''}`}
                  onClick={() => onSpeedChange(spd)}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Step Progress Ribbon */}
        {trace.length > 0 && (
          <div className="trace-stepper-ribbon">
            {trace.map((t, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <button
                  key={`${t.node_id}-${idx}`}
                  className={`ribbon-step ${isCurrent ? 'current' : ''} ${isPast ? 'past' : ''}`}
                  onClick={() => onStepChange(idx)}
                  style={{
                    borderColor: isCurrent ? agent.color : isPast ? `${agent.color}80` : '#334155',
                  }}
                >
                  <span
                    className="step-number"
                    style={{
                      background: isCurrent ? agent.color : isPast ? `${agent.color}35` : '#1e293b',
                      color: isCurrent ? '#09110e' : '#e2e8f0',
                    }}
                  >
                    {isPast ? <Check size={11} /> : idx + 1}
                  </span>
                  <span className="step-label">{t.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Current Active Step Callout */}
        {currentStep && (
          <div className="active-step-card" style={{ borderLeftColor: agent.color }}>
            <div className="active-step-meta">
              <span className="step-phase-pill" style={{ background: `${agent.color}25`, color: agent.color }}>
                Phase: {currentStep.phase.toUpperCase()}
              </span>
              <span className="step-index-counter">
                Step {currentStepIndex + 1} of {trace.length}
              </span>
            </div>
            <h5 className="active-step-title">{currentStep.label}</h5>
            <p className="active-step-detail">{currentStep.detail}</p>
          </div>
        )}
      </div>

      {/* 4. Route Comparison & Elimination Table (Non-Technical) */}
      {scenario && scenario.routes.length > 0 && (
        <div className="route-comparison-section">
          <div className="section-title-row">
            <Compass size={16} style={{ color: agent.color }} />
            <h4>Candidate Route Breakdown & Decision Comparison</h4>
          </div>
          <p className="section-subtitle">
            Here is how each candidate route scored against the deadline and conditions for this agent:
          </p>

          <div className="route-cards-grid">
            {scenario.routes.map((route) => {
              const isChosen = decision?.selected_route_id === route.id;
              const isFeasible = route.travel_time_min <= scenario.deadline_min;
              const timeDiff = scenario.deadline_min - route.travel_time_min;

              return (
                <div
                  key={route.id}
                  className={`route-card-item ${isChosen ? 'chosen' : ''}`}
                  style={{
                    borderColor: isChosen ? agent.color : '#28382f',
                    background: isChosen ? `${agent.color}10` : '#101a16',
                  }}
                >
                  <div className="route-card-top">
                    <div className="route-title-badge">
                      <span className="route-id" style={{ background: isChosen ? agent.color : '#334155', color: isChosen ? '#09110e' : '#fff' }}>
                        {route.id}
                      </span>
                      <b>{route.name}</b>
                    </div>
                    {isChosen ? (
                      <span className="chosen-pill" style={{ background: agent.color, color: '#09110e' }}>
                        <CheckCircle2 size={13} /> SELECTED
                      </span>
                    ) : (
                      <span className="rejected-pill">REJECTED</span>
                    )}
                  </div>

                  <div className="route-card-specs">
                    <div className="spec-item">
                      <Clock size={13} />
                      <span>ETA: <b>{route.travel_time_min} min</b></span>
                    </div>
                    <div className="spec-item">
                      <DollarSign size={13} />
                      <span>Cost: <b>Rs. {route.cost}</b></span>
                    </div>
                    <div className="spec-item">
                      <span className={`traffic-dot ${route.traffic_level}`} />
                      <span className="capitalize">{route.traffic_level} Traffic</span>
                    </div>
                  </div>

                  {/* Why picked or rejected explanation */}
                  <div className="route-why-box">
                    {isChosen ? (
                      <div className="why-chosen">
                        <Check size={14} className="text-emerald-400" />
                        <span>
                          <b>Why Selected:</b> {decision?.plain_explanation || decision?.summary || 'Best match for agent rules.'}
                        </span>
                      </div>
                    ) : (
                      <div className="why-rejected">
                        <XCircle size={14} className="text-red-400" />
                        <span>
                          <b>Why Not Picked:</b>{' '}
                          {!isFeasible
                            ? `Takes ${route.travel_time_min}m — exceeds ${scenario.deadline_min}m deadline by ${Math.abs(timeDiff)}m.`
                            : route.travel_time_min > (selectedRoute?.travel_time_min ?? 0)
                            ? `Slower than Route ${selectedRoute?.id} (${route.travel_time_min}m vs ${selectedRoute?.travel_time_min}m).`
                            : `Lower overall score under ${agent.name} policy.`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Final Outcome Summary Banner */}
      {decision && (
        <div className="final-outcome-banner" style={{ borderColor: decision.on_time ? '#22c55e' : '#f59e0b' }}>
          <div className="outcome-icon-wrap" style={{ background: decision.on_time ? '#22c55e20' : '#f59e0b20', color: decision.on_time ? '#4ade80' : '#fbbf24' }}>
            {decision.on_time ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div className="outcome-text-wrap">
            <div className="outcome-headline">
              <b>Result: {decision.on_time ? 'SUCCESSFUL ON-TIME DELIVERY' : 'LATE DELIVERY WARNING'}</b>
              <span className="outcome-route-badge">Via Route {decision.selected_route_id}</span>
            </div>
            <p className="outcome-description">{decision.plain_explanation || decision.summary}</p>
            <div className="outcome-pills">
              <span>Arrival Time: <b>{decision.eta_min} mins</b></span>
              <span>Deadline: <b>{decision.deadline_min} mins</b></span>
              <span>Total Cost: <b>Rs. {decision.cost}</b></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
