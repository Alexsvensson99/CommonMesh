import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import type { AssignmentInput, CoordinationState } from './types'
import {
  buildRecommendedAssignments,
  createPlanDigest,
  getCoordinationSnapshot,
  validateMatchPlan,
} from './coordination'

function assignment(
  state: CoordinationState,
  needId: string,
  resourceId: string,
  quantity?: number,
): AssignmentInput {
  const need = state.needs.find((candidate) => candidate.id === needId)
  if (!need) throw new Error(`Missing need ${needId}`)
  return {
    needId,
    resourceId,
    quantity: quantity ?? need.quantity,
    start: need.start,
    end: need.end,
  }
}

function errorCodes(state: CoordinationState, assignments: AssignmentInput[]) {
  return validateMatchPlan(state, assignments).errors.map((error) => error.code)
}

describe('coordination constraints', () => {
  it('builds a complete valid plan with coverage and efficiency metrics', () => {
    const state = createSeedState()
    const validation = validateMatchPlan(
      state,
      buildRecommendedAssignments(state),
    )

    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
    expect(validation.uncoveredNeeds).toEqual([])
    expect(validation.coverage).toEqual({
      needsTotal: 7,
      needsFullyCovered: 7,
      percentage: 100,
    })
    expect(validation.metrics).toMatchObject({
      assignmentCount: 8,
      needsTargeted: 7,
      uniqueResources: 8,
      estimatedVolunteerHours: 8,
      preservedAssignments: 0,
      replacedAssignments: 0,
    })
  })

  it('rejects an empty invalid plan and reports every need as uncovered', () => {
    const validation = validateMatchPlan(createSeedState(), [])

    expect(validation.valid).toBe(false)
    expect(validation.errors[0]?.code).toBe('EMPTY_PLAN')
    expect(validation.uncoveredNeeds).toHaveLength(7)
    expect(validation.coverage.percentage).toBe(0)
  })

  it('enforces resource availability and scheduling windows', () => {
    const state = createSeedState()
    const assignments = [
      assignment(state, 'need-volunteers', 'res-sam', 1),
      assignment(state, 'need-volunteers', 'res-aya', 1),
    ]

    expect(errorCodes(state, assignments)).toContain('RESOURCE_TIME_CONFLICT')
  })

  it('enforces required skills', () => {
    const state = createSeedState()
    expect(
      errorCodes(state, [
        assignment(state, 'need-projector', 'res-pocket-projector'),
      ]),
    ).toContain('SKILL_MISMATCH')
  })

  it('enforces quantity and vehicle capacity', () => {
    const state = createSeedState()
    expect(
      errorCodes(state, [assignment(state, 'need-van', 'res-bike-trailer')]),
    ).toContain('RESOURCE_CAPACITY_EXCEEDED')
  })

  it('enforces maximum volunteer hours', () => {
    const state = createSeedState()
    const assignments = [
      assignment(state, 'need-volunteers', 'res-sam', 1),
      assignment(state, 'need-volunteers', 'res-aya', 1),
    ]

    expect(errorCodes(state, assignments)).toContain('MAX_HOURS_EXCEEDED')
  })

  it('rejects overlapping schedules for the same person', () => {
    const state = createSeedState()
    state.resources = state.resources.map((resource) =>
      resource.id === 'res-nora-driver'
        ? {
            ...resource,
            skills: [...resource.skills, 'event-support'],
            maxHours: 5,
            availability: {
              ...resource.availability,
              end: '2026-09-05T13:00:00+02:00',
            },
          }
        : resource,
    )
    const assignments = [
      assignment(state, 'need-driver', 'res-nora-driver'),
      assignment(state, 'need-volunteers', 'res-nora-driver', 1),
      assignment(state, 'need-volunteers', 'res-aya', 1),
    ]
    const codes = errorCodes(state, assignments)

    expect(codes).toContain('RESOURCE_OVERBOOKED')
    expect(codes).toContain('RESOURCE_TIME_OVERLAP')
  })

  it('enforces the event maximum travel distance', () => {
    const state = createSeedState()
    expect(
      errorCodes(state, [
        assignment(state, 'need-driver', 'res-remote-driver'),
      ]),
    ).toContain('MAX_DISTANCE_EXCEEDED')
  })

  it('creates the same SHA-256 approval digest regardless of input order', async () => {
    const state = createSeedState()
    const assignments = buildRecommendedAssignments(state)

    const first = await createPlanDigest(1, assignments)
    const second = await createPlanDigest(1, assignments.toReversed())

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(second).toBe(first)
  })

  it('flags only a committed need whose resource becomes unavailable', () => {
    const state = createSeedState()
    const van = assignment(state, 'need-van', 'res-northside-van')
    state.committedAssignments = [
      {
        ...van,
        planId: 'CM-TEST',
        committedAt: '2026-09-05T08:00:00+02:00',
      },
    ]
    state.resources = state.resources.map((resource) =>
      resource.id === 'res-northside-van'
        ? {
            ...resource,
            availability: { ...resource.availability, status: 'unavailable' },
          }
        : resource,
    )

    const snapshot = getCoordinationSnapshot(state)
    expect(
      snapshot.needs.find((need) => need.id === 'need-van')?.status,
    ).toBe('disrupted')
    expect(snapshot.totals.disrupted).toBe(1)
  })

  it('reports the exact preserved and replaced assignment counts for repair plans', () => {
    const state = createSeedState()
    const initial = buildRecommendedAssignments(state)
    state.committedAssignments = initial.map((item) => ({
      ...item,
      planId: 'CM-INITIAL',
      committedAt: '2026-09-05T08:00:00+02:00',
    }))
    state.resources = state.resources.map((resource) =>
      resource.id === 'res-northside-van'
        ? {
            ...resource,
            availability: { ...resource.availability, status: 'unavailable' },
          }
        : resource,
    )

    const validation = validateMatchPlan(
      state,
      buildRecommendedAssignments(state),
    )

    expect(validation.metrics).toMatchObject({
      assignmentCount: 1,
      preservedAssignments: 7,
      replacedAssignments: 1,
    })
    expect(validation.coverage.percentage).toBe(100)
  })
})
