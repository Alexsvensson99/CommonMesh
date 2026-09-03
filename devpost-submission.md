# Title

CommonMesh

> **Canonical submission record.** The exact live project description is kept
> in [`docs/DEVPOST_DESCRIPTION.md`](docs/DEVPOST_DESCRIPTION.md). Use this file
> for testing instructions, links, and submission-field values. The longer
> [`docs/DEVPOST_SUBMISSION.md`](docs/DEVPOST_SUBMISSION.md) is supporting
> judging evidence, not a second field-value source.
>
> **Status:** Submitted to the WebMCP Challenge and verified live on 2026-09-03.
> Devpost submission `1167827` is available at
> [devpost.com/software/commonmesh](https://devpost.com/software/commonmesh).
> The independently validated 2:50 demo is public at
> [youtu.be/7Oy3g2_-LRk](https://youtu.be/7Oy3g2_-LRk), with HD processing
> complete and a manual English caption track published.

## One-line Summary

Human-approved community coordination through structured WebMCP tools.

## Problem

Community events often have enough goodwill and resources but too little coordination capacity. Organizers must reconcile quantities, skills, licences, schedules, travel limits, accessibility requirements, availability, and existing commitments across volunteers, vehicles, equipment, food, and spaces.

A conventional dashboard leaves that comparison work to the organizer. Pixel-based browser automation introduces a different risk: it must infer domain state and approval from a changing visual layout. Commitments that affect people and shared resources need agent assistance without surrendering human authority or visibility.

## Solution

Previously, organizers had to reconcile every constraint manually or rely on brittle pixel automation. CommonMesh lets the agent prepare and repair a structured plan while the organizer approves the exact real-world commitment in the same visible workspace.

CommonMesh is a WebMCP-native coordination workspace for a deterministic **Saturday Community Day** scenario. A browser agent can inspect seven needs and fifteen resources, compare constraints, validate an eight-assignment plan, and stage it in the shared product interface.

The lifecycle is deliberately explicit:

```text
PROPOSED -> APPROVED -> COMMITTED
            human       agent
```

The human reviews the exact assignments, projected coverage, constraints, warnings, source revision, and SHA-256 digest before approving. The agent may propose a plan, but it may execute only after the human approves that exact digest. The agent has no tool for approving a plan, resetting the demo, or changing resource availability. Persisted approval is intentionally not trusted after a reload, so the proposal returns to PROPOSED and requires fresh human approval.

If a committed resource becomes unavailable, CommonMesh marks only the affected assignment as disrupted. The agent can stage a surgical repair that reports how many existing assignments are preserved and how many are replaced. In the judging scenario, seven assignments remain intact and one van assignment changes.

## Why This Matters

CommonMesh is aimed at community organizers coordinating volunteers and shared local capacity. The prototype demonstrates how structured agent assistance can reduce comparison work while decisions that create real obligations remain under human control.

The failure-and-repair flow also shows continuity: one van failure lowers live coverage from 100% to 86%, then a targeted repair restores 100% while preserving seven of eight assignments. These are deterministic prototype results, not claims of adoption or measured real-world time savings.

## Why WebMCP

WebMCP is the product's core collaboration layer. CommonMesh exposes nine imperative browser tools:

| Tool | Purpose | Access |
| --- | --- | --- |
| `get_coordination_snapshot` | Read event state, coverage, revisions, assignments, and staged-plan state | Read |
| `search_needs` | Filter needs by text, category, urgency, date, or live status | Read |
| `search_resources` | Compare resources by compatibility, capacity, distance, availability, and time | Read |
| `get_resource_details` | Inspect one resource's limits, skills, availability, and commitments | Read |
| `validate_match_plan` | Dry-run a complete or targeted plan against domain rules | Read |
| `stage_match_plan` | Validate, hash, and display a proposal for human review | Write |
| `get_staged_plan` | Read the proposal, digest, revision, validation, and approval state | Read |
| `commit_approved_plan` | Commit only the exact human-approved digest | Write |
| `get_activity_log` | Read the shared human, agent, and system activity trail | Read |

This is more reliable and meaningful than DOM clicking or screenshot automation because the agent receives named capabilities, strict JSON Schemas, stable identifiers, structured results, pagination, and corrective error codes. It does not need to infer quantities, IDs, constraints, or approval state from pixels. The React interface and WebMCP tools use the same store and domain logic, so staged plans, commits, and blocked write attempts immediately appear in visible product state and the shared activity trail while read tools remain state-pure.

## How We Used AI

The finished application does not embed a model or inference API. At runtime, AI capability comes from a compatible browser agent operating through the WebMCP tool contract. The agent handles high-comparison work: inspecting state, finding compatible resources, validating assignments, staging proposals, committing an approved digest, and repairing a disruption.

The human retains the high-consequence decision: approving the exact proposal that may become a commitment.

## How We Used Codex

OpenAI Codex assisted with repository setup, product and interaction design,
implementation, debugging, automated testing, accessibility review,
documentation, deployment checks, end-to-end WebMCP verification, and
preparation of the hybrid demo video, captions, thumbnail, and technical QA
evidence. The project owner defined the product direction, constrained the
scope, established the human-approval policy, reviewed the work, and remains
responsible for the final entry.

## Key Features

- Constraint-aware matching across quantities, skills, licences, time windows, distance, availability, maximum hours, and overbooking.
- Shared React and WebMCP state with no hidden agent-only implementation.
- Exact-digest human approval separated from agent execution.
- Structured rejection of missing approval, stale state, digest mismatch, tampering, invalid plans, and replay.
- Selective repair that replaces only assignments affected by a failure.
- Visible plan lifecycle, validation, coverage, efficiency metrics, and actor-labelled activity history.
- Deterministic reset restores seeded resources and baseline activity while
  clearing assignments, staged plans, approvals, and resource-availability
  changes.
- Human-only failure simulation and reset controls.
- Responsive, accessible desktop-first interface.

## Architecture

```text
Human React UI ---------+
                        +--> CoordinationStore --> domain validation
WebMCP tool layer ------+          |               approval and audit rules
                                   +--> versioned browser localStorage
```

- **UI:** React 19, React DOM, and Lucide icons.
- **Language/build:** TypeScript 6 and Vite 8.
- **Domain:** Typed needs, resources, assignments, constraints, validation results, plans, approvals, and activity outcomes.
- **State:** One reactive `CoordinationStore` shared by the human UI and WebMCP tools.
- **Persistence:** Structurally validated, versioned `localStorage` with deterministic reset.
- **Trust binding:** Native Web Crypto SHA-256 over normalized assignments and the source revision.
- **Quality:** Vitest, Oxlint, TypeScript checking, and production builds.
- **Hosting:** Static public deployment through ChatGPT Sites; no application backend in this prototype.

## Testing Instructions

1. Open the public demo in ChatGPT's in-app browser or a compatible Chrome WebMCP build and wait for **WebMCP live · 9 tools**.
2. Choose **Reset Demo** and confirm 7 needs, 15 available resources, 0% live coverage, and no staged plan.
3. Open **WebMCP Tools** to inspect the seven read tools and two write tools. Confirm that no approval tool exists.
4. Ask the agent to inspect, validate, and stage a complete plan for all seven needs.
5. Attempt a commit before human approval. Confirm `APPROVAL_REQUIRED`, no live assignments, and a blocked entry in the Activity Trail.
6. In the visible UI, approve the exact staged plan. Confirm the state is **APPROVED — not committed** and live coverage remains 0%.
7. Ask the agent to commit the approved digest. Confirm 7/7 needs covered, 100% live coverage, and eight active assignments.
8. In the visible UI, click **Mark assigned van unavailable**; the control follows whichever cargo van the agent committed. Confirm only that assignment is disrupted and coverage becomes 86%.
9. Ask the agent to repair only the affected need. Confirm **7 existing assignments preserved**, **1 assignment replaced**, and 100% projected coverage.
10. Approve and commit the repair, then reset once more to verify deterministic recovery.

## Public Demo Link

https://commonmesh.itsjustmeal3x.chatgpt.site

## Public Repository Link

https://github.com/Alexsvensson99/CommonMesh

## Demo Video

**Public URL:** https://youtu.be/7Oy3g2_-LRk

The exact local candidate is a transparent hybrid rather than a continuous
screen recording. It combines genuine WebMCP `stage_match_plan` and
approval-boundary footage with verified product-state captures for the
proposal, human approval, commitment, disruption, and selective repair.

- Local upload copy (git-ignored):
  `docs/video/commonmesh-demo-eric-v2-candidate.mp4`
- SHA-256: `36a9868d6c6047b8b18e4886af8d113946b9be1d13d0bacc8125a42d01ffd58f`
- Runtime: `170.000` seconds (2:50)
- Format: 1920×1080, 30 fps, H.264 High Profile, AAC stereo at 48 kHz
- Captions: `docs/DEMO_VIDEO_CAPTIONS.srt`
- Captions SHA-256: `2361469aed5796b69cae7c9704fdcdcc399d732404987b4b7c090de9e566a78d`
- Status: public; HD processing complete; technical, caption, and independent
  visual QA passed; manual English captions published

Source materials:

- [`docs/DEMO_VIDEO_SCRIPT.md`](docs/DEMO_VIDEO_SCRIPT.md)
- [`docs/DEMO_VIDEO_CAPTIONS.srt`](docs/DEMO_VIDEO_CAPTIONS.srt)

## Current Visual Assets

1. `docs/video/commonmesh-thumbnail.jpg` — 1280×720 prepared custom thumbnail,
   composed from the exact 2:38 frame of the hash-locked candidate; SHA-256
   `17059a457a54d582a84f29a3e609a432fe8e15a7445c04c30837ebaa46ef9e9c`.
   This remains optional artwork; the published video uses YouTube's second
   autogenerated thumbnail, which satisfies the challenge requirements.
2. `docs/screenshots/10-final-committed-repair.png` — exact 2:38 candidate frame
   showing `WebMCP live · 9 tools`, a committed selective repair, 7/7 needs
   covered, and 100% coordination coverage.
3. `docs/screenshots/07-webmcp-tools-live.jpg` — clean live registration evidence
   with nine tools, the 7 read / 2 write split, and no approval tool.

Other repository captures remain traceable production sources, but they are not
recommended as current gallery assets because they predate final presentation
copy and timestamp refinements.

## Submission Readiness Notes

- [x] Official rules, eligibility, deadline, deliverables, fields, and judging criteria re-verified on 2026-09-03.
- [x] Rules explicitly acknowledged by the project owner in the active Codex session.
- [x] Existing Devpost pre-draft reused; no duplicate project created.
- [x] Devpost project title, tagline, description, technology list, and public links populated.
- [x] Public MIT-licensed repository verified.
- [x] The currently deployed public baseline and its full WebMCP transport flow were verified on 2026-09-03.
- [x] Nine live WebMCP tools and the full approval/repair flow verified in the public in-app browser.
- [x] Current automated suite passes: 57/57 tests.
- [x] Prepare and hash-check an optional custom video thumbnail using the exact 2:38 frame from the rendered candidate.
- [x] Render and technically validate the truthful 170-second hybrid demo candidate with clear English audio and picture-locked captions.
- [x] Independent Ultra visual QA passed on the exact hash-locked candidate.
- [x] Obtain explicit approval for the exact YouTube upload manifest.
- [x] Upload the approved candidate, wait for HD processing, and verify an
  unauthenticated `OK` player response with `isUnlisted: false`.
- [x] Replace every pending-video marker in the repository with the exact verified public URL.
- [x] Add the public video URL to the live Devpost project and confirm Devpost reads it back.
- [x] Confirm and submit the four personal/subjective form answers below.
- [x] Run lint, typecheck, tests, production build, and dependency audit on the exact final worktree; commit, push, verify CI, and correlate the deployed assets.
- [x] Obtain a final explicit **yes, submit**, submit the entry, and verify Devpost's `submitted_at` value.

## Known Limitations

- Client-side, single-page competition prototype; it has no production server trust boundary or cross-tab synchronization.
- Browser persistence is local to one origin and browser profile.
- Live WebMCP execution requires ChatGPT's in-app browser or another compatible browser.
- Seeded data is deterministic demonstration data, not a live community directory.
- No production identity, user research, adoption, or outcome metrics are claimed.
- Production use would require server-side authorization, privacy controls, multi-user synchronization, notifications, and real inventory or volunteer integrations.

## Canonical Official Form Fields

The live form was queried and submitted on 2026-09-03. Devpost accepted every
required answer; live project readback confirmed the public video URL and the
challenge submission timestamp.

| ID | Official field | Prepared answer | Status |
| --- | --- | --- | --- |
| 28249 | Submitter Type | `Individual` | Submitted |
| 28250 | Country(s) | `Sweden` | Submitted |
| 28251 | Organization name | Leave blank | Optional |
| 28252 | App Status | `New` | Submitted |
| 28253 | Existing project explanation | Leave blank | Not applicable |
| 28254 | Live URL | `https://commonmesh.itsjustmeal3x.chatgpt.site` | Submitted |
| 28255 | Testing instructions | Use the Testing Instructions section above | Submitted |
| 28256 | Public repository | `https://github.com/Alexsvensson99/CommonMesh` | Submitted |
| 28257 | Agents/clients tested | `OpenAI Codex using ChatGPT's in-app browser` | Submitted |
| 28258 | AI tools used | `OpenAI Codex` and `ElevenLabs Eric v2` | Submitted |
| 28259 | Learning | `Significant` | Submitted |
| 28260 | AI career value | `Yes` | Submitted |
| — | Video URL | `https://youtu.be/7Oy3g2_-LRk` | Submitted and read back |

No official field currently asks for a Codex session ID. Add it here only if the live form changes and explicitly requests one.
