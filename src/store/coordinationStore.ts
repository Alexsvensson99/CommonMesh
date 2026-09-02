import { useSyncExternalStore } from 'react'
import {
  buildRecommendedAssignments,
  createPlanDigest,
  getCoordinationSnapshot,
  getNeedStatus,
  normalizeAssignments,
  validateMatchPlan,
} from '../domain/coordination'
import { createSeedState } from '../data/seed'
import type {
  ActivityActor,
  AssignmentInput,
  CoordinationState,
  NeedCategory,
  StagedPlan,
  ToolResult,
} from '../domain/types'

const STORAGE_KEY = 'commonmesh-demo-state-v1'
const MAX_ACTIVITY_ENTRIES = 80

type Listener = () => void

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export type NeedSearch = {
  query?: string
  category?: NeedCategory
  urgency?: 'standard' | 'high'
  status?: 'open' | 'covered' | 'disrupted'
}

export type ResourceSearch = {
  query?: string
  category?: NeedCategory
  needId?: string
  availableOnly?: boolean
  maxDistanceKm?: number
}

function loadState(storage: StorageLike | null): CoordinationState {
  if (!storage) return createSeedState()
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return createSeedState()
    const parsed = JSON.parse(raw) as CoordinationState
    if (
      parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.needs) ||
      !Array.isArray(parsed.resources) ||
      !Array.isArray(parsed.activity)
    ) {
      return createSeedState()
    }
    return parsed
  } catch {
    return createSeedState()
  }
}

export class CoordinationStore {
  private state: CoordinationState
  private readonly listeners = new Set<Listener>()
  private readonly storage: StorageLike | null
  private readonly now: () => string
  private activitySequence = 0

