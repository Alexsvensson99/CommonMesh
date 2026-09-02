import { useSyncExternalStore } from 'react'
import {
  buildRecommendedAssignments,
  createPlanDigest,
  getCoordinationSnapshot,
  getNeedStatus,
  getResourceConstraints,
  normalizeAssignments,
  validateMatchPlan,
} from '../domain/coordination'
import { createSeedState } from '../data/seed'
import type {
  ActivityActor,
  ActivityOutcome,
  AssignmentInput,
  CoordinationState,
  NeedCategory,
  Resource,
  StagedPlan,
  ToolResult,
} from '../domain/types'

const STORAGE_KEY = 'commonmesh-demo-state-v2'
const MAX_ACTIVITY_ENTRIES = 80

type Listener = () => void

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type PlanDigestFactory = typeof createPlanDigest

const activityOutcomes: ActivityOutcome[] = ['success', 'failed', 'info']

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export type NeedSearch = {
  query?: string
  category?: NeedCategory
  date?: string
  urgency?: 'standard' | 'high'
  status?: 'open' | 'covered' | 'disrupted'
}

export type ResourceSearch = {
  query?: string
  type?: NeedCategory
  skill?: string
  needId?: string
  availableOnly?: boolean
  minCapacity?: number
  maxDistanceKm?: number
  date?: string
  start?: string
  end?: string
}

function loadState(storage: StorageLike | null): CoordinationState {
  if (!storage) return createSeedState()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return createSeedState()
    const parsed = JSON.parse(raw) as CoordinationState
    if (
      parsed.schemaVersion !== 2 ||
      !Array.isArray(parsed.needs) ||
      !Array.isArray(parsed.resources) ||
      !Array.isArray(parsed.activity)
    ) {
      return createSeedState()
    }
    return {
      ...parsed,
      activity: parsed.activity.map((entry) => ({
        ...entry,
        outcome: activityOutcomes.includes(entry.outcome)
          ? entry.outcome
          : 'info',
      })),
    }
  } catch {
    return createSeedState()
  }
}

export class CoordinationStore {
  private state: CoordinationState
  private readonly listeners = new Set<Listener>()
  private readonly storage: StorageLike | null
  private readonly now: () => string
  private readonly createDigest: PlanDigestFactory
  private activitySequence = 0
  private stageRequestSequence = 0

  constructor(options?: {
    storage?: StorageLike | null
    now?: () => string
    initialState?: CoordinationState
    createDigest?: PlanDigestFactory
  }) {
    const browserStorage = getBrowserStorage()
    this.storage = options?.storage === undefined ? browserStorage : options.storage
    this.now = options?.now ?? (() => new Date().toISOString())
    this.createDigest = options?.createDigest ?? createPlanDigest
    this.state = options?.initialState
      ? structuredClone(options.initialState)
      : loadState(this.storage)
  }

