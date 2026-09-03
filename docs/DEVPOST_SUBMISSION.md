# CommonMesh — Submission Draft

> **Draft status:** Prepared from the current repository on 2026-09-03. Nothing has been sent to Devpost. The repository and public demo are verified; official form fields, current rules, and the final video URL remain open gates.

## Title

**CommonMesh**

## One-line pitch

A WebMCP-native coordination workspace where agents match constrained community needs, humans approve an exact plan, and agents repair disruptions without disturbing commitments that still work.

## Short project pitch

Community events can have enough goodwill and resources but too little coordination capacity. CommonMesh lets a browser agent compare people, equipment, transport, food, and accessible spaces through structured WebMCP tools. The agent can validate and stage a complete plan, but it cannot approve its own work. A human reviews the exact proposal in the shared interface, approves its SHA-256 digest, and only then can the agent commit it. If a resource later fails, CommonMesh identifies the affected assignment and stages a surgical repair while preserving the rest.

## Problem

Coordinating a community event means reconciling quantities, skills, licences, schedules, travel limits, maximum hours, availability, existing commitments, and accessibility requirements. That comparison work is time-consuming, while the resulting decisions can create real obligations for volunteers and shared resources.

A conventional dashboard leaves all comparison work to the organizer. A chatbot layered over the page introduces a different risk: it may infer state from pixels, use unstable controls, or act without a trustworthy link between what a human reviewed and what the system executes. Organizers need agent assistance without giving up authority or visibility.

## Solution

CommonMesh makes the website itself agent-capable. A compatible browser agent receives named tools, strict inputs, stable identifiers, structured results, and corrective error messages. It can inspect the live workspace, search compatible resources, validate assignments, and stage a proposal through the same domain logic and state store used by the human interface.

The human sees projected coverage, assignments, constraints, warnings, travel, volunteer hours, the source revision, and the plan digest. Approval and execution remain separate states:

```text
PROPOSED -> APPROVED -> COMMITTED
            human       agent
```

The agent has no approval, resource-availability, reset, or undo tool. The visible human interface alone can approve the exact digest or change demo resource availability.

## What the demo does

The deterministic **Saturday Community Day** workspace models seven needs and fifteen resources around Riverlight Hall in Gothenburg. The needs include chairs, a cargo van, two setup volunteers, a separately assigned licensed driver, forty vegetarian lunches, an AV kit, and a nearby step-free consultation room. The resource set contains valid choices as well as deliberate failure cases involving capacity, time, distance, and missing skills.

The judging flow demonstrates:

1. A clean workspace with 7 open needs, 15 available resources, and 0% live coverage.
2. An agent inspecting, searching, validating, and staging a plan.
3. A visible `PROPOSED` plan with projected coverage and constraint evidence, but no live commitments.
4. An attempted early commit rejected with `APPROVAL_REQUIRED` and recorded in the activity trail.
5. Human approval of the exact digest, producing `APPROVED — not committed`.
6. Agent commit of that approved digest, producing live assignments and 100% coverage.
7. A human marking the assigned cargo van unavailable, leaving one disrupted assignment and seven active assignments.
8. An agent staging a one-assignment repair that reports **7 existing assignments preserved** and **1 assignment replaced**.
9. A second human approval and agent commit restoring 100% live coverage.

The detailed recording plan is in [`DEMO_VIDEO_SCRIPT.md`](DEMO_VIDEO_SCRIPT.md).

## Why WebMCP is central

WebMCP is the product's collaboration layer, not a decorative integration. CommonMesh registers nine imperative tools with `document.modelContext.registerTool(...)`:

| Capability | Role |
| --- | --- |
| `get_coordination_snapshot` | Read event state, coverage, revisions, assignments, and staged-plan state |
| `search_needs` | Filter needs by text, category, urgency, date, or live status |
| `search_resources` | Compare resources by need compatibility, capability, distance, capacity, availability, and time |
| `get_resource_details` | Inspect one resource's limits, skills, availability, and commitments |
| `validate_match_plan` | Dry-run the complete or targeted plan against domain rules |
| `stage_match_plan` | Validate, hash, and display a proposal for human review |
| `get_staged_plan` | Read the exact proposal, digest, revision, validation, and approval state |
| `commit_approved_plan` | Commit only the exact human-approved digest |
| `get_activity_log` | Read the shared human, agent, and system activity trail |

Seven tools are read-only and two can write. Every input schema rejects additional properties, while runtime parsers and domain validation remain authoritative. Read tools are state-pure, list-heavy results are paginated, and community-authored text is marked as untrusted content. Tool registration follows the React lifecycle through an `AbortSignal`.

This is materially different from DOM automation: the agent reads domain state directly, uses stable IDs, receives structured failures, and updates the same visible store and audit trail as the human.

## Human approval and safety model

