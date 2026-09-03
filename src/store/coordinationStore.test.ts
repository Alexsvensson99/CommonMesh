import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import {
  buildRecommendedAssignments,
  createPlanDigest,
} from '../domain/coordination'
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

  it('treats partial capacity as compatible for splittable needs', () => {
    const store = makeStore()
    const contributors = store.searchResources({
      needId: 'need-volunteers',
      type: 'people',
    })

    expect(contributors.find((resource) => resource.id === 'res-aya')).toMatchObject(
      {
        compatibleWithNeed: true,
        canContribute: true,
        fullyCoversNeed: false,
        contributionCapacity: 1,
        compatibilityIssues: [],
      },
    )
    expect(contributors.find((resource) => resource.id === 'res-leo')).toMatchObject(
      {
        compatibleWithNeed: true,
        canContribute: true,
        fullyCoversNeed: false,
      },
    )
    expect(
      store
        .searchResources({ needId: 'need-van', type: 'transport' })
        .find((resource) => resource.id === 'res-bike-trailer'),
    ).toMatchObject({
      compatibleWithNeed: false,
      canContribute: false,
      fullyCoversNeed: false,
      compatibilityIssues: expect.arrayContaining(['capacity']),
    })
  })

  it('ranks the strongest compatible resource first for every need', () => {
    const store = makeStore()
    const expectedFirstMatch = {
      'need-chairs': 'res-library-chairs',
      'need-van': 'res-northside-van',
      'need-volunteers': 'res-aya',
      'need-driver': 'res-sam',
      'need-lunch': 'res-community-kitchen',
      'need-projector': 'res-media-kit',
      'need-quiet-room': 'res-advice-room',
    }

    Object.entries(expectedFirstMatch).forEach(([needId, resourceId]) => {
      expect(store.searchResources({ needId })[0]).toMatchObject({
        id: resourceId,
        compatibleWithNeed: true,
      })
    })
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

  it('refuses to stage an otherwise valid plan with incomplete coverage', async () => {
    const store = makeStore()
    const partialPlan = buildRecommendedAssignments(store.getState()).filter(
      (assignment) => assignment.needId === 'need-chairs',
    )

    expect(await store.stagePlan(partialPlan, 'Cover only the chairs')).toMatchObject({
      ok: false,
      error: {
        code: 'PLAN_INVALID',
        details: {
          errors: expect.arrayContaining([
            expect.objectContaining({ code: 'WORKSPACE_UNDER_COVERED' }),
          ]),
        },
      },
    })
    expect(store.getState().stagedPlan).toBeNull()
    expect(store.getState().committedAssignments).toEqual([])
  })

  it('rejects an unapproved commit and requires the exact approval digest', async () => {
    const store = makeStore()
    const staged = await store.stageRecommendedPlan('agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    expect(await store.commitApprovedPlan(staged.data.digest)).toMatchObject({
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
    expect(await store.commitApprovedPlan(original.data.digest)).toMatchObject({
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
    expect(await store.commitApprovedPlan(staged.data.digest)).toMatchObject({
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

    expect(await store.commitApprovedPlan(staged.data.digest)).toMatchObject({
      ok: true,
    })
    expect(store.getSnapshot().coveragePercent).toBe(100)
    expect(store.getState().committedAssignments).toHaveLength(8)
    expect(await store.commitApprovedPlan(staged.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'PLAN_ALREADY_COMMITTED' },
    })
    expect(store.getStagedPlanDetails()).toMatchObject({
      approvalStatus: 'consumed',
    })
  })

  it('recomputes the approved digest and blocks altered assignments', async () => {
    const state = createSeedState()
    const approvedAssignments = buildRecommendedAssignments(state)
    const approvedDigest = await createPlanDigest(
      state.resourceRevision,
      approvedAssignments,
    )
    state.stagedPlan = {
      id: 'CM-TAMPER',
      digest: approvedDigest,
      intent: 'Original approved proposal',
      assignments: approvedAssignments.map((assignment) =>
        assignment.needId === 'need-van'
          ? { ...assignment, resourceId: 'res-harbour-van' }
          : assignment,
      ),
      sourceRevision: state.resourceRevision,
      createdAt: fixedNow(),
      proposedBy: 'agent',
      status: 'approved',
      approval: {
        digest: approvedDigest,
        approvedAt: fixedNow(),
        approvedBy: 'human-ui',
      },
    }
    const store = new CoordinationStore({
      storage: null,
      now: fixedNow,
      initialState: state,
    })

    expect(Object.isFrozen(store.getState().stagedPlan?.assignments)).toBe(true)
    expect(await store.commitApprovedPlan(approvedDigest)).toMatchObject({
      ok: false,
      error: { code: 'PLAN_TAMPERED' },
    })
    expect(store.getState().committedAssignments).toEqual([])
  })

  it.each([
    ['res-northside-van', 'res-harbour-van'],
    ['res-harbour-van', 'res-northside-van'],
  ])(
    'repairs only the disrupted van assignment when %s fails',
    async (initialVanId, replacementVanId) => {
      const store = makeStore()
      const initialAssignments = buildRecommendedAssignments(
        store.getState(),
      ).map((assignment) =>
        assignment.needId === 'need-van'
          ? { ...assignment, resourceId: initialVanId }
          : assignment,
      )
      const initial = await store.stagePlan(
        initialAssignments,
        'Cover every open need',
        'agent',
      )
      expect(initial.ok).toBe(true)
      if (!initial.ok) return
      store.approveStagedPlan(initial.data.digest)
      await store.commitApprovedPlan(initial.data.digest)
      expect(store.getStagedPlanDetails()).toMatchObject({
        validation: {
          metrics: { preservedAssignments: 0, replacedAssignments: 0 },
        },
      })

      store.setResourceUnavailable(initialVanId, true, 'human')
      expect(store.getSnapshot()).toMatchObject({
        totals: { covered: 6, disrupted: 1 },
        coveragePercent: 86,
      })
      expect(
        store.getState().committedAssignments.filter((assignment) => {
          const resource = store
            .getState()
            .resources.find(
              (candidate) => candidate.id === assignment.resourceId,
            )
          return resource?.availability.status === 'available'
        }),
      ).toHaveLength(7)

      const repair = await store.stageRecommendedPlan('agent')
      expect(repair.ok).toBe(true)
      if (!repair.ok) return
      expect(repair.data.assignments).toEqual([
        expect.objectContaining({
          needId: 'need-van',
          resourceId: replacementVanId,
        }),
      ])

      store.approveStagedPlan(repair.data.digest)
      expect(await store.commitApprovedPlan(repair.data.digest)).toMatchObject({
        ok: true,
      })
      expect(store.getStagedPlanDetails()).toMatchObject({
        validation: {
          metrics: { preservedAssignments: 7, replacedAssignments: 1 },
        },
      })
      expect(store.getSnapshot().coveragePercent).toBe(100)
      expect(store.getState().committedAssignments).toHaveLength(8)

      expect(store.undoLastCommit()).toMatchObject({
        ok: true,
        data: { undonePlanId: repair.data.id },
      })
      expect(store.getSnapshot().totals.disrupted).toBe(1)
    },
  )

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

  it('falls back to seed data for malformed same-version storage', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          schemaVersion: 2,
          needs: [],
          resources: [],
          activity: [],
        }),
      setItem: () => undefined,
    }

    const store = new CoordinationStore({ storage, now: fixedNow })

    expect(store.getSnapshot()).toMatchObject({
      revision: 1,
      totals: { needs: 7, resources: 15 },
    })
    expect(store.getState().committedAssignments).toEqual([])
  })

  it('rejects non-ISO timestamps from persisted browser state', () => {
    const state = createSeedState()
    state.needs[0].start = '09/05/2026 08:00'
    const storage = {
      getItem: () => JSON.stringify(state),
      setItem: () => undefined,
    }

    const store = new CoordinationStore({ storage, now: fixedNow })

    expect(store.getState().needs[0].start).toBe('2026-09-05T08:00:00+02:00')
    expect(store.getSnapshot()).toMatchObject({
      revision: 1,
      totals: { needs: 7, resources: 15 },
    })
  })

  it('falls back to seed data when a persisted event date is invalid', () => {
    const state = createSeedState()
    state.eventDate = '2026-02-31'
    const storage = {
      getItem: () => JSON.stringify(state),
      setItem: () => undefined,
    }

    const store = new CoordinationStore({ storage, now: fixedNow })

    expect(store.getState().eventDate).toBe('2026-09-05')
    expect(store.getSnapshot()).toMatchObject({
      revision: 1,
      totals: { needs: 7, resources: 15 },
    })
  })

  it('keeps the existing state when reset cannot be persisted', async () => {
    let stored: string | null = null
    let rejectWrites = false
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        if (rejectWrites) throw new Error('quota exceeded')
        stored = value
      },
    }
    const store = new CoordinationStore({
      storage,
      now: fixedNow,
      initialState: createSeedState(),
    })
    const staged = await store.stageRecommendedPlan('agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return
    store.approveStagedPlan(staged.data.digest)
    await store.commitApprovedPlan(staged.data.digest)
    expect(stored).not.toBeNull()

    rejectWrites = true
    expect(store.resetDemo()).toEqual({ persisted: false })
    expect(store.getState().committedAssignments).toHaveLength(8)

    const reloaded = new CoordinationStore({ storage, now: fixedNow })
    expect(reloaded.getState().committedAssignments).toHaveLength(8)
  })

  it('keeps stage, approval, and commit transactional when persistence fails', async () => {
    let stored: string | null = null
    let rejectWrites = true
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        if (rejectWrites) throw new Error('quota exceeded')
        stored = value
      },
    }
    const store = new CoordinationStore({
      storage,
      now: fixedNow,
      initialState: createSeedState(),
    })

    expect(await store.stageRecommendedPlan('agent')).toMatchObject({
      ok: false,
      error: { code: 'PERSISTENCE_FAILED' },
    })
    expect(store.getState().stagedPlan).toBeNull()

    rejectWrites = false
    const staged = await store.stageRecommendedPlan('agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    rejectWrites = true
    expect(store.approveStagedPlan(staged.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'PERSISTENCE_FAILED' },
    })
    expect(store.getState().stagedPlan).toMatchObject({
      status: 'staged',
      approval: null,
    })

    rejectWrites = false
    expect(store.approveStagedPlan(staged.data.digest)).toMatchObject({ ok: true })

    rejectWrites = true
    expect(await store.commitApprovedPlan(staged.data.digest)).toMatchObject({
      ok: false,
      error: { code: 'PERSISTENCE_FAILED' },
    })
    expect(store.getState().stagedPlan).toMatchObject({ status: 'approved' })
    expect(store.getState().committedAssignments).toEqual([])
  })

  it('rejects contradictory committed lifecycle data from storage', async () => {
    const state = createSeedState()
    const assignments = buildRecommendedAssignments(state)
    const digest = await createPlanDigest(state.resourceRevision, assignments)
    state.stagedPlan = {
      id: 'CM-INVALID',
      digest,
      intent: 'Contradictory persisted plan',
      assignments,
      sourceRevision: state.resourceRevision,
      createdAt: fixedNow(),
      proposedBy: 'agent',
      status: 'committed',
      approval: null,
    }
    const storage = {
      getItem: () => JSON.stringify(state),
      setItem: () => undefined,
    }

    const reloaded = new CoordinationStore({ storage, now: fixedNow })

    expect(reloaded.getState().stagedPlan).toBeNull()
    expect(reloaded.getState().committedAssignments).toEqual([])
    expect(reloaded.getSnapshot()).toMatchObject({
      revision: 1,
      totals: { needs: 7, covered: 0 },
    })
  })

  it('rejects mismatched committed plans and invalid undo references', async () => {
    const committedStore = makeStore()
    const staged = await committedStore.stageRecommendedPlan('agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return
    committedStore.approveStagedPlan(staged.data.digest)
    await committedStore.commitApprovedPlan(staged.data.digest)
    const validState = structuredClone(committedStore.getState())

    const duplicatePlanAssignment = structuredClone(validState)
    duplicatePlanAssignment.stagedPlan?.assignments.push({
      ...duplicatePlanAssignment.stagedPlan.assignments[0],
    })

    const invalidUndoReference = structuredClone(validState)
    invalidUndoReference.lastCommit?.previousAssignments.push({
      ...invalidUndoReference.committedAssignments[0],
      planId: 'CM-EARLIER',
      resourceId: 'missing-resource',
    })

    for (const corrupted of [duplicatePlanAssignment, invalidUndoReference]) {
      const storage = {
        getItem: () => JSON.stringify(corrupted),
        setItem: () => undefined,
      }
      const reloaded = new CoordinationStore({ storage, now: fixedNow })
      expect(reloaded.getState().stagedPlan).toBeNull()
      expect(reloaded.getState().committedAssignments).toEqual([])
    }
  })

  it('rejects escaped plan intents that could exceed tool output budgets', async () => {
    const store = makeStore()
    const assignments = buildRecommendedAssignments(store.getState())

    expect(
      await store.stagePlan(assignments, '\\'.repeat(240), 'agent'),
    ).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INTENT' },
    })
    expect(store.getState().stagedPlan).toBeNull()

    const staged = await store.stagePlan(assignments, 'Safe plan intent', 'agent')
    expect(staged.ok).toBe(true)
    if (!staged.ok) return
    const corrupted = structuredClone(store.getState())
    if (!corrupted.stagedPlan) return
    corrupted.stagedPlan.intent = '\0'.repeat(240)

    const reloaded = new CoordinationStore({
      storage: {
        getItem: () => JSON.stringify(corrupted),
        setItem: () => undefined,
      },
      now: fixedNow,
    })
    expect(reloaded.getState().stagedPlan).toBeNull()
    expect(reloaded.getState().committedAssignments).toEqual([])
  })

  it('fails writes when browser storage itself is unavailable', async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
    const browserWithoutStorage = Object.defineProperty({}, 'localStorage', {
      get: () => {
        throw new Error('storage access denied')
      },
    })
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: browserWithoutStorage,
    })

    try {
      const store = new CoordinationStore({
        now: fixedNow,
        initialState: createSeedState(),
      })
      expect(await store.stageRecommendedPlan('agent')).toMatchObject({
        ok: false,
        error: { code: 'PERSISTENCE_FAILED' },
      })
      expect(store.getState().stagedPlan).toBeNull()
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow)
      } else {
        Reflect.deleteProperty(globalThis, 'window')
      }
    }
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
