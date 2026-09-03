import type {
  AssignmentInput,
  CoordinationSnapshot,
  CoordinationState,
  Constraint,
  Need,
  NeedStatus,
  NeedWithStatus,
  PlanValidationIssue,
  PlanValidationResult,
  Resource,
  StagedPlan,
} from './types'

const encoder = new TextEncoder()

const round = (value: number, places = 1) => {
  const power = 10 ** places
  return Math.round((value + Number.EPSILON) * power) / power
}

const ISO_8601_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/

export function isIso8601Timestamp(value: string) {
  const match = ISO_8601_TIMESTAMP.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12) return false

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]
  return (
    day >= 1 &&
    day <= daysInMonth[month - 1] &&
    Number.isFinite(Date.parse(value))
  )
}

const toTime = (value: string) =>
  isIso8601Timestamp(value) ? Date.parse(value) : Number.NaN

const durationHours = (start: string, end: string) =>
  (toTime(end) - toTime(start)) / 3_600_000

const overlaps = (
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
) => toTime(firstStart) < toTime(secondEnd) && toTime(secondStart) < toTime(firstEnd)

const getResource = (state: CoordinationState, resourceId: string) =>
  state.resources.find((resource) => resource.id === resourceId)

const isResourceUnavailable = (resource: Resource) =>
  resource.availability.status === 'unavailable'

export function getResourceConstraints(
  state: CoordinationState,
  resource: Resource,
): Constraint[] {
  return [
    {
      type: 'availability',
      start: resource.availability.start,
      end: resource.availability.end,
    },
    { type: 'capacity', value: resource.capacity, unit: resource.unit },
    { type: 'maximum_distance_km', value: state.maxDistanceKm },
    ...(resource.maxHours === null
      ? []
      : ([{ type: 'maximum_hours', value: resource.maxHours }] as Constraint[])),
  ]
}

export function getNeedStatus(
  state: CoordinationState,
  need: Need,
): NeedWithStatus {
  const assignments = state.committedAssignments.filter(
    (assignment) => assignment.needId === need.id,
  )
  const committedQuantity = assignments.reduce(
    (sum, assignment) => sum + assignment.quantity,
    0,
  )
  const availableCommittedQuantity = assignments.reduce((sum, assignment) => {
    const resource = getResource(state, assignment.resourceId)
    return resource && !isResourceUnavailable(resource)
      ? sum + assignment.quantity
      : sum
  }, 0)

  let status: NeedStatus = 'open'
  if (availableCommittedQuantity >= need.quantity) {
    status = 'covered'
  } else if (committedQuantity > 0) {
    status = 'disrupted'
  }

  return {
    ...need,
    status,
    committedQuantity,
    availableCommittedQuantity,
  }
}

export function getCoordinationSnapshot(
  state: CoordinationState,
): CoordinationSnapshot {
  const needs = state.needs.map((need) => getNeedStatus(state, need))
  const covered = needs.filter((need) => need.status === 'covered').length
  const disrupted = needs.filter((need) => need.status === 'disrupted').length
  const open = needs.length - covered - disrupted
  const availableResources = state.resources.filter(
    (resource) => !isResourceUnavailable(resource),
  ).length
  const assignedResourceIds = new Set(
    state.committedAssignments.map((assignment) => assignment.resourceId),
  )

  return {
    event: {
      name: state.eventName,
      date: state.eventDate,
      location: state.hubLocation,
    },
    revision: state.resourceRevision,
    totals: {
      needs: needs.length,
      open,
      covered,
      disrupted,
      resources: state.resources.length,
      availableResources,
    },
    coveragePercent:
      needs.length === 0 ? 100 : Math.round((covered / needs.length) * 100),
    openNeeds: needs.filter((need) => need.status !== 'covered'),
    currentAssignments: structuredClone(state.committedAssignments),
    resourceSummary: {
      total: state.resources.length,
      available: availableResources,
      unavailable: state.resources.length - availableResources,
      assigned: assignedResourceIds.size,
    },
    stagedPlanStatus: state.stagedPlan
      ? {
          id: state.stagedPlan.id,
          digest: state.stagedPlan.digest,
          status: state.stagedPlan.status,
          stale:
            state.stagedPlan.status !== 'committed' &&
            state.stagedPlan.sourceRevision !== state.resourceRevision,
        }
      : null,
    stagedPlan: state.stagedPlan,
    needs,
  }
}

