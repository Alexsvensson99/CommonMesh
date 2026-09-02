# CommonMesh

> An agent-native coordination workspace where people and AI agents match community needs with available skills, equipment, transport, food, and spaces.

CommonMesh is a new open-source project built for the **2026 WebMCP Challenge**. It demonstrates a complete human-agent workflow over shared browser state: discover, compare, validate, stage, approve, commit, detect a resource failure, and repair only the affected assignments.

The application is intentionally not a chatbot. CommonMesh owns the data, rules, state, and actions. A WebMCP-enabled browser agent supplies the reasoning and interacts through structured tools registered directly on `document.modelContext`.

## Why this is a strong WebMCP use case

Community coordination is a constraint problem, not a form-filling problem. A useful solution may need to combine several resources while respecting:

- availability and overlapping time windows;
- quantities and capacity;
- required skills or licences;
- maximum volunteer hours;
- travel distance;
- existing commitments; and
- explicit human authority over real-world commitments.

Screen scraping or DOM automation forces an agent to infer all of this from presentation. CommonMesh exposes the underlying capabilities and identifiers as strict, self-describing WebMCP tools. The human still sees every staged change in the same UI and owns the one action the agent cannot perform: approval.

```text
Human UI ───────┐
                ├── shared CoordinationStore ── validation + audit log
WebMCP tools ───┘                 │
                                  └── browser localStorage
```

Both interaction paths invoke the same domain functions. There is no hidden agent-only state and no second implementation to drift out of sync.

## The Riverlight demo

The deterministic demo workspace represents a Saturday community event with six needs:

- 20 folding chairs;
- a cargo van and licensed driver;
- two event volunteers, each limited to a three-hour shift;
- 40 vegetarian lunch portions;
- a projector and screen; and
- a nearby step-free consultation room.

Thirteen seeded resources offer multiple possible matches with deliberately different constraints. No external API, account, database, or network connection is required, so every judge starts from the same scenario.

## WebMCP tool catalogue

CommonMesh registers 11 tools with the current imperative API:

```ts
await document.modelContext.registerTool(tool, { signal })
```

| Tool | Purpose | State effect |
| --- | --- | --- |
| `get_coordination_snapshot` | Read event totals, live need statuses, revision, and staged state | Read only |
| `search_needs` | Filter needs by query, category, urgency, and status | Read only; returns untrusted listing text |
| `search_resources` | Find resources and calculate need-compatibility signals | Read only; returns untrusted listing text |
| `get_resource_details` | Inspect one resource, its constraints, and commitments | Read only; returns untrusted listing text |
| `validate_match_plan` | Dry-run assignments against all domain constraints | Read only |
| `stage_match_plan` | Validate, hash, and display a plan for human review | Stages only; never commits |
| `get_staged_plan` | Read the exact digest, revision, and approval state | Read only |
| `commit_approved_plan` | Commit only an exact human-approved digest | Mutating and approval-gated |
| `get_activity_log` | Read the visible human-agent audit trail | Read only |
| `set_resource_availability` | Change a demo resource and trigger disruption detection | Mutating |
| `undo_last_commit` | Restore the exact assignment state from before the last commit | Mutating and reversible |

Every input uses a strict JSON Schema with `additionalProperties: false`. Every execution path also performs runtime validation and returns structured success or error objects with stable codes and a useful next action.

Read tools carry `readOnlyHint: true`. Tools that return community-authored descriptions also carry `untrustedContentHint: true`, making the trust boundary explicit to the agent.

## Human approval and security model

The approval gate is part of the domain model, not a disabled button:

1. `stage_match_plan` validates and normalizes every assignment.
2. CommonMesh generates a deterministic SHA-256 digest from the normalized plan and current coordination revision.
3. The visible UI shows that exact plan and digest.
4. Approval is available only in the human UI; no WebMCP approval tool exists.
5. The approval record is bound to that exact digest.
6. `commit_approved_plan` rejects missing approval, a changed digest, stale state, an invalid plan, or replay of a consumed plan.
7. The audit trail records the attempt and outcome.
8. The latest commit is reversible with `undo_last_commit`.

