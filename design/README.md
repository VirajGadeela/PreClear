# design/

Reference material for the design skills installed in `~/.claude/skills/`.
**Nothing in this folder is authoritative.** Precedence runs:

1. `app/src/theme.ts` — the source of truth. Tokens live in code.
2. `/DESIGN.md` — derived from `theme.ts`, written so design skills inherit
   this project's rules instead of their own defaults.
3. This folder — inputs and second opinions, kept for provenance.

## What's here

| File | What it is |
|---|---|
| `awesome-claude-design-index.md` | The VoltAgent/awesome-claude-design README — an index of 68 `DESIGN.md` files hosted at getdesign.md. The repo contains no skills. |
| `design-md-candidates/` | Four `DESIGN.md` files pulled with `npx getdesign@latest add <brand>` (wise, stripe, linear.app, apple). Evaluated, **not adopted** — see below. |
| `ui-ux-pro-max-advisory.txt` | Raw output of the `ui-ux-pro-max` design-system generator for this product. Partially rejected — see below. |

## Why none of it was adopted wholesale

Preclear's central finding is that the cheaper payment today can be the worse
decision for the year. `theme.ts` therefore forbids hue from encoding rank —
no red/green for cheap/expensive.

Both external systems violate that directly:

- **The getdesign.md candidates** (Wise, Stripe, et al.) ship
  `positive: #2ead4b` / `negative: #d03238` traffic-light semantics. Wise was
  the closest analog on brand grounds — money math shown honestly — and is the
  clearest example of the conflict.
- **The `ui-ux-pro-max` generator** recommended "Medical teal + health green"
  with `accent: #16A34A` and `destructive: #DC2626`, plus hover states,
  `cursor-pointer`, Google Fonts `@import`, and GSAP ScrollTrigger — a web
  stack this app doesn't have.

Both are reasonable defaults for most products and wrong for this one. They're
kept because the *structure* is still useful: the candidates are a good model
for how to write a token file with rationale attached, and the advisory's
accessibility checklist and Swiss/minimal pattern notes hold up.

## Regenerating

```sh
# a different brand reference
cd design/design-md-candidates && npx -y getdesign@latest add <brand>

# re-run the generator (writes to stdout; --persist would create
# design-system/preclear/MASTER.md, deliberately not used here)
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<query>" \
  --design-system --stack react-native --density 7 --variance 3 --motion 2
```
