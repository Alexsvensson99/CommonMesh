import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bot,
  Box,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDotDashed,
  Clipboard,
  ClipboardCheck,
  Clock3,
  DoorOpen,
  HeartHandshake,
  Info,
  LayoutDashboard,
  MapPin,
  Network,
  PackageSearch,
  Radio,
  RefreshCcw,
  Route,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Truck,
  UserRound,
  Users,
  Utensils,
  WifiOff,
  Wrench,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  categoryLabel,
  formatTimeWindow,
  getCoordinationSnapshot,
  validateMatchPlan,
} from './domain/coordination'
import type {
  ActivityEntry,
  CoordinationState,
  NeedCategory,
  NeedWithStatus,
  Resource,
  StagedPlan,
} from './domain/types'
import {
  coordinationStore,
  useCoordinationState,
} from './store/coordinationStore'
import { getCommonMeshToolCatalogue } from './webmcp/tools'
import { useWebMCP, type WebMCPStatus } from './webmcp/useWebMCP'
import './App.css'

const agentPrompt =
  "Inspect the coordination snapshot. Cover every open need for Saturday Community Day using resources within 10 km. Respect availability, quantities, skills, time windows, and maximum hours. Validate the complete plan and stage it for my review. Do not commit anything until I approve the exact plan in CommonMesh."

const categoryIcons: Record<NeedCategory, LucideIcon> = {
  equipment: Box,
  transport: Truck,
  people: Users,
  food: Utensils,
  space: DoorOpen,
}

const categoryTones: Record<NeedCategory, string> = {
  equipment: 'violet',
  transport: 'blue',
  people: 'green',
  food: 'orange',
  space: 'rose',
}

type Notice = {
  kind: 'success' | 'error' | 'info'
  message: string
}

