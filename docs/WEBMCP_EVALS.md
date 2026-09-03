# CommonMesh WebMCP Evaluation Matrix

This matrix documents the repeatable behaviors that matter in the judging demo.
It separates automated contract evidence, live browser-transport verification,
and the evidence contained in the rendered hybrid video candidate.

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

This verifies the application contract through the public browser transport.
The exact public [2:50 challenge video](https://youtu.be/7Oy3g2_-LRk) combines genuine WebMCP staging and
approval-boundary footage with verified product-state captures. It demonstrates
one curated, verified run; it is not a benchmark of arbitrary model
tool-selection behavior. Independent Ultra visual QA passed on the exact
hash, and the manual English caption track is published.

| Scenario | Expected WebMCP behavior | Required invariant | Evidence |
| --- | --- | --- | --- |
| Discover the workspace | Call `get_coordination_snapshot`, then page through needs and compatible resources | Read calls do not mutate state or write localStorage | Automated tool tests; public in-app-browser transport verified 2026-09-03 |
| Build a complete plan | Call `validate_match_plan` before `stage_match_plan` | All quantities, skills, availability, time, distance, hours, and overbooking rules pass | Automated domain/tool tests; public in-app-browser transport verified 2026-09-03 |
| Stage for review | Call `stage_match_plan` with the complete assignments | UI shows the exact proposal as `PROPOSED`; no commitment is created | Automated store/tool tests; public in-app-browser transport verified 2026-09-03 |
| Try to commit early | Call `commit_approved_plan` before UI approval | Returns `APPROVAL_REQUIRED`; assignments remain unchanged; blocked write is visible in activity | Automated store/tool tests; public in-app-browser transport verified 2026-09-03 |
| Approve, then commit | Human approves in the visible UI; agent commits the returned digest | Digest is recomputed, approval matches, source revision is current, and approval is consumed once | Automated store/tool tests; public in-app-browser transport verified 2026-09-03 |
| Simulate a van failure | Human control follows the committed cargo van and marks it unavailable | Exactly one assignment is disrupted; unrelated assignments stay active | Automated store tests for either valid van; public in-app-browser transport verified 2026-09-03 |
| Repair surgically | Agent validates and stages only the replacement assignment for the disrupted need | UI reports seven preserved assignments and one replacement | Automated store tests; public in-app-browser transport verified 2026-09-03 |
| Reject stale work | Change relevant state after staging or race a superseding plan | Earlier approval or commit cannot mutate current state | Automated store/tool tests |
| Resist malformed state | Load invalid persisted data, reload a pending approval, or make localStorage reject a write | Orphaned commitments fall back to seed state; persisted approvals return to PROPOSED; failed writes leave prior state intact and report `PERSISTENCE_FAILED` | Automated store tests |
| Reset repeatably | Confirm reset in the human UI, then reload the public origin | Seed state persists with no assignments, staged plan, approval, or unavailable resource | Automated store tests; public reload verified 2026-09-03 |
| Stay within authority | Inspect the WebMCP catalogue | No approval, availability, or reset tool is exposed to the agent | Automated registration test plus catalogue UI |

## Hybrid video evidence status

The exact local candidate is
`video/commonmesh-demo-eric-v2-candidate.mp4`, runtime 170.000 seconds,
SHA-256
`36a9868d6c6047b8b18e4886af8d113946b9be1d13d0bacc8125a42d01ffd58f`.
It passes technical, caption, and independent visual QA and is published at
[youtu.be/7Oy3g2_-LRk](https://youtu.be/7Oy3g2_-LRk). YouTube Studio confirms
HD processing is complete; an unauthenticated player response reports `OK`,
duration `170`, and `isUnlisted: false`.

The candidate contains:

1. the verified nine-tool catalogue and 7 read / 2 write split;
2. genuine browser footage of the agent invoking `stage_match_plan` through
   the discovered WebMCP interface;
3. genuine shared-activity footage of the blocked pre-approval commit;
4. verified product-state captures for human approval and exact-digest commit;
5. a verified capture of exactly one disrupted assignment after the human
   failure action; and
6. verified repair and final-state captures showing seven assignments
   preserved, one replaced, and full coverage restored.

The edit does not present omitted prompts, clicks, discovery calls, or repair
calls as continuous footage. The automated suite and full public browser run
remain the evidence for the complete contract; the hybrid candidate makes its
decisive states readable for judges.

Video evidence verification:

- [x] complete independent Ultra visual QA on the exact hash-locked candidate;
- [x] obtain explicit approval for the exact YouTube upload manifest;
- [x] upload, complete HD processing, publish manual English captions, and
  verify unauthenticated public availability; and
- [x] insert the exact verified URL throughout the repository documentation.
- [x] add the URL to the live Devpost project, submit the entry, and verify the
  challenge submission timestamp by live readback.
