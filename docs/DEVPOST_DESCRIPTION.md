# CommonMesh — Devpost Description

This is the exact project description approved by the project owner and synced
to the live Devpost entry on 2026-09-03. Devpost readback matched this copy after
its normal removal of Markdown heading, bold, and inline-code markers.

## Inspiration

I didn’t want to build another chatbot. I wanted to see whether WebMCP could
help with a messy, practical task: coordinating volunteers and shared resources
for a community event.

An agent can save time by comparing schedules, capacity, distance and
requirements. But assigning a person or a vehicle creates a real commitment.
That decision should stay with the organizer.

CommonMesh is my attempt to split those responsibilities clearly.

## What it does

CommonMesh runs one fixed demo: Saturday Community Day at Riverlight Hall in
Gothenburg. The event has 7 needs and 15 possible resources.

A browser agent can inspect the workspace, find compatible resources, validate
a complete plan and stage it for review. The proposal then appears in the same
interface the organizer is using, marked **PROPOSED**.

If the agent tries to commit too early, CommonMesh returns `APPROVAL_REQUIRED`
and records the failed attempt in the activity trail. The organizer can review
the assignments and approve that exact plan. Only then can the agent commit it.

The demo then breaks the plan on purpose by making the assigned van unavailable.
CommonMesh flags that assignment without making everything else look broken.
The repair keeps 7 existing assignments and replaces 1.

## Why WebMCP

CommonMesh registers 9 browser tools with
`document.modelContext.registerTool`. Seven are read-only. The two write tools
can stage a proposal and commit an approved plan.

There is no WebMCP tool for approving a proposal, resetting the demo or changing
resource availability. Those actions stay in the human interface.

The agent receives stable resource IDs, strict input schemas and structured
errors instead of trying to infer state from page text or screenshots. The tools
and the interface use the same `CoordinationStore`, so the organizer can
immediately see what the agent proposed, what failed and what was committed.

## How I built it

The app uses React, TypeScript and Vite. A shared domain layer checks
availability, timing, capacity, distance, licences and double-booking.

Approval is tied to the normalized assignments and current workspace revision
with a SHA-256 digest. Before committing, CommonMesh calculates the digest again
and validates the plan against the latest state. Reloading the page also clears
pending approval, so it must be given again.

A late code review found a persistence edge case where an inconsistent saved
state could lose its commit history. I tightened the loader and added regression
tests for approvals, rejected repairs and completed repairs. The final suite has
57 tests and runs in GitHub Actions.

I used OpenAI Codex throughout the project for implementation, UI iteration,
testing, review, documentation and demo production. The app itself does not
embed a model or require an API key. Runtime AI comes from the browser agent
using WebMCP. ElevenLabs Eric v2 was used only for the English video narration.

## What I learned

Structured agent tools are boring in a good way. The agent knows what operations
exist and what data they require. The application still decides what is valid,
and the person can see exactly where their approval is needed.

The hardest part wasn’t finding a matching van. It was making approval mean
“this exact plan” rather than “whatever plan happens to exist when the agent
commits.”

## Current limits

CommonMesh is a client-side prototype with fixed demonstration data. It does not
yet have user accounts, server-side authorization, multi-user synchronization or
live community-resource integrations.

The next step would be moving the trust boundary to a server and testing the
workflow with real organizers and real data.
