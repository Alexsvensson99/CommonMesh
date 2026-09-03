# CommonMesh — 2:50 Demo Video Script

> **Recording status:** Script ready; final video URL is **[PLACEHOLDER — not recorded/uploaded in this pass]**. Target runtime is 2:50, with an acceptable final cut of 2:35–2:59. Trim agent wait time, not evidence states.

## Recording setup

- Record in ChatGPT's in-app browser or a compatible Chrome build with the CommonMesh app and agent conversation both visible when practical.
- Use the deployed URL only after it has been opened and verified. Until then use the local Vite URL printed by `npm run dev`.
- Hide notifications, account details, tokens, unrelated tabs, and developer secrets.
- Keep browser zoom and capture framing large enough to read status labels, metrics, the digest state, and structured tool errors.
- Do not use **Stage sample plan** or **Stage repair** during the recorded agent path. Those are human demo shortcuts; the recording should show the agent staging through WebMCP.
- Cuts may remove model thinking or network latency. Do not cut across a state transition in a way that implies an action occurred before it did.

## Preflight — before recording

1. Run the complete quality gate on the exact commit to be shown.
2. Open CommonMesh in the WebMCP-capable judge environment.
3. Confirm the top status reads **WebMCP live · 9 tools**.
4. Rehearse the full sequence once. Verify that the initial plan has eight assignments and uses the **Northside cargo van**, so the fixed human failure control produces the documented seven-preserved/one-replaced repair.
5. If the agent produces another valid plan, do not mislabel it as the documented deterministic path. Reset and repeat the mission with this transparent addition: **“For this resilience demonstration, use the Northside cargo van if it validates.”**
6. After rehearsal, click **Reset Demo**, confirm **Reset Demo** in the dialog, and verify the reset checkpoint below.

## Exact prompts

### Mission prompt

```text
Inspect the coordination snapshot. Cover every open need for Saturday Community Day using resources within 10 km. Respect availability, quantities, skills, time windows, and maximum hours. Validate the complete plan and stage it for my review. Do not commit anything until I approve the exact plan in CommonMesh.
```

### Deliberate early-commit prompt

```text
Attempt to commit the currently staged plan with its exact digest before I approve it. Do not change or restage the plan. Report the structured result.
```

### Approved-plan commit prompt

```text
I have approved the staged plan in CommonMesh. Commit only that exact approved digest, then report the live coverage.
```

### Repair prompt

```text
Inspect the current coordination snapshot. Repair only the disrupted cargo-van need, preserve every unaffected committed assignment, validate the smallest valid repair, and stage it for my review. Do not commit until I approve the exact repair digest.
```

### Approved-repair commit prompt

```text
I have approved the repair in CommonMesh. Commit only that exact approved repair digest, then report the final live coverage and preserved assignment count.
```

## Timed shot and narration script

### 0:00–0:10 — Reset and start checkpoint

**Operator:** Start on the overview immediately after the confirmed reset. Briefly pan across the top metrics and the Plan review empty state.

**Required visible checkpoint:**

- `WebMCP live · 9 tools`
- 7 needs, 0 covered
- 15 available resources
- 0% coordination coverage
- 0 active assignments
- no staged plan, approval, or commitments

**Narration:**

> “This is CommonMesh: a WebMCP-native workspace for community coordination. We begin from a deterministic reset—seven open needs, fifteen available resources, and no plan or commitments.”

**Stop condition:** If WebMCP is still detecting, unavailable, or reports any count other than nine, stop the take and fix the environment. Do not describe tools as live.

### 0:10–0:27 — State the problem and product idea

**Operator:** Keep the event overview, needs, and resource mesh visible.

**Narration:**

> “An organizer must reconcile quantities, skills, licences, schedules, travel, and accessibility. The agent handles that comparison work, while CommonMesh keeps every real-world commitment visible and human-controlled.”

### 0:27–0:41 — Show the WebMCP surface

**Operator:** Open **Tools** / **View tool catalogue**. Hold on the registration status and tool list, then close it.

**Required visible checkpoint:** nine capabilities, `7 read · 2 write`, and **No approval tool is exposed.**

**Narration:**

> “Nine structured tools expose the domain directly: seven reads and two writes. The agent can inspect, validate, stage, and commit—but approval, reset, and resource availability remain human-only.”

### 0:41–1:01 — Agent builds and stages the plan

**Operator:** Paste the exact **Mission prompt**. Show a quick sequence of real tool calls or their structured results: snapshot, search, validation, and `stage_match_plan`. Cut only idle thinking time. Return to CommonMesh when the plan appears.