Additional safeguards:

- Resource changes increment a revision, automatically making earlier staged plans stale.
- A repair plan replaces assignments only for the needs it targets; unaffected commitments are preserved.
- Community listing descriptions are treated as untrusted data, never executable instructions.
- The demo stores no credentials or personal data and makes no third-party requests.
- WebMCP tools are lifecycle-bound with `AbortSignal` cleanup when the React surface unmounts.

## Technology stack

- React 19
- TypeScript 6
- Vite 8
- Vitest
- Oxlint
- Lucide React icons
- Native Web Crypto for SHA-256 plan digests
- Native `document.modelContext.registerTool(...)` WebMCP integration
- Browser-local persistence through `localStorage`

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. State persists in the browser until you use the reset control in the top bar.

### Verification commands

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

The tests exercise every WebMCP tool and explicitly cover malformed inputs, unavailable resources, constraint failures, digest mismatch, missing approval, stale plans, consumed-plan replay, selective repair, undo, and deterministic reset.

## Judge testing instructions

Use either:

- ChatGPT's in-app browser, which supports WebMCP; or
- Google Chrome 149 or later with `chrome://flags/#enable-webmcp-testing` enabled, followed by a browser restart.

After opening CommonMesh, the status pill in the top bar should read **WebMCP live · 11 tools**.

Give the browser agent this prompt:

> Inspect the coordination snapshot. Cover every open need for Saturday's Riverlight Community Day using resources within 10 km. Respect availability, quantities, skills, time windows, and maximum hours. Validate the complete plan and stage it for my review. Do not commit anything until I approve the exact plan in CommonMesh.

The page should visibly update as the agent calls read tools, validates assignments, and stages a plan. Ask the agent to commit before clicking approval: it must receive `APPROVAL_REQUIRED`. Review the visible plan, click **Approve exact plan**, then ask the agent to commit that digest.

To inspect the API directly from a WebMCP-enabled browser console:

```js
const tools = await document.modelContext.getTools()
tools.map(({ name, description }) => ({ name, description }))
```

## Suggested demo script (under three minutes)

1. **0:00–0:20 · The problem** — show six open needs and thirteen constrained resources.
2. **0:20–0:45 · Structured discovery** — give the prompt and let the agent inspect the snapshot, needs, and resources.
3. **0:45–1:15 · Reason and validate** — show tool calls appearing in the live activity trail and the agent validating seven assignments.
4. **1:15–1:35 · Human authority** — let the first commit fail with `APPROVAL_REQUIRED`; approve the exact digest in the UI; let the agent commit it.
5. **1:35–2:05 · Reality changes** — mark the assigned Northside cargo van unavailable. Coverage drops and the transport need becomes disrupted.
6. **2:05–2:30 · Surgical repair** — ask the agent to preserve working assignments and repair only transport with the backup van. Validate, stage, approve, and commit the one-assignment repair.
7. **2:30–2:45 · Trust summary** — point to the audit trail, hash binding, stale-plan protection, and reversible commit.

## Project structure

```text
src/
├── data/                 deterministic Riverlight seed scenario
├── domain/               types, status derivation, matching rules, SHA-256
├── store/                shared reactive state, persistence, approval workflow
├── webmcp/               API types, tool definitions, registration lifecycle
├── App.tsx               responsive product interface
└── App.css               visual system and responsive layout
```

## Current scope

CommonMesh is a competition-ready client-side demonstration of the interaction and trust model. It does not yet contact volunteers, reserve third-party assets, or provide multi-user server synchronization. Those actions would require identity, authorization, privacy, notification, and conflict-resolution work beyond this deterministic demo.

## Challenge references

- [The WebMCP Challenge](https://webmcp.devpost.com/)
- [Official challenge rules](https://webmcp.devpost.com/rules)
- [Chrome WebMCP imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [WebMCP security guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)

## License

CommonMesh is available under the [MIT License](LICENSE).
