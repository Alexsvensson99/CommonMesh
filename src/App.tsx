import { useMemo, useState } from 'react'
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
  NeedCategory,
  NeedWithStatus,
  Resource,
  StagedPlan,
} from './domain/types'
import {
  coordinationStore,
  useCoordinationState,
} from './store/coordinationStore'
import { useWebMCP } from './webmcp/useWebMCP'
import './App.css'

const agentPrompt =
  "Inspect the coordination snapshot. Cover every open need for Saturday's Riverlight Community Day using resources within 10 km. Respect availability, quantities, skills, time windows, and maximum hours. Validate the complete plan and stage it for my review. Do not commit anything until I approve the exact plan in CommonMesh."

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

function shortDigest(digest: string) {
  return `${digest.slice(0, 18)}…${digest.slice(-6)}`
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
    hour12: false,
  }).format(new Date(timestamp))
}

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  )
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandMark />
        <div>
          <span className="brand-name">CommonMesh</span>
          <span className="brand-tagline">Human + agent coordination</span>
        </div>
      </div>

      <nav className="side-nav" aria-label="Workspace navigation">
        <a className="active" href="#overview">
          <LayoutDashboard size={18} />
          Overview
        </a>
        <a href="#needs">
          <HeartHandshake size={18} />
          Open needs
          <span className="nav-count">6</span>
        </a>
        <a href="#resources">
          <PackageSearch size={18} />
          Resources
        </a>
        <a href="#plan">
          <ClipboardCheck size={18} />
          Coordination plan
        </a>
        <a href="#activity">
          <ScrollText size={18} />
          Activity trail
        </a>
      </nav>

      <div className="sidebar-spacer" />

      <div className="trust-card">
        <div className="trust-icon">
          <ShieldCheck size={18} />
        </div>
        <div>
          <strong>Human checkpoint</strong>
          <p>Agents can stage. Only you can approve.</p>
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
  state,
  count,
  detail,
}: {
  state: 'checking' | 'connected' | 'unavailable' | 'error'
  count: number
  detail: string
}) {
  const connected = state === 'connected'
  const checking = state === 'checking'
  return (
    <div
      className={`webmcp-badge ${connected ? 'connected' : state}`}
      title={detail}
      aria-live="polite"
    >
      {connected ? (
        <Radio size={15} />
      ) : checking ? (
        <CircleDotDashed size={15} />
      ) : (
        <WifiOff size={15} />
      )}
      <span>
        {connected
          ? `WebMCP live · ${count} tools`
          : checking
            ? 'Detecting WebMCP'
            : 'WebMCP preview mode'}
      </span>
    </div>
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
        <Icon size={18} />
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
        <Check size={12} />
      ) : status === 'disrupted' ? (
        <TriangleAlert size={12} />
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
          <Icon size={17} />
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
          <Clock3 size={13} /> {formatTimeWindow(need.start, need.end)}
        </span>
        <span>
          <MapPin size={13} /> {need.location}
        </span>
      </div>
      {need.status !== 'open' && (
        <div className="need-coverage">
          <div>
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
}: {
  resource: Resource
  assigned: boolean
}) {
  const Icon = categoryIcons[resource.category]
  const canToggle = assigned || resource.category === 'transport'
  return (
    <article className={`resource-card ${resource.unavailable ? 'unavailable' : ''}`}>
      <div className={`resource-avatar ${categoryTones[resource.category]}`}>
        <Icon size={18} />
      </div>
      <div className="resource-body">
        <div className="resource-title-row">
          <div>
            <h3>{resource.name}</h3>
            <span>{resource.owner}</span>
          </div>
          {assigned && !resource.unavailable && (
            <span className="assigned-chip">Assigned</span>
          )}
          {resource.unavailable && (
            <span className="unavailable-chip">Unavailable</span>
          )}
        </div>
        <p>{resource.description}</p>
        <div className="resource-meta">
          <span>
            <Route size={13} /> {resource.distanceKm} km
          </span>
          <span>
            <Clock3 size={13} />{' '}
            {formatTimeWindow(resource.availableStart, resource.availableEnd)}
          </span>
          <span>
            {quantityLabel(resource.capacity, resource.unit)}
          </span>
        </div>
        {canToggle && (
          <button
            type="button"
            className="availability-button"
            onClick={() =>
              coordinationStore.setResourceUnavailable(
                resource.id,
                !resource.unavailable,
                'human',
              )
            }
          >
            {resource.unavailable ? (
              <>
                <RefreshCcw size={13} /> Restore availability
              </>
            ) : (
              <>
                <X size={13} /> Mark unavailable
              </>
            )}
          </button>
        )}
      </div>
    </article>
  )
}

function PlanAssignment({
  assignment,
  state,
}: {
  assignment: StagedPlan['assignments'][number]
  state: ReturnType<typeof coordinationStore.getState>
}) {
  const need = state.needs.find((candidate) => candidate.id === assignment.needId)
  const resource = state.resources.find(
    (candidate) => candidate.id === assignment.resourceId,
  )
  if (!need || !resource) return null
  const Icon = categoryIcons[need.category]
  return (
    <div className="plan-assignment">
      <div className={`assignment-icon ${categoryTones[need.category]}`}>
        <Icon size={15} />
      </div>
      <div className="assignment-copy">
        <strong>{need.title}</strong>
        <span>
          {resource.name} · {quantityLabel(assignment.quantity, need.unit)}
        </span>
      </div>
      <CheckCircle2 size={16} className="assignment-check" />
    </div>
  )
}

function EmptyPlan({ onStage }: { onStage: () => void }) {
  return (
    <div className="empty-plan">
      <div className="empty-plan-orbit" aria-hidden="true">
        <Bot size={27} />
        <span />
        <span />
        <span />
      </div>
      <h3>Ready for an agent plan</h3>
      <p>
        Ask your browser agent to inspect needs, compare constraints, validate a
        solution, and stage it here.
      </p>
      <button type="button" className="secondary-button" onClick={onStage}>
        <Sparkles size={15} /> Stage deterministic demo plan
      </button>
    </div>
  )
}

function PlanPanel({
  plan,
  onStage,
}: {
  plan: StagedPlan | null
  onStage: () => void
}) {
  const state = useCoordinationState()
  if (!plan) return <EmptyPlan onStage={onStage} />

  const validation = validateMatchPlan(state, plan.assignments)
  const stale = plan.sourceRevision !== state.resourceRevision && plan.status !== 'committed'
  const approved = plan.status === 'approved'
  const committed = plan.status === 'committed'

  return (
    <div className="plan-content">
      <div className="plan-summary-header">
        <div>
          <div className="eyebrow-row">
            <span className={`plan-state ${plan.status}`}>
              {committed ? 'Committed' : approved ? 'Human approved' : 'Awaiting review'}
            </span>
            <span>revision {plan.sourceRevision}</span>
          </div>
          <h3>{plan.id}</h3>
          <p>{plan.intent}</p>
        </div>
        <div className="plan-score">
          <strong>{validation.summary.needsFullyCovered}</strong>
          <span>{validation.summary.needsFullyCovered === 1 ? 'need' : 'needs'}</span>
        </div>
      </div>

      <div className="plan-metrics">
        <span>
          <CheckCircle2 size={14} /> {validation.summary.assignmentCount}{' '}
          {validation.summary.assignmentCount === 1 ? 'assignment' : 'assignments'}
        </span>
        <span>
          <Route size={14} /> {validation.summary.totalTravelKm} km total
        </span>
        <span className={validation.valid ? 'valid' : 'invalid'}>
          {validation.valid ? <ShieldCheck size={14} /> : <TriangleAlert size={14} />}
          {validation.valid ? 'Constraints pass' : `${validation.errors.length} issues`}
        </span>
      </div>

      <div className="assignment-list">
        {plan.assignments.map((assignment) => (
          <PlanAssignment
            assignment={assignment}
            state={state}
            key={`${assignment.needId}-${assignment.resourceId}`}
          />
        ))}
      </div>

      <div className={`approval-box ${approved ? 'approved' : ''} ${committed ? 'committed' : ''}`}>
        <div className="approval-copy">
          <div className="approval-icon">
            {committed ? (
              <CheckCircle2 size={19} />
            ) : approved ? (
              <ShieldCheck size={19} />
            ) : (
              <UserRound size={19} />
            )}
          </div>
          <div>
            <strong>
              {committed
                ? 'Approved plan committed'
                : approved
                  ? 'Approval bound to this digest'
                  : stale
                    ? 'Plan is stale'
                    : 'Human approval required'}
            </strong>
            <span className="digest">{shortDigest(plan.digest)}</span>
          </div>
        </div>
        {!committed && !approved && (
          <button
            type="button"
            className="primary-button"
            disabled={stale || !validation.valid}
            onClick={() => coordinationStore.approveStagedPlan(plan.digest)}
          >
            <ShieldCheck size={15} /> Approve exact plan
          </button>
        )}
        {approved && (
          <span className="agent-next">
            <Bot size={14} /> Ready for agent commit
          </span>
        )}
      </div>

      {(stale || committed) && (
        <button type="button" className="text-button" onClick={onStage}>
          <RefreshCcw size={14} />
          {stale ? 'Restage against current resources' : 'Stage remaining or disrupted needs'}
        </button>
      )}
    </div>
  )
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  return (
    <li className={`activity-item ${entry.actor}`}>
      <div className="activity-avatar">
        {entry.actor === 'agent' ? (
          <Bot size={15} />
        ) : entry.actor === 'human' ? (
          <UserRound size={15} />
        ) : (
          <Network size={15} />
        )}
      </div>
      <div>
        <div className="activity-line">
          <strong>{entry.summary}</strong>
          <time>{formatActivityTime(entry.timestamp)}</time>
        </div>
        {entry.detail && <p>{entry.detail}</p>}
        <code>{entry.action}</code>
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

function App() {
  const state = useCoordinationState()
  const webMCP = useWebMCP()
  const snapshot = useMemo(() => getCoordinationSnapshot(state), [state])
  const [resourceFilter, setResourceFilter] = useState<'all' | NeedCategory>('all')
  const [needFilter, setNeedFilter] = useState<'all' | NeedWithStatus['status']>('all')
  const [copied, setCopied] = useState(false)
  const [staging, setStaging] = useState(false)

  const assignedResourceIds = useMemo(
    () => new Set(state.committedAssignments.map((item) => item.resourceId)),
    [state.committedAssignments],
  )
  const filteredResources = state.resources.filter(
    (resource) => resourceFilter === 'all' || resource.category === resourceFilter,
  )
  const filteredNeeds = snapshot.needs.filter(
    (need) => needFilter === 'all' || need.status === needFilter,
  )
  const uniqueCommittedPlans = new Set(
    state.committedAssignments.map((assignment) => assignment.planId),
  ).size

  const stageRecommended = async () => {
    setStaging(true)
    try {
      await coordinationStore.stageRecommendedPlan('human')
    } finally {
      setStaging(false)
    }
  }

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="workspace" id="overview">
        <header className="topbar">
          <div className="mobile-brand">
            <BrandMark />
            <strong>CommonMesh</strong>
          </div>
          <div className="breadcrumb">
            <span>Community workspaces</span>
            <ChevronRight size={14} />
            <strong>Riverlight</strong>
          </div>
          <div className="topbar-actions">
            <WebMCPBadge
              state={webMCP.state}
              count={webMCP.toolCount}
              detail={webMCP.detail}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => coordinationStore.resetDemo()}
              title="Reset the deterministic demo"
              aria-label="Reset the deterministic demo"
            >
              <RefreshCcw size={16} />
            </button>
            <div className="user-avatar" aria-label="Coordinator account">
              AS
            </div>
          </div>
        </header>

        <div className="workspace-content">
          <section className="hero-panel">
            <div className="hero-copy">
              <div className="event-kicker">
                <span>Live workspace</span>
                <span className="kicker-divider" />
                <CalendarDays size={14} />
                {formatDate(state.eventDate)}
              </div>
              <h1>Coordinate the whole picture.</h1>
              <p>
                People define the mission. Agents work through the constraints.
                Every real commitment stays visible and human-approved.
              </p>
              <div className="event-meta">
                <span>
                  <MapPin size={15} /> {state.hubLocation}
                </span>
                <span>
                  <Network size={15} /> Shared state · revision {state.resourceRevision}
                </span>
              </div>
            </div>
            <div className="hero-visual" aria-hidden="true">
              <div className="mesh-ring ring-one" />
              <div className="mesh-ring ring-two" />
              <div className="mesh-core">
                <BrandMark />
              </div>
              <div className="mesh-node node-one"><Box size={16} /></div>
              <div className="mesh-node node-two"><Users size={16} /></div>
              <div className="mesh-node node-three"><Truck size={16} /></div>
              <div className="mesh-node node-four"><Utensils size={16} /></div>
            </div>
          </section>

          <section className="metrics-grid" aria-label="Coordination metrics">
            <MetricCard
              label="Open needs"
              value={snapshot.totals.open}
              note={snapshot.totals.disrupted ? `${snapshot.totals.disrupted} disrupted` : 'ready to match'}
              icon={HeartHandshake}
              tone="violet"
            />
            <MetricCard
              label="Available resources"
              value={snapshot.totals.availableResources}
              note={`of ${snapshot.totals.resources} in the mesh`}
              icon={PackageSearch}
              tone="blue"
            />
            <MetricCard
              label="Active assignments"
              value={state.committedAssignments.length}
              note={`${uniqueCommittedPlans} committed plan${uniqueCommittedPlans === 1 ? '' : 's'}`}
              icon={ClipboardCheck}
              tone="green"
            />
            <article className="metric-card coverage-card">
              <CoverageDonut percent={snapshot.coveragePercent} />
              <div>
                <span className="metric-label">Event coverage</span>
                <div className="metric-line">
                  <strong>{snapshot.totals.covered}/{snapshot.totals.needs}</strong>
                  <span>needs secured</span>
                </div>
              </div>
            </article>
          </section>

          {snapshot.totals.disrupted > 0 && (
            <section className="disruption-banner" aria-live="polite">
              <div className="disruption-icon">
                <TriangleAlert size={19} />
              </div>
              <div>
                <strong>{snapshot.totals.disrupted} committed need is disrupted</strong>
                <p>A resource changed. Ask the agent to preserve working assignments and repair only the broken portion.</p>
              </div>
              <button type="button" onClick={() => void stageRecommended()}>
                Stage repair <ArrowRight size={14} />
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
                {(['all', 'open', 'covered', 'disrupted'] as const).map((filter) => (
                  <button
                    type="button"
                    key={filter}
                    className={needFilter === filter ? 'active' : ''}
                    onClick={() => setNeedFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <div className="card-scroll">
                {filteredNeeds.map((need) => (
                  <NeedCard need={need} key={need.id} />
                ))}
              </div>
            </section>

            <section className="panel plan-panel" id="plan">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Shared staging area</span>
                  <h2>Agent coordination plan</h2>
                </div>
                <div className="agent-presence">
                  <Bot size={15} />
                  Agent-visible
                </div>
              </div>
              <PlanPanel
                plan={state.stagedPlan}
                onStage={() => void stageRecommended()}
              />
              {staging && <div className="panel-loading">Hashing and validating plan…</div>}
            </section>

            <section className="panel resources-panel" id="resources">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Local capacity</span>
                  <h2>Resource mesh</h2>
                </div>
                <span className="panel-count">{filteredResources.length}</span>
              </div>
              <div className="filter-row resource-filters" aria-label="Filter resources">
                {(['all', 'equipment', 'transport', 'people', 'food', 'space'] as const).map(
                  (filter) => (
                    <button
                      type="button"
                      key={filter}
                      className={resourceFilter === filter ? 'active' : ''}
                      onClick={() => setResourceFilter(filter)}
                    >
                      {filter === 'all' ? 'all' : categoryLabel(filter)}
                    </button>
                  ),
                )}
              </div>
              <div className="card-scroll">
                {filteredResources.map((resource) => (
                  <ResourceCard
                    resource={resource}
                    assigned={assignedResourceIds.has(resource.id)}
                    key={resource.id}
                  />
                ))}
              </div>
            </section>
          </section>

          <section className="lower-grid">
            <section className="panel prompt-panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Try the collaboration</span>
                  <h2>Give your agent the mission</h2>
                </div>
                <Sparkles size={19} className="sparkle-icon" />
              </div>
              <div className="prompt-bubble">
                <div className="prompt-avatar"><UserRound size={16} /></div>
                <p>“{agentPrompt}”</p>
              </div>
              <div className="prompt-actions">
                <button type="button" className="secondary-button" onClick={() => void copyPrompt()}>
                  {copied ? <Check size={15} /> : <Clipboard size={15} />}
                  {copied ? 'Copied' : 'Copy agent prompt'}
                </button>
                <span>The agent works through structured WebMCP tools—not the DOM.</span>
              </div>
            </section>

            <section className="panel activity-panel" id="activity">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">Inspectable by design</span>
                  <h2>Human + agent activity</h2>
                </div>
                <span className="live-chip"><span /> Live</span>
              </div>
              <ol className="activity-list">
                {state.activity.slice(0, 8).map((entry) => (
                  <ActivityItem entry={entry} key={entry.id} />
                ))}
              </ol>
            </section>
          </section>

          <footer>
            <div><BrandMark /> <strong>CommonMesh</strong></div>
            <p>Built for the 2026 WebMCP Challenge · deterministic demo data · MIT licensed</p>
          </footer>
        </div>
      </main>
    </div>
  )
}

export default App
