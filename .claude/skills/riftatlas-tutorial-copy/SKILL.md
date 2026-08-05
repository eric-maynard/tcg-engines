---
name: riftatlas-tutorial-copy
description: Watch a RiftAtlas gameplay video, extract UI/UX behaviors it demonstrates, and check whether each is present in our app. Reports {feature, riftatlas_behavior, our_behavior, gap}.
---

# riftatlas-tutorial-copy

RiftAtlas (riftatlas.com) is a working Riftbound client. This skill takes a gameplay video, extracts the UI behaviors it shows (drag interactions, prompts, animations, board layout, resource displays), and checks each against our app at `localhost:3000`.

## Prerequisites

- `yt-dlp` and `ffmpeg` available (install: `pip install yt-dlp` / `apt install ffmpeg`)
- App running at `localhost:3000` + a `pw` lane free (see `/tcg-test` prerequisites)

## Run

```
Workflow({
  scriptPath: '.claude/workflows/riftatlas-tutorial-copy.js',
  args: { videoUrl: 'https://www.youtube.com/watch?v=6t2YPOQEp14', frames: 60, lane: 23 }
})
```

Args:
- `videoUrl` — YouTube URL (or local .mp4 path)
- `frames` — how many frames to sample evenly across the video (default 60)
- `lane` — pw-repl lane for our-app screenshots (default 23)

## What it does

1. **Download + sample**: `yt-dlp` fetches the video; `ffmpeg -vf fps=...` extracts N evenly-spaced frames to `/tmp/riftatlas/frame-%03d.png`.
2. **Extract behaviors**: agents read frame batches (5-8 frames each) and describe what UI action is happening — "player dragged a card from hand to battlefield", "a target-selection modal appeared with 3 cards", "energy display ticked 4→2", "hovering shows a large card preview at the right". Output: `{timestamp, feature, description}` list.
3. **Dedupe** into a feature list (~15-30 unique behaviors).
4. **Check ours**: for each feature, one agent goldfish-plays via `pw` on lane N, tries to reproduce the same interaction, screenshots, and reports `{feature, riftatlas: <what the video showed>, ours: <what happened>, verdict: PRESENT|MISSING|DIFFERENT}`.
5. Return the gap list ranked by how often the feature appeared in the video.

## Output

`.claude/skills/riftatlas-tutorial-copy/GAPS-<video-id>.json` — one entry per feature:
```json
{"feature":"drag-to-battlefield","riftatlas":"card follows cursor, drops onto glowing zone, snaps in","ours":"drag works but no glow/snap; card teleports","verdict":"DIFFERENT","frames":[12,34,51]}
```

## Limits

- Frame-sampling misses fast interactions (< video_length/frames seconds). Use `frames:120` for dense coverage.
- Agents describe what they SEE — a subtle animation may be described inconsistently across batches. The dedupe step groups by semantic similarity but isn't perfect.
- "Check ours" agents can only test what's reachable in goldfish; multiplayer-only features get `verdict:NOT_TESTABLE`.
