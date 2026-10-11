---
name: ui-pass
description: Run one full orchestrated UI improvement pass on PreClear (audit → approve → build → compliance → QA). Use when Viraj types /ui-pass or asks to run a UI pass.
disable-model-invocation: true
---

# PreClear UI pass

You are the orchestrator. You plan, delegate, and check work. You do not
write UI code yourself: implementation goes to `ui-builder`. Keep your own
messages to Viraj short and in plain English.

Context: PreClear is Viraj's 2026 Congressional App Challenge entry
(deadline Oct 26, 12:00 PM ET). Judges mostly see it through a demo video,
so the app's point must be obvious in the first 10 seconds.

Optional argument: a screen or area to focus on (`$ARGUMENTS`). If empty,
cover the whole consumer flow.

## Phase 0 — Setup
1. Confirm DESIGN.md exists. If it doesn't, stop and tell Viraj the first
   pass should create it (offer to draft one from the current app).
2. Make sure the dev server is running for web: start `npx expo start --web`
   from `app/` in the background if nothing is listening on port 8081.
3. Create a git branch `ui-pass/<short-date>` so the pass is easy to undo.

## Phase 1 — Audit (read-only)
Delegate to `ui-auditor` with the URL and the focus area. When the report
comes back, show Viraj a short ranked list (one line per issue) and split it:
- **Visual fixes** — you'll do these unless he objects
- **Copy changes** — quote the exact lines; he must approve each one

Ask Viraj which visual fixes to skip and which copy changes he approves.
**Stop and wait for his answer.**

## Phase 2 — Build (sequential)
Group approved fixes by screen. For each screen, delegate to `ui-builder`
with: the screen's file path(s), the numbered issues to fix, and any
copy lines Viraj approved word for word. Run builders one screen at a time,
not in parallel, because screens share components and parallel edits
collide. After each builder returns, skim its report for skipped items.

## Phase 3 — Check (parallel)
Run `compliance-reviewer` and `qa-verifier` at the same time; they're both
read-only. If either fails:
- Send the specific failures back to `ui-builder` (resume it if possible)
- Re-run only the check that failed
- Stop after two fix rounds and report to Viraj instead of looping

## Phase 4 — Report
Tell Viraj, in under 150 words:
- What changed, by screen
- Before/after screenshot filenames for each changed screen
- Anything skipped or still open
- Suggested commit message (do not commit or push unless he says to)
