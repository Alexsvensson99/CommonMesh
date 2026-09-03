import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import {
  buildRecommendedAssignments,
  createPlanDigest,
} from '../domain/coordination'
import type { ToolResult } from '../domain/types'
import { CoordinationStore } from '../store/coordinationStore'
import type { WebMCPModelContext, WebMCPTool } from './types'
import {
  createCommonMeshTools,
  getCommonMeshToolCatalogue,
  registerCommonMeshTools,
} from './tools'

const fixedNow = () => '2026-09-05T08:00:00+02:00'

function makeStore() {
  return new CoordinationStore({
    storage: null,
    now: fixedNow,
    initialState: createSeedState(),
  })
}

function byName(tools: WebMCPTool[], name: string) {
  const tool = tools.find((candidate) => candidate.name === name)
  if (!tool) throw new Error(`Missing tool ${name}`)
  return tool
}

describe('CommonMesh WebMCP tools', () => {
  it('exposes the complete unique tool catalogue with strict schemas', () => {
    const tools = createCommonMeshTools(makeStore())
    const names = tools.map((tool) => tool.name)

    expect(names).toEqual([
      'get_coordination_snapshot',
      'search_needs',
      'search_resources',
      'get_resource_details',
      'validate_match_plan',
      'stage_match_plan',
      'get_staged_plan',
      'commit_approved_plan',
      'get_activity_log',
    ])
    expect(new Set(names).size).toBe(names.length)
    expect(tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(
      true,
    )
    expect(byName(tools, 'search_needs').annotations).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
    expect(byName(tools, 'commit_approved_plan').annotations).toMatchObject({
      readOnlyHint: false,
      untrustedContentHint: true,
    })
    expect(
      byName(tools, 'validate_match_plan').inputSchema.properties?.assignments
        .items?.properties?.start.format,
    ).toBe('date-time')
    expect(
      byName(tools, 'validate_match_plan').inputSchema.properties?.assignments
        .items?.properties?.quantity,
    ).toMatchObject({ type: 'integer', minimum: 1 })
    expect(
      byName(tools, 'search_resources').inputSchema.properties?.end.format,
    ).toBe('date-time')
    expect(names).not.toContain('approve_staged_plan')

    const catalogue = getCommonMeshToolCatalogue(makeStore())
    expect(catalogue).toHaveLength(9)
    expect(catalogue.filter((tool) => tool.access === 'read')).toHaveLength(7)
    expect(catalogue.filter((tool) => tool.access === 'write')).toHaveLength(2)
    expect(names).not.toContain('set_resource_availability')
    expect(names).not.toContain('undo_last_commit')
  })

  it('returns the closest fully compatible van choices first', async () => {
    const result = (await byName(
      createCommonMeshTools(makeStore()),
      'search_resources',
    ).execute({ needId: 'need-van', type: 'transport' })) as ToolResult<{
      resources: Array<{
        id: string
        canContribute: boolean
        fullyCoversNeed: boolean
      }>
    }>

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data.resources.slice(0, 2)).toMatchObject([
      {
        id: 'res-northside-van',
        canContribute: true,
        fullyCoversNeed: true,
      },
      {
        id: 'res-harbour-van',
        canContribute: true,
        fullyCoversNeed: true,
      },
    ])
  })

  it('describes ranking only for need-scoped resource searches', async () => {
    const search = byName(createCommonMeshTools(makeStore()), 'search_resources')

    const unscoped = (await search.execute({ limit: 1 })) as ToolResult<unknown>
    expect(unscoped).toMatchObject({ ok: true })
    expect(unscoped.nextAction).not.toContain('ranked')

    const noResults = (await search.execute({
      query: 'resource-that-does-not-exist',
    })) as ToolResult<unknown>
    expect(noResults).toMatchObject({ ok: true })
    expect(noResults.nextAction).toBe(
      'No resources matched these filters. Relax optional filters or inspect another need.',
    )
  })

  it('reports incomplete coverage as an invalid dry run and refuses staging', async () => {
    const store = makeStore()
    const tools = createCommonMeshTools(store)
    const partialPlan = buildRecommendedAssignments(store.getState()).filter(
      (assignment) => assignment.needId === 'need-chairs',
    )

    expect(
      await byName(tools, 'validate_match_plan').execute({
        assignments: partialPlan,
      }),
    ).toMatchObject({
      ok: true,
      data: {
        valid: false,
        coverage: { needsFullyCovered: 1, percentage: 14 },
        uncoveredNeedIds: expect.arrayContaining(['need-van']),
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'WORKSPACE_UNDER_COVERED' }),
        ]),
      },
    })

    expect(
      await byName(tools, 'stage_match_plan').execute({
        intent: 'Cover only the chairs',
        assignments: partialPlan,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'PLAN_INVALID',
        details: { valid: false },
      },
    })
    expect(store.getState().stagedPlan).toBeNull()
  })

  it('executes every tool through the primary collaboration flow', async () => {
    const store = makeStore()
    const tools = createCommonMeshTools(store)
    const assignments = buildRecommendedAssignments(store.getState())

    expect(await byName(tools, 'get_coordination_snapshot').execute({})).toMatchObject({
      ok: true,
      data: {
        coveragePercent: 0,
        currentAssignments: [],
        totals: { resources: 15, availableResources: 15 },
      },
    })
    expect(
      await byName(tools, 'search_needs').execute({ status: 'open' }),
    ).toMatchObject({ ok: true, data: { total: 7, returned: 3 } })
    expect(
      await byName(tools, 'search_resources').execute({
        needId: 'need-van',
        type: 'transport',
        minCapacity: 1,
        maxDistanceKm: 10,
        date: '2026-09-05',
        start: '2026-09-05T08:15:00+02:00',
        end: '2026-09-05T10:15:00+02:00',
      }),
    ).toMatchObject({ ok: true, data: { total: 2, returned: 2 } })
    expect(
      await byName(tools, 'get_resource_details').execute({
        resourceId: 'res-northside-van',
      }),
    ).toMatchObject({ ok: true })
    expect(
      await byName(tools, 'validate_match_plan').execute({ assignments }),
    ).toMatchObject({ ok: true, data: { valid: true } })

    const staged = (await byName(tools, 'stage_match_plan').execute({
      intent: 'Cover every open need',
      assignments,
    })) as ToolResult<{ digest: string }>
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    expect(await byName(tools, 'get_staged_plan').execute({})).toMatchObject({
      ok: true,
      data: {
        digest: staged.data.digest,
        validationStatus: 'valid',
        approvalStatus: 'pending',
        plan: { status: 'staged' },
      },
    })

    expect(
      await byName(tools, 'commit_approved_plan').execute({
        digest: staged.data.digest,
      }),
    ).toMatchObject({ ok: false, error: { code: 'APPROVAL_REQUIRED' } })

    expect(store.approveStagedPlan(staged.data.digest)).toMatchObject({ ok: true })
    expect(
      await byName(tools, 'commit_approved_plan').execute({
        digest: staged.data.digest,
      }),
    ).toMatchObject({ ok: true })

    expect(
      await byName(tools, 'get_activity_log').execute({ limit: 6 }),
    ).toMatchObject({ ok: true })
  })

  it('returns structured errors for malformed and unknown inputs', async () => {
    const store = makeStore()
    const tools = createCommonMeshTools(store)
    const assignments = buildRecommendedAssignments(store.getState())

    expect(await byName(tools, 'stage_match_plan').execute({ intent: 'No plan' })).toMatchObject(
      { ok: false, error: { code: 'INVALID_INPUT' } },
    )
    expect(
      await byName(tools, 'get_resource_details').execute({
        resourceId: 'res-does-not-exist',
      }),
    ).toMatchObject({ ok: false, error: { code: 'RESOURCE_NOT_FOUND' } })
    expect(
      await byName(tools, 'search_needs').execute({ category: 'spaceship' }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(
      await byName(tools, 'search_needs').execute({ date: '2026-02-31' }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(
      await byName(tools, 'search_needs').execute({ unexpected: true }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(
      await byName(tools, 'search_resources').execute({
        start: '09/05/2026 08:00',
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(
      await byName(tools, 'search_resources').execute({ date: '2026-02-31' }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(
      await byName(tools, 'validate_match_plan').execute({
        assignments: assignments.map((assignment, index) =>
          index === 0
            ? { ...assignment, start: '2026-02-31T08:00:00+02:00' }
            : assignment,
        ),
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
    expect(
      await byName(tools, 'validate_match_plan').execute({
        assignments: assignments.map((assignment, index) =>
          index === 0 ? { ...assignment, quantity: 0.5 } : assignment,
        ),
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: 'assignments[0].quantity must be a positive integer.',
      },
    })
  })

  it('does not stage a proposal after the execution is cancelled', async () => {
    const store = makeStore()
    const tool = byName(createCommonMeshTools(store), 'stage_match_plan')
    const controller = new AbortController()
    controller.abort()

    expect(
      await tool.execute(
        {
          intent: 'Cancelled proposal',
          assignments: buildRecommendedAssignments(store.getState()),
        },
        { signal: controller.signal },
      ),
    ).toMatchObject({ ok: false, error: { code: 'STAGE_CANCELLED' } })
    expect(store.getState().stagedPlan).toBeNull()
  })

  it('does not commit after the execution is cancelled during digest verification', async () => {
    let digestCalls = 0
    let releaseCommitDigest: (() => void) | undefined
    let markCommitDigestStarted: (() => void) | undefined
    const commitDigestGate = new Promise<void>((resolve) => {
      releaseCommitDigest = resolve
    })
    const commitDigestStarted = new Promise<void>((resolve) => {
      markCommitDigestStarted = resolve
    })
    const store = new CoordinationStore({
      storage: null,
      now: fixedNow,
      initialState: createSeedState(),
      createDigest: async (revision, assignments) => {
        digestCalls += 1
        if (digestCalls > 1) {
          markCommitDigestStarted?.()
          await commitDigestGate
        }
        return createPlanDigest(revision, assignments)
      },
    })
    const tools = createCommonMeshTools(store)
    const staged = (await byName(tools, 'stage_match_plan').execute({
      intent: 'Cover every open need',
      assignments: buildRecommendedAssignments(store.getState()),
    })) as ToolResult<{ digest: string }>
    expect(staged.ok).toBe(true)
    if (!staged.ok) return
    store.approveStagedPlan(staged.data.digest)

    const controller = new AbortController()
    const committing = byName(tools, 'commit_approved_plan').execute(
      { digest: staged.data.digest },
      { signal: controller.signal },
    )
    await commitDigestStarted
    controller.abort()
    releaseCommitDigest?.()

    expect(await committing).toMatchObject({
      ok: false,
      error: { code: 'COMMIT_CANCELLED' },
    })
    expect(store.getState().committedAssignments).toEqual([])
    expect(store.getState().stagedPlan).toMatchObject({ status: 'approved' })
  })

  it('keeps every read-only tool free of state and persistence side effects', async () => {
    const writes: string[] = []
    const storage = {
      getItem: () => null,
      setItem: (_key: string, value: string) => writes.push(value),
    }
    const store = new CoordinationStore({
      storage,
      now: fixedNow,
      initialState: createSeedState(),
    })
    const tools = createCommonMeshTools(store)
    const before = store.getState()
    const assignments = buildRecommendedAssignments(before)

    await byName(tools, 'get_coordination_snapshot').execute({})
    await byName(tools, 'search_needs').execute({})
    await byName(tools, 'search_resources').execute({ needId: 'need-van' })
    await byName(tools, 'get_resource_details').execute({
      resourceId: 'res-northside-van',
    })
    await byName(tools, 'validate_match_plan').execute({ assignments })
    await byName(tools, 'get_staged_plan').execute({})
    await byName(tools, 'get_activity_log').execute({})

    expect(store.getState()).toBe(before)
    expect(writes).toEqual([])
  })

  it('keeps representative tool results within the recommended context budget', async () => {
    const store = makeStore()
    const tools = createCommonMeshTools(store)
    const assignments = buildRecommendedAssignments(store.getState())
    const results = [
      ['get_coordination_snapshot', await byName(tools, 'get_coordination_snapshot').execute({})],
      ['search_needs', await byName(tools, 'search_needs').execute({ status: 'open' })],
      ['search_resources', await byName(tools, 'search_resources').execute({ needId: 'need-van' })],
      [
        'get_resource_details',
        await byName(tools, 'get_resource_details').execute({
          resourceId: 'res-northside-van',
        }),
      ],
      ['validate_match_plan', await byName(tools, 'validate_match_plan').execute({ assignments })],
      ['get_staged_plan', await byName(tools, 'get_staged_plan').execute({})],
      ['get_activity_log', await byName(tools, 'get_activity_log').execute({})],
    ]

    for (const [name, result] of results) {
      expect(JSON.stringify(result).length, String(name)).toBeLessThanOrEqual(1500)
    }

    const staged = (await byName(tools, 'stage_match_plan').execute({
      intent: 'Cover every open need',
      assignments,
    })) as ToolResult<{ digest: string }>
    expect(JSON.stringify(staged).length, 'stage_match_plan').toBeLessThanOrEqual(
      1500,
    )
    expect(staged.ok).toBe(true)
    if (!staged.ok) return

    const stagedDetails = await byName(tools, 'get_staged_plan').execute({})
    expect(
      JSON.stringify(stagedDetails).length,
      'get_staged_plan with assignments',
    ).toBeLessThanOrEqual(1500)
    store.approveStagedPlan(staged.data.digest)
    const committed = await byName(tools, 'commit_approved_plan').execute({
      digest: staged.data.digest,
    })
    expect(
      JSON.stringify(committed).length,
      'commit_approved_plan',
    ).toBeLessThanOrEqual(1500)

    for (const offset of [0, 3, 6]) {
      const snapshot = await byName(
        tools,
        'get_coordination_snapshot',
      ).execute({ offset })
      expect(
        JSON.stringify(snapshot).length,
        `post-commit snapshot offset ${offset}`,
      ).toBeLessThanOrEqual(1500)
    }

    for (const offset of [0, 3, 6, 9, 12]) {
      const broadResources = await byName(tools, 'search_resources').execute({
        offset,
      })
      expect(
        JSON.stringify(broadResources).length,
        `unfiltered search_resources offset ${offset}`,
      ).toBeLessThanOrEqual(1500)
    }
    for (const resource of store.getState().resources) {
      const resourceDetails = await byName(
        tools,
        'get_resource_details',
      ).execute({ resourceId: resource.id })
      expect(
        JSON.stringify(resourceDetails).length,
        `get_resource_details ${resource.id}`,
      ).toBeLessThanOrEqual(1500)
    }
    for (const need of store.getState().needs) {
      for (const offset of [0, 3, 6, 9, 12]) {
        const compatibleResources = await byName(
          tools,
          'search_resources',
        ).execute({ needId: need.id, offset })
        expect(
          JSON.stringify(compatibleResources).length,
          `search_resources ${need.id} offset ${offset}`,
        ).toBeLessThanOrEqual(1500)
      }
    }
    const populatedActivity = await byName(tools, 'get_activity_log').execute({})
    expect(
      JSON.stringify(populatedActivity).length,
      'populated get_activity_log',
    ).toBeLessThanOrEqual(1500)

    const invalidAssignments = assignments.map((assignment) => ({
      ...assignment,
      resourceId: 'missing-resource',
    }))
    const invalidValidation = await byName(
      tools,
      'validate_match_plan',
    ).execute({ assignments: invalidAssignments })
    expect(
      JSON.stringify(invalidValidation).length,
      'invalid validate_match_plan',
    ).toBeLessThanOrEqual(1500)
    const invalidStage = await byName(tools, 'stage_match_plan').execute({
      intent: 'Invalid plan',
      assignments: invalidAssignments,
    })
    expect(
      JSON.stringify(invalidStage).length,
      'invalid stage_match_plan',
    ).toBeLessThanOrEqual(1500)

    expect(
      await byName(tools, 'validate_match_plan').execute({
        assignments: Array.from({ length: 25 }, () => assignments[0]),
      }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })

    const oversizedId = await byName(tools, 'get_resource_details').execute({
      resourceId: 'x'.repeat(2_000),
    })
    expect(oversizedId).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    })
    expect(JSON.stringify(oversizedId).length).toBeLessThanOrEqual(1500)

    const oversizedUnknownKey = await byName(
      tools,
      'search_needs',
    ).execute({ ['x'.repeat(2_000)]: true })
    expect(oversizedUnknownKey).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    })
    expect(JSON.stringify(oversizedUnknownKey).length).toBeLessThanOrEqual(
      1500,
    )

    const freshStore = makeStore()
    const freshTools = createCommonMeshTools(freshStore)
    const oversizedIntent = await byName(freshTools, 'stage_match_plan').execute({
      intent: 'x'.repeat(2_000),
      assignments: buildRecommendedAssignments(freshStore.getState()),
    })
    expect(oversizedIntent).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    })
    expect(JSON.stringify(oversizedIntent).length).toBeLessThanOrEqual(1500)

    for (const intent of ['\\'.repeat(240), '\0'.repeat(240)]) {
      const escapedIntent = await byName(
        freshTools,
        'stage_match_plan',
      ).execute({
        intent,
        assignments: buildRecommendedAssignments(freshStore.getState()),
      })
      expect(escapedIntent).toMatchObject({
        ok: false,
        error: { code: 'INVALID_INPUT' },
      })
      expect(JSON.stringify(escapedIntent).length).toBeLessThanOrEqual(1500)
    }

    const longestAcceptedIntent = await byName(
      freshTools,
      'stage_match_plan',
    ).execute({
      intent: 'x'.repeat(240),
      assignments: buildRecommendedAssignments(freshStore.getState()),
    })
    expect(longestAcceptedIntent).toMatchObject({ ok: true })
    const longestIntentDetails = await byName(
      freshTools,
      'get_staged_plan',
    ).execute({})
    expect(JSON.stringify(longestIntentDetails).length).toBeLessThanOrEqual(
      1500,
    )
  })

  it('registers every tool with AbortSignal-based lifecycle cleanup', async () => {
    const registered: WebMCPTool[] = []
    let signal: AbortSignal | undefined
    const context = Object.assign(new EventTarget(), {
      registerTool: (tool: WebMCPTool, options?: { signal?: AbortSignal }) => {
        registered.push(tool)
        signal = options?.signal
      },
    }) as WebMCPModelContext
    const lifecycle = new AbortController()

    const result = await registerCommonMeshTools(
      context,
      makeStore(),
      lifecycle.signal,
    )

    expect(result.count).toBe(9)
    expect(registered).toHaveLength(9)
    expect(signal?.aborted).toBe(false)
    lifecycle.abort()
    expect(signal?.aborted).toBe(true)
    result.unregister()
    expect(signal?.aborted).toBe(true)
  })
})
