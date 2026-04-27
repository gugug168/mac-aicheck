# OpenClaw Owner-Auto Smoke Report

Date: 2026-04-27
Repo: `mac-aicheck`
Environment: real macOS device, real `openclaw`, real `mac-aicheck` auth token, real AICOEVO API

## Summary

This smoke test confirmed that MacAICheck can complete the full self-serve owner verification loop without waiting for a human collaborator:

1. Run real OpenClaw smoke flow on macOS.
2. Create a real agent-event bounty draft.
3. Publish the draft.
4. Claim the bounty from the same bound agent.
5. Submit an answer.
6. Let `ownerAutoVerify` reproduce locally and auto-submit owner verification.

Result: the loop succeeded on a real machine.

## Real IDs From This Run

- Bounty draft / bounty: `7b1971364d`
- First answer: `7636c082d7`
- Successful owner-auto answer: `39e3588385`
- Successful owner-auto validation command: `node --version`

## What Passed

- `bash scripts/openclaw-smoke.sh` completed on macOS.
- Scan report was generated and uploaded successfully.
- OpenClaw shell hook was installed and verified.
- `capture` + `sync` created a real bounty draft from a local agent event.
- `bounty-draft-publish` worked against the real API.
- `bounty-recommended` returned the published bounty to the current agent.
- `bounty-claim` succeeded for the same bound agent.
- `bounty-submit` created a pending owner verification item.
- `worker daemon` auto-submitted owner verification successfully.

## Important Finding

The first owner-auto attempt did not close automatically even though the platform flow was healthy.

Root cause:
- the answer text mentioned `node --version` inside prose
- `extractValidationCommands()` did not reliably extract that inline labeled command
- worker touched the item and recorded cooldown, but did not submit a successful owner-auto result

Manual verification still worked:
- `owner-verify 7b1971364d --answer 7636c082d7 --result success --cmd node --yes`

## Proven Safe Answer Format

Use an explicit labeled command, ideally on its own line:

```text
Validation command:
node --version

Expected result:
Prints the local Node.js version and exits 0.
```

This exact pattern was auto-extracted and auto-submitted successfully for answer `39e3588385`.

## Code/Testing Follow-Up

The repo now includes a regression fix and coverage for inline labeled commands inside prose, so this format is handled more reliably:

- `src/agent/index.ts`
- `tests/agent-v2-flow.test.ts`

## Recommendations For Other AI Agents

- Prefer explicit `Validation command:` or `验证命令:` labels in bounty answers.
- Put the command on its own line or inside backticks.
- Use safe local commands only: `node --version`, `pytest`, `python -m pytest`, `npm test`, `bun test`.
- If owner-auto appears stuck, check:
  - `mac-aicheck agent owner-check`
  - `mac-aicheck agent worker status`
  - whether the answer actually exposes an extractable validation command

## Suggested Next Steps

1. Keep using real smoke bounties for owner-auto regression checks.
2. Preserve one “known-good” answer template for future agents.
3. Consider surfacing worker-side owner-auto failure reasons in `worker status` for easier debugging.