function quantityLabel(quantity: number, unit: string) {
  const displayUnit = unit === 'people' && quantity === 1 ? 'person' : unit
  return `${quantity} ${displayUnit}`
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${date}T12:00:00`))
}

function formatActivityTime(timestamp: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

function formatActivityDate(timestamp: string) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Network size={18} strokeWidth={2.2} />
    </span>
  )
}

function Sidebar({ needCount }: { needCount: number }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <div>
          <span className="brand-name">CommonMesh</span>
          <span className="brand-tagline">Coordination workspace</span>
        </div>
      </div>

      <nav className="side-nav" aria-label="Workspace navigation">
        <a className="active" href="#overview">
          <LayoutDashboard size={18} />
          Overview
        </a>
        <a href="#needs">
          <HeartHandshake size={18} />
          Needs
          <span className="nav-count">{needCount}</span>
        </a>
        <a href="#plan">
          <ClipboardCheck size={18} />
          Agent plan
        </a>
        <a href="#resources">
          <PackageSearch size={18} />
          Resources
        </a>
        <a href="#assignments">
          <ClipboardCheck size={18} />
          Assignments
        </a>
        <a href="#activity">
          <ScrollText size={18} />
          Activity trail
        </a>
      </nav>

      <div className="sidebar-spacer" />

      <div className="trust-card">
        <div className="trust-icon">
          <ShieldCheck size={19} />
        </div>
        <div>
          <strong>Human approval boundary</strong>
          <p>Agents can propose changes. Only you can approve execution.</p>
        </div>
      </div>

      <div className="challenge-label">
        <Network size={16} />
        <span>2026 WebMCP Challenge</span>
      </div>
    </aside>
  )
}

function WebMCPBadge({
  status,
  onOpen,
}: {
  status: WebMCPStatus
  onOpen: () => void
}) {
  const connected = status.state === 'connected'
  const checking = status.state === 'checking'
  const label = connected
    ? `WebMCP live · ${status.toolCount} tools`
    : checking
      ? 'Detecting WebMCP'
      : 'WebMCP preview mode'

  return (
    <button
      type="button"
      className={`webmcp-badge ${connected ? 'connected' : status.state}`}
      title={status.detail}
      aria-label={`${label}. Open WebMCP tool catalogue`}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      {connected ? (
        <Radio size={15} />
      ) : checking ? (
        <CircleDotDashed size={15} />
      ) : (
        <WifiOff size={15} />
      )}
      <span>{label}</span>
    </button>
  )
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  note: string
  icon: LucideIcon
  tone: string
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon size={20} />
      </div>
      <div>
        <span className="metric-label">{label}</span>
        <div className="metric-line">
          <strong>{value}</strong>
          <span>{note}</span>
        </div>
      </div>
    </article>
  )
}

function NeedStatusBadge({ status }: { status: NeedWithStatus['status'] }) {
  return (
    <span className={`status-badge ${status}`}>
      {status === 'covered' ? (
        <Check size={13} />
      ) : status === 'disrupted' ? (
        <TriangleAlert size={13} />
      ) : (
        <span className="status-dot" />
      )}
      {status}
    </span>
  )
}

function NeedCard({ need }: { need: NeedWithStatus }) {
  const Icon = categoryIcons[need.category]
  return (
    <article className={`need-card ${need.status}`}>
      <div className="need-topline">
        <div className={`category-icon ${categoryTones[need.category]}`}>
          <Icon size={18} />
        </div>
        <div className="need-heading">
          <span>{categoryLabel(need.category)}</span>
          <h3>{need.title}</h3>
        </div>
        <NeedStatusBadge status={need.status} />
      </div>
      <p>{need.description}</p>
      <div className="need-meta">
        <span>
          <Clock3 size={14} /> {formatTimeWindow(need.start, need.end)}
        </span>
        <span>
          <MapPin size={14} /> {need.location}
        </span>
      </div>
      {need.status !== 'open' && (
        <div className="need-coverage">
          <div aria-hidden="true">
            <span
              style={{
                width: `${Math.min(100, (need.availableCommittedQuantity / need.quantity) * 100)}%`,
              }}
            />
          </div>
          <small>
            {need.availableCommittedQuantity}/{need.quantity} {need.unit} live
          </small>
        </div>
      )}
    </article>
  )
}

function ResourceCard({
  resource,
  assigned,
  onAvailabilityChange,
}: {
  resource: Resource
  assigned: boolean
  onAvailabilityChange: (resourceId: string, unavailable: boolean) => void
}) {
  const Icon = categoryIcons[resource.type]
  const unavailable = resource.availability.status === 'unavailable'
  const canToggle = assigned || resource.type === 'transport'
  return (
    <article className={`resource-card ${unavailable ? 'unavailable' : ''}`}>
      <div className={`resource-avatar ${categoryTones[resource.type]}`}>
        <Icon size={19} />
      </div>
      <div className="resource-body">
        <div className="resource-title-row">
          <div>
            <h3>{resource.name}</h3>
            <span>{resource.owner}</span>
          </div>
          {assigned && !unavailable && (
            <span className="assigned-chip">Assigned</span>
          )}
          {unavailable && (
            <span className="unavailable-chip">Unavailable</span>
          )}
        </div>
        <p>{resource.description}</p>
        <div className="resource-meta">
          <span>
            <Route size={14} /> {resource.distanceKm} km
          </span>
          <span>
            <Clock3 size={14} />{' '}
            {formatTimeWindow(
              resource.availability.start,
              resource.availability.end,
            )}
          </span>
          <span>{quantityLabel(resource.capacity, resource.unit)}</span>
        </div>
        {canToggle && (
          <button
            type="button"
            className="availability-button"
            onClick={() => onAvailabilityChange(resource.id, !unavailable)}
          >
            {unavailable ? (
              <>
                <RefreshCcw size={14} /> Restore availability
              </>
            ) : (
              <>
                <X size={14} /> Mark unavailable
              </>
            )}
          </button>
        )}
      </div>
    </article>
  )
}

function EmptyFilterState({ subject }: { subject: 'needs' | 'resources' }) {
  return (
    <div className="empty-filter-state" role="status">
      <Info size={20} />
      <strong>No {subject} match this filter</strong>
      <span>Choose another filter to return to the full workspace.</span>
    </div>
  )
}

function PlanLifecycle({
  status,
  stale,
}: {
  status: StagedPlan['status']
  stale: boolean
}) {
  const activeIndex = stale
    ? 0
    : status === 'staged'
      ? 0
      : status === 'approved'
        ? 1
        : 2
  const steps = ['PROPOSED', 'APPROVED', 'COMMITTED']

  return (
    <ol
      className={`plan-lifecycle ${stale ? 'stale' : ''}`}
      aria-label={`Plan lifecycle. Current state: ${stale ? 'stale proposal' : steps[activeIndex].toLowerCase()}`}
    >
      {steps.map((step, index) => (
        <li
          className={
            index < activeIndex
              ? 'complete'
              : index === activeIndex
                ? 'current'
                : ''
          }
          key={step}
        >
          <span>{index < activeIndex ? <Check size={13} /> : index + 1}</span>
          <strong>{step}</strong>
        </li>
      ))}
    </ol>
  )
}

function PlanAssignment({
  assignment,
  state,
  replacement,
}: {
  assignment: StagedPlan['assignments'][number]
  state: ReturnType<typeof coordinationStore.getState>
  replacement: boolean
}) {
  const need = state.needs.find((candidate) => candidate.id === assignment.needId)
  const resource = state.resources.find(
    (candidate) => candidate.id === assignment.resourceId,
  )
  if (!need || !resource) return null
  const Icon = categoryIcons[need.category]
  const unavailable = resource.availability.status === 'unavailable'

  return (
    <div className={`plan-assignment ${unavailable ? 'invalid' : ''}`}>
      <div className={`assignment-icon ${categoryTones[need.category]}`}>
        <Icon size={16} />
      </div>
      <div className="assignment-copy">
        <strong>{need.title}</strong>
        <span>
          {resource.name} · {quantityLabel(assignment.quantity, need.unit)}
        </span>
      </div>
      {replacement && <span className="replacement-chip">Replacement</span>}
      {unavailable ? (
        <TriangleAlert size={17} className="assignment-error" />
      ) : (
        <CheckCircle2 size={17} className="assignment-check" />
      )}
    </div>
  )
}

function EmptyPlan({ onStage }: { onStage: () => void }) {
  return (
    <div className="empty-plan">
      <div className="empty-plan-icon" aria-hidden="true">
        <Bot size={28} />
      </div>
      <h3>No plan is staged</h3>
      <p>
        An agent can inspect the live workspace, validate every constraint, and
        place a proposal here. Nothing executes until you approve it.
      </p>
      <button type="button" className="secondary-button" onClick={onStage}>
        <Sparkles size={16} /> Stage deterministic demo plan
      </button>
    </div>
  )
}

function PlanPanel({
  plan,
  onStage,
  onApprove,
  onReject,
}: {
  plan: StagedPlan | null
  onStage: () => void
  onApprove: (plan: StagedPlan) => void
  onReject: (plan: StagedPlan) => void
}) {
  const state = useCoordinationState()
  if (!plan) return <EmptyPlan onStage={onStage} />

  const validation = validateMatchPlan(state, plan.assignments)
  const stale =
    plan.sourceRevision !== state.resourceRevision && plan.status !== 'committed'
  const approved = plan.status === 'approved' && !stale
  const committed = plan.status === 'committed'
  const issues = [...validation.errors, ...validation.warnings]
  const isRepair = validation.metrics.replacedAssignments > 0
  const visibleState = stale
    ? 'STALE'
    : committed
      ? 'COMMITTED'
      : approved
        ? 'APPROVED'
        : 'PROPOSED'

  return (
    <div className="plan-content">
      <div className="agent-proposal-label">
        <Bot size={16} /> Agent Proposed Plan
      </div>
      <PlanLifecycle status={plan.status} stale={stale} />

      <div className="plan-summary-header">
        <div>
          <div className="eyebrow-row">
            <span className={`plan-state ${visibleState.toLowerCase()}`}>
              {visibleState}
            </span>
            <span>workspace revision {plan.sourceRevision}</span>
          </div>
          <h3>{plan.id}</h3>
          <p>{plan.intent}</p>
        </div>
        <div className="plan-score">
          <strong>{validation.coverage.percentage}%</strong>
          <span>projected coverage</span>
        </div>
      </div>

      {isRepair && (
        <div className="plan-change-summary" aria-label="Repair plan impact">
          <span>
            <CheckCircle2 size={16} />
            <strong>{validation.metrics.preservedAssignments}</strong> existing
            assignments preserved
          </span>
          <span>
            <RefreshCcw size={16} />
            <strong>{validation.metrics.replacedAssignments}</strong>{' '}
            {validation.metrics.replacedAssignments === 1
              ? 'assignment'
              : 'assignments'}{' '}
            replaced
          </span>
        </div>
      )}

      <div className="plan-metrics">
        <span>
          <CheckCircle2 size={15} /> {validation.summary.assignmentCount}{' '}
          {validation.summary.assignmentCount === 1
            ? 'assignment'
            : 'assignments'}
        </span>
        <span>
          <Route size={15} /> {validation.summary.totalTravelKm} km travel
        </span>
        <span>
          <Clock3 size={15} /> {validation.summary.estimatedVolunteerHours}{' '}
          volunteer hours
        </span>
        <span className={validation.valid ? 'valid' : 'invalid'}>
          {validation.valid ? (
            <ShieldCheck size={15} />
          ) : (
            <TriangleAlert size={15} />
          )}
          {validation.valid
            ? 'All constraints satisfied'
            : `${validation.errors.length} blocking ${validation.errors.length === 1 ? 'issue' : 'issues'}`}
        </span>
      </div>

      <div className="assignment-list" aria-label="Proposed assignments">
        {plan.assignments.map((assignment) => (
          <PlanAssignment
            assignment={assignment}
            state={state}
            replacement={isRepair}
            key={`${assignment.needId}-${assignment.resourceId}`}
          />
        ))}
      </div>

      <div className="plan-validation-summary">
        <div>
          <strong>Coverage</strong>
          <span>
            {validation.coverage.needsFullyCovered}/
            {validation.coverage.needsTotal} needs fully covered
          </span>
        </div>
        <div>
          <strong>Warnings</strong>
          <span>
            {validation.warnings.length === 0
              ? 'None'
              : `${validation.warnings.length} review ${validation.warnings.length === 1 ? 'item' : 'items'}`}
          </span>
        </div>
        <div>
          <strong>Uncovered</strong>
          <span>
            {validation.uncoveredNeeds.length === 0
              ? 'None'
              : validation.uncoveredNeeds.map((need) => need.title).join(', ')}
          </span>
        </div>
        {issues.length > 0 && (
          <ul className="plan-issues">
            {issues.slice(0, 4).map((item, index) => (
              <li key={`${item.code}-${index}`}>
                <code>{item.code}</code> {item.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div
        className={`approval-box ${stale ? 'stale' : approved ? 'approved' : committed ? 'committed' : ''}`}
        aria-live="polite"
      >
        <div className="approval-copy">
          <div className="approval-icon">
            {stale ? (
              <TriangleAlert size={21} />
            ) : committed ? (
              <CheckCircle2 size={21} />
            ) : approved ? (
              <ShieldCheck size={21} />
            ) : (
              <UserRound size={21} />
            )}
          </div>
          <div>
            <strong>
              {stale
                ? 'Plan is stale — approval is not valid'
                : committed
                  ? 'Committed after human approval'
                  : approved
                    ? 'Approved — not committed'
                    : 'Human approval required'}
            </strong>
            <span className="approval-explanation">
              {stale
                ? 'Resources changed after this proposal. Restage before approval.'
                : committed
                  ? 'The assignments below are now active.'
                  : approved
                    ? 'The agent may commit only this exact digest.'
                    : 'Approving authorizes this exact proposal. It does not execute it.'}
            </span>
            <span className="digest" title={plan.digest}>
              {plan.digest}
            </span>
          </div>
        </div>

        {!committed && !approved && !stale && (
          <div className="approval-actions">
            <button
              type="button"
              className="reject-button"
              onClick={() => onReject(plan)}
            >
              <X size={16} /> Reject
            </button>
            <button
              type="button"
              className="primary-button approve-button"
              disabled={!validation.valid}
              onClick={() => onApprove(plan)}
            >
              <ShieldCheck size={17} /> Approve Plan
            </button>
          </div>
        )}

        {approved && (
          <div className="approval-actions">
            <button
              type="button"
              className="reject-button"
              onClick={() => onReject(plan)}
            >
              <X size={16} /> Revoke and reject
            </button>
            <span className="agent-next">
              <Bot size={15} /> Ready for agent commit
            </span>
          </div>
        )}
      </div>

      {(stale || (committed && validation.coverage.percentage < 100)) && (
        <button type="button" className="text-button" onClick={onStage}>
          <RefreshCcw size={15} />
          {stale
            ? 'Restage against current resources'
            : 'Stage disrupted needs'}
        </button>
      )}
    </div>
  )
}

function ActivityGlyph({ entry }: { entry: ActivityEntry }) {
  if (entry.outcome === 'failed') return <TriangleAlert size={16} />
  if (entry.action === 'approve_plan') return <ShieldCheck size={16} />
  if (entry.action === 'commit_approved_plan') return <CheckCircle2 size={16} />
  if (entry.action === 'set_resource_availability') return <Truck size={16} />
  if (entry.action === 'stage_match_plan') return <Bot size={16} />
  if (entry.action.startsWith('search_')) return <PackageSearch size={16} />
  if (entry.action === 'reset_demo') return <RefreshCcw size={16} />
  if (entry.actor === 'agent') return <Bot size={16} />
  if (entry.actor === 'human') return <UserRound size={16} />
  return <Network size={16} />
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const planId = `${entry.summary} ${entry.detail ?? ''}`.match(
    /\bCM-[A-Z0-9]+\b/,
  )?.[0]
  const outcome = entry.outcome ?? 'info'

  return (
    <li className={`activity-item ${entry.actor} ${outcome}`}>
      <div className="activity-avatar">
        <ActivityGlyph entry={entry} />
      </div>
      <div className="activity-body">
        <div className="activity-meta">
          <span className={`actor-label ${entry.actor}`}>
            {entry.actor.toUpperCase()}
          </span>
          <span className={`outcome-label ${outcome}`}>
            {outcome === 'failed'
              ? 'Blocked'
              : outcome === 'success'
                ? 'Succeeded'
                : 'Info'}
          </span>
          {planId && <code className="activity-plan-id">{planId}</code>}
          <time
            dateTime={entry.timestamp}
            title={formatActivityDate(entry.timestamp)}
          >
            {formatActivityTime(entry.timestamp)}
          </time>
        </div>
        <strong>{entry.summary}</strong>
        {entry.detail && <p>{entry.detail}</p>}
        <code className="activity-action">{entry.action}</code>
      </div>
    </li>
  )
}

function CoverageDonut({ percent }: { percent: number }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  return (
    <div className="coverage-donut">
      <svg viewBox="0 0 84 84" role="img" aria-label={`${percent}% coverage`}>
        <circle className="donut-track" cx="42" cy="42" r={radius} />
        <circle
          className="donut-progress"
          cx="42"
          cy="42"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
        />
      </svg>
      <div>
        <strong>{percent}%</strong>
        <span>covered</span>
      </div>
    </div>
  )
}

function OperationalSummary({
  state,
  snapshot,
}: {
  state: CoordinationState
  snapshot: ReturnType<typeof getCoordinationSnapshot>
}) {
  const health =
    snapshot.totals.disrupted > 0
      ? {
          tone: 'attention',
          label: 'Attention required',
          detail: 'A committed assignment needs repair.',
          icon: TriangleAlert,
        }
      : snapshot.coveragePercent === 100
        ? {
            tone: 'healthy',
            label: 'Fully coordinated',
            detail: 'Every need has an active assignment.',
            icon: CheckCircle2,
          }
        : {
            tone: 'ready',
            label: 'Ready to coordinate',
            detail: 'Needs and resources are ready for an agent plan.',
            icon: ClipboardCheck,
          }
  const HealthIcon = health.icon
  const planLabel = state.stagedPlan
    ? `${state.stagedPlan.id} · ${state.stagedPlan.status.toUpperCase()}`
    : 'No plan staged'

  return (
    <aside className={`operational-summary ${health.tone}`}>
      <div className="operational-status">
        <span>
          <HealthIcon size={19} />
        </span>
        <div>
          <strong>{health.label}</strong>
          <p>{health.detail}</p>
        </div>
      </div>
      <dl>
        <div>
          <dt>Live coverage</dt>
          <dd>
            {snapshot.totals.covered}/{snapshot.totals.needs} needs
          </dd>
        </div>
        <div>
          <dt>Resources</dt>
          <dd>{snapshot.totals.availableResources} available</dd>
        </div>
        <div>
          <dt>Plan state</dt>
          <dd>{planLabel}</dd>
        </div>
      </dl>
      <div className="operational-trust">
        <ShieldCheck size={16} />
        <span>Agents propose. Humans approve execution.</span>
      </div>
    </aside>
  )
}

function AssignmentsPanel({ state }: { state: CoordinationState }) {
  const disruptedAssignments = state.committedAssignments.filter(
    (assignment) =>
      state.resources.find((resource) => resource.id === assignment.resourceId)
        ?.availability.status === 'unavailable',
  )
  const activeAssignments =
    state.committedAssignments.length - disruptedAssignments.length

  return (
    <section className="panel assignments-panel" id="assignments">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Committed coordination</span>
          <h2>Assignments</h2>
        </div>
        <span className="panel-count">{state.committedAssignments.length}</span>
      </div>

      {disruptedAssignments.length > 0 && (
        <div className="assignment-attention" role="status">
          <TriangleAlert size={18} />
          <strong>
            {disruptedAssignments.length}{' '}
            {disruptedAssignments.length === 1
              ? 'assignment requires'
              : 'assignments require'}{' '}
            attention
          </strong>
          <span>{activeAssignments} assignments remain active</span>
        </div>
      )}

      {state.committedAssignments.length === 0 ? (
        <div className="assignments-empty">
          <ClipboardCheck size={21} />
          <div>
            <strong>No committed assignments</strong>
            <p>
              Agent plans remain proposals until a human approves their exact
              digest and the agent commits it.
            </p>
          </div>
        </div>
      ) : (
        <div className="committed-grid">
          {state.committedAssignments.map((assignment) => {
            const need = state.needs.find(
              (candidate) => candidate.id === assignment.needId,
            )
            const resource = state.resources.find(
              (candidate) => candidate.id === assignment.resourceId,
            )
            if (!need || !resource) return null
            const disrupted = resource.availability.status === 'unavailable'
            return (
              <article
                className={`committed-assignment ${disrupted ? 'disrupted' : ''}`}
                key={`${assignment.planId}-${assignment.needId}-${assignment.resourceId}`}
              >
                <div>
                  <span className="assignment-plan-id">{assignment.planId}</span>
                  <strong>{need.title}</strong>
                  <p>
                    {resource.name} ·{' '}
                    {quantityLabel(assignment.quantity, need.unit)}
                  </p>
                  {disrupted && (
                    <span className="affected-detail">
                      {resource.name} is unavailable
                    </span>
                  )}
                </div>
                <div className="committed-assignment-meta">
                  <span>{formatTimeWindow(assignment.start, assignment.end)}</span>
                  <span
                    className={
                      disrupted
                        ? 'assignment-flag disrupted'
                        : 'assignment-flag'
                    }
                  >
                    {disrupted ? (
                      <TriangleAlert size={14} />
                    ) : (
                      <Check size={14} />
                    )}
                    {disrupted ? 'Affected' : 'Active'}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function AccessibleDialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  className,
  children,
}: {
  open: boolean
  onClose: () => void
  labelledBy: string
  describedBy?: string
  className: string
  children: React.ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className={className}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClose={onClose}
    >
      {children}
    </dialog>
  )
}

function WebMCPToolsDialog({
  open,
  onClose,
  status,
}: {
  open: boolean
  onClose: () => void
  status: WebMCPStatus
}) {
  const tools = useMemo(
    () => getCommonMeshToolCatalogue(coordinationStore),
    [],
  )
  const readCount = tools.filter((tool) => tool.access === 'read').length

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      labelledBy="webmcp-tools-title"
      describedBy="webmcp-tools-description"
      className="app-dialog tools-dialog"
    >
      <div className="dialog-header">
        <div>
          <span className="section-kicker">Judge & developer view</span>
          <h2 id="webmcp-tools-title">WebMCP Tools</h2>
          <p id="webmcp-tools-description">
            The live page exposes {tools.length} structured capabilities to
            browser agents.
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close WebMCP tools"
          autoFocus
        >
          <X size={18} />
        </button>
      </div>

      <div
        className={`dialog-status ${status.state === 'connected' ? 'connected' : 'unavailable'}`}
        role="status"
      >
        {status.state === 'connected' ? <Radio size={17} /> : <WifiOff size={17} />}
        <span>
          {status.state === 'connected'
            ? `Live registration confirmed · ${readCount} read · ${tools.length - readCount} write`
            : 'Informational catalogue · live registration needs a WebMCP-enabled browser'}
        </span>
      </div>

      <div className="tool-list" role="list" aria-label="Exposed WebMCP tools">
        {tools.map((tool) => (
          <div className="tool-row" role="listitem" key={tool.name}>
            <div>
              <code>{tool.name}</code>
              <span>{tool.purpose}</span>
            </div>
            <span className={`access-chip ${tool.access}`}>
              {tool.access === 'read' ? 'READ' : 'WRITE'}
            </span>
          </div>
        ))}
      </div>

      <div className="dialog-trust-note">
        <ShieldCheck size={18} />
        <div>
          <strong>No approval tool is exposed.</strong>
          <span>Agents can propose changes. Only you can approve execution.</span>
        </div>
      </div>
    </AccessibleDialog>
  )
}

function ResetDialog({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      labelledBy="reset-dialog-title"
      describedBy="reset-dialog-description"
      className="app-dialog reset-dialog"
    >
      <div className="reset-dialog-icon">
        <RefreshCcw size={22} />
      </div>
      <h2 id="reset-dialog-title">Reset the demo?</h2>
      <p id="reset-dialog-description">
        This restores all 7 needs and 15 resources, clears staged plans and
        approvals, removes assignments, and resets resource availability.
      </p>
      <div className="reset-dialog-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onClose}
          autoFocus
        >
          Keep current state
        </button>
        <button type="button" className="danger-button" onClick={onConfirm}>
          <RefreshCcw size={16} /> Reset Demo
        </button>
      </div>
    </AccessibleDialog>
  )
}

function NoticeBar({
  notice,
  onDismiss,
}: {
  notice: Notice
  onDismiss: () => void
}) {
  return (
    <div
      className={`notice-bar ${notice.kind}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
    >
      {notice.kind === 'error' ? (
        <TriangleAlert size={17} />
      ) : notice.kind === 'success' ? (
        <CheckCircle2 size={17} />
      ) : (
        <Info size={17} />
      )}
      <span>{notice.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss message">
        <X size={15} />
      </button>
    </div>
  )
}

