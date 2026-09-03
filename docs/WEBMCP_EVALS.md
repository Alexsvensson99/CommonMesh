# CommonMesh WebMCP Evaluation Matrix

This matrix documents the repeatable behaviors that matter in the judging demo.
It separates automated contract evidence, live browser-transport verification,
and the remaining submission-recording gate.

Public verification on 2026-09-03 confirmed all nine live registrations in the
Codex in-app browser and exercised the real WebMCP transport on the
[deployed build](https://commonmesh.itsjustmeal3x.chatgpt.site). The run covered
discovery, paginated search, validation, staging, a blocked pre-approval commit,
human approval, exact-digest commit, disruption, selective repair, a second
approval and commit, and activity inspection. The repair restored 7/7 covered
needs while preserving seven assignments and replacing only the failed van
assignment. A confirmed reset then restored 7 open needs, 15 available
resources, no assignments, no staged plan, and 0% coverage; reloading the public
origin returned the same clean persisted state with no browser-console errors.

This verifies the application contract through the public browser transport. A
recorded single-prompt model rehearsal remains a separate submission gate.

| Scenario | Expected WebMCP behavior | Required invariant | Evidence |
| --- | --- | --- | --- |
| Discover the workspace | Call `get_coordination_snapshot`, then page through needs and compatible resources | Read calls do not mutate state or write localStorage | Automated tool tests; public in-app-browser transport verified 2026-09-03 |
| Build a complete plan | Call `validate_match_plan` before `stage_match_plan` | All quantities, skills, availability, time, distance, hours, and overbooking rules pass | Automated domain/tool tests; public in-app-browser transport verified 2026-09-03 |
| Stage for review | Call `stage_match_plan` with the complete assignments | UI shows the exact proposal as `PROPOSED`; no commitment is created | Automated store/tool tests; public in-app-browser transport verified 2026-09-03 |
| Try to commit early | Call `commit_approved_plan` before UI approval | Returns `APPROVAL_REQUIRED`; assignments remain unchanged; blocked write is visible in activity | Automated store/tool tests; public in-app-browser transport verified 2026-09-03 |
| Approve, then commit | Human approves in the visible UI; agent commits the returned digest | Digest is recomputed, approval matches, source revision is current, and approval is consumed once | Automated store/tool tests; public in-app-browser transport verified 2026-09-03 |
| Simulate a van failure | Human marks the primary van unavailable | Exactly one assignment is disrupted; unrelated assignments stay active | Automated store tests; public in-app-browser transport verified 2026-09-03 |
| Repair surgically | Agent validates and stages only the replacement assignment for the disrupted need | UI reports seven preserved assignments and one replacement | Automated store tests; public in-app-browser transport verified 2026-09-03 |
| Reject stale work | Change relevant state after staging or race a superseding plan | Earlier approval or commit cannot mutate current state | Automated store/tool tests |
| Resist malformed state | Load invalid persisted data or make localStorage reject a write | Malformed data falls back to seed state; failed writes leave prior state intact and report `PERSISTENCE_FAILED` | Automated store tests |
| Reset repeatably | Confirm reset in the human UI, then reload the public origin | Seed state persists with no assignments, staged plan, approval, or unavailable resource | Automated store tests; public reload verified 2026-09-03 |
| Stay within authority | Inspect the WebMCP catalogue | No approval, availability, reset, or undo tool is exposed to the agent | Automated registration test plus catalogue UI |

## Submission recording checklist

The full sequence has been verified against the public deployment through the
WebMCP-enabled Codex in-app browser. Before submission, repeat it from the
mission prompt in the exact judge environment and record evidence of:

1. nine registered tools and the 7 read / 2 write split;
2. an actual agent-authored proposal;
3. a blocked pre-approval commit;
4. human approval followed by exact-digest commit;
5. one disrupted assignment after the human failure action; and
6. a repaired plan showing seven preserved and one replaced assignment.

The automated suite and manual browser transport run validate the application
contract. They do not by themselves measure whether an arbitrary model selects
the ideal tool sequence from one prompt, so that claim remains dependent on the
recorded model rehearsal.
