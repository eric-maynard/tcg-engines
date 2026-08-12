#!/usr/bin/env python3
"""Stale-base guard for land-patch.sh.

A lane that captured its base before some commit landed, and then lands whole
files, silently reverts that commit — no test catches it when the loss is in a
doc or a code path no test covers (this cost us 50d33ab once). For each file
being landed, check that the distinctive lines HEAD gained recently are still
present in the incoming content.
"""
import subprocess, sys, os

REPO = os.environ.get("REPO", ".")
SINCE = os.environ.get("LAND_STALE_SINCE", "18 hours ago")
THRESH = float(os.environ.get("LAND_STALE_THRESH", "0.34"))


def sh(*a):
    return subprocess.run(a, cwd=REPO, capture_output=True, text=True).stdout


def recent_added_lines(path):
    """Non-trivial lines added to `path` by commits in the recent window."""
    out = sh("git", "log", f"--since={SINCE}", "-p", "--no-color",
             "--format=%H", "--", path)
    added = set()
    for ln in out.splitlines():
        if ln.startswith("+") and not ln.startswith("+++"):
            s = ln[1:].strip()
            # Skip boilerplate that legitimately recurs or vanishes.
            if len(s) >= 24 and not s.startswith(("import ", "//", "*", "#")):
                added.add(s)
    return added


def per_commit_added_lines(path):
    """{sha: added non-trivial lines} for each recent commit touching `path`.

    Whole-window ratios miss the case that actually bit us: a lane's copy is
    current except that it silently drops ONE landed commit. Checking each
    commit separately catches that while tolerating ordinary drift.
    """
    shas = sh("git", "log", f"--since={SINCE}", "--format=%H", "--", path).split()
    out = {}
    for sha in shas:
        diff = sh("git", "show", "--no-color", "--format=", sha, "--", path)
        added = {ln[1:].strip() for ln in diff.splitlines()
                 if ln.startswith("+") and not ln.startswith("+++")}
        out[sha] = {a for a in added
                    if len(a) >= 24 and not a.startswith(("import ", "//", "*", "#"))}
    return out


def last_commit_added_lines(path):
    """Non-trivial lines added by the most recent commit touching `path`.

    A lane whose base predates that commit will be missing them — the cheapest
    reliable staleness signal, and the one that catches a small surgical commit
    (a three-line guard) that a window-wide ratio would drown out.
    """
    sha = sh("git", "log", "-1", "--format=%H", "--", path).strip()
    if not sha:
        return set()
    out = sh("git", "show", "--no-color", "--format=", sha, "--", path)
    added = set()
    for ln in out.splitlines():
        if ln.startswith("+") and not ln.startswith("+++"):
            s = ln[1:].strip()
            if len(s) >= 24 and not s.startswith(("import ", "//", "*", "#")):
                added.add(s)
    return added


def main(files):
    stale = []
    for f in files:
        src = os.path.join(REPO, f)
        if not os.path.exists(src):
            continue
        want = recent_added_lines(f)
        try:
            have = {l.strip() for l in open(src, encoding="utf-8", errors="replace")}
        except OSError:
            continue
        missing = [w for w in want if w not in have]
        if len(want) >= 8 and len(missing) / len(want) > THRESH:
            stale.append((f, len(missing), len(want), missing[:3]))
            continue
        # Second signal: the file's newest commit is absent from the incoming
        # copy, so this lane's base predates it even though the bulk matches.
        for sha, added in per_commit_added_lines(f).items():
            if len(added) < 5:
                continue
            lost = [w for w in added if w not in have]
            if len(lost) / len(added) > 0.5:
                stale.append((f + f" (drops {sha[:7]})", len(lost), len(added), lost[:3]))
                break
    for f, m, t, sample in stale:
        print(f"stale_base {f} missing {m}/{t} recently-landed lines")
        for s in sample:
            print(f"stale_sample   {s[:110]}")
    return 1 if stale else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
