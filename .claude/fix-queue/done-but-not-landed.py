#!/usr/bin/env python3
"""Audit: is every CLOSED item's own facet actually fixed at HEAD?

The failure this catches is not a wrong fix — it is a fix that was never
committed. A lane verifies in its own worktree, marks the item done, and its
land is then refused or reaped; the item reads as finished forever while the
marker sits in the tree still failing. A 2026-08-13 triage found SEVEN at once,
which made land-loss the biggest single leak in the loop.

    python3 .claude/fix-queue/done-but-not-landed.py            # report
    python3 .claude/fix-queue/done-but-not-landed.py --reopen   # reopen offenders

A file holds many facets, so "this file still has a marker" is far too coarse.
We match the ITEM's own distinctive words against the text of a still-failing
marker at HEAD. `scanned=0` is a FAILURE, not an all-clear.
"""
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DONE = os.path.join(REPO, ".claude", "fix-queue", "done")
MARKER = re.compile(r"(test|it)\.failing")
REOPEN = "--reopen" in sys.argv


def head_text(path: str, dirty: set[str]) -> str:
    """HEAD's content — read the working copy when it is identical to HEAD."""
    if path in dirty:
        r = subprocess.run(["git", "-C", REPO, "show", f"HEAD:{path}"],
                           capture_output=True, text=True)
        return r.stdout if r.returncode == 0 else ""
    try:
        with open(os.path.join(REPO, path), encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def keywords(title: str) -> list[str]:
    t = re.sub(r"^\[[^\]]*\]\s*", "", title)          # coordinator prefixes
    t = re.sub(r"^(BUG|GAP)[^:]*:\s*", "", t)
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z0-9_.\-]{4,}", t) if not w.isdigit()]
    return words[:5]


def main() -> int:
    dirty = set(subprocess.run(["git", "-C", REPO, "diff", "--name-only", "HEAD"],
                               capture_output=True, text=True).stdout.split())
    scanned = suspect = 0
    for name in sorted(os.listdir(DONE)):
        if not name.endswith(".json"):
            continue
        p = os.path.join(DONE, name)
        try:
            d = json.load(open(p))
        except Exception:
            continue
        tf = d.get("testFile") or d.get("fileHint") or ""
        if not tf.endswith(".test.ts") or "__tests__" not in tf:
            continue
        if not os.path.exists(os.path.join(REPO, tf)):
            continue
        kw = keywords(d.get("title", ""))
        if len(kw) < 3:
            continue
        scanned += 1
        for line in head_text(tf, dirty).splitlines():
            if MARKER.search(line) and sum(k in line for k in kw) >= 3:
                print(f"suspect={d.get('id', name[:-5])}  its own facet is still marked failing at HEAD in {tf}")
                suspect += 1
                if REOPEN:
                    d["attempts"] = 0
                    d["claim"] = None
                    if not d.get("title", "").startswith("[REOPENED"):
                        d["title"] = ("[REOPENED by the done-but-not-landed audit — closed while ITS OWN facet is "
                                      "still marked failing at HEAD, so the fix never landed. Re-verify at HEAD "
                                      "first; if the fix is real, land it AND the marker flip together.] "
                                      + d.get("title", ""))
                    d.setdefault("history", []).append({"at": "now", "event": "reopened:done-but-not-landed"})
                    json.dump(d, open(p.replace("/done/", "/open/"), "w"), indent=2)
                    os.remove(p)
                break
    print(f"scanned={scanned} suspect={suspect}")
    return 1 if scanned == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