  getState = () => this.state

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(nextState: CoordinationState) {
    this.state = nextState
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(nextState))
    } catch {
      // A full or blocked localStorage must not break the live demo.
    }
    this.listeners.forEach((listener) => listener())
  }

  private activity(
    state: CoordinationState,
    actor: ActivityActor,
    action: string,
    summary: string,
    detail?: string,
    outcome: ActivityOutcome = 'success',
  ) {
    this.activitySequence += 1
    return [
      {
        id: `activity-${this.activitySequence}-${Date.now()}`,
        actor,
        outcome,
        action,
        summary,
        timestamp: this.now(),
        ...(detail ? { detail } : {}),
      },
      ...state.activity,
    ].slice(0, MAX_ACTIVITY_ENTRIES)
  }

  recordActivity(
    actor: ActivityActor,
    action: string,
    summary: string,
    detail?: string,
    outcome: ActivityOutcome = 'success',
  ) {
    this.publish({
      ...this.state,
      activity: this.activity(
        this.state,
        actor,
        action,
        summary,
        detail,
        outcome,
      ),
    })
  }

  private failure<T>(
    actor: ActivityActor,
    action: string,
    summary: string,
    error: { code: string; message: string; details?: unknown },
    nextAction?: string,
  ): ToolResult<T> {
    this.recordActivity(actor, action, summary, error.code, 'failed')
    return {
      ok: false,
      error,
      ...(nextAction ? { nextAction } : {}),
    }
  }

  getSnapshot() {
    return getCoordinationSnapshot(this.state)
  }

  searchNeeds(filters: NeedSearch = {}) {
    const normalizedQuery = filters.query?.trim().toLowerCase()
    return this.state.needs
      .map((need) => getNeedStatus(this.state, need))
      .filter((need) => !filters.category || need.category === filters.category)
      .filter((need) => !filters.date || need.date === filters.date)
      .filter((need) => !filters.urgency || need.urgency === filters.urgency)
      .filter((need) => !filters.status || need.status === filters.status)
      .filter((need) => {
        if (!normalizedQuery) return true
        const haystack = [
          need.title,
          need.description,
          need.location,
          need.createdBy,
          ...need.requiredSkills,
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
  }

  searchResources(filters: ResourceSearch = {}) {
    const normalizedQuery = filters.query?.trim().toLowerCase()
    const need = filters.needId
      ? this.state.needs.find((candidate) => candidate.id === filters.needId)
      : undefined

    return this.state.resources
      .filter((resource) => !filters.type || resource.type === filters.type)
      .filter(
        (resource) =>
          !filters.skill || resource.skills.includes(filters.skill),
      )
      .filter(
        (resource) =>
          filters.availableOnly === false ||
          resource.availability.status === 'available',
      )
      .filter(
        (resource) =>
          filters.minCapacity === undefined ||
          resource.capacity >= filters.minCapacity,
      )
      .filter(
        (resource) =>
          filters.maxDistanceKm === undefined ||
          resource.distanceKm <= filters.maxDistanceKm,
      )
      .filter((resource) => {
        if (!filters.date) return true
        return resource.availability.start.slice(0, 10) === filters.date
      })
      .filter((resource) => {
        if (!filters.start && !filters.end) return true
        return (
          (!filters.start ||
            Date.parse(resource.availability.start) <=
              Date.parse(filters.start)) &&
          (!filters.end ||
            Date.parse(resource.availability.end) >= Date.parse(filters.end))
        )
      })
      .filter((resource) => {
        if (!normalizedQuery) return true
        const haystack = [
          resource.name,
          resource.description,
          resource.owner,
          ...resource.skills,
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
      .map((resource) => {
        const compatibilityIssues: string[] = []
        if (need) {
          if (resource.type !== need.category) {
            compatibilityIssues.push('category')
          }
          if (resource.unit !== need.unit) compatibilityIssues.push('unit')
          if (resource.capacity < need.quantity) compatibilityIssues.push('capacity')
          if (resource.availability.status === 'unavailable') {
            compatibilityIssues.push('unavailable')
          }
          if (
            need.requiredSkills.some((skill) => !resource.skills.includes(skill))
          ) {
            compatibilityIssues.push('required_skills')
          }
          if (
            Date.parse(resource.availability.start) > Date.parse(need.start) ||
            Date.parse(resource.availability.end) < Date.parse(need.end)
          ) {
            compatibilityIssues.push('time_window')
          }
          const duration =
            (Date.parse(need.end) - Date.parse(need.start)) / 3_600_000
          if (resource.maxHours !== null && duration > resource.maxHours) {
            compatibilityIssues.push('max_hours')
          }
          if (resource.distanceKm > this.state.maxDistanceKm) {
            compatibilityIssues.push('distance')
          }
        }
        return {
          ...resource,
          compatibleWithNeed: need ? compatibilityIssues.length === 0 : null,
          compatibilityIssues,
        }
      })
  }

  getResourceDetails(resourceId: string) {
    const resource = this.state.resources.find(
      (candidate) => candidate.id === resourceId,
    )
    if (!resource) return null
    const assignments = this.state.committedAssignments.filter(
      (assignment) => assignment.resourceId === resourceId,
    )
    return {
      ...resource,
      constraints: getResourceConstraints(this.state, resource),
      currentAssignments: assignments,
    }
  }

  validatePlan(assignments: AssignmentInput[]) {
    return validateMatchPlan(this.state, assignments)
  }

  getStagedPlanDetails() {
    const plan = this.state.stagedPlan
    if (!plan) return null
    const validation = validateMatchPlan(this.state, plan.assignments)
    return {
      plan,
      digest: plan.digest,
      validation,
      validationStatus: validation.valid ? 'valid' : 'invalid',
      approvalStatus:
        plan.status === 'committed'
          ? 'consumed'
          : plan.approval
            ? 'approved'
            : 'pending',
      createdAt: plan.createdAt,
      sourceRevision: plan.sourceRevision,
      currentRevision: this.state.resourceRevision,
      stale:
        plan.status !== 'committed' &&
        plan.sourceRevision !== this.state.resourceRevision,
    }
  }

  async stagePlan(
    assignments: AssignmentInput[],
    intent: string,
    actor: ActivityActor = 'agent',
  ): Promise<ToolResult<StagedPlan>> {
    const stageRequest = ++this.stageRequestSequence
    const sourceRevision = this.state.resourceRevision
    const normalized = normalizeAssignments(assignments)
    const validation = validateMatchPlan(this.state, normalized)
    if (!validation.valid) {
      this.recordActivity(
        actor,
        'stage_match_plan',
        'Rejected an invalid coordination plan',
        `${validation.errors.length} validation error${validation.errors.length === 1 ? '' : 's'}`,
        'failed',
      )
      return {
        ok: false,
        error: {
          code: 'PLAN_INVALID',
          message: 'The plan could not be staged because validation failed.',
          details: validation,
        },
        nextAction: 'Correct the reported errors, validate, and stage again.',
      }
    }

    const digest = await this.createDigest(sourceRevision, normalized)
    if (stageRequest !== this.stageRequestSequence) {
      this.recordActivity(
        actor,
        'stage_match_plan',
        'Discarded a superseded staging request',
        'A newer plan was staged first.',
        'failed',
      )
      return {
        ok: false,
        error: {
          code: 'STAGE_SUPERSEDED',
          message: 'A newer plan replaced this staging request.',
        },
        nextAction: 'Inspect the currently staged plan before continuing.',
      }
    }
    if (sourceRevision !== this.state.resourceRevision) {
      this.recordActivity(
        actor,
        'stage_match_plan',
        'Discarded a stale staging request',
        `revision ${sourceRevision} changed to ${this.state.resourceRevision}`,
        'failed',
      )
      return {
        ok: false,
        error: {
          code: 'STALE_PLAN',
          message: 'Coordination state changed while the plan was being staged.',
        },
        nextAction: 'Inspect the latest snapshot, validate, and stage again.',
      }
    }
    const plan: StagedPlan = {
      id: `CM-${digest.slice(7, 13).toUpperCase()}`,
      digest,
      intent: intent.trim() || 'Coordinate selected community needs',
      assignments: normalized,
      sourceRevision,
      createdAt: this.now(),
      status: 'staged',
      approval: null,
    }

    this.publish({
      ...this.state,
      stagedPlan: plan,
      activity: this.activity(
        this.state,
        actor,
        'stage_match_plan',
        `Staged ${plan.id} for human review`,
        `${validation.coverage.needsFullyCovered}/${validation.coverage.needsTotal} needs projected covered · ${validation.summary.assignmentCount} ${validation.summary.assignmentCount === 1 ? 'assignment' : 'assignments'} · ${validation.summary.totalTravelKm} km`,
      ),
    })

    return {
      ok: true,
      data: plan,
      nextAction:
        'Ask the human to inspect and approve this exact digest in the visible UI.',
    }
  }

  async stageRecommendedPlan(actor: ActivityActor = 'human') {
    const assignments = buildRecommendedAssignments(this.state)
    const intent =
      getCoordinationSnapshot(this.state).totals.disrupted > 0
        ? 'Repair only disrupted needs while preserving working assignments'
        : 'Cover every open Saturday Community Day need with low travel and no overbooking'
    return this.stagePlan(assignments, intent, actor)
  }

  approveStagedPlan(digest: string): ToolResult<StagedPlan> {
    const stagedPlan = this.state.stagedPlan
    if (!stagedPlan) {
      return this.failure(
        'human',
        'approve_plan',
        'Approval blocked because no plan was staged',
        {
          code: 'NO_STAGED_PLAN',
          message: 'There is no staged plan to approve.',
        },
      )
    }
    if (stagedPlan.status === 'committed') {
      return this.failure(
        'human',
        'approve_plan',
        `Approval blocked for ${stagedPlan.id}`,
        {
          code: 'PLAN_ALREADY_COMMITTED',
          message: `${stagedPlan.id} has already been committed.`,
        },
      )
    }
    if (stagedPlan.digest !== digest) {
      return this.failure(
        'human',
        'approve_plan',
        `Approval blocked for ${stagedPlan.id}`,
        {
          code: 'DIGEST_MISMATCH',
          message: 'Approval must target the exact digest shown in the UI.',
        },
      )
    }
    if (stagedPlan.sourceRevision !== this.state.resourceRevision) {
      return this.failure(
        'human',
        'approve_plan',
        `Approval blocked for stale plan ${stagedPlan.id}`,
        {
          code: 'STALE_PLAN',
          message: 'The coordination state changed. Restage before approval.',
        },
        'Restage the plan against current resources.',
      )
    }

    const approved: StagedPlan = {
      ...stagedPlan,
      status: 'approved',
      approval: {
        digest,
        approvedAt: this.now(),
        approvedBy: 'human-ui',
      },
    }
    this.publish({
      ...this.state,
      stagedPlan: approved,
      activity: this.activity(
        this.state,
        'human',
        'approve_plan',
        `Approved ${approved.id} in the UI`,
        `${digest.slice(0, 22)}…`,
      ),
    })
    return {
      ok: true,
      data: approved,
      nextAction: 'The agent may now commit this exact approved digest.',
    }
  }

  rejectStagedPlan(
    digest: string,
  ): ToolResult<{ rejectedPlanId: string; rejectedDigest: string }> {
    const stagedPlan = this.state.stagedPlan
    if (!stagedPlan) {
      return this.failure(
        'human',
        'reject_plan',
        'Rejection blocked because no plan was staged',
        {
          code: 'NO_STAGED_PLAN',
          message: 'There is no staged plan to reject.',
        },
      )
    }
    if (stagedPlan.status === 'committed') {
      return this.failure(
        'human',
        'reject_plan',
        `Rejection blocked for ${stagedPlan.id}`,
        {
          code: 'PLAN_ALREADY_COMMITTED',
          message: `${stagedPlan.id} has already been committed.`,
        },
      )
    }
    if (stagedPlan.digest !== digest) {
      return this.failure(
        'human',
        'reject_plan',
        `Rejection blocked for ${stagedPlan.id}`,
        {
          code: 'DIGEST_MISMATCH',
          message: 'Rejection must target the exact plan shown in the UI.',
        },
      )
    }

    this.publish({
      ...this.state,
      stagedPlan: null,
      activity: this.activity(
        this.state,
        'human',
        'reject_plan',
        `Rejected ${stagedPlan.id} in the UI`,
        `${digest.slice(0, 22)}… · no assignments changed`,
      ),
    })
    return {
      ok: true,
      data: {
        rejectedPlanId: stagedPlan.id,
        rejectedDigest: stagedPlan.digest,
      },
      nextAction: 'The agent may inspect feedback and stage a new exact plan.',
    }
  }

  commitApprovedPlan(digest: string): ToolResult<StagedPlan> {
    const stagedPlan = this.state.stagedPlan
    if (!stagedPlan) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        'Commit blocked because no plan was staged',
        {
          code: 'NO_STAGED_PLAN',
          message: 'There is no staged plan to commit.',
        },
        'Validate and stage a plan first.',
      )
    }
    if (stagedPlan.status === 'committed') {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit blocked for ${stagedPlan.id}`,
        {
          code: 'PLAN_ALREADY_COMMITTED',
          message: `${stagedPlan.id} has already been committed.`,
        },
      )
    }
    if (stagedPlan.digest !== digest) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit blocked for ${stagedPlan.id}`,
        {
          code: 'DIGEST_MISMATCH',
          message: 'The supplied digest does not match the staged plan.',
        },
      )
    }
    if (stagedPlan.sourceRevision !== this.state.resourceRevision) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit blocked for stale plan ${stagedPlan.id}`,
        {
          code: 'STALE_PLAN',
          message: 'Resources or assignments changed after this plan was staged.',
        },
        'Inspect the latest snapshot and stage a repaired plan.',
      )
    }
    if (!stagedPlan.approval) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit blocked for ${stagedPlan.id}`,
        {
          code: 'APPROVAL_REQUIRED',
          message:
            'A human must approve the exact staged-plan digest in the visible UI.',
        },
        'Ask the human to review and approve the staged plan.',
      )
    }
    if (stagedPlan.approval.digest !== digest) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit blocked for ${stagedPlan.id}`,
        {
          code: 'APPROVAL_DIGEST_MISMATCH',
          message: 'The human approval is bound to a different plan digest.',
        },
      )
    }

    const validation = validateMatchPlan(
      this.state,
      stagedPlan.assignments,
    )
    if (!validation.valid) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit blocked for invalid plan ${stagedPlan.id}`,
        {
          code: 'PLAN_INVALID',
          message: 'The approved plan no longer validates.',
          details: validation,
        },
        'Inspect the latest snapshot and stage a repaired plan.',
      )
    }

    const committedAt = this.now()
    const previousAssignments = structuredClone(
      this.state.committedAssignments,
    )
    const replacedNeedIds = new Set(
      stagedPlan.assignments.map((assignment) => assignment.needId),
    )
    const preserved = this.state.committedAssignments.filter(
      (assignment) => !replacedNeedIds.has(assignment.needId),
    )
    const committed = stagedPlan.assignments.map((assignment) => ({
      ...assignment,
      planId: stagedPlan.id,
      committedAt,
    }))
    const completedPlan: StagedPlan = { ...stagedPlan, status: 'committed' }

    this.publish({
      ...this.state,
      resourceRevision: this.state.resourceRevision + 1,
      committedAssignments: [...preserved, ...committed],
      stagedPlan: completedPlan,
      lastCommit: {
        planId: stagedPlan.id,
        digest,
        previousAssignments,
        createdAt: committedAt,
      },
      activity: this.activity(
        this.state,
        'agent',
        'commit_approved_plan',
        `Committed approved plan ${stagedPlan.id}`,
        `${committed.length} ${committed.length === 1 ? 'assignment' : 'assignments'} · human-approved digest consumed`,
      ),
    })

    return {
      ok: true,
      data: completedPlan,
      nextAction:
        'The assignments are active. Monitor the snapshot for disrupted resources.',
    }
  }

  setResourceUnavailable(
    resourceId: string,
    unavailable: boolean,
    actor: ActivityActor = 'human',
  ): ToolResult<Resource> {
    const resource = this.state.resources.find(
      (candidate) => candidate.id === resourceId,
    )
    if (!resource) {
      return this.failure<Resource>(
        actor,
        'set_resource_availability',
        'Resource update failed',
        {
          code: 'RESOURCE_NOT_FOUND',
          message: `Resource "${resourceId}" does not exist.`,
        },
      )
    }
    const currentlyUnavailable = resource.availability.status === 'unavailable'
    if (currentlyUnavailable === unavailable) {
      return {
        ok: true,
        data: resource,
        nextAction: 'No state change was necessary.',
      } satisfies ToolResult<typeof resource>
    }

    const availabilityStatus: 'available' | 'unavailable' = unavailable
      ? 'unavailable'
      : 'available'
    const resources = this.state.resources.map((candidate) =>
      candidate.id === resourceId
        ? {
            ...candidate,
            availability: {
              ...candidate.availability,
              status: availabilityStatus,
            },
          }
        : candidate,
    )
    const invalidatedApproval = Boolean(
      this.state.stagedPlan?.status !== 'committed' &&
        this.state.stagedPlan?.approval,
    )
    const stagedPlan =
      this.state.stagedPlan && this.state.stagedPlan.status !== 'committed'
        ? {
            ...this.state.stagedPlan,
            status: 'staged' as const,
            approval: null,
          }
        : this.state.stagedPlan
    this.publish({
      ...this.state,
      resourceRevision: this.state.resourceRevision + 1,
      resources,
      stagedPlan,
      activity: this.activity(
        this.state,
        actor,
        'set_resource_availability',
        `${resource.name} marked ${unavailable ? 'unavailable' : 'available'}`,
        unavailable
          ? `Any dependent committed need is now disrupted.${invalidatedApproval ? ' Earlier plan approval was cleared.' : ''}`
          : `The resource can be considered by future plans.${invalidatedApproval ? ' Earlier plan approval was cleared.' : ''}`,
      ),
    })

    return {
      ok: true,
      data: resources.find((candidate) => candidate.id === resourceId)!,
      nextAction: unavailable
        ? 'Inspect disrupted needs and repair only the affected assignments.'
        : 'The resource is available for validation and planning.',
    } satisfies ToolResult<typeof resource>
  }

  undoLastCommit(): ToolResult<{ undonePlanId: string }> {
    const frame = this.state.lastCommit
    if (!frame) {
      return this.failure(
        'agent',
        'undo_last_commit',
        'Undo blocked because no commit is available',
        {
          code: 'NOTHING_TO_UNDO',
          message: 'There is no committed plan available for undo.',
        },
      )
    }

    this.publish({
      ...this.state,
      resourceRevision: this.state.resourceRevision + 1,
      committedAssignments: structuredClone(frame.previousAssignments),
      stagedPlan: null,
      lastCommit: null,
      activity: this.activity(
        this.state,
        'agent',
        'undo_last_commit',
        `Reversed ${frame.planId}`,
        'The exact pre-commit assignment state was restored.',
      ),
    })
    return {
      ok: true,
      data: { undonePlanId: frame.planId },
      nextAction: 'Inspect the current snapshot before planning again.',
    }
  }

  resetDemo() {
    this.stageRequestSequence += 1
    const reset = createSeedState()
    reset.activity = this.activity(
      reset,
      'human',
      'reset_demo',
      'Restored the deterministic Riverlight scenario',
      'All approvals, assignments, and availability changes were cleared.',
    )
    this.publish(reset)
  }
}

export const coordinationStore = new CoordinationStore()

export function useCoordinationState() {
  return useSyncExternalStore(
    coordinationStore.subscribe,
    coordinationStore.getState,
    coordinationStore.getState,
  )
}