export function normalizeAssignments(assignments: AssignmentInput[]) {
  return assignments
    .map((assignment) => ({
      needId: assignment.needId.trim(),
      resourceId: assignment.resourceId.trim(),
      quantity: Number(assignment.quantity),
      start: assignment.start,
      end: assignment.end,
    }))
    .sort((left, right) => {
      const leftKey = `${left.needId}:${left.resourceId}:${left.start}:${left.end}`
      const rightKey = `${right.needId}:${right.resourceId}:${right.start}:${right.end}`
      return leftKey.localeCompare(rightKey)
    })
}

export async function createPlanDigest(
  sourceRevision: number,
  assignments: AssignmentInput[],
) {
  const canonical = JSON.stringify({
    sourceRevision,
    assignments: normalizeAssignments(assignments),
  })
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    encoder.encode(canonical),
  )
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `sha256:${hex}`
}

function issue(
  code: string,
  message: string,
  assignmentIndex?: number,
  needId?: string,
  resourceId?: string,
): PlanValidationIssue {
  return { code, message, assignmentIndex, needId, resourceId }
}

type UsageWindow = {
  resourceId: string
  quantity: number
  start: string
  end: string
  assignmentIndex?: number
}

function maximumConcurrentQuantity(windows: UsageWindow[]) {
  const checkpoints = windows.flatMap((window) => [
    toTime(window.start),
    Math.max(toTime(window.start), toTime(window.end) - 1),
  ])
  return checkpoints.reduce((maximum, checkpoint) => {
    const used = windows.reduce((sum, window) => {
      const active =
        toTime(window.start) <= checkpoint && checkpoint < toTime(window.end)
      return active ? sum + window.quantity : sum
    }, 0)
    return Math.max(maximum, used)
  }, 0)
}

