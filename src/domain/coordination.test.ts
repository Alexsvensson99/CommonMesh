import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import {
  buildRecommendedAssignments,
  createPlanDigest,
  getCoordinationSnapshot,
  validateMatchPlan,
} from './coordination'

describe('coordination domain', () => {
  it('builds a complete, valid deterministic demo plan', () => {
    const state = createSeedState()
    const assignments = buildRecommendedAssignments(state)
    const validation = validateMatchPlan(state, assignments)

    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
    expect(validation.summary).toMatchObject({
      assignmentCount: 7,
      needsTargeted: 6,
      needsFullyCovered: 6,
    })
  })

  it('returns the same SHA-256 digest regardless of assignment order', async () => {
    const state = createSeedState()
    const assignments = buildRecommendedAssignments(state)

    const first = await createPlanDigest(1, assignments)
    const second = await createPlanDigest(1, assignments.toReversed())

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(second).toBe(first)
  })

  it('rejects unavailable, under-covered, and skill-incompatible matches', () => {
    const state = createSeedState()
    state.resources = state.resources.map((resource) =>
      resource.id === 'res-northside-van'
        ? { ...resource, unavailable: true }
        : resource,
    )
    const vanNeed = state.needs.find((need) => need.id === 'need-van')!
    const invalid = [
      {
        needId: vanNeed.id,
        resourceId: 'res-northside-van',
        quantity: 0.5,
        start: vanNeed.start,
        end: vanNeed.end,
      },
      {
        needId: 'need-projector',
        resourceId: 'res-pocket-projector',
        quantity: 1,
        start: state.needs.find((need) => need.id === 'need-projector')!.start,
        end: state.needs.find((need) => need.id === 'need-projector')!.end,
      },
    ]

    const validation = validateMatchPlan(state, invalid)
    const codes = validation.errors.map((error) => error.code)

    expect(validation.valid).toBe(false)
    expect(codes).toContain('RESOURCE_UNAVAILABLE')
    expect(codes).toContain('NEED_UNDER_COVERED')
    expect(codes).toContain('SKILL_MISMATCH')
  })

  it('classifies a committed need as disrupted when its resource fails', () => {
    const state = createSeedState()
    const vanNeed = state.needs.find((need) => need.id === 'need-van')!
    state.committedAssignments = [
      {
        needId: vanNeed.id,
        resourceId: 'res-northside-van',
        quantity: 1,
        start: vanNeed.start,
        end: vanNeed.end,
        planId: 'CM-TEST',
        committedAt: '2026-09-05T08:00:00+02:00',
      },
    ]
    state.resources = state.resources.map((resource) =>
      resource.id === 'res-northside-van'
        ? { ...resource, unavailable: true }
        : resource,
    )

    const snapshot = getCoordinationSnapshot(state)
    const vanStatus = snapshot.needs.find((need) => need.id === vanNeed.id)

    expect(vanStatus?.status).toBe('disrupted')
    expect(snapshot.totals.disrupted).toBe(1)
  })
})