- Plans are normalized and validated before staging.
- The SHA-256 digest binds the normalized assignments to the coordination revision the plan was built against.
- Only the visible human UI can create an approval record.
- Staging a changed proposal clears any earlier approval.
- A resource change makes a pending proposal stale and clears its approval.
- Commit checks the supplied digest, approval digest, current revision, plan validity, and replay state.
- Commit recomputes the digest immediately before mutation.
- Missing approval, digest mismatch, stale state, tampering, invalid plans, cancellation, and replay return structured errors.
- Blocked and successful writes appear in the visible Human + Agent Activity trail.
- State-changing operations are transactional with respect to browser persistence: if storage fails, the visible state is not advanced.

This competition build demonstrates the interaction and authorization model within one browser session. It does not claim to provide production identity, server-side authorization, or multi-user security.

## Key features

- Constraint-aware matching across quantities, skills, licences, time windows, distance, maximum hours, and overbooking.
- Partial contributions for splittable needs, while indivisible needs require a fully capable resource.
- Shared React UI and WebMCP state with no hidden agent-only implementation.
- Exact-digest human approval separated from agent execution.
- Stale-plan, tamper, replay, and persistence-failure protection.
- Selective repair that replaces only assignments for affected needs.
- Visible lifecycle, metrics, validation, and actor-labelled activity history.
- Deterministic seeded state and confirmed reset for repeatable judging.
- Human-only failure simulation and reset controls.
- Responsive desktop, tablet, and mobile layouts; the desktop layout is the primary judging surface.

## Architecture and technology

```text
Human React UI ---------+
                        +--> CoordinationStore --> domain validation
WebMCP tool layer ------+          |               approval and audit rules
                                   +--> versioned browser localStorage
```

- **UI:** React 19, React DOM, and Lucide icons.
- **Language and build:** TypeScript 6 and Vite 8.
- **Domain layer:** typed needs, resources, assignments, constraints, validation results, staged plans, approvals, and activity outcomes.
- **State:** one reactive `CoordinationStore` shared by the UI and WebMCP tools.
- **Persistence:** structurally validated, versioned browser `localStorage` with a deterministic reset state.
- **Trust binding:** native Web Crypto SHA-256 over normalized assignments and the source revision.
- **Agent interface:** the current imperative WebMCP registration API.
- **Quality tooling:** Vitest and Oxlint, plus TypeScript build/type checking.
- **Backend:** none in this prototype; no model or inference API is embedded in the app.

## Implementation challenges and learnings

### A schema is a contract, not authorization

JSON Schema makes tool inputs legible to an agent, but hints cannot enforce business rules. CommonMesh therefore parses bounded inputs at runtime and runs every plan through the same domain validator used by the UI.

### Approval must survive mutable state

A generic confirmation dialog would not prove that execution matches what the human reviewed. Binding approval to both normalized assignments and a source revision makes changed or stale work rejectable at commit time.

### Recovery should preserve good work

Replacing an entire plan after one failure would create unnecessary churn. Validation identifies the needs targeted by a repair, preserves committed assignments for all other needs, and reports the replacement impact explicitly.

### Agent and human surfaces need one source of truth

Separate implementations would make the demo easy to desynchronize. Routing both surfaces through one store means staged plans, approvals, commitments, failures, and activity are immediately visible to both.

### Failures are part of the product experience

`APPROVAL_REQUIRED`, stale-state rejection, digest mismatch, cancellation, malformed persisted state, and storage failure are intentional, testable states with a next action—not silent edge cases.

## Potential impact

CommonMesh is aimed at community organizers coordinating volunteers and shared local capacity. The prototype shows how an agent can reduce comparison work while a coordinator retains control over commitments affecting people, vehicles, food, equipment, and accessible space. Its selective-repair model also shows how coordination can continue when one resource fails instead of discarding unaffected work.

The current evidence is prototype evidence: a concrete scenario, repeatable workflow, structured safeguards, automated tests, local product-state captures, and a documented public in-app-browser WebMCP evaluation in the repository. It does **not** establish adoption, time savings, or real-world organizational outcomes.

Production deployment would require server-side identity and authorization, privacy controls, multi-user synchronization, notifications, and integrations with real inventory or volunteer systems.

## Judging evidence map

The category names below follow the repository's current judging checklist. Re-check the live official rules and form immediately before submission.

| Category | Strongest repository evidence | Honest boundary |
| --- | --- | --- |
| **WebMCP Leverage** | Nine purpose-built tools carry the full inspect -> search -> validate -> stage -> approve -> commit -> audit workflow; schemas, runtime parsing, annotations, pagination, lifecycle cleanup, and structured failures are implemented | WebMCP requires a compatible browser; the repo does not contain a separate model-behavior benchmark harness |
| **Execution** | A coherent shared workspace, explicit lifecycle, deterministic reset, responsive UI, public build, local screenshots, automated domain/store/tool tests, and a documented end-to-end run through the public WebMCP transport | The final recorded demo remains an open gate |
| **Potential Impact** | A specific organizer audience, realistic cross-category constraints, inspectable actions, and continuity through selective repair | No production deployment, user research, adoption, or outcome metrics are claimed |
| **Creativity & Ambition** | The website is an agent-capable coordination system rather than a chatbot; exact-digest governance and surgical recovery are part of the domain model | Matching, volunteer platforms, and approval workflows are not claimed as individually novel |

