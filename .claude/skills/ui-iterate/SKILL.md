---
name: ui-iterate
description: Run ONE unattended improvement iteration on PreClear's UI (audit, fix top issues, check, commit or revert, log). Used by the autonomous /goal loop; also fine to run once by hand.
---

# One unattended UI iteration

You are the orchestrator for a single iteration of PreClear's autonomous UI
loop. Viraj is NOT watching, so never stop to ask a question. Anything that
needs his judgment goes into `.claude/ui-loop/proposals.md` instead.
Do not write UI code yourself; delegate it to `ui-builder`.

Context: PreClear is Viraj's 2026 Congressional App Challenge entry. Judges
mostly see it through a demo video, so the app's point must be obvious in
the first 10 seconds.

## 0. Preflight (stop the iteration if any check fails)
- You are on a branch named `ui-loop/*`. If you're on `main`, stop and say so.
- `git status` is clean. If not, stop and say so (don't stash or discard).
- The dev server answers at http://localhost:8081. Do NOT start it yourself.
  A server started from inside this session would keep running in the
  background and block the loop's evaluator. If it's down, stop and say so.
- DESIGN.md exists. If it doesn't, stop: the loop needs a fixed target.
- Create `.claude/ui-loop/log.md` and `.claude/ui-loop/proposals.md` if
  they don't exist. Read the log: it tells you the iteration number, past
  scores, and what was already tried, rejected, or reverted.

## 1. Audit
Delegate to `ui-auditor` (URL http://localhost:8081, whole consumer flow).
Record its TOTAL score.

## 2. Choose (be conservative)
Pick at most 3 issues, highest severity first, that are:
- type `visual` (never `copy`)
- not listed in the log as rejected or reverted
- fixable within 1–2 screens

Small, safe steps beat big rewrites. If nothing qualifies, skip to step 5
and log "no actionable visual issues."

## 3. Build
Delegate to `ui-builder`, one screen at a time, with the chosen issues.

## 4. Check
Run `compliance-reviewer` and `qa-verifier` in parallel.
- **Both pass:** `git add -A && git commit -m "ui-loop: iteration N — <summary>"`.
- **Either fails:** send the failures back to `ui-builder` once. Re-run the
  failed check. If it still fails, discard this iteration's changes with
  `git checkout -- . && git clean -fd app/` and log it as reverted, with the
  reason, so future iterations don't retry it.

## 5. Docs and proposals
You MAY edit directly:
- README.md: keep setup/run instructions and screen descriptions accurate.
- DESIGN.md: only ADD a new token or append to a "Decisions" section at
  the bottom. Never change or remove an existing token value, the colorway,
  or the type pairing. Those are Viraj's calls.

Put these in `.claude/ui-loop/proposals.md` instead (never apply them):
- Copy changes, quoting the exact current line and the suggested line
- Changes to existing DESIGN.md tokens or direction
- Anything structural: new screens, navigation changes, removing a step

Commit doc and proposal edits in the same iteration commit.

## 6. Log and report
Append one entry to `.claude/ui-loop/log.md`:
```
## Iteration N — <date/time>
Score: before X/60 → (next audit will measure after)
Fixed: <issues>   Result: committed | reverted (<reason>)
Skipped: <issues and why>
```
Then end your turn with exactly this line so the loop's evaluator can read it:

`ITERATION N — audit score X/60 — committed|reverted|nothing-to-do — high-severity issues remaining: K`
