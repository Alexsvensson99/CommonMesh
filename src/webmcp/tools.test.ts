import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import { buildRecommendedAssignments } from '../domain/coordination'
import type { ToolResult } from '../domain/types'
import { CoordinationStore } from '../store/coordinationStore'
import type { WebMCPModelContext, WebMCPTool } from './types'
import { createCommonMeshTools, registerCommonMeshTools } from './tools'

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
      'set_resource_availability',
      'undo_last_commit',
    ])
    expect(new Set(names).size).toBe(names.length)
    expect(tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(
      true,
    )
    expect(byName(tools, 'search_needs').annotations).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    })
    expect(names).not.toContain('approve_staged_plan')
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
        resourceSummary: { total: 15, available: 15 },
      },
    })
    expect(
      await byName(tools, 'search_needs').execute({ status: 'open' }),
    ).toMatchObject({ ok: true, data: { count: 7 } })
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
    ).toMatchObject({ ok: true, data: { count: 2 } })
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
      await byName(tools, 'get_activity_log').execute({ limit: 50 }),
    ).toMatchObject({ ok: true })
    expect(
      await byName(tools, 'set_resource_availability').execute({
        resourceId: 'res-northside-van',
        unavailable: true,
      }),
    ).toMatchObject({ ok: true })
    expect(await byName(tools, 'undo_last_commit').execute({})).toMatchObject({
      ok: true,
    })
  })

  it('returns structured errors for malformed and unknown inputs', async () => {
    const tools = createCommonMeshTools(makeStore())

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

    const result = await registerCommonMeshTools(context, makeStore())

    expect(result.count).toBe(11)
    expect(registered).toHaveLength(11)
    expect(signal?.aborted).toBe(false)
    result.unregister()
    expect(signal?.aborted).toBe(true)
  })
})
