/**
 * Ruling ae766345a675d38f — Charm (OGN-043 → ogn-043-298) · Spell · [1][calm] · "Move an enemy unit."
 *   × Teemo, Scout (OGN-197 → ogn-197-298) · Unit · [2] · 1 Might · "[Hidden] · When you play me, give me
 *     +3 [Might] this turn." — the card sitting face-down at the battlefield.
 *
 * Q: A battlefield holds one unit and one hidden card. The opponent Charms that unit away — what happens to
 *    the hidden card?
 * A: If it is not revealed as a reaction it is left as the only card there, its hider loses control of the
 *    battlefield, and the face-down card is removed in the following Cleanup. Revealing it in reaction (a
 *    hidden card can still be played whenever that timing is legal) keeps a unit there and saves it.
 * Rules: 323.6 / 190.4.c (control lapses in the next Open Cleanup), 323.7 (facedown cards go with it),
 *        811 (hidden cards are played from the Facedown Zone).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHARM = "ogn-043-298";
const TEEMO_SCOUT = "ogn-197-298";

/** P2 holds bf1 with a single unit and a face-down Teemo there; P1 has Charm and the [calm] to cast it. */
function loneGuardAndHiddenCard() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .facedown(P2, "bf1", TEEMO_SCOUT, "teemo")
    .hand(P1, CHARM, "charm");
}

describe("Ruling ae766345a675d38f — Charming away the last unit strands the hidden card, which the Cleanup removes", () => {
  test("the face-down card starts in the Facedown Zone of the battlefield its hider controls", async () => {
    const game = await loneGuardAndHiddenCard().build();
    expect(game.zoneOf("teemo")).toBe("facedown-bf1");
    expect(game.p2.facedown("bf1")).toEqual(["teemo"]);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("not revealed: the unit is Charmed to base, control lapses and the hidden card is trashed in the Cleanup", async () => {
    const game = await loneGuardAndHiddenCard().build();
    await game.p1.cast("charm", { targets: "guard", answers: ["base"] });
    await game.settle();
    expect(game.locationOf("guard")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeFalsy();
    expect(game.zoneOf("teemo")).toBe("trash");
    expect(game.p2.facedown("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("revealed in reaction to the Charm: Teemo arrives at bf1, so P2 still has a unit there and keeps control", async () => {
    const game = await loneGuardAndHiddenCard().build();
    await game.p1.cast("charm", { targets: "guard", answers: ["base"] });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("reveal", "teemo")).toBe(true);
    await game.p2.reveal("teemo");
    await game.settle();
    expect(game.locationOf("guard")).toBe("base"); // the Charm still resolved
    expect(game.zoneOf("teemo")).toBe("battlefield-bf1"); // …but the battlefield is not empty
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
