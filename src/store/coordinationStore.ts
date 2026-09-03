import { useSyncExternalStore } from 'react'
import {
  buildRecommendedAssignments,
  createPlanDigest,
  getCoordinationSnapshot,
  getNeedStatus,
  getResourceConstraints,
  isIso8601Timestamp,
  normalizeAssignments,
  validateMatchPlan,
  validateStagedPlan,
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
const MAX_PLAN_INTENT_LENGTH = 240

type Listener = () => void

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type PlanDigestFactory = typeof createPlanDigest

const activityOutcomes: ActivityOutcome[] = ['success', 'failed', 'info']
const splittableUnits = new Set(['chairs', 'people', 'portions'])

const parseTimestamp = (value: unknown) =>
  typeof value === 'string' && isIso8601Timestamp(value)
    ? Date.parse(value)
    : Number.NaN

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isBoundedSerializedString(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length <= maxLength &&
    JSON.stringify(value).length - 2 <= maxLength
  )
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const parsed = new Date(`${value}T00:00:00Z`)
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

function isAssignment(value: unknown): value is AssignmentInput {
  const start = isRecord(value) ? parseTimestamp(value.start) : Number.NaN
  const end = isRecord(value) ? parseTimestamp(value.end) : Number.NaN
  return (
    isRecord(value) &&
    typeof value.needId === 'string' &&
    typeof value.resourceId === 'string' &&
    typeof value.quantity === 'number' &&
    Number.isInteger(value.quantity) &&
    value.quantity > 0 &&
    typeof value.start === 'string' &&
    typeof value.end === 'string' &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start < end
  )
}

function isCommittedAssignment(
  value: unknown,
): value is CoordinationState['committedAssignments'][number] {
  return (
    isAssignment(value) &&
    isRecord(value) &&
    typeof (value as Record<string, unknown>).planId === 'string' &&
    Number.isFinite(
      parseTimestamp((value as Record<string, unknown>).committedAt),
    )
  )
}

function isNeed(value: unknown): value is CoordinationState['needs'][number] {
  const start = isRecord(value) ? parseTimestamp(value.start) : Number.NaN
  const end = isRecord(value) ? parseTimestamp(value.end) : Number.NaN
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    ['equipment', 'transport', 'people', 'food', 'space'].includes(
      String(value.category),
    ) &&
    typeof value.quantity === 'number' &&
    Number.isFinite(value.quantity) &&
    value.quantity > 0 &&
    typeof value.unit === 'string' &&
    typeof value.location === 'string' &&
    isCalendarDate(value.date) &&
    typeof value.start === 'string' &&
    typeof value.end === 'string' &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start < end &&
    (value.urgency === 'standard' || value.urgency === 'high') &&
    isStringArray(value.requiredSkills) &&
    typeof value.createdBy === 'string'
  )
}

function isResource(
  value: unknown,
): value is CoordinationState['resources'][number] {
  const availabilityStart =
    isRecord(value) && isRecord(value.availability)
      ? parseTimestamp(value.availability.start)
      : Number.NaN
  const availabilityEnd =
    isRecord(value) && isRecord(value.availability)
      ? parseTimestamp(value.availability.end)
      : Number.NaN
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    ['equipment', 'transport', 'people', 'food', 'space'].includes(
      String(value.type),
    ) &&
    typeof value.capacity === 'number' &&
    Number.isFinite(value.capacity) &&
    value.capacity > 0 &&
    typeof value.unit === 'string' &&
    typeof value.owner === 'string' &&
    typeof value.distanceKm === 'number' &&
    Number.isFinite(value.distanceKm) &&
    value.distanceKm >= 0 &&
    isRecord(value.availability) &&
    typeof value.availability.start === 'string' &&
    typeof value.availability.end === 'string' &&
    Number.isFinite(availabilityStart) &&
    Number.isFinite(availabilityEnd) &&
    availabilityStart < availabilityEnd &&
    (value.availability.status === 'available' ||
      value.availability.status === 'unavailable') &&
    (value.maxHours === null ||
      (typeof value.maxHours === 'number' &&
        Number.isFinite(value.maxHours) &&
        value.maxHours > 0)) &&
    isStringArray(value.skills)
  )
}

