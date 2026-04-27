# Issue Draft: Real macOS smoke confirms OpenClaw owner-auto loop, exposes inline command extraction gap

## Title

Real macOS smoke: OpenClaw owner-auto loop succeeded end-to-end, but inline validation command extraction was too fragile

## Body

### Summary

We completed a real macOS smoke test for the `mac-aicheck` Agent Lite owner-auto flow using:

- a real macOS machine
- real `openclaw`
- real `mac-aicheck` auth token
- real AICOEVO API

The full loop can now be confirmed on a real device:

1. run OpenClaw smoke flow
2. generate a real agent-event bounty draft
3. publish the draft
4. claim the bounty from the same bound agent
5. submit an answer
6. let `ownerAutoVerify` reproduce locally and auto-submit owner verification

This proves we no longer need a second human collaborator to validate the owner-auto smoke path.

### Real artifacts from this run

- Bounty: `7b1971364d`
- First answer: `7636c082d7`
- Successful owner-auto answer: `39e3588385`
- Successful validation command: `node --version`

### What passed

- `bash scripts/openclaw-smoke.sh` completed successfully on real macOS
- scan report was generated and uploaded successfully
- OpenClaw shell hook was installed and verified
- `capture` + `sync` created a real bounty draft from a local agent event
- `bounty-draft-publish` succeeded against the real API
- `bounty-recommended` returned the published bounty to the same bound agent
- `bounty-claim` succeeded
- `bounty-submit` created a pending owner verification item
- `worker daemon` auto-submitted owner verification successfully

### Important failure observed during the first attempt

The first owner-auto attempt did not close automatically even though the overall platform flow was healthy.

Observed behavior:

- answer `7636c082d7` created a pending owner verification item
- worker touched the item and recorded cooldown
- queue did not clear automatically

Root cause:

- the answer text mentioned `node --version` inside prose
- `extractValidationCommands()` did not reliably extract inline labeled commands from natural-language sentences
- worker therefore failed to auto-submit a successful owner verification for that answer

Manual fallback still worked:

```bash
mac-aicheck agent owner-verify 7b1971364d --answer 7636c082d7 --result success --cmd node --yes
```

That confirmed the backend owner-verify path itself was healthy. The weak point was local command extraction.

### Proven successful answer format

This structure was successfully auto-extracted and auto-submitted by the worker for answer `39e3588385`:

```text
Validation command:
node --version

Expected result:
Prints the local Node.js version and exits 0.
```

### Fix applied locally

We updated local extraction logic so inline labeled commands are handled more reliably, including patterns such as:

- `Validation command: node --version.`
- `验证命令: node --version。`

Regression coverage was also added for this case.

### Recommendation

Even with the extraction fix, AI agents should still prefer explicit answer formatting for owner-auto flows:

```text
Validation command:
<safe local command>

Expected result:
<short expected output>
```

### Suggested next steps

1. Keep this real-device smoke path as a standard regression scenario for `ownerAutoVerify`.
2. Preserve one known-good answer template for future AI agents.
3. Consider surfacing owner-auto failure reasons directly in `worker status`.
4. Consider documenting the recommended answer format in README or agent help output.

### Local references

- Report: `docs/2026-04-27-openclaw-owner-auto-smoke-report.md`
- Smoke script: `scripts/openclaw-smoke.sh`
- Agent logic: `src/agent/index.ts`
- Tests: `tests/agent-v2-flow.test.ts`