function DemoControls({
  webMCP,
  vanUnavailable,
  onReset,
  onVanChange,
  onTools,
}: {
  webMCP: WebMCPStatus
  vanUnavailable: boolean
  onReset: () => void
  onVanChange: (unavailable: boolean) => void
  onTools: () => void
}) {
  const webMCPReady = webMCP.state === 'connected'
  return (
    <section className="panel demo-panel" aria-labelledby="demo-controls-title">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Repeatable judging flow</span>
          <h2 id="demo-controls-title">Demo controls</h2>
        </div>
        <RefreshCcw size={19} />
      </div>
      <div className="demo-actions">
        <button type="button" className="secondary-button" onClick={onReset}>
          <RefreshCcw size={16} /> Reset Demo
        </button>
        <button
          type="button"
          className={vanUnavailable ? 'secondary-button' : 'van-button'}
          onClick={() => onVanChange(!vanUnavailable)}
        >
          {vanUnavailable ? <RefreshCcw size={16} /> : <Truck size={16} />}
          {vanUnavailable
            ? 'Restore primary van'
            : 'Mark primary van unavailable'}
        </button>
      </div>
      <div className={`webmcp-status-card ${webMCPReady ? 'connected' : ''}`}>
        {webMCPReady ? <Radio size={18} /> : <WifiOff size={18} />}
        <div>
          <strong>
            {webMCPReady
              ? `WebMCP live · ${webMCP.toolCount} tools registered`
              : 'WebMCP unsupported in this browser'}
          </strong>
          <p>
            {webMCPReady
              ? 'Agent actions update this same workspace and activity trail.'
              : 'The human interface remains fully usable. Open in ChatGPT or a supported Chrome build for agent tools.'}
          </p>
          <button type="button" className="inline-link" onClick={onTools}>
            View tool catalogue <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </section>
  )
}

