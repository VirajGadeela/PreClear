# PreClear agent setup

Drop this `.claude/` folder into the root of the PreClear repo (next to `app/`
and `pipeline/`). Commit it so Rohan and Dhanvanth get the same agents.

```
.claude/
  agents/
    ui-auditor.md           read-only, screenshots + ranked issues  (Opus)
    ui-builder.md           edits one screen at a time               (Sonnet)
    compliance-reviewer.md  read-only, checks hard rules             (Haiku)
    qa-verifier.md          read-only, typecheck + clicks through    (Sonnet)
  skills/
    ui-pass/SKILL.md        supervised pass (stops for your approval) → /ui-pass
    ui-iterate/SKILL.md     one unattended iteration, used by the loop
  settings.json             what the loop may do without asking (no pushing,
                            no pipeline edits, no editing its own rules)
```

## One-time setup
1. Install Claude Code and open it in the PreClear repo root: `claude`
2. Install Anthropic's design skill (the builder preloads it):
   ```
   /plugin marketplace add anthropics/claude-code
   /plugin install frontend-design@claude-code-plugins
   ```
3. Install a browser for Playwright: `npx playwright install chromium`
4. Accept the workspace trust prompt when Claude Code asks; the agents'
   browser tools only load in a trusted folder.
5. Add `.claude/screenshots/` to `.gitignore`.

## Daily use
- Full pass: `/ui-pass`
- One screen: `/ui-pass results screen`
- Just an audit: `@"ui-auditor (agent)" audit step 2`
- Compliance check before committing: `@"compliance-reviewer (agent)" check my changes`

## Autonomous loop

The loop repeats the `ui-iterate` skill (audit → fix the top 3 visual
issues → compliance + QA → commit or revert → log) until the UI scores well,
stops improving, or hits 8 iterations.

**Before starting (every time):**
1. Commit or stash your own work. The loop refuses to run on a dirty tree.
2. Make a branch: `git checkout -b ui-loop/oct12`
3. In a SEPARATE terminal, start the app: `cd app && npx expo start --web`
   (Don't let Claude start it. A server running inside the session blocks
   the loop's evaluator.)
4. In Claude Code, press Shift+Tab until the mode shows **auto**, so it
   doesn't stop for permission prompts.

**Start it** by pasting the contents of `.claude/GOAL.txt` into Claude Code.

**While it runs:** `/goal` shows status, score history is in
`.claude/ui-loop/log.md`, and `/goal clear` stops it.

**When it finishes:**
- Read `.claude/ui-loop/proposals.md` and decide on copy and design changes.
- Review commits: `git log --oneline main..HEAD`. Revert any you dislike
  with `git revert <hash>`.
- If you rejected something, add it to the log under "Rejected by Viraj" so
  the next run doesn't try it again.
- Merge into main yourself when you're happy.

## Order for this week
1. RevenueCat removal first (use the plan-mode prompt), then run
   `compliance-reviewer` to confirm nothing is left.
2. Create DESIGN.md (pick a direction first).
3. Run `/ui-pass` once per day, approving fixes each time.
4. Stop UI work around Oct 20 and switch to the demo video.
