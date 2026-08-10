/**
 * Ruling d9e5c340b9131254 — Pack of Wonders (OGN-181 → ogn-181-298) · Gear · [2]
 *   "[Exhaust]: Return another friendly gear, unit, or facedown card to its owner's hand."
 *   × Treasure Trove (OGN-186 → ogn-186-298) · Gear · [2]
 *   "When this leaves the board, draw 1 and channel 1 rune exhausted. / [chaos], [Exhaust]: Kill this."
 *
 * Q: Does returning Treasure Trove to hand with Pack of Wonders trigger its "leaves the board" effect?
 * A: Yes — bounce to hand is leaving the board: draw 1 and channel 1 rune exhausted.
 * Rules: "leaves the board" covers any board → non-board zone change (hand included), 383 (triggered abilities).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PACK_OF_WONDERS = "ogn-181-298";
const TREASURE_TROVE = "ogn-186-298";

/** P1's turn, empty pool. Pack of Wonders and Treasure Trove both ready in P1's base; a Bystander unit too (so the Pack has a real choice). */
function board() {
  return scenario()
    .battlefield("bf1")
    .gear(P1, PACK_OF_WONDERS, "pack")
    .gear(P1, TREASURE_TROVE, "trove")
    .unit(P1, "base", { might: 2, name: "Bystander" }, "bystander");
}

/** Activate the Pack choosing the Trove (target given up front or answered when asked) and let the ability resolve. */
async function packReturnsTrove(): Promise<Game> {
  const game = await board().build();
  const targetsField = game.p1.option("activate", "pack")?.fields.find((f) => f.name === "targets");
  if (targetsField) {
    expect((targetsField.options ?? []).flat()).toEqual(expect.arrayContaining(["trove", "bystander"]));
    expect((targetsField.options ?? []).flat()).not.toContain("pack"); // "another"
    await game.p1.activate("pack", 0, { targets: "trove" });
  } else {
    await game.p1.activate("pack", 0, { answers: ["trove"] });
  }
  expect(game.state("pack").isExhausted).toBe(true);
  for (let i = 0; i < 6 && game.zoneOf("trove") !== "hand"; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick("trove");
    } else if (d?.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).passPriority();
    } else {
      break;
    }
  }
  return game;
}

describe("Ruling d9e5c340b9131254 — Pack of Wonders bouncing Treasure Trove triggers its leaves-the-board effect", () => {
  test("the Pack's ability resolves: Treasure Trove goes to its owner's (P1's) hand — and its 'leaves the board' trigger is put on the chain", async () => {
    const game = await packReturnsTrove();
    expect(game.zoneOf("trove")).toBe("hand");
    expect(game.p1.hand()).toContain("trove");
    expect(game.p1.gear()).toEqual(["pack"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "trove", controller: P1, triggered: true })]);
  });

  test("that trigger resolves: P1 draws 1 and channels 1 rune EXHAUSTED", async () => {
    const game = await packReturnsTrove();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    const runes = game.p1.runes().length;
    const ready = game.p1.runes({ ready: true }).length;
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.p1.runes()).toHaveLength(runes + 1);
    expect(game.p1.runes({ ready: true })).toHaveLength(ready); // the channeled rune is exhausted
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