function isActivity(
  value: unknown,
): value is CoordinationState['activity'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.actor === 'agent' || value.actor === 'human' || value.actor === 'system') &&
    activityOutcomes.includes(value.outcome as ActivityOutcome) &&
    typeof value.action === 'string' &&
    typeof value.summary === 'string' &&
    Number.isFinite(parseTimestamp(value.timestamp)) &&
    (value.detail === undefined || typeof value.detail === 'string')
  )
}

function isStagedPlan(value: unknown): value is StagedPlan | null {
  if (value === null) return true
  const structurallyValid =
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.digest === 'string' &&
    /^sha256:[0-9a-f]{64}$/.test(value.digest) &&
    isBoundedSerializedString(value.intent, MAX_PLAN_INTENT_LENGTH) &&
    Number.isInteger(value.sourceRevision) &&
    Number(value.sourceRevision) >= 0 &&
    Number.isFinite(parseTimestamp(value.createdAt)) &&
    (value.proposedBy === 'agent' || value.proposedBy === 'human') &&
    (value.status === 'staged' ||
      value.status === 'approved' ||
      value.status === 'committed') &&
    Array.isArray(value.assignments) &&
    value.assignments.length > 0 &&
    value.assignments.every(isAssignment) &&
    (value.approval === null ||
      (isRecord(value.approval) &&
        typeof value.approval.digest === 'string' &&
        Number.isFinite(parseTimestamp(value.approval.approvedAt)) &&
        value.approval.approvedBy === 'human-ui'))
  if (!structurallyValid || !isRecord(value)) return false
  if (value.status === 'staged') return value.approval === null
  return isRecord(value.approval) && value.approval.digest === value.digest
}

function isUndoFrame(
  value: unknown,
): value is CoordinationState['lastCommit'] {
  if (value === null) return true
  return (
    isRecord(value) &&
    typeof value.planId === 'string' &&
    typeof value.digest === 'string' &&
    Number.isFinite(parseTimestamp(value.createdAt)) &&
    Array.isArray(value.previousAssignments) &&
    value.previousAssignments.every(isCommittedAssignment)
  )
}