export function validateMatchPlan(
  state: CoordinationState,
  rawAssignments: AssignmentInput[],
): PlanValidationResult {
  const assignments = normalizeAssignments(rawAssignments)
  const errors: PlanValidationIssue[] = []
  const warnings: PlanValidationIssue[] = []

  if (assignments.length === 0) {
    errors.push(issue('EMPTY_PLAN', 'A plan must contain at least one assignment.'))
  }

  const targetNeedIds = new Set(assignments.map((assignment) => assignment.needId))
  const existingUsage: UsageWindow[] = state.committedAssignments
    .filter((assignment) => !targetNeedIds.has(assignment.needId))
    .map((assignment) => ({
      resourceId: assignment.resourceId,
      quantity: assignment.quantity,
      start: assignment.start,
      end: assignment.end,
    }))

  const candidateUsage: UsageWindow[] = []
  const seenPairs = new Set<string>()

  assignments.forEach((assignment, index) => {
    const need = state.needs.find((candidate) => candidate.id === assignment.needId)
    const resource = getResource(state, assignment.resourceId)
    const pairKey = `${assignment.needId}:${assignment.resourceId}`

    if (seenPairs.has(pairKey)) {
      errors.push(
        issue(
          'DUPLICATE_ASSIGNMENT',
          'The same resource is assigned to the same need more than once.',
          index,
          assignment.needId,
          assignment.resourceId,
        ),
      )
    }
    seenPairs.add(pairKey)

    if (!need) {
      errors.push(
        issue(
          'NEED_NOT_FOUND',
          `Need "${assignment.needId}" does not exist.`,
          index,
          assignment.needId,
          assignment.resourceId,
        ),
      )
    }

    if (!resource) {
      errors.push(
        issue(
          'RESOURCE_NOT_FOUND',
          `Resource "${assignment.resourceId}" does not exist.`,
          index,
          assignment.needId,
          assignment.resourceId,
        ),
      )
    }

    if (!Number.isFinite(assignment.quantity) || assignment.quantity <= 0) {
      errors.push(
        issue(
          'INVALID_QUANTITY',
          'Assignment quantity must be a finite number greater than zero.',
          index,
          assignment.needId,
          assignment.resourceId,
        ),
      )
    }

    const start = toTime(assignment.start)
    const end = toTime(assignment.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      errors.push(
        issue(
          'INVALID_TIME_WINDOW',
          'Assignment start and end must be valid, and end must be after start.',
          index,
          assignment.needId,
          assignment.resourceId,
        ),
      )
      return
    }

    if (!need || !resource) return

    if (isResourceUnavailable(resource)) {
      errors.push(
        issue(
          'RESOURCE_UNAVAILABLE',
          `${resource.name} is currently unavailable.`,
          index,
          need.id,
          resource.id,
        ),
      )
    }

    if (resource.type !== need.category) {
      errors.push(
        issue(
          'CATEGORY_MISMATCH',
          `${resource.name} cannot satisfy a ${need.category} need.`,
          index,
          need.id,
          resource.id,
        ),
      )
    }

    if (resource.unit !== need.unit) {
      errors.push(
        issue(
          'UNIT_MISMATCH',
          `${resource.name} is measured in ${resource.unit}, not ${need.unit}.`,
          index,
          need.id,
          resource.id,
        ),
      )
    }

    const missingSkills = need.requiredSkills.filter(
      (skill) => !resource.skills.includes(skill),
    )
    if (missingSkills.length > 0) {
      errors.push(
        issue(
          'SKILL_MISMATCH',
          `${resource.name} is missing: ${missingSkills.join(', ')}.`,
          index,
          need.id,
          resource.id,
        ),
      )
    }

    if (assignment.quantity > resource.capacity) {
      errors.push(
        issue(
          'RESOURCE_CAPACITY_EXCEEDED',
          `${resource.name} can supply ${resource.capacity} ${resource.unit}, not ${assignment.quantity}.`,
          index,
          need.id,
          resource.id,
        ),
      )
    }

    if (
      start < toTime(resource.availability.start) ||
      end > toTime(resource.availability.end)
    ) {
      errors.push(
        issue(
          'RESOURCE_TIME_CONFLICT',
          `${resource.name} is not available for the full assignment window.`,
          index,
          need.id,
          resource.id,
        ),
      )
    }

    if (start > toTime(need.start) || end < toTime(need.end)) {
      errors.push(
        issue(
          'NEED_TIME_NOT_COVERED',
          `${resource.name} does not cover the full time window for ${need.title}.`,
          index,
          need.id,
          resource.id,
        ),
      )
    }

    if (resource.distanceKm > state.maxDistanceKm) {
      errors.push(
        issue(
          'MAX_DISTANCE_EXCEEDED',
          `${resource.name} is ${resource.distanceKm} km away; the event limit is ${state.maxDistanceKm} km.`,
          index,
          need.id,
          resource.id,
        ),
      )
    } else if (resource.distanceKm >= state.maxDistanceKm * 0.8) {
      warnings.push(
        issue(
          'HIGH_TRAVEL_DISTANCE',
          `${resource.name} is close to the ${state.maxDistanceKm} km travel limit.`,
          index,
          need.id,
          resource.id,
        ),
      )
    }

    candidateUsage.push({
      resourceId: resource.id,
      quantity: assignment.quantity,
      start: assignment.start,
      end: assignment.end,
      assignmentIndex: index,
    })
  })

  targetNeedIds.forEach((needId) => {
    const need = state.needs.find((candidate) => candidate.id === needId)
    if (!need) return
    const quantity = assignments
      .filter((assignment) => assignment.needId === needId)
      .reduce((sum, assignment) => sum + assignment.quantity, 0)

    if (quantity < need.quantity) {
      errors.push(
        issue(
          'NEED_UNDER_COVERED',
          `${need.title} requires ${need.quantity} ${need.unit}; the plan supplies ${quantity}.`,
          undefined,
          need.id,
        ),
      )
    } else if (quantity > need.quantity) {
      errors.push(
        issue(
          'NEED_OVER_COVERED',
          `${need.title} requires ${need.quantity} ${need.unit}; the plan supplies ${quantity}.`,
          undefined,
          need.id,
        ),
      )
    }
  })

  const allUsage = [...existingUsage, ...candidateUsage]
  new Set(candidateUsage.map((usage) => usage.resourceId)).forEach((resourceId) => {
    const resource = getResource(state, resourceId)
    if (!resource) return
    const windows = allUsage.filter((usage) => usage.resourceId === resourceId)
    const maximum = maximumConcurrentQuantity(windows)
    if (maximum > resource.capacity) {
      errors.push(
        issue(
          'RESOURCE_OVERBOOKED',
          `${resource.name} would be booked for ${maximum} ${resource.unit} at the same time; capacity is ${resource.capacity}.`,
          undefined,
          undefined,
          resource.id,
        ),
      )
    }

    const totalHours = windows.reduce(
      (sum, window) =>
        sum + durationHours(window.start, window.end) * window.quantity,
      0,
    )
    if (resource.maxHours !== null && totalHours > resource.maxHours) {
      errors.push(
        issue(
          'MAX_HOURS_EXCEEDED',
          `${resource.name} would work ${round(totalHours)} hours; the limit is ${resource.maxHours}.`,
          undefined,
          undefined,
          resource.id,
        ),
      )
    }

    const hasConflict = windows.some((window, index) =>
      windows.some(
        (other, otherIndex) =>
          index !== otherIndex &&
          overlaps(window.start, window.end, other.start, other.end),
      ),
    )
    if (hasConflict && resource.capacity <= 1 && windows.length > 1) {
      errors.push(
        issue(
          'RESOURCE_TIME_OVERLAP',
          `${resource.name} has overlapping assignments.`,
          undefined,
          undefined,
          resource.id,
        ),
      )
    }
  })

  const resourceIds = new Set(assignments.map((assignment) => assignment.resourceId))
  const totalTravelKm = Array.from(resourceIds).reduce((sum, resourceId) => {
    const resource = getResource(state, resourceId)
    return sum + (resource?.distanceKm ?? 0)
  }, 0)

  const fullyCovered = Array.from(targetNeedIds).filter((needId) => {
    const need = state.needs.find((candidate) => candidate.id === needId)
    if (!need) return false
    return (
      assignments
        .filter((assignment) => assignment.needId === needId)
        .reduce((sum, assignment) => sum + assignment.quantity, 0) ===
      need.quantity
    )
  }).length

  const preservedAssignments = state.committedAssignments.filter(
    (assignment) => !targetNeedIds.has(assignment.needId),
  )
  const replacedAssignments = state.committedAssignments.filter((assignment) =>
    targetNeedIds.has(assignment.needId),
  )
  const projectedAssignments = [...preservedAssignments, ...assignments]
  const uncoveredNeeds = state.needs.flatMap((need) => {
    const coveredQuantity = projectedAssignments
      .filter((assignment) => assignment.needId === need.id)
      .filter((assignment) => {
        const resource = getResource(state, assignment.resourceId)
        return resource && !isResourceUnavailable(resource)
      })
      .reduce((sum, assignment) => sum + assignment.quantity, 0)
    if (coveredQuantity >= need.quantity) return []
    return [
      {
        needId: need.id,
        title: need.title,
        requiredQuantity: need.quantity,
        coveredQuantity,
        remainingQuantity: round(need.quantity - coveredQuantity),
        unit: need.unit,
      },
    ]
  })
  const projectedCovered = state.needs.length - uncoveredNeeds.length
  const conflictCodes = new Set([
    'RESOURCE_TIME_CONFLICT',
    'NEED_TIME_NOT_COVERED',
    'RESOURCE_OVERBOOKED',
    'RESOURCE_TIME_OVERLAP',
  ])
  const conflicts = errors.filter((candidate) => conflictCodes.has(candidate.code))
  const estimatedVolunteerHours = round(
    assignments.reduce((sum, assignment) => {
      const resource = getResource(state, assignment.resourceId)
      if (resource?.type !== 'people') return sum
      return sum + durationHours(assignment.start, assignment.end) * assignment.quantity
    }, 0),
  )
  const totalTravelKmRounded = round(totalTravelKm)
  const coveragePercentage =
    state.needs.length === 0
      ? 100
      : Math.round((projectedCovered / state.needs.length) * 100)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    uncoveredNeeds,
    conflicts,
    constraintViolations: errors,
    coverage: {
      needsTotal: state.needs.length,
      needsFullyCovered: projectedCovered,
      percentage: coveragePercentage,
    },
    metrics: {
      assignmentCount: assignments.length,
      needsTargeted: targetNeedIds.size,
      uniqueResources: resourceIds.size,
      totalTravelKm: totalTravelKmRounded,
      estimatedVolunteerHours,
      preservedAssignments: preservedAssignments.length,
      replacedAssignments: replacedAssignments.length,
    },
    summary: {
      assignmentCount: assignments.length,
      needsTargeted: targetNeedIds.size,
      needsFullyCovered: fullyCovered,
      totalTravelKm: totalTravelKmRounded,
      estimatedVolunteerHours,
    },
  }
}

