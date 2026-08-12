/**
 * Ruling 3368643605aa9d23 — (no specific card) banish-and-replay your own unit under a hidden card
 *   Exercised with Temporal Breach (VEN-066 → ven-066-166) "[Hidden] Banish a unit, then its owner plays it
 *   to the same location, ignoring its cost." and Block (OGN-057 → ogn-057-298) as the hidden card.
 *
 * Q: When you banish a unit and replay it to that same battlefield, does a hidden card there stay if it is
 *    not played?
 * A: Yes. Control of the battlefield is never lost: the whole banish-and-replay happens while the chain item
 *    is resolving (a Closed State), so no Cleanup ever sees you with no unit there in an Open State. The
 *    hidden card is only removed when you lose control at a Cleanup — which never happens here.
 * Rules: 190.4 / 323.6 (control lapses only at a Cleanup in an OPEN State), 401.1 (a resolving item is a
 *        Closed State), 323.7 / 466.5.c (a hidden card is trashed when its battlefield's controller changes),
 *        FIXER-PRIMER §BATTLEFIELD CONTROL TIMING (the adjudicated model this ruling agrees with).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const TEMPORAL_BREACH = "ven-066-166"; // [2][mind]
const BLOCK = "ogn-057-298"; // [Hidden] spell — the card sitting facedown at bf1

/** [Action] "Recall a unit." — the contrast case: the battlefield really is left empty in an Open State. */
const RECALL_SPELL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "recall" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 0,
  name: "Test Recall",
  rulesText: "[Action] Recall a unit.",
  timing: "action",
} as const;

/** Turn 3, P1's turn: P1 holds bf1 with a lone Warden and Block hidden there from an earlier turn. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Warden" }, "warden")
    .unit(P2, "bf2", { might: 4, name: "Theirs" }, "theirs")
    .facedown(P1, "bf1", BLOCK, "block");
}

describe("Ruling 3368643605aa9d23 — banishing and replaying your own unit to the same battlefield keeps control and the hidden card", () => {
  test("the Warden comes back to bf1, P1 never stops controlling it, and Block is still facedown there", async () => {
    const game = await board().hand(P1, TEMPORAL_BREACH, "breach").build();
    expect(game.zoneOf("block")).toBe("facedown-bf1");
    await game.p1.cast("breach", { targets: "warden" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // still controlled while the item is pending
    await game.settle();
    expect(game.locationOf("warden")).toBe("bf1");
    expect(game.zoneOf("warden")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("block")).toBe("facedown-bf1"); // undisturbed
    expect(game.p1.facedown("bf1")).toEqual(["block"]);
    expect(game.violations()).toEqual([]);
  });

  test("…and the hidden card is still a live card: it can be played from there afterwards", async () => {
    const game = await board().hand(P1, TEMPORAL_BREACH, "breach").build();
    await game.p1.cast("breach", { targets: "warden" });
    await game.settle();
    expect(game.p1.can("reveal", "block")).toBe(true);
    await game.p1.reveal("block");
    await game.settle();
    expect(game.zoneOf("block")).toBe("trash"); // played, not lost
    expect(game.state("warden").keywords).toContain("Shield");
  });

  test("contrast — really leaving the battlefield empty in an OPEN state does cost you the hidden card", async () => {
    const game = await board().hand(P1, RECALL_SPELL, "recall").build();
    await game.p1.cast("recall", { targets: "warden" });
    await game.settle();
    expect(game.locationOf("warden")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // 190.4 / 323.6
    expect(game.zoneOf("block")).toBe("trash"); // 323.7 — the hidden card follows the lost control
  });
});
