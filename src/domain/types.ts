export type NeedCategory =
  | 'equipment'
  | 'transport'
  | 'people'
  | 'food'
  | 'space'

export type ActivityActor = 'agent' | 'human' | 'system'

export type Need = {
  id: string
  title: string
  description: string
  category: NeedCategory
  quantity: number
  unit: string
  location: string
  start: string
  end: string
  urgency: 'standard' | 'high'
  requiredSkills: string[]
  createdBy: string
}

export type Resource = {
  id: string
  name: string
  description: string
  category: NeedCategory
  capacity: number
  unit: string
  owner: string
  distanceKm: number
  availableStart: string
  availableEnd: string
  maxHours: number | null
  skills: string[]
  unavailable: boolean
}

export type AssignmentInput = {
  needId: string
  resourceId: string
  quantity: number
  start: string
  end: string
}

export type CommittedAssignment = AssignmentInput & {
  planId: string
  committedAt: string
}

export type PlanApproval = {
  digest: string
  approvedAt: string
  approvedBy: 'human-ui'
}

export type StagedPlanStatus = 'staged' | 'approved' | 'committed'

export type StagedPlan = {
  id: string
  digest: string
  intent: string
  assignments: AssignmentInput[]
  sourceRevision: number
  createdAt: string
  status: StagedPlanStatus
  approval: PlanApproval | null
}

export type ActivityEntry = {
  id: string
  actor: ActivityActor
  action: string
  summary: string
  timestamp: string
  detail?: string
}

export type UndoFrame = {
  planId: string
  digest: string
  previousAssignments: CommittedAssignment[]
  createdAt: string
}

export type CoordinationState = {
  schemaVersion: 1
  eventName: string
  eventDate: string
  hubLocation: string
  resourceRevision: number
  needs: Need[]
  resources: Resource[]
  committedAssignments: CommittedAssignment[]
  stagedPlan: StagedPlan | null
  activity: ActivityEntry[]
  lastCommit: UndoFrame | null
}

export type PlanValidationIssue = {
  code: string
  message: string
  assignmentIndex?: number
  needId?: string
  resourceId?: string
}

export type PlanValidationResult = {
  valid: boolean
  errors: PlanValidationIssue[]
  warnings: PlanValidationIssue[]
  summary: {
    assignmentCount: number
    needsTargeted: number
    needsFullyCovered: number
    totalTravelKm: number
  }
}

export type NeedStatus = 'open' | 'covered' | 'disrupted'

export type NeedWithStatus = Need & {
  status: NeedStatus
  committedQuantity: number
  availableCommittedQuantity: number
}

export type CoordinationSnapshot = {
  event: {
    name: string
    date: string
    location: string
  }
  revision: number
  totals: {
    needs: number
    open: number
    covered: number
    disrupted: number
    resources: number
    availableResources: number
  }
  coveragePercent: number
  stagedPlan: StagedPlan | null
  needs: NeedWithStatus[]
}

export type ToolResult<T> =
  | {
      ok: true
      data: T
      nextAction?: string
    }
  | {
      ok: false
      error: {
        code: string
        message: string
        details?: unknown
      }
      nextAction?: string
    }