export function validateStagedPlan(
  state: CoordinationState,
  plan: StagedPlan,
): PlanValidationResult {
  const baselineAssignments =
    plan.status === 'committed' && state.lastCommit?.planId === plan.id
      ? state.lastCommit.previousAssignments
      : state.committedAssignments

  return validateMatchPlan(
    baselineAssignments === state.committedAssignments
      ? state
      : { ...state, committedAssignments: baselineAssignments },
    plan.assignments,
  )
}

function assignmentFor(
  need: Need,
  resource: Resource,
  quantity = need.quantity,
): AssignmentInput {
  return {
    needId: need.id,
    resourceId: resource.id,
    quantity,
    start: need.start,
    end: need.end,
  }
}

export function buildRecommendedAssignments(state: CoordinationState) {
  const needs = state.needs
    .map((need) => getNeedStatus(state, need))
    .filter((need) => need.status !== 'covered')
  const result: AssignmentInput[] = []

  needs.forEach((need) => {
    const find = (resourceId: string) =>
      state.resources.find(
        (resource) =>
          resource.id === resourceId && !isResourceUnavailable(resource),
      )

    if (need.id === 'need-chairs') {
      const resource = find('res-library-chairs') ?? find('res-school-chairs')
      if (resource) result.push(assignmentFor(need, resource))
    }

    if (need.id === 'need-van') {
      const resource = find('res-northside-van') ?? find('res-harbour-van')
      if (resource) result.push(assignmentFor(need, resource))
    }

    if (need.id === 'need-volunteers') {
      const volunteers = ['res-aya', 'res-leo', 'res-sam']
        .map(find)
        .filter((resource): resource is Resource => Boolean(resource))
        .slice(0, 2)
      volunteers.forEach((resource) =>
        result.push(assignmentFor(need, resource, 1)),
      )
    }

    if (need.id === 'need-driver') {
      const resource =
        find('res-nora-driver') ?? find('res-sam') ?? find('res-remote-driver')
      if (resource) result.push(assignmentFor(need, resource))
    }

    if (need.id === 'need-lunch') {
      const resource = find('res-community-kitchen')
      if (resource) result.push(assignmentFor(need, resource))
    }

    if (need.id === 'need-projector') {
      const resource = find('res-media-kit')
      if (resource) result.push(assignmentFor(need, resource))
    }

    if (need.id === 'need-quiet-room') {
      const resource = find('res-advice-room')
      if (resource) result.push(assignmentFor(need, resource))
    }
  })

  return result
}

export function formatTimeWindow(start: string, end: string) {
  const format = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `${format.format(new Date(start))}–${format.format(new Date(end))}`
}

export function categoryLabel(category: Need['category']) {
  const labels: Record<Need['category'], string> = {
    equipment: 'Equipment',
    transport: 'Transport',
    people: 'People',
    food: 'Food',
    space: 'Space',
  }
  return labels[category]
}
