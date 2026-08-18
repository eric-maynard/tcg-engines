import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * [rule:ui-explain-refused-move] Dragging a second unit into a battlefield
 * whose showdown already opened must say WHY, not "No legal move to that zone".
 *
 * Rule 144.3 wants both units declared as one action; a solo first move applies
 * Contested and opens the showdown (190.3.a.1), so the follow-up drag is
 * correctly refused — and previously the player was told nothing they could
 * act on.
 */
const src = readFileSync("apps/riftbound-app/public/js/gameplay/drag-drop.js", "utf8");

function reasonWith(gameState: unknown, canGroup: boolean): string {
  // Lift the pure helper out of the classic script with its globals stubbed.
  const fn = new Function(
    "gameState",
    "availableMoves",
    "GroupMove",
    `${src.slice(src.indexOf("function moveRefusalReason"), src.indexOf("/** Drop-zone id for a movement destination"))}; return moveRefusalReason;`,
  )(gameState, [], { canGroup: () => canGroup });
  return fn("bf1", "u2");
}

describe("move refusal reason", () => {
  test("names the open showdown and the group move", () => {
    const msg = reasonWith({ battlefields: { bf1: { contested: true, showdownComplete: false } } }, false);
    expect(msg).toContain("showdown");
    expect(msg).toContain("Move as a group");
  });

  test("suggests the group move when one exists", () => {
    const msg = reasonWith({ battlefields: { bf1: {} } }, true);
    expect(msg).toContain("Move as a group");
  });

  test("falls back to the plain message when neither applies", () => {
    expect(reasonWith({ battlefields: { bf1: {} } }, false)).toBe("No legal move to that zone");
  });

  test("a COMPLETED showdown is not reported as open", () => {
    const msg = reasonWith({ battlefields: { bf1: { contested: true, showdownComplete: true } } }, false);
    expect(msg).toBe("No legal move to that zone");
  });
});