function App() {
  const state = useCoordinationState()
  const webMCP = useWebMCP()
  const snapshot = useMemo(() => getCoordinationSnapshot(state), [state])
  const [resourceFilter, setResourceFilter] = useState<'all' | NeedCategory>(
    'all',
  )
  const [needFilter, setNeedFilter] = useState<
    'all' | NeedWithStatus['status']
  >('all')
  const [copied, setCopied] = useState(false)
  const [staging, setStaging] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  const assignedResourceIds = useMemo(
    () => new Set(state.committedAssignments.map((item) => item.resourceId)),
    [state.committedAssignments],
  )
  const filteredResources = state.resources.filter(
    (resource) =>
      resourceFilter === 'all' || resource.type === resourceFilter,
  )
  const filteredNeeds = snapshot.needs.filter(
    (need) => needFilter === 'all' || need.status === needFilter,
  )
  const primaryVanUnavailable =
    state.resources.find((resource) => resource.id === 'res-northside-van')
      ?.availability.status === 'unavailable'
  const disruptedAssignments = state.committedAssignments.filter(
    (assignment) =>
      state.resources.find((resource) => resource.id === assignment.resourceId)
        ?.availability.status === 'unavailable',
  )
  const affectedAssignment = disruptedAssignments[0]
  const affectedNeed = affectedAssignment
    ? state.needs.find((need) => need.id === affectedAssignment.needId)
    : undefined
  const affectedResource = affectedAssignment
    ? state.resources.find(
        (resource) => resource.id === affectedAssignment.resourceId,
      )
    : undefined

  const stageRecommended = async () => {
    if (staging) return
    setStaging(true)
    try {
      const result = await coordinationStore.stageRecommendedPlan('human')
      if (result.ok) {
        setNotice({
          kind: 'success',
          message: `${result.data.id} is staged for review. No assignments changed.`,
        })
      } else {
        setNotice({ kind: 'error', message: result.error.message })
      }
    } catch {
      setNotice({
        kind: 'error',
        message: 'The plan could not be staged. Please try again.',
      })
    } finally {
      setStaging(false)
    }
  }

  const approvePlan = (plan: StagedPlan) => {
    const result = coordinationStore.approveStagedPlan(plan.digest)
    setNotice(
      result.ok
        ? {
            kind: 'success',
            message: `${plan.id} approved. Execution has not happened yet.`,
          }
        : { kind: 'error', message: result.error.message },
    )
  }

  const rejectPlan = (plan: StagedPlan) => {
    const result = coordinationStore.rejectStagedPlan(plan.digest)
    setNotice(
      result.ok
        ? {
            kind: 'info',
            message: `${plan.id} rejected. No assignments changed.`,
          }
        : { kind: 'error', message: result.error.message },
    )
  }

  const updateAvailability = (resourceId: string, unavailable: boolean) => {
    const result = coordinationStore.setResourceUnavailable(
      resourceId,
      unavailable,
      'human',
    )
    setNotice(
      result.ok
        ? {
            kind: unavailable ? 'info' : 'success',
            message: unavailable
              ? `${result.data.name} is unavailable. Only dependent assignments are affected.`
              : `${result.data.name} is available again.`,
          }
        : { kind: 'error', message: result.error.message },
    )
  }

  const resetDemo = () => {
    coordinationStore.resetDemo()
    setNeedFilter('all')
    setResourceFilter('all')
    setToolsOpen(false)
    setResetOpen(false)
    setNotice({
      kind: 'success',
      message:
        'Demo restored: 7 needs, 15 available resources, no plan, approval, or assignments.',
    })
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt)
      setCopied(true)
      setNotice({ kind: 'success', message: 'Agent prompt copied.' })
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
      setNotice({
        kind: 'error',
        message: 'The prompt could not be copied. Select the text manually.',
      })
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to dashboard
      </a>
      <Sidebar needCount={snapshot.totals.needs} />
      <main className="workspace" id="overview">
        <header className="topbar">
          <div className="mobile-brand">
            <BrandMark />
            <strong>CommonMesh</strong>
          </div>
          <div className="breadcrumb">
            <span>Community workspaces</span>
            <ChevronRight size={15} />
            <strong>{state.eventName}</strong>
          </div>
          <div className="topbar-actions">
            <WebMCPBadge
              status={webMCP}
              onOpen={() => setToolsOpen(true)}
            />
            <button
              className="topbar-tool-button"
              type="button"
              onClick={() => setToolsOpen(true)}
              aria-haspopup="dialog"
            >
              <Wrench size={16} />
              <span>Tools</span>
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={() => setResetOpen(true)}
              title="Reset the deterministic demo"
              aria-label="Reset the deterministic demo"
            >
              <RefreshCcw size={17} />
            </button>
            <div className="user-avatar" role="img" aria-label="Coordinator account">
              AS
            </div>
          </div>
        </header>

        <div className="workspace-content" id="main-content" tabIndex={-1}>
          {notice && (
            <NoticeBar notice={notice} onDismiss={() => setNotice(null)} />
          )}

          <section className="hero-panel" aria-labelledby="event-title">
            <div className="hero-copy">
              <div className="event-kicker">
                <span>Live coordination workspace</span>
                <span className="kicker-divider" />
                <CalendarDays size={15} />
                {formatDate(state.eventDate)}
              </div>
              <h1 id="event-title">{state.eventName}</h1>
              <p>
                Match community needs with trusted local capacity—while every
                proposed commitment stays visible and human-controlled.
              </p>
              <div className="event-meta">
                <span>
                  <MapPin size={16} /> {state.hubLocation}
                </span>
                <span>
                  <Network size={16} /> Shared state · revision{' '}
                  {state.resourceRevision}
                </span>
              </div>
            </div>
            <OperationalSummary state={state} snapshot={snapshot} />
          </section>

          <section className="metrics-grid" aria-label="Coordination metrics">
            <MetricCard
              label="Needs"
              value={snapshot.totals.needs}
              note={
                snapshot.totals.disrupted
                  ? `${snapshot.totals.disrupted} disrupted`
                  : `${snapshot.totals.open} open`
              }
              icon={HeartHandshake}
              tone="violet"
            />
            <MetricCard
              label="Covered"
              value={snapshot.totals.covered}
              note={`of ${snapshot.totals.needs} needs`}
              icon={CheckCircle2}
              tone="green"
            />
            <MetricCard
              label="Available resources"
              value={snapshot.totals.availableResources}
              note={`of ${snapshot.totals.resources} in the mesh`}
              icon={PackageSearch}
              tone="blue"
            />
            <article className="metric-card coverage-card">
              <CoverageDonut percent={snapshot.coveragePercent} />
              <div>
                <span className="metric-label">Coordination coverage</span>
                <div className="metric-line">
                  <strong>{snapshot.coveragePercent}%</strong>
                  <span>
                    {state.committedAssignments.length} active assignments
                  </span>
                </div>
              </div>
            </article>
          </section>

          {snapshot.totals.disrupted > 0 && (
            <section className="disruption-banner" aria-live="assertive">
              <div className="disruption-icon">
                <TriangleAlert size={20} />
              </div>
              <div>
                <strong>
                  {disruptedAssignments.length}{' '}
                  {disruptedAssignments.length === 1
                    ? 'committed assignment requires'
                    : 'committed assignments require'}{' '}
                  attention
                </strong>
                <p>
                  {affectedNeed && affectedResource
                    ? `${affectedNeed.title} is affected because ${affectedResource.name} is unavailable. ${state.committedAssignments.length - disruptedAssignments.length} other assignments remain active.`
                    : 'A resource changed. Preserve working assignments and repair only the affected portion.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void stageRecommended()}
                disabled={staging}
              >
                Stage repair <ArrowRight size={15} />
              </button>
            </section>
          )}

          <section className="coordination-grid">
            <section className="panel needs-panel" id="needs">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Mission inputs</span>
                  <h2>Community needs</h2>
                </div>
                <span className="panel-count">{filteredNeeds.length}</span>
              </div>
              <div className="filter-row" aria-label="Filter needs">
                {(['all', 'open', 'covered', 'disrupted'] as const).map(
                  (filter) => (
                    <button
                      type="button"
                      key={filter}
                      className={needFilter === filter ? 'active' : ''}
                      aria-pressed={needFilter === filter}
                      onClick={() => setNeedFilter(filter)}
                    >
                      {filter}
                    </button>
                  ),
                )}
              </div>
              <div className="card-scroll">
                {filteredNeeds.length === 0 ? (
                  <EmptyFilterState subject="needs" />
                ) : (
                  filteredNeeds.map((need) => (
                    <NeedCard need={need} key={need.id} />
                  ))
                )}
              </div>
            </section>

            <section
              className="panel plan-panel"
              id="plan"
              aria-busy={staging}
            >
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Human approval checkpoint</span>
                  <h2>Agent plan</h2>
                </div>
                <div className="agent-presence">
                  <Bot size={16} />
                  Agent-visible
                </div>
              </div>
              <PlanPanel
                plan={state.stagedPlan}
                onStage={() => void stageRecommended()}
                onApprove={approvePlan}
                onReject={rejectPlan}
              />
              {staging && (
                <div className="panel-loading" role="status">
                  Validating constraints and securing plan digest…
                </div>
              )}
            </section>

            <section className="panel resources-panel" id="resources">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Local capacity</span>
                  <h2>Resource mesh</h2>
                </div>
                <span className="panel-count">{filteredResources.length}</span>
              </div>
              <div
                className="filter-row resource-filters"
                aria-label="Filter resources"
              >
                {(
                  [
                    'all',
                    'equipment',
                    'transport',
                    'people',
                    'food',
                    'space',
                  ] as const
                ).map((filter) => (
                  <button
                    type="button"
                    key={filter}
                    className={resourceFilter === filter ? 'active' : ''}
                    aria-pressed={resourceFilter === filter}
                    onClick={() => setResourceFilter(filter)}
                  >
                    {filter === 'all' ? 'all' : categoryLabel(filter)}
                  </button>
                ))}
              </div>
              <div className="card-scroll">
                {filteredResources.length === 0 ? (
                  <EmptyFilterState subject="resources" />
                ) : (
                  filteredResources.map((resource) => (
                    <ResourceCard
                      resource={resource}
                      assigned={assignedResourceIds.has(resource.id)}
                      onAvailabilityChange={updateAvailability}
                      key={resource.id}
                    />
                  ))
                )}
              </div>
            </section>
          </section>

          <AssignmentsPanel state={state} />

          <section className="lower-grid">
            <section className="panel prompt-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Try the collaboration</span>
                  <h2>Give your agent the mission</h2>
                </div>
                <Sparkles size={20} className="sparkle-icon" />
              </div>
              <div className="prompt-bubble">
                <div className="prompt-avatar">
                  <UserRound size={17} />
                </div>
                <p>“{agentPrompt}”</p>
              </div>
              <div className="prompt-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void copyPrompt()}
                >
                  {copied ? <Check size={16} /> : <Clipboard size={16} />}
                  {copied ? 'Copied' : 'Copy agent prompt'}
                </button>
                <span>
                  Structured tools replace brittle DOM clicking and screenshot
                  interpretation.
                </span>
              </div>
            </section>

            <DemoControls
              webMCP={webMCP}
              vanUnavailable={Boolean(primaryVanUnavailable)}
              onReset={() => setResetOpen(true)}
              onVanChange={(unavailable) =>
                updateAvailability('res-northside-van', unavailable)
              }
              onTools={() => setToolsOpen(true)}
            />

            <section className="panel activity-panel" id="activity">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Inspectable by design</span>
                  <h2>Human + agent activity</h2>
                </div>
                <span className="live-chip">
                  <span /> Live
                </span>
              </div>
              <ol className="activity-list" aria-live="polite">
                {state.activity.slice(0, 14).map((entry) => (
                  <ActivityItem entry={entry} key={entry.id} />
                ))}
              </ol>
            </section>
          </section>

          <footer>
            <div>
              <BrandMark /> <strong>CommonMesh</strong>
            </div>
            <p>
              Built for the 2026 WebMCP Challenge · deterministic demo data ·
              MIT licensed
            </p>
          </footer>
        </div>
      </main>

      <WebMCPToolsDialog
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        status={webMCP}
      />
      <ResetDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={resetDemo}
      />
    </div>
  )
}

export default App