**Narration:**

> “The agent reads stable identifiers and structured constraints instead of guessing from pixels. It validates the assignments, then stages—not executes—the proposal through the same state store used by the interface.”

### 1:01–1:20 — Inspect the proposal

**Operator:** Frame **Agent Proposed Plan**, the `PROPOSED` lifecycle state, 100% projected coverage, eight assignments, constraint status, source revision, and digest. Scroll just enough to show the approval box.

**Required visible checkpoint:** `PROPOSED`, 100% projected coverage, eight assignments, **All constraints satisfied**, **Human approval required**, and 0% live coverage.

**Narration:**

> “The proposal covers every need and exposes its assignments, metrics, revision, validation, and SHA-256 digest. Notice that projected coverage is one hundred percent while live coverage is still zero. Nothing has executed.”

### 1:20–1:36 — Prove the boundary with a blocked commit

**Operator:** Send the exact **Deliberate early-commit prompt**. Show the tool result and then the failed entry in **Human + agent activity**.

**Required visible checkpoint:** structured error code `APPROVAL_REQUIRED`; assignments and live coverage remain unchanged; blocked activity is visible.

**Narration:**

> “Even when explicitly asked to commit early, the domain layer rejects the write with APPROVAL_REQUIRED and records the blocked attempt. The agent cannot approve itself.”

### 1:36–1:55 — Human approval, then agent commit

**Operator:** In CommonMesh, click **Approve Plan**. Hold on `APPROVED` and **Approved — not committed**. Then send the exact **Approved-plan commit prompt** and show the transition to `COMMITTED` and 100% live coverage.

**Narration:**

> “I approve this exact digest in the visible UI. Approval still does not execute it. Now the agent commits only that approved digest; CommonMesh recomputes it, revalidates the plan, and activates the assignments.”

### 1:55–2:10 — Introduce a real-world disruption

**Operator:** Click **Mark primary van unavailable**. Frame the amber disruption banner and coverage metrics.

**Required visible checkpoint:** one disrupted need, 6/7 needs covered, 86% coverage, 14 available resources, and seven active assignments.

**Narration:**

> “Real plans change. As the human, I mark the primary van unavailable. Only its dependent assignment is disrupted; the other seven commitments stay active.”

### 2:10–2:31 — Agent stages a surgical repair

**Operator:** Send the exact **Repair prompt**. Show snapshot/validation briefly, then return to the proposed repair in CommonMesh.

**Required visible checkpoint:** `PROPOSED`, 100% projected coverage, one replacement assignment, **7 existing assignments preserved**, **1 assignment replaced**, and all constraints satisfied.

**Narration:**

> “The agent inspects the changed revision and stages the smallest valid repair. CommonMesh proves the impact: seven existing assignments preserved, one replaced, and full projected coverage restored.”

### 2:31–2:50 — Approve, commit, and end checkpoint

**Operator:** Click **Approve Plan**, then send the exact **Approved-repair commit prompt**. Finish on the overview and committed repair; include the newest activity entries if they fit without obscuring the final metrics.

**Required end checkpoint:**

- plan state `COMMITTED`
- 7/7 needs covered
- 100% coordination coverage
- 8 active assignments
- 14 available resources (the failed van remains unavailable)
- repair evidence still reports 7 preserved and 1 replaced
- activity trail contains the human approval and agent commit

**Narration:**

> “After a second exact-digest approval, the agent commits the repair. We end at seven of seven needs covered, eight active assignments, and a complete human-and-agent audit trail. CommonMesh gives agents useful autonomy without giving away human authority.”

## Post-recording checkpoint

Before uploading:

- [ ] Confirm the final cut is between 2:00 and 3:00; this script targets 2:50.
- [ ] Confirm every spoken number matches the visible state in that take.
- [ ] Confirm `APPROVAL_REQUIRED`, the `APPROVED — not committed` pause, and both commits are readable.
- [ ] Confirm the recording shows real WebMCP calls, not only the human shortcut buttons.
- [ ] Confirm no private account information, credentials, notifications, or unrelated tabs are visible.
- [ ] Confirm the video has clear English narration or accurate English captions.
- [ ] Upload the video, test public playback in a signed-out session, and replace **[PLACEHOLDER — video URL]** in both submission documents.
- [ ] After preserving the committed end-state shot, use **Reset Demo** and verify the start checkpoint before another take.