function isCoordinationState(value: unknown): value is CoordinationState {
  if (!isRecord(value)) return false
  if (
    value.schemaVersion !== 2 ||
    typeof value.eventName !== 'string' ||
    !isCalendarDate(value.eventDate) ||
    typeof value.hubLocation !== 'string' ||
    typeof value.maxDistanceKm !== 'number' ||
    !Number.isFinite(value.maxDistanceKm) ||
    value.maxDistanceKm < 0 ||
    !Number.isInteger(value.resourceRevision) ||
    Number(value.resourceRevision) < 1 ||
    !Array.isArray(value.needs) ||
    !value.needs.every(isNeed) ||
    !Array.isArray(value.resources) ||
    !value.resources.every(isResource) ||
    !Array.isArray(value.committedAssignments) ||
    !value.committedAssignments.every(isCommittedAssignment) ||
    !isStagedPlan(value.stagedPlan) ||
    !Array.isArray(value.activity) ||
    !value.activity.every(isActivity) ||
    !isUndoFrame(value.lastCommit)
  ) {
    return false
  }

  const needs = value.needs as CoordinationState['needs']
  const resources = value.resources as CoordinationState['resources']
  const committedAssignments =
    value.committedAssignments as CoordinationState['committedAssignments']
  const stagedPlan = value.stagedPlan as StagedPlan | null
  const lastCommit = value.lastCommit as CoordinationState['lastCommit']
  const needIds = new Set(needs.map((need) => need.id))
  const resourceIds = new Set(resources.map((resource) => resource.id))
  const assignmentsReferenceKnownEntities = [
    ...committedAssignments,
    ...(stagedPlan?.assignments ?? []),
    ...(lastCommit?.previousAssignments ?? []),
  ].every(
    (assignment) =>
      needIds.has(assignment.needId) && resourceIds.has(assignment.resourceId),
  )
  if (!assignmentsReferenceKnownEntities) return false

  if (stagedPlan?.status === 'committed') {
    if (
      !lastCommit ||
      lastCommit.planId !== stagedPlan.id ||
      lastCommit.digest !== stagedPlan.digest
    ) {
      return false
    }
    const assignmentKey = (assignment: AssignmentInput) =>
      [
        assignment.needId,
        assignment.resourceId,
        assignment.quantity,
        assignment.start,
        assignment.end,
      ].join('\u0000')
    const stagedPairKeys = stagedPlan.assignments.map(
      (assignment) => `${assignment.needId}\u0000${assignment.resourceId}`,
    )
    if (new Set(stagedPairKeys).size !== stagedPairKeys.length) return false
    const expectedAssignments = stagedPlan.assignments
      .map(assignmentKey)
      .sort()
    const committedForPlan = committedAssignments
      .filter((assignment) => assignment.planId === stagedPlan.id)
      .map(assignmentKey)
      .sort()
    if (
      expectedAssignments.length !== committedForPlan.length ||
      expectedAssignments.some(
        (assignment, index) => assignment !== committedForPlan[index],
      )
    ) {
      return false
    }
  }

  return true
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value
  }
  Object.values(value).forEach((item) => deepFreeze(item))
  return Object.freeze(value)
}

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
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || !Array.isArray(parsed.activity)) {
      return createSeedState()
    }
    const normalized = {
      ...parsed,
      activity: parsed.activity.map((entry) => ({
        ...(isRecord(entry) ? entry : {}),
        outcome:
          isRecord(entry) &&
          activityOutcomes.includes(entry.outcome as ActivityOutcome)
            ? entry.outcome
            : 'info',
      })),
      stagedPlan:
        isRecord(parsed.stagedPlan) && !('proposedBy' in parsed.stagedPlan)
          ? { ...parsed.stagedPlan, proposedBy: 'agent' }
          : parsed.stagedPlan,
    }
    return isCoordinationState(normalized) ? normalized : createSeedState()
  } catch {
    return createSeedState()
  }
}

export class CoordinationStore {
  private state: CoordinationState
  private readonly listeners = new Set<Listener>()
  private readonly storage: StorageLike | null
  private readonly persistenceRequired: boolean
  private readonly now: () => string
  private readonly createDigest: PlanDigestFactory
  private activitySequence = 0
  private stageRequestSequence = 0
  private resetSequence = 0

  constructor(options?: {
    storage?: StorageLike | null
    now?: () => string
    initialState?: CoordinationState
    createDigest?: PlanDigestFactory
  }) {
    const browserStorage = getBrowserStorage()
    this.storage = options?.storage === undefined ? browserStorage : options.storage
    this.persistenceRequired =
      options?.storage === undefined
        ? typeof window !== 'undefined'
        : options.storage !== null
    this.now = options?.now ?? (() => new Date().toISOString())
    this.createDigest = options?.createDigest ?? createPlanDigest
    this.state = deepFreeze(
      options?.initialState
        ? structuredClone(options.initialState)
        : loadState(this.storage),
    )
  }