## Testing and evidence

Run the complete local quality gate:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The repository's [`WEBMCP_EVALS.md`](WEBMCP_EVALS.md) records a 2026-09-03 public in-app-browser verification covering all nine live tool registrations, discovery, validation, staging, a blocked pre-approval commit, human approval, exact-digest commit, disruption, selective repair, a second commit, and persisted reset after reload. It explicitly leaves a recorded single-prompt model rehearsal as a separate submission gate.

### Existing screenshot evidence

1. [`01-overview.png`](screenshots/01-overview.png) — clean state: 7 open needs, 15 available resources, 0% coverage, and no staged plan.
2. [`02-agent-proposed-plan.png`](screenshots/02-agent-proposed-plan.png) — agent proposal with 100% projected coverage, eight assignments, metrics, and all constraints satisfied.
3. [`03-human-approved-plan.png`](screenshots/03-human-approved-plan.png) — exact plan approved while live coverage remains 0%, proving approval is not execution.
4. [`04-repair-plan.png`](screenshots/04-repair-plan.png) — one disrupted assignment, seven active assignments, and a proposed one-assignment repair preserving seven.
5. [`05-committed-plan.jpg`](screenshots/05-committed-plan.jpg) — approved repair committed with 7/7 needs covered, 100% coverage, and eight active assignments.

## Links

- **Repository:** [github.com/Alexsvensson99/CommonMesh](https://github.com/Alexsvensson99/CommonMesh) — verified public on 2026-09-03.
- **Public demo:** [commonmesh.itsjustmeal3x.chatgpt.site](https://commonmesh.itsjustmeal3x.chatgpt.site) — the full WebMCP workflow and persisted reset were verified in the in-app browser on 2026-09-03.
- **Demo video:** **[PLACEHOLDER — record the verified 2–3 minute flow, upload it, and insert the public video URL]**
- **Challenge page:** [webmcp.devpost.com](https://webmcp.devpost.com/)
- **License:** [MIT](../LICENSE)

## Build-process disclosure

**[AUTHOR CONFIRMATION REQUIRED]** The repository does not by itself establish which design, implementation, debugging, testing, or writing tasks were completed with Codex or another AI system. If the official form asks, add a short factual account based on the actual work history; do not infer it from commit messages or the finished code.

## Known limitations

- Client-side, single-browser prototype; the public static demo has no production server trust boundary.
- Browser persistence is local to one origin and browser profile.
- Live WebMCP execution depends on ChatGPT's in-app browser or a compatible Chrome build.
- Seeded data is deterministic demonstration data, not a live community directory.
- No real organization, user study, time-saving measurement, or adoption result is claimed.
- The repository documents an end-to-end public tool-transport run, but the final one-prompt recording has not yet been added.

## Submission readiness checklist

- [x] Keep project claims traceable to code, tests, repository docs, or product-state captures.
- [x] Prepare a concise product story, technical explanation, evidence map, screenshot list, and timed demo script.
- [x] Include the configured repository remote without claiming its public visibility was verified.
- [ ] **Verify the current official rules, eligibility, deadline, judging wording, and exact form fields on Devpost.**
- [x] Verify that the repository is publicly accessible without authentication.
- [x] Deploy and verify a free, unrestricted public demo in the WebMCP-capable browser.
- [x] Run the complete quality gate on the deployed source commit: lint, typecheck, 40 tests, and production build all pass.
- [ ] **Rehearse and record the real browser-agent flow from the mission prompt.**
- [ ] **Upload the video, verify public playback, and replace the video placeholder.**
- [x] Verify the full public transport flow: discovery, validation, staging, blocked commit, approval, commit, failure, selective repair, second commit, activity, and persisted reset.
- [ ] **Confirm the factual build-process/AI-assistance disclosure if the form asks for it.**
- [ ] **Copy only fields actually requested by the live form; leave no placeholders in the final entry.**

## TODO — official form fields

The live Devpost form was not queried during this documentation pass. Add only fields actually present in the current official form.

- **[PLACEHOLDER — official project description field, if separate]**
- **[PLACEHOLDER — Built With / technology field, if requested]**
- **[PLACEHOLDER — team member details, if requested]**
- **[PLACEHOLDER — AI/Codex disclosure, if requested and author-confirmed]**
- **[PLACEHOLDER — any required repository, demo, image, or video fields]**