  constructor(options?: {
    storage?: StorageLike | null
    now?: () => string
    initialState?: CoordinationState
  }) {
    const browserStorage =
      typeof window === 'undefined' ? null : window.localStorage
    this.storage = options?.storage === undefined ? browserStorage : options.storage
    this.now = options?.now ?? (() => new Date().toISOString())
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
  ) {
    this.activitySequence += 1
    return [
      {
        id: `activity-${this.activitySequence}-${Date.now()}`,
        actor,
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
  ) {
    this.publish({
      ...this.state,
      activity: this.activity(this.state, actor, action, summary, detail),
    })
  }

  getSnapshot() {
    return getCoordinationSnapshot(this.state)
  }

  searchNeeds(filters: NeedSearch = {}) {
    const normalizedQuery = filters.query?.trim().toLowerCase()
    return this.state.needs
      .map((need) => getNeedStatus(this.state, need))
      .filter((need) => !filters.category || need.category === filters.category)
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
      .filter((resource) => !filters.category || resource.category === filters.category)
      .filter(
        (resource) =>
          filters.availableOnly === false || !resource.unavailable,
      )
      .filter(
        (resource) =>
          filters.maxDistanceKm === undefined ||
          resource.distanceKm <= filters.maxDistanceKm,
      )
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
          if (resource.category !== need.category) {
            compatibilityIssues.push('category')
          }
          if (resource.unit !== need.unit) compatibilityIssues.push('unit')
          if (resource.capacity <= 0) compatibilityIssues.push('capacity')
          if (resource.unavailable) compatibilityIssues.push('unavailable')
          if (
            need.requiredSkills.some((skill) => !resource.skills.includes(skill))
          ) {
            compatibilityIssues.push('required_skills')
          }
          if (
            Date.parse(resource.availableStart) > Date.parse(need.start) ||
            Date.parse(resource.availableEnd) < Date.parse(need.end)
          ) {
            compatibilityIssues.push('time_window')
          }
          const duration =
            (Date.parse(need.end) - Date.parse(need.start)) / 3_600_000
          if (resource.maxHours !== null && duration > resource.maxHours) {
            compatibilityIssues.push('max_hours')
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
    return { ...resource, committedAssignments: assignments }
  }

  validatePlan(assignments: AssignmentInput[]) {
    return validateMatchPlan(this.state, assignments)
  }

  async stagePlan(
    assignments: AssignmentInput[],
    intent: string,
    actor: ActivityActor = 'agent',
  ): Promise<ToolResult<StagedPlan>> {
    const normalized = normalizeAssignments(assignments)
    const validation = validateMatchPlan(this.state, normalized)
    if (!validation.valid) {
      this.recordActivity(
        actor,
        'stage_match_plan',
        'Rejected an invalid coordination plan',
        `${validation.errors.length} validation error${validation.errors.length === 1 ? '' : 's'}`,
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

    const digest = await createPlanDigest(
      this.state.resourceRevision,
      normalized,
    )
    const plan: StagedPlan = {
      id: `CM-${digest.slice(7, 13).toUpperCase()}`,
      digest,
      intent: intent.trim() || 'Coordinate selected community needs',
      assignments: normalized,
      sourceRevision: this.state.resourceRevision,
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
        `${validation.summary.needsFullyCovered} ${validation.summary.needsFullyCovered === 1 ? 'need' : 'needs'} · ${validation.summary.assignmentCount} ${validation.summary.assignmentCount === 1 ? 'assignment' : 'assignments'} · ${validation.summary.totalTravelKm} km`,
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
        : 'Cover every open Riverlight Community Day need with low travel and no overbooking'
    return this.stagePlan(assignments, intent, actor)
  }

  approveStagedPlan(digest: string): ToolResult<StagedPlan> {
    const stagedPlan = this.state.stagedPlan
    if (!stagedPlan) {
      return {
        ok: false,
        error: {
          code: 'NO_STAGED_PLAN',
          message: 'There is no staged plan to approve.',
        },
      }
    }
    if (stagedPlan.status === 'committed') {
      return {
        ok: false,
        error: {
          code: 'PLAN_ALREADY_COMMITTED',
          message: `${stagedPlan.id} has already been committed.`,
        },
      }
    }
    if (stagedPlan.digest !== digest) {
      return {
        ok: false,
        error: {
          code: 'DIGEST_MISMATCH',
          message: 'Approval must target the exact digest shown in the UI.',
        },
      }
    }
    if (stagedPlan.sourceRevision !== this.state.resourceRevision) {
      return {
        ok: false,
        error: {
          code: 'STALE_PLAN',
          message: 'The coordination state changed. Restage before approval.',
        },
      }
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

  commitApprovedPlan(digest: string): ToolResult<StagedPlan> {
    const stagedPlan = this.state.stagedPlan
    if (!stagedPlan) {
      return {
        ok: false,
        error: {
          code: 'NO_STAGED_PLAN',
          message: 'There is no staged plan to commit.',
        },
        nextAction: 'Validate and stage a plan first.',
      }
    }
    if (stagedPlan.status === 'committed') {
      return {
        ok: false,
        error: {
          code: 'PLAN_ALREADY_COMMITTED',
          message: `${stagedPlan.id} has already been committed.`,
        },
      }
    }
    if (stagedPlan.digest !== digest) {
      return {
        ok: false,
        error: {
          code: 'DIGEST_MISMATCH',
          message: 'The supplied digest does not match the staged plan.',
        },
      }
    }
    if (stagedPlan.sourceRevision !== this.state.resourceRevision) {
      return {
        ok: false,
        error: {
          code: 'STALE_PLAN',
          message: 'Resources or assignments changed after this plan was staged.',
        },
        nextAction: 'Inspect the latest snapshot and stage a repaired plan.',
      }
    }
    if (!stagedPlan.approval) {
      this.recordActivity(
        'agent',
        'commit_approved_plan',
        `Commit blocked for ${stagedPlan.id}`,
        'APPROVAL_REQUIRED',
      )
      return {
        ok: false,
        error: {
          code: 'APPROVAL_REQUIRED',
          message:
            'A human must approve the exact staged-plan digest in the visible UI.',
        },
        nextAction: 'Ask the human to review and approve the staged plan.',
      }
    }
    if (stagedPlan.approval.digest !== digest) {
      return {
        ok: false,
        error: {
          code: 'APPROVAL_DIGEST_MISMATCH',
          message: 'The human approval is bound to a different plan digest.',
        },
      }
    }

    const validation = validateMatchPlan(
      this.state,
      stagedPlan.assignments,
    )
    if (!validation.valid) {
      return {
        ok: false,
        error: {
          code: 'PLAN_INVALID',
          message: 'The approved plan no longer validates.',
          details: validation,
        },
        nextAction: 'Inspect the latest snapshot and stage a repaired plan.',
      }
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
  ) {
    const resource = this.state.resources.find(
      (candidate) => candidate.id === resourceId,
    )
    if (!resource) {
      return {
        ok: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `Resource "${resourceId}" does not exist.`,
        },
      } satisfies ToolResult<null>
    }
    if (resource.unavailable === unavailable) {
      return {
        ok: true,
        data: resource,
        nextAction: 'No state change was necessary.',
      } satisfies ToolResult<typeof resource>
    }

    const resources = this.state.resources.map((candidate) =>
      candidate.id === resourceId ? { ...candidate, unavailable } : candidate,
    )
    this.publish({
      ...this.state,
      resourceRevision: this.state.resourceRevision + 1,
      resources,
      activity: this.activity(
        this.state,
        actor,
        'set_resource_availability',
        `${resource.name} marked ${unavailable ? 'unavailable' : 'available'}`,
        unavailable
          ? 'Any dependent committed need is now disrupted.'
          : 'The resource can be considered by future plans.',
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
      return {
        ok: false,
        error: {
          code: 'NOTHING_TO_UNDO',
          message: 'There is no committed plan available for undo.',
        },
      }
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