  getState = () => this.state

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(nextState: CoordinationState) {
    const publishedState = deepFreeze(nextState)
    if (!this.storage && this.persistenceRequired) return false
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(publishedState))
    } catch {
      return false
    }
    this.state = publishedState
    this.listeners.forEach((listener) => listener())
    return true
  }

  private persistenceFailure<T>(): ToolResult<T> {
    return {
      ok: false,
      error: {
        code: 'PERSISTENCE_FAILED',
        message:
          'The change was not applied because browser storage could not be updated.',
      },
      nextAction: 'Enable site storage or free browser storage, then retry.',
    }
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

    const resources = this.state.resources
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
        const fullyCoversNeed = need
          ? resource.capacity >= need.quantity
          : null
        if (need) {
          if (resource.type !== need.category) {
            compatibilityIssues.push('category')
          }
          if (resource.unit !== need.unit) compatibilityIssues.push('unit')
          if (!fullyCoversNeed && !splittableUnits.has(need.unit)) {
            compatibilityIssues.push('capacity')
          }
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
          canContribute: need ? compatibilityIssues.length === 0 : null,
          fullyCoversNeed: need
            ? compatibilityIssues.length === 0 && fullyCoversNeed
            : null,
          contributionCapacity: need
            ? Math.min(resource.capacity, need.quantity)
            : null,
          compatibilityIssues,
        }
      })

    if (!need) return resources

    return resources.sort((left, right) => {
      const compatibilityOrder =
        Number(right.compatibleWithNeed) - Number(left.compatibleWithNeed)
      if (compatibilityOrder !== 0) return compatibilityOrder

      const coverageOrder =
        Number(right.fullyCoversNeed) - Number(left.fullyCoversNeed)
      if (coverageOrder !== 0) return coverageOrder

      const issueOrder =
        left.compatibilityIssues.length - right.compatibilityIssues.length
      if (issueOrder !== 0) return issueOrder

      const distanceOrder = left.distanceKm - right.distanceKm
      if (distanceOrder !== 0) return distanceOrder

      return left.id.localeCompare(right.id)
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
    const validation = validateStagedPlan(this.state, plan)
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
    signal?: AbortSignal,
  ): Promise<ToolResult<StagedPlan>> {
    if (signal?.aborted) {
      return this.failure(
        actor,
        'stage_match_plan',
        'Cancelled plan staging before it started',
        {
          code: 'STAGE_CANCELLED',
          message: 'Plan staging was cancelled before any proposal changed.',
        },
      )
    }
    const normalizedIntent =
      intent.trim() || 'Coordinate selected community needs'
    if (!isBoundedSerializedString(normalizedIntent, MAX_PLAN_INTENT_LENGTH)) {
      return this.failure(
        actor,
        'stage_match_plan',
        'Rejected a plan with an invalid intent',
        {
          code: 'INVALID_INTENT',
          message: `Plan intent must be at most ${MAX_PLAN_INTENT_LENGTH} characters.`,
        },
        'Shorten the plan intent and retry.',
      )
    }
    const stageRequest = ++this.stageRequestSequence
    const resetSequence = this.resetSequence
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
      if (resetSequence === this.resetSequence) {
        this.recordActivity(
          actor,
          'stage_match_plan',
          'Discarded a superseded staging request',
          'A newer plan was staged first.',
          'failed',
        )
      }
      return {
        ok: false,
        error: {
          code: 'STAGE_SUPERSEDED',
          message: 'A newer plan replaced this staging request.',
        },
        nextAction: 'Inspect the currently staged plan before continuing.',
      }
    }
    if (signal?.aborted) {
      return this.failure(
        actor,
        'stage_match_plan',
        'Cancelled plan staging during digest verification',
        {
          code: 'STAGE_CANCELLED',
          message: 'Plan staging was cancelled before any proposal changed.',
        },
      )
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
      intent: normalizedIntent,
      assignments: normalized,
      sourceRevision,
      createdAt: this.now(),
      proposedBy: actor === 'human' ? 'human' : 'agent',
      status: 'staged',
      approval: null,
    }

    const persisted = this.publish({
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
    if (!persisted) return this.persistenceFailure<StagedPlan>()

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
    const persisted = this.publish({
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
    if (!persisted) return this.persistenceFailure<StagedPlan>()
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

    const persisted = this.publish({
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
    if (!persisted) {
      return this.persistenceFailure<{
        rejectedPlanId: string
        rejectedDigest: string
      }>()
    }
    return {
      ok: true,
      data: {
        rejectedPlanId: stagedPlan.id,
        rejectedDigest: stagedPlan.digest,
      },
      nextAction: 'The agent may inspect feedback and stage a new exact plan.',
    }
  }

  async commitApprovedPlan(
    digest: string,
    signal?: AbortSignal,
  ): Promise<ToolResult<StagedPlan>> {
    if (signal?.aborted) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        'Commit cancelled before verification started',
        {
          code: 'COMMIT_CANCELLED',
          message: 'Commit was cancelled before any assignment changed.',
        },
      )
    }
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

    const recomputedDigest = await this.createDigest(
      stagedPlan.sourceRevision,
      stagedPlan.assignments,
    )
    if (signal?.aborted) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit cancelled for ${stagedPlan.id}`,
        {
          code: 'COMMIT_CANCELLED',
          message: 'Commit was cancelled before any assignment changed.',
        },
      )
    }
    if (recomputedDigest !== digest) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit blocked for altered plan ${stagedPlan.id}`,
        {
          code: 'PLAN_TAMPERED',
          message:
            'The staged assignments no longer match the human-approved digest.',
        },
        'Inspect the staged plan and stage a fresh exact proposal.',
      )
    }

    const approvedPlan = this.state.stagedPlan
    if (approvedPlan?.status === 'committed') {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit blocked for ${approvedPlan.id}`,
        {
          code: 'PLAN_ALREADY_COMMITTED',
          message: `${approvedPlan.id} has already been committed.`,
        },
      )
    }
    if (
      !approvedPlan ||
      approvedPlan.digest !== digest ||
      approvedPlan.approval?.digest !== digest ||
      approvedPlan.sourceRevision !== this.state.resourceRevision
    ) {
      return this.failure(
        'agent',
        'commit_approved_plan',
        `Commit blocked because ${stagedPlan.id} changed during verification`,
        {
          code: 'STALE_PLAN',
          message: 'The approved plan changed while its digest was being verified.',
        },
        'Inspect the latest workspace and request approval again if needed.',
      )
    }

    const validation = validateMatchPlan(
      this.state,
      approvedPlan.assignments,
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
      approvedPlan.assignments.map((assignment) => assignment.needId),
    )
    const preserved = this.state.committedAssignments.filter(
      (assignment) => !replacedNeedIds.has(assignment.needId),
    )
    const committed = approvedPlan.assignments.map((assignment) => ({
      ...assignment,
      planId: approvedPlan.id,
      committedAt,
    }))
    const completedPlan: StagedPlan = { ...approvedPlan, status: 'committed' }

    const persisted = this.publish({
      ...this.state,
      resourceRevision: this.state.resourceRevision + 1,
      committedAssignments: [...preserved, ...committed],
      stagedPlan: completedPlan,
      lastCommit: {
        planId: approvedPlan.id,
        digest,
        previousAssignments,
        createdAt: committedAt,
      },
      activity: this.activity(
        this.state,
        'agent',
        'commit_approved_plan',
        `Committed approved plan ${approvedPlan.id}`,
        `${committed.length} ${committed.length === 1 ? 'assignment' : 'assignments'} · human-approved digest consumed`,
      ),
    })
    if (!persisted) return this.persistenceFailure<StagedPlan>()

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
    const persisted = this.publish({
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
    if (!persisted) return this.persistenceFailure<Resource>()

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

    const persisted = this.publish({
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
    if (!persisted) {
      return this.persistenceFailure<{ undonePlanId: string }>()
    }
    return {
      ok: true,
      data: { undonePlanId: frame.planId },
      nextAction: 'Inspect the current snapshot before planning again.',
    }
  }

  resetDemo() {
    this.stageRequestSequence += 1
    this.resetSequence += 1
    const reset = createSeedState()
    reset.activity = this.activity(
      reset,
      'human',
      'reset_demo',
      'Restored the deterministic Riverlight scenario',
      'All approvals, assignments, and availability changes were cleared.',
    )
    return { persisted: this.publish(reset) }
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
