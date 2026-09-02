import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import { buildRecommendedAssignments } from '../domain/coordination'
import { CoordinationStore } from './coordinationStore'

const fixedNow = () => '2026-09-05T08:00:00+02:00'

function makeStore() {
  return new CoordinationStore({
    storage: null,
    now: fixedNow,
    initialState: createSeedState(),
  })
}

describe('CoordinationStore approval boundary', () => {
  it('cannot commit until a human approves the exact staged digest', async () => {
    const store = makeStore()
    const assignments = buildRecommendedAssignments(store.getState())
    const staged = await store.stagePlan(assignments, 'Cover the event')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    const blocked = store.commitApprovedPlan(staged.data.digest)
    expect(blocked).toMatchObject({
      ok: false,
      error: { code: 'APPROVAL_REQUIRED' },
    })

    const wrongApproval = store.approveStagedPlan('sha256:not-the-plan')
    expect(wrongApproval).toMatchObject({
      ok: false,
      error: { code: 'DIGEST_MISMATCH' },
    })

    const approval = store.approveStagedPlan(staged.data.digest)
    expect(approval).toMatchObject({ ok: true })

    const committed = store.commitApprovedPlan(staged.data.digest)
    expect(committed).toMatchObject({ ok: true })
    expect(store.getSnapshot().coveragePercent).toBe(100)
    expect(store.getState().committedAssignments).toHaveLength(7)

    const replay = store.commitApprovedPlan(staged.data.digest)
    expect(replay).toMatchObject({
      ok: false,
      error: { code: 'PLAN_ALREADY_COMMITTED' },
    })
  })

  it('rejects an approval after the coordination revision changes', async () => {
    const store = makeStore()
    const staged = await store.stageRecommendedPlan('agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    store.setResourceUnavailable('res-northside-van', true, 'human')

    expect(store.approveStagedPlan(staged.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'STALE_PLAN' },
    })
    expect(store.commitApprovedPlan(staged.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'STALE_PLAN' },
    })
  })

  it('repairs only a disrupted need and can undo the last commit', async () => {
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
    expect(repair.data.assignments).toHaveLength(1)
    expect(repair.data.assignments[0]).toMatchObject({
      needId: 'need-van',
      resourceId: 'res-harbour-van',
    })

    store.approveStagedPlan(repair.data.digest)
    expect(store.commitApprovedPlan(repair.data.digest)).toMatchObject({ ok: true })
    expect(store.getSnapshot().coveragePercent).toBe(100)
    expect(store.getState().committedAssignments).toHaveLength(7)

    expect(store.undoLastCommit()).toMatchObject({
      ok: true,
      data: { undonePlanId: repair.data.id },
    })
    expect(store.getSnapshot().totals.disrupted).toBe(1)
  })

  it('reset restores the original deterministic demo state', async () => {
    const store = makeStore()
    await store.stageRecommendedPlan('human')
    store.setResourceUnavailable('res-northside-van', true, 'human')

    store.resetDemo()

    expect(store.getState()).toMatchObject({
      resourceRevision: 1,
      stagedPlan: null,
      committedAssignments: [],
      lastCommit: null,
    })
    expect(store.getState().resources.every((resource) => !resource.unavailable)).toBe(
      true,
    )
    expect(store.getSnapshot().totals.open).toBe(6)
  })
})
