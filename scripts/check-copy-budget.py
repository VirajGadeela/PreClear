#!/usr/bin/env python3
"""Fail when a screen grows past its word budget.

This exists because the app has been called too wordy twice, three weeks apart,
and the second time was after a pass that fixed it. Nothing had gone wrong in
between: every stage added text that was individually correct -- an honesty
label, an explanation of a tied total, a how-it-works block, an FAQ -- and
nothing was ever removed to pay for it. A screen does not become cluttered in
one commit. It becomes cluttered in eleven, each of which looked reasonable.

So the budget is the point, not the count. A screen that needs another sentence
can have one; it just has to either delete a sentence or raise its cap in the
diff, where somebody sees it happen.

WHAT THIS MEASURES, AND WHAT IT DOES NOT
----------------------------------------
It counts what a member sees *on arrival*: comments stripped, the body of every
`<Disclosure>` dropped, then words in JSX text nodes and user-facing string
props. Text behind a tap does not count, which is deliberate -- moving detail
behind a tap is the behaviour this pass was for, and a measure that scored that
at zero would push against it.

It is still a proxy, and will be somewhat wrong about any given screen: it
cannot see text that comes from the data bundle, it counts a conditional branch
that never renders, and it misses a string built by an expression.

It does not have to be right. It has to be *stable*, so that a screen growing by
forty words trips it. Do not chase exactness here; chase the delta.

`accessibilityLabel` is deliberately excluded. Screen-reader text is not clutter
-- it is often the longest string on a control precisely so the visible one can
be short, and budgeting it would push in exactly the wrong direction.

Run from the repo root:  ./scripts/check-copy-budget.py
"""

from __future__ import annotations

import re
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"

# (path, cap, what the screen is for). Caps are the measurement taken after the
# 2026-09-03 subtraction pass, rounded up with roughly 25% headroom -- enough
# that an honest addition does not trip it and a regression does.
BUDGETS = [
    # Reset on 2026-10-25 when the UI was rebuilt from the Claude Design
    # walkthrough. The old screens and their caps are in git history; these are
    # the new files, measured on the day they landed, with roughly 25% headroom.
    # The welcome story is the cover's successor and carries the same job: the
    # whole idea in ten seconds, so it is held tightest relative to its size.
    ("src/screens/Welcome.tsx", 90, "the welcome story: four acts and two buttons"),
    ("src/screens/Terms.tsx", 60, "three things to know before starting"),
    ("src/screens/ScanStep.tsx", 10, "the scan picker"),
    ("src/screens/CoverageSteps.tsx", 120, "insurer, plan type and name, where it is booked"),
    ("src/screens/OrderStep.tsx", 65, "the reason, and the facts a published rule reads"),
    ("src/screens/AmountStep.tsx", 10, "a keypad and its help line"),
    ("src/screens/CareStep.tsx", 25, "the planned-care options"),
    ("src/screens/ReviewStep.tsx", 20, "every answer, each tappable"),
    ("src/screens/Calculating.tsx", 15, "the work shown on the way to the answer"),
    ("src/screens/Answer.tsx", 60, "the best route and what it saves"),
    ("src/screens/AllRoutes.tsx", 15, "every route, with its deductible-credit clause"),
    ("src/screens/Why.tsx", 30, "why the best route won"),
    ("src/screens/TheMath.tsx", 45, "the estimate taken apart row by row"),
    ("src/screens/Facility.tsx", 20, "what to book and say"),
    ("src/screens/Checklist.tsx", 40, "published criteria against the order"),
    ("src/screens/Sources.tsx", 135, "provenance and scope"),
    ("src/screens/Home.tsx", 45, "estimates and the demo account's past scans"),
    ("src/screens/PlanScreen.tsx", 15, "the plan figures"),
    # Not screens, but sources of on-screen prose. Budgeting a screen and not the
    # module feeding it would leave the obvious place to hide growth unwatched.
    ("src/resultCopy.ts", 55, "the result screens' sentences"),
    ("src/routeCopy.ts", 110, "what to do about each route, and why"),
    ("src/marketing.ts", 330, "how-it-works and FAQ copy, all of it prose"),
]

