#!/usr/bin/env bun
/**
 * Visual-review helper.
 *
 * Takes 1+ image paths as args and prints a structured "common visual
 * bugs" checklist alongside each. The point is NOT to mechanically
 * detect bugs (no OCR / model inference here) — it's to give the agent
 * (or the human looking over its shoulder) a consistent prompt to
 * actually LOOK at the screenshots, because in the past agents have
 * declared UI work done based on "tests pass / build clean" without
 * ever rendering a single frame and seeing what it looks like.
 *
 * Usage:
 *   bun run scripts/visual-review.ts <image-path> [<image-path> ...]
 *
 * Exit code:
 *   - 0 if all paths exist and were enumerated
 *   - 1 if any path is missing
 *
 * For each image the script prints:
 *   - resolved absolute path (so the Read tool can pick it up verbatim)
 *   - file size + format hint
 *   - the same checklist of "did you actually look at this?" items,
 *     framed as yes/no questions the reviewer is expected to answer
 *     after reading the file.
 *
 * The script does NOT attempt yes/no inference itself — its job is to
 * make the review step structured + repeatable. The actual review is
 * done by reading the images.
 */
import fs from "node:fs";
import path from "node:path";

interface ImageInfo {
  readonly absPath: string;
  readonly exists: boolean;
  readonly size: number;
  readonly ext: string;
}

const CHECKLIST: readonly string[] = [
  "1. Are battlefield (BF) tile unit chips clearly visible (not clipped, not 0-sized)?",
  "2. Do unit chips overlap the BF title pill or rules text in a way that obscures either?",
  "3. Are BASE-zone units (above/below the BF row) visible and proportionate?",
  "4. Are hand chips (player's own hand) full-size at the bottom of the board?",
  "5. Is the opponent hand strip showing face-down chips (no card faces leaked)?",
  "6. Are any UI elements rendering outside their parent container (overflow leak)?",
  "7. Are z-index layers correct: art behind, chips on top, badges/title above chips?",
  "8. Is text legible (no white-on-white, no clipping, no ellipsis on critical labels)?",
  "9. Are combat-role badges (ATTACKING / DEFENDING) visible when in showdown?",
  "10. Does the overall layout match the intended game-table aesthetic (no giant voids)?",
  // R9 — defect-1 cross-frame check (TCG convention: exhausted units rotate 90°).
  "R9. Are exhausted units rendered ROTATED 90° clockwise (TCG 'tapped' convention)?",
  "    Cross-frame: pick a unit visible across turns N and N+1. If meta says",
  "    exhausted=true at N+1, the chip must be sideways at N+1 but upright at N.",
  // R10 — defect-3: focus / priority popup during showdowns.
  "R10. During an active showdown chain, is the focus/priority prompt visible",
  "     (banner reads 'You have priority — play a reaction or pass' OR",
  "      'Waiting for opponent to act or pass…')?",
  // U9 — defect-2: cross-frame element-geometry stability.
  "U9. No element resize between frames — compare bounding rects of .hand,",
  "    .move-log, .sidebar, .bf-row across consecutive frames. Use",
  "    page.evaluate(() => document.querySelector(SEL).getBoundingClientRect())",
  "    and assert deltas < 5px on each axis for stable elements.",
];

function inspect(p: string): ImageInfo {
  const abs = path.resolve(p);
  let exists = false;
  let size = 0;
  try {
    const st = fs.statSync(abs);
    exists = st.isFile();
    ({ size } = st);
  } catch {
    /* Missing */
  }
  const ext = path.extname(abs).toLowerCase().replace(/^\./, "") || "(none)";
  return { absPath: abs, exists, ext, size };
}

function fmtBytes(n: number): string {
  if (n < 1024) {return `${n} B`;}
  if (n < 1024 * 1024) {return `${(n / 1024).toFixed(1)} KiB`;}
  return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("usage: bun run scripts/visual-review.ts <image-path> [<image-path> ...]");
    process.exit(2);
  }

  let anyMissing = false;
  console.log("\n=== Visual review checklist ===\n");
  console.log("For each image below: READ it (via the Read tool or by opening");
  console.log("the file), then answer each checklist item. Do NOT declare");
  console.log("success unless every item is OK or knowingly accepted.\n");

  args.forEach((p, idx) => {
    const info = inspect(p);
    console.log(`[${idx + 1}/${args.length}] ${info.absPath}`);
    if (!info.exists) {
      console.log("    MISSING — cannot review");
      anyMissing = true;
      console.log("");
      return;
    }
    console.log(`    size: ${fmtBytes(info.size)}   format: ${info.ext}`);
    console.log("    checklist:");
    for (const line of CHECKLIST) {
      console.log(`      [ ] ${line}`);
    }
    console.log("");
  });

  console.log("=== End checklist ===");
  console.log("Reviewer: mark every [ ] either [Y] (ok) or [N] (problem found).");
  console.log("Iterate on the implementation until all items pass on the");
  console.log("targeted frames before reporting success.\n");

  process.exit(anyMissing ? 1 : 0);
}

main();
