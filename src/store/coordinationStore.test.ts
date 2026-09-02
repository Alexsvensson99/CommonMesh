import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import { createPlanDigest } from '../domain/coordination'
import { CoordinationStore } from './coordinationStore'

const fixedNow = () => '2026-09-05T08:00:00+02:00'

function makeStore() {
  return new CoordinationStore({
    storage: null,
    now: fixedNow,
    initialState: createSeedState(),
  })
}

describe('CoordinationStore search and approval boundary', () => {
  it('searches needs by date, category, urgency, and live status', () => {
    const store = makeStore()
    const needs = store.searchNeeds({
      date: '2026-09-05',
      category: 'people',
      urgency: 'high',
      status: 'open',
    })

    expect(needs.map((need) => need.id)).toEqual([
      'need-volunteers',
      'need-driver',
    ])
  })

  it('searches resources by type, skill, capacity, distance, and time', () => {
    const store = makeStore()
    const resources = store.searchResources({
      type: 'people',
      skill: 'b-driving-licence',
      availableOnly: true,
      minCapacity: 1,
      maxDistanceKm: 10,
      date: '2026-09-05',
      start: '2026-09-05T08:15:00+02:00',
      end: '2026-09-05T10:15:00+02:00',
    })

    expect(resources.map((resource) => resource.id)).toEqual([
      'res-sam',
      'res-nora-driver',
    ])
  })

  it('stages without committing and lets the human reject the exact digest', async () => {
    const store = makeStore()
    const staged = await store.stageRecommendedPlan('agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    expect(store.getState().committedAssignments).toEqual([])
    expect(store.rejectStagedPlan(staged.data.digest)).toMatchObject({
      ok: true,
      data: { rejectedPlanId: staged.data.id },
    })
    expect(store.getState().stagedPlan).toBeNull()
    expect(store.getState().activity[0]).toMatchObject({
      actor: 'human',
      action: 'reject_plan',
    })
  })

  it('rejects an unapproved commit and requires the exact approval digest', async () => {
    const store = makeStore()
    const staged = await store.stageRecommendedPlan('agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    expect(store.commitApprovedPlan(staged.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'APPROVAL_REQUIRED' },
    })
    expect(store.getState().activity[0]).toMatchObject({
      actor: 'agent',
      action: 'commit_approved_plan',
      outcome: 'failed',
    })
    expect(store.approveStagedPlan('sha256:not-the-plan')).toMatchObject({
      ok: false,
      error: { code: 'DIGEST_MISMATCH' },
    })
    expect(store.approveStagedPlan(staged.data.digest)).toMatchObject({ ok: true })
  })

  it('invalidates approval when a different plan is staged', async () => {
    const store = makeStore()
    const original = await store.stageRecommendedPlan('agent')
    expect(original.ok).toBe(true)
    if (!original.ok) return
    store.approveStagedPlan(original.data.digest)

    const changedAssignments = original.data.assignments.map((assignment) =>
      assignment.needId === 'need-van'
        ? { ...assignment, resourceId: 'res-harbour-van' }
        : assignment,
    )
    const changed = await store.stagePlan(
      changedAssignments,
      'Use the backup van',
      'agent',
    )

    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    expect(changed.data.approval).toBeNull()
    expect(changed.data.status).toBe('staged')
    expect(store.commitApprovedPlan(original.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'DIGEST_MISMATCH' },
    })
  })

  it('rejects a stale digest after resource state changes', async () => {
    const store = makeStore()
    const staged = await store.stageRecommendedPlan('agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    store.setResourceUnavailable('res-northside-van', true, 'human')

    expect(store.getState().stagedPlan).toMatchObject({
      status: 'staged',
      approval: null,
    })

    expect(store.approveStagedPlan(staged.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'STALE_PLAN' },
    })
    expect(store.commitApprovedPlan(staged.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'STALE_PLAN' },
    })
  })

  it('commits an approved plan once and consumes its approval', async () => {
    const store = makeStore()
    const staged = await store.stageRecommendedPlan('agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return
    store.approveStagedPlan(staged.data.digest)

    expect(store.commitApprovedPlan(staged.data.digest)).toMatchObject({ ok: true })
    expect(store.getSnapshot().coveragePercent).toBe(100)
    expect(store.getState().committedAssignments).toHaveLength(8)
    expect(store.commitApprovedPlan(staged.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'PLAN_ALREADY_COMMITTED' },
    })
    expect(store.getStagedPlanDetails()).toMatchObject({
      approvalStatus: 'consumed',
    })
  })

  it('repairs only the disrupted van assignment and can undo the repair', async () => {
    const store = makeStore()
    const initial = await store.stageRecommendedPlan('agent')
    expect(initial.ok).toBe(true)
    if (!initial.ok) return
    store.approveStagedPlan(initial.data.digest)
    store.commitApprovedPlan(initial.data.digest)

    store.setResourceUnavailable('res-northside-van', true, 'human')
    expect(store.getSnapshot().totals.disrupted).toBe(1)

    const repair = await store.stageRecommendedPlan('agent')
    expect(repair.ok).toBe(true)
    if (!repair.ok) return
    expect(repair.data.assignments).toEqual([
      expect.objectContaining({
        needId: 'need-van',
        resourceId: 'res-harbour-van',
      }),
    ])

    store.approveStagedPlan(repair.data.digest)
    expect(store.commitApprovedPlan(repair.data.digest)).toMatchObject({ ok: true })
    expect(store.getSnapshot().coveragePercent).toBe(100)
    expect(store.getState().committedAssignments).toHaveLength(8)

    expect(store.undoLastCommit()).toMatchObject({
      ok: true,
      data: { undonePlanId: repair.data.id },
    })
    expect(store.getSnapshot().totals.disrupted).toBe(1)
  })

  it('reset restores the exact deterministic demo state', async () => {
    const store = makeStore()
    await store.stageRecommendedPlan('human')
    store.setResourceUnavailable('res-northside-van', true, 'human')

    store.resetDemo()

    expect(store.getState()).toMatchObject({
      schemaVersion: 2,
      resourceRevision: 1,
      stagedPlan: null,
      committedAssignments: [],
      lastCommit: null,
    })
    expect(
      store
        .getState()
        .resources.every(
          (resource) => resource.availability.status === 'available',
        ),
    ).toBe(true)
    expect(store.getSnapshot().totals.open).toBe(7)
  })

  it('persists the complete reset state for a fresh browser session', async () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const store = new CoordinationStore({
      storage,
      now: fixedNow,
      initialState: createSeedState(),
    })
    const staged = await store.stageRecommendedPlan('human')
    expect(staged.ok).toBe(true)
    store.setResourceUnavailable('res-northside-van', true, 'human')

    store.resetDemo()

    const reloaded = new CoordinationStore({ storage, now: fixedNow })
    expect(reloaded.getState()).toMatchObject({
      resourceRevision: 1,
      committedAssignments: [],
      stagedPlan: null,
      lastCommit: null,
    })
    expect(reloaded.getState().activity[0]).toMatchObject({
      actor: 'human',
      action: 'reset_demo',
      outcome: 'success',
    })
    expect(
      reloaded
        .getState()
        .resources.every(
          (resource) => resource.availability.status === 'available',
        ),
    ).toBe(true)
  })

  it('discards a plan if coordination changes while its digest is being created', async () => {
    let releaseDigest: (() => void) | undefined
    const digestGate = new Promise<void>((resolve) => {
      releaseDigest = resolve
    })
    const store = new CoordinationStore({
      storage: null,
      now: fixedNow,
      initialState: createSeedState(),
      createDigest: async (revision, assignments) => {
        await digestGate
        return createPlanDigest(revision, assignments)
      },
    })

    const staging = store.stageRecommendedPlan('agent')
    store.setResourceUnavailable('res-northside-van', true, 'human')
    releaseDigest?.()

    expect(await staging).toMatchObject({
      ok: false,
      error: { code: 'STALE_PLAN' },
    })
    expect(store.getState().stagedPlan).toBeNull()
    expect(store.getState().activity[0]).toMatchObject({
      action: 'stage_match_plan',
      outcome: 'failed',
    })
  })
})