# String props whose value a member reads on screen. `accessibilityLabel`,
# `accessibilityHint` and `spoken` are excluded -- see the module docstring.
VISIBLE_PROPS = ("label", "title", "placeholder", "summary")


def strip_comments(source: str) -> str:
    source = re.sub(r"\{/\*.*?\*/\}", "", source, flags=re.S)
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    source = re.sub(r"^\s*//.*$", "", source, flags=re.M)
    return source


def close_disclosures(source: str) -> str:
    """Drop the body of every `<Disclosure>`, keeping its opening tag.

    This is what makes the number mean something. Total words in a file is the
    wrong measure -- the whole point of the pass this script came out of was
    moving text behind a tap, and a count that cannot tell the difference would
    have scored that work at roughly nothing.

    So what is counted is what a member sees on arrival. Burying detail in a
    disclosure genuinely does reduce it, which is not a loophole: it is the
    behaviour being asked for. The opening tag survives because `title` and
    `summary` are on it, and those stay on screen while it is closed.

    Nested disclosures come out for free -- the outermost match takes its
    children with it.
    """
    while True:
        start = source.find("<Disclosure")
        if start == -1:
            return source
        # End of the opening tag: the first ">" not inside a JSX expression.
        depth = 0
        i = start
        while i < len(source):
            if source[i] == "{":
                depth += 1
            elif source[i] == "}":
                depth -= 1
            elif source[i] == ">" and depth == 0:
                break
            i += 1
        open_tag_end = i + 1

        # Matching close, counting nested opens.
        nesting = 1
        j = open_tag_end
        while j < len(source) and nesting:
            nxt_open = source.find("<Disclosure", j)
            nxt_close = source.find("</Disclosure>", j)
            if nxt_close == -1:
                return source[:start] + source[start:open_tag_end] + source[open_tag_end:]
            if nxt_open != -1 and nxt_open < nxt_close:
                nesting += 1
                j = nxt_open + len("<Disclosure")
            else:
                nesting -= 1
                j = nxt_close + len("</Disclosure>")

        # `DISCLOSED` keeps the tag from being re-matched on the next pass.
        source = (
            source[:start]
            + "<DISCLOSED"
            + source[start + len("<Disclosure") : open_tag_end]
            + source[j:]
        )


def visible_words(source: str) -> int:
    source = close_disclosures(strip_comments(source))

    chunks: list[str] = []

    # JSX text nodes: >Some words here<
    chunks += re.findall(r">\s*([A-Za-z][^<>{}]*?)\s*<", source)

    # Visible string props on components.
    for prop in VISIBLE_PROPS:
        chunks += re.findall(rf"\b{prop}=\"([^\"]+)\"", source)
        chunks += re.findall(rf"\b{prop}='([^']+)'", source)

    # Prose in a data module (marketing.ts): any string literal long enough to
    # be a sentence rather than a key or a token.
    chunks += re.findall(r"'([A-Z][^']{24,})'", source)

    total = 0
    for chunk in chunks:
        # Collapse JSX whitespace and drop anything that is punctuation only.
        words = [w for w in chunk.split() if any(ch.isalpha() for ch in w)]
        total += len(words)
    return total


def main() -> int:
    failures = 0
    print(f"{'screen':34} {'words':>12}")
    for path, cap, purpose in BUDGETS:
        source = (APP / path).read_text()
        count = visible_words(source)
        over = count > cap
        failures += over
        status = "OVER" if over else "ok"
        print(f"  {Path(path).name:32} {count:4} / {cap:<4} {status}")
        if over:
            print(f"      {purpose}")
            print(
                f"      {count - cap} words over. Delete something, move it behind a "
                "tap, or raise the cap here on purpose."
            )

    if failures:
        print(f"\n{failures} screen(s) over budget")
        return 1

    print(f"\n{len(BUDGETS)} screens within budget")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
