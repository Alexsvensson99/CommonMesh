# CommonMesh Judging Checklist

This checklist maps the current repository to the four equally weighted Stage Two criteria in the [official WebMCP Challenge rules](https://webmcp.devpost.com/rules). It is an evidence summary, not a predicted score.

## 1. WebMCP Leverage

Official question: does the project use WebMCP thoroughly and skillfully through a working, non-trivial implementation?

### Evidence

- CommonMesh registers nine imperative WebMCP tools through `document.modelContext.registerTool(...)`.
- Seven tools read state or validate without mutation; two tools stage or commit a plan.
- Tools cover the complete agent workflow: inspect, search, compare, validate, stage, read staged state, commit an approved digest, and inspect activity.
- Tool inputs use explicit JSON Schemas with `additionalProperties: false`.
- Runtime parsers and the domain layer revalidate all inputs instead of relying on schemas as enforcement.
- Read operations use `readOnlyHint`, are state-pure, and return compact results; list-heavy outputs are paginated. Tools returning community-authored descriptions use `untrustedContentHint`.
- Tool registration is bound to an `AbortSignal` and cleaned up with the React lifecycle.
- Agent and human actions use the same `CoordinationStore`, so tool calls update the visible product state and audit trail.
- Structured failures include stable codes and a useful next action.
- Human approval, resource-failure, and reset capabilities are deliberately absent from the WebMCP catalogue. No undo tool is exposed.

### Current limitation

WebMCP is still browser-dependent and experimental. CommonMesh detects unsupported browsers and keeps the human UI usable, but live tool execution must be judged in ChatGPT's in-app browser or a compatible Chrome build. The repository has deterministic integration tests and a documented evaluation matrix, not a separate model-behavior evaluation harness.

### Assessment

Strong evidence. WebMCP is the primary agent interaction mechanism and carries the full non-trivial workflow rather than decorating a conventional UI.

## 2. Execution

Official question: is this a working, runnable project with a complete and coherent product experience rather than only a technical proof of concept?

### Evidence

- The application has a coherent dashboard for one deterministic event: Saturday Community Day.
- The first viewport communicates needs, covered needs, available resources, coverage, plan state, and the human approval boundary.
- The staged-plan surface shows assignments, constraints, warnings, efficiency metrics, a SHA-256 digest, and an explicit PROPOSED → APPROVED → COMMITTED lifecycle.
- Human approval and agent commit are visibly separate operations.
- The failure demo identifies only the assignment that depends on the unavailable van.
- The repair plan reports seven existing assignments preserved and one assignment replaced.
- Reset Demo has a confirmation step and persists the restored seed state.
- Persisted state and lifecycle relationships are validated, public state snapshots are deeply frozen, and state-changing operations remain unchanged when storage rejects a write.
- The activity trail differentiates Human, Agent, and System actors plus succeeded, blocked, and informational outcomes.
- The WebMCP Tools dialog lists every exposed tool with its purpose and read/write status.
- Empty, invalid, stale, missing-approval, unavailable-resource, unsupported-browser, and filtered-no-result states have intentional user-facing copy.
- Desktop is the primary layout; tablet and mobile layouts reflow without removing core functions.
- Automated tests cover the domain, store, and tool registration/flow.

### Current limitation

The project is a client-side deterministic demo. The repository includes local product-state captures through a committed repair, but a publicly accessible hosted build and submission video remain separate submission gates.

### Assessment

Strong local execution, subject to providing judges a working hosted or packaged test link as required by the official rules.

## 3. Potential Impact

Official question: does the project make a credible and specific case for a real audience and demonstrate that it addresses the stated problem?

### Evidence

- The target audience is concrete: community organizers coordinating volunteers, equipment, transport, food, and accessible space.
- The demo models real constraints including quantities, licences, availability windows, maximum hours, travel distance, overbooking, and existing commitments.
- Splittable needs can combine partial contributions while indivisible needs still require a fully capable resource.
- The workflow reduces comparison work while retaining human control over commitments that affect people and shared resources.
- Selective repair demonstrates continuity: one failed resource does not invalidate unrelated work.
- Structured results and an audit trail make agent actions inspectable by coordinators.

### Current limitation

The demo does not prove adoption, time savings, or outcomes in a live organization. Production use would need identity, server-side authorization, privacy controls, multi-user synchronization, notifications, and integrations with real inventory or volunteer systems.

### Assessment

Credible problem-solution fit at prototype scale. Impact is demonstrated through the scenario and interaction model, not through production evidence.

## 4. Creativity & Ambition

Official question: is the concept creative or novel, and does it differ from existing concepts?

### Evidence

- CommonMesh is not an embedded chatbot. It treats the website as an agent-capable coordination system with explicit domain tools.
- The human approval boundary is part of the data model and execution path, not a confirmation message added by the agent.
- The same visible workspace supports initial planning, blocked execution, resource failure, and surgical repair.
- Plan digests and revisions make approval exact and stale state visible; commit recomputes the digest before mutation.
- The project combines community resource matching, agent planning, human governance, disruption detection, and selective repair in one focused workflow.

### Current limitation

CommonMesh does not claim that matching systems, volunteer platforms, or approval workflows are individually new. Its distinctive contribution is the combination and the use of WebMCP as the structured collaboration layer.

### Assessment

Distinctive and appropriately ambitious for the challenge while remaining demonstrable in one short end-to-end scenario.

## Rules and readiness notes

- The rules require a working project to remain available to judges free of charge and without restriction during judging.
- Judges may evaluate from the submission text, images, and video without running the project, so those materials must make the lifecycle and repair workflow understandable on their own.
- The repository should be paired with a verified public demo link and a concise browser-agent video before submission readiness is claimed.
- The repeatable tool-flow checks and evidence boundaries are documented in [`WEBMCP_EVALS.md`](WEBMCP_EVALS.md).

## Primary references

- [Official WebMCP Challenge rules and judging criteria](https://webmcp.devpost.com/rules)
- [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
- [Chrome WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
