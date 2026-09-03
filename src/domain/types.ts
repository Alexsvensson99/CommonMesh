export type NeedCategory =
  | 'equipment'
  | 'transport'
  | 'people'
  | 'food'
  | 'space'

export type ActivityActor = 'agent' | 'human' | 'system'

export type ActivityOutcome = 'success' | 'failed' | 'info'

export type Availability = {
  start: string
  end: string
  status: 'available' | 'unavailable'
}

export type Constraint =
  | { type: 'required_skill'; value: string }
  | { type: 'capacity'; value: number; unit: string }
  | { type: 'maximum_hours'; value: number }
  | { type: 'maximum_distance_km'; value: number }
  | { type: 'availability'; start: string; end: string }

export type Need = {
  id: string
  title: string
  description: string
  category: NeedCategory
  quantity: number
  unit: string
  location: string
  date: string
  latitude?: number
  longitude?: number
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
  type: NeedCategory
  capacity: number
  unit: string
  owner: string
  distanceKm: number
  availability: Availability
  maxHours: number | null
  skills: string[]
}

export type Assignment = {
  needId: string
  resourceId: string
  quantity: number
  start: string
  end: string
}

export type AssignmentInput = Assignment

export type CommittedAssignment = Assignment & {
  planId: string
  committedAt: string
}

export type Approval = {
  digest: string
  approvedAt: string
  approvedBy: 'human-ui'
}

export type PlanApproval = Approval

export type MatchPlan = {
  intent: string
  assignments: Assignment[]
}

export type StagedPlanStatus = 'staged' | 'approved' | 'committed'

export type StagedPlan = MatchPlan & {
  id: string
  digest: string
  sourceRevision: number
  createdAt: string
  proposedBy: 'agent' | 'human'
  status: StagedPlanStatus
  approval: PlanApproval | null
}

export type ActivityLogEntry = {
  id: string
  actor: ActivityActor
  outcome: ActivityOutcome
  action: string
  summary: string
  timestamp: string
  detail?: string
}

export type ActivityEntry = ActivityLogEntry

export type UndoFrame = {
  planId: string
  digest: string
  previousAssignments: CommittedAssignment[]
  createdAt: string
}

export type CoordinationState = {
  schemaVersion: 2
  eventName: string
  eventDate: string
  hubLocation: string
  maxDistanceKm: number
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
  uncoveredNeeds: Array<{
    needId: string
    title: string
    requiredQuantity: number
    coveredQuantity: number
    remainingQuantity: number
    unit: string
  }>
  conflicts: PlanValidationIssue[]
  constraintViolations: PlanValidationIssue[]
  coverage: {
    needsTotal: number
    needsFullyCovered: number
    percentage: number
  }
  metrics: {
    assignmentCount: number
    needsTargeted: number
    uniqueResources: number
    totalTravelKm: number
    estimatedVolunteerHours: number
    preservedAssignments: number
    replacedAssignments: number
  }
  summary: {
    assignmentCount: number
    needsTargeted: number
    needsFullyCovered: number
    totalTravelKm: number
    estimatedVolunteerHours: number
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
  openNeeds: NeedWithStatus[]
  currentAssignments: CommittedAssignment[]
  resourceSummary: {
    total: number
    available: number
    unavailable: number
    assigned: number
  }
  stagedPlanStatus: {
    id: string
    digest: string
    status: StagedPlanStatus
    stale: boolean
  } | null
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
