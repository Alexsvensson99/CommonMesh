# CommonMesh — 2:50 Hybrid Demo Production Script

> **Production status:** The exact 170.000-second Eric-v2 candidate is published
> at [youtu.be/7Oy3g2_-LRk](https://youtu.be/7Oy3g2_-LRk). The local upload copy
> is `video/commonmesh-demo-eric-v2-candidate.mp4` with SHA-256
> `36a9868d6c6047b8b18e4886af8d113946b9be1d13d0bacc8125a42d01ffd58f`.
> Decode, media-format, loudness, fast-start, source-crop, and independent
> Ultra visual checks pass. HD processing is complete, the manual English
> caption track is published, and unauthenticated YouTube metadata reports an
> `OK` player response with `isUnlisted: false`.

The English Eric-v2 narration and
[`DEMO_VIDEO_CAPTIONS.srt`](DEMO_VIDEO_CAPTIONS.srt) are picture-locked to this
2:50 edit. The caption file SHA-256 is
`2361469aed5796b69cae7c9704fdcdcc399d732404987b4b7c090de9e566a78d`.

## Honest edit format

This is a curated hybrid demo, not a continuous screen recording:

- genuine browser footage shows the agent invoking `stage_match_plan` through
  the discovered WebMCP interface and the shared activity trail recording the
  `APPROVAL_REQUIRED` boundary;
- verified captures from the exercised public workflow keep the clean reset,
  tool catalogue, proposal, approved state, committed state, disruption,
  repair, and final metrics readable; and
- narration connects those verified states without implying that an omitted
  click or prompt is visible in the edit.

The exact prompts below reproduce the complete live workflow. They are
reproduction material, not a claim that every prompt or tool call appears as
continuous moving footage in the final candidate.

## Source-capture and reproduction setup

- Use ChatGPT's in-app browser or a compatible Chrome build with the verified
  public build at
  [commonmesh.itsjustmeal3x.chatgpt.site](https://commonmesh.itsjustmeal3x.chatgpt.site).
- Hide notifications, account details, tokens, unrelated tabs, and developer
  secrets.
- Keep status labels, metrics, digest state, and structured failures readable.
- Do not use **Stage sample plan** or **Stage repair** for WebMCP evidence. Those
  are human shortcuts; the genuine source footage stages through WebMCP.
- Cuts may remove model thinking or latency, but must not reverse or fabricate
  a state transition.

## Reproduction preflight

1. Run the complete quality gate on the exact commit being demonstrated.
2. Open CommonMesh in the WebMCP-capable judge environment.
3. Confirm the top status reads **WebMCP live · 9 tools**.
4. Verify that the initial plan has eight assignments and that **Mark assigned
   van unavailable** targets the cargo van in the committed assignment.
5. Confirm **Reset Demo** and verify the reset checkpoint below before beginning
   another run.

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

## Picture-locked shot and narration record

### 0:00–0:16.55 — Product promise and reset checkpoint

**Picture:** A five-second title composition introduces CommonMesh and its
human-control promise, followed by the verified clean overview metrics.

**Visible evidence:** 7 needs, 0 covered, 15 available resources, 0%
coordination coverage, and no live assignments.

**Narration:**

> “This is CommonMesh: a WebMCP-native workspace for community coordination. We begin from a deterministic reset—seven open needs, fifteen available resources, and no plan or commitments.”

### 0:16.55–0:35.25 — Problem and collaboration model

**Picture:** Verified clean-state need cards and the human-approval boundary.

**Narration:**

> “An organizer must reconcile quantities, skills, licences, schedules, travel, and accessibility. The agent handles that comparison work, while CommonMesh keeps every real-world commitment visible and human-controlled.”

### 0:35.25–0:52.30 — Structured WebMCP surface

**Picture:** Verified live WebMCP catalogue capture.

**Visible evidence:** nine capabilities, `7 read · 2 write`, and **No approval
tool is exposed.**

**Narration:**

> “Nine structured tools expose the domain directly: seven reads and two writes. The agent can inspect, validate, stage, and commit—but approval, reset, and resource availability remain human-only.”

### 0:52.30–1:09.65 — Genuine WebMCP staging footage

**Picture:** Genuine browser footage shows the agent's explicit
`stage_match_plan` invocation through CommonMesh's discovered WebMCP interface,
the real tool row/result, and the proposal appearing in CommonMesh. Snapshot,
search, and validation calls were verified in the full public transport run but
are not presented as visible calls in this edited interval.

**Narration:**

> “The agent reads stable identifiers and structured constraints instead of guessing from pixels. It validates the assignments, then stages—not executes—the proposal through the same state store used by the interface.”

### 1:09.65–1:29.67 — Inspect the proposal

**Picture:** Verified captures hold on **Agent Proposed Plan**, its
`PROPOSED` lifecycle state, metrics, assignments, and validation.

**Visible evidence:** `PROPOSED`, 100% projected coverage, eight assignments,
**All constraints satisfied**, and 0% live coverage.

**Narration:**

> “The proposal covers every need and exposes its assignments, metrics, revision, validation, and SHA-256 digest. Notice that projected coverage is one hundred percent while live coverage is still zero. Nothing has executed.”

### 1:29.67–1:41.87 — Genuine approval-boundary footage

**Picture:** Genuine browser footage isolates CommonMesh's shared activity
trail after the deliberate early commit attempt.

**Visible evidence:** `APPROVAL_REQUIRED`, successful staging, blocked agent
commit, and no executed assignments.

**Narration:**

> “Even when explicitly asked to commit early, the domain layer rejects the write with APPROVAL_REQUIRED and records the blocked attempt. The agent cannot approve itself.”

### 1:41.87–1:59.57 — Human approval, then agent commit

**Picture:** Verified product-state captures show `APPROVED — not committed`
followed by the `COMMITTED` lifecycle and 100% live coverage. The edit does not
present the omitted click and prompt as continuous footage.

**Narration:**

> “I approve this exact digest in the visible interface. Approval still does not execute it. Now the agent commits only that approved digest; CommonMesh recomputes it, revalidates the plan, and activates the assignments.”

### 1:59.57–2:12.24 — One real-world disruption

**Picture:** A verified disruption capture frames the amber warning and live
coverage metrics after the assigned van was made unavailable.

**Visible evidence:** one disrupted need, 6/7 needs covered, 86% coverage, 14
available resources, and seven active assignments.

**Narration:**

> “Real plans change. As the human, I mark the assigned van unavailable. Only its dependent assignment is disrupted; the other seven commitments stay active.”

### 2:12.24–2:28.29 — Selective repair

**Picture:** The verified WebMCP repair capture shows the proposed replacement
and its explicit impact metrics.

**Visible evidence:** `PROPOSED`, 100% projected coverage, one replacement,
**7 existing assignments preserved**, **1 assignment replaced**, and all
constraints satisfied.

**Narration:**

> “The agent inspects the changed revision and stages the smallest valid repair. CommonMesh proves the impact: seven existing assignments preserved, one replaced, and full projected coverage restored.”

### 2:28.29–2:50 — Committed repair and end checkpoint

**Picture:** A verified final-state capture shows the committed repaired plan
and full workspace metrics.

**Visible evidence:** `COMMITTED`, 7/7 needs covered, 100% coordination
coverage, eight active assignments, 14 available resources, and repair evidence
for seven preserved / one replaced.

**Narration:**

> “After a second exact-digest approval, the agent commits the repair. We end at seven of seven needs covered, eight active assignments, and a complete human-and-agent audit trail. CommonMesh gives agents useful autonomy without giving away human authority.”

## Candidate QA and publication gates

- [x] Exact candidate runtime is 170.000 seconds, below the three-minute limit.
- [x] Full decode passes; H.264 High Profile video and AAC 48 kHz stereo audio
  match the delivery manifest.
- [x] English narration measures approximately −14 LUFS with safe true peak.
- [x] Genuine WebMCP staging and `APPROVAL_REQUIRED` boundary footage is used;
  no human shortcut is presented as agent evidence.
- [x] Captions are locked to the final Eric-v2 narration while preserving all
  ten picture/paragraph boundaries; SHA-256
  `2361469aed5796b69cae7c9704fdcdcc399d732404987b4b7c090de9e566a78d`.
- [x] Independent Ultra visual QA passed for every state, number, transition,
  crop, and privacy boundary on the exact hash-locked candidate.
- [x] Obtain explicit approval for the exact YouTube title, description,
  audience, language, thumbnail, captions, visibility, and MP4 hash.
- [x] Upload only after approval, complete HD processing, publish the manual
  English caption track, and verify unauthenticated public availability.
- [x] Add the exact verified URL to README, both submission documents, this
  production record, the video manifest, judging checklist, and WebMCP
  evaluation matrix.
- [ ] Add the URL to the live Devpost project and read it back from Devpost.
- [x] Accept YouTube's autogenerated thumbnail; a custom thumbnail is optional
  and is not a WebMCP Challenge submission requirement.
- [ ] Obtain a separate explicit **yes, submit** before submitting the WebMCP
  Challenge entry.
