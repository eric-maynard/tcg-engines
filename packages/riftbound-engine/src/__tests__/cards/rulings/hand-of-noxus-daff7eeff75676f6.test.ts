/**
 * Ruling daff7eeff75676f6 — Hand of Noxus (Darius legend, OGN-253 → ogn-253-298)
 *     "[Exhaust]: [Reaction], [Legion] — [Add] [1]. (Get the effect if you've played a card this turn.)"
 *   × Legion Rearguard (OGN-010 → ogn-010-298) · 2-cost Fury unit, "[Accelerate] (pay [1][fury] more to enter ready)"
 *
 * Q: Can Darius's Hand of Noxus [Add] [1] be used to pay Legion Rearguard's Accelerate cost as the FIRST play of a turn?
 * A: No. Hand of Noxus is itself a [Legion] ability — it can only be activated after you have already played a card
 *    this turn. Accelerate is an additional cost paid while playing the unit (not a Legion ability), so with nothing
 *    played yet Darius can't contribute. Once another card has been played first (the ruling's "seal, then Rearguard"
 *    line), Darius can be tapped and Rearguard played accelerated, entering ready.
 * Rules: 819 (Legion), 356 (additional costs paid at finalization), 143.4 / Accelerate (enters ready if paid).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const HAND_OF_NOXUS = "ogn-253-298";
const LEGION_REARGUARD = "ogn-010-298";
/** A cheap first play so the Legion condition can be met in the contrast case. */
const TRINKET = { cardType: "gear", energyCost: 1, name: "Trinket" } as const;

/** P1's turn, nothing played yet. Pool = Rearguard's base [2] + a [fury] for the Accelerate pip; Accelerate would need one more [1]. */
function board(extraEnergy = 0) {
  return scenario()
    .legend(P1, HAND_OF_NOXUS, "darius")
    .resources(P1, { energy: 2 + extraEnergy, power: { fury: 1 } })
    .hand(P1, LEGION_REARGUARD, "rear")
    .hand(P1, TRINKET, "trinket");
}

describe("Ruling daff7eeff75676f6 — Hand of Noxus can't fund Accelerate on the first play of the turn", () => {
  test("with no card played this turn, Darius's [Legion] [Add] ability is not activatable and Rearguard cannot be accelerated on [2][fury]", async () => {
    const game = await board().build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    // Legion not met → the legend ability is simply not on the menu.
    expect(game.p1.can("activate", "darius")).toBe(false);
    expect(game.state("darius").isExhausted).toBe(false);
    // Accelerate needs [3][fury] in the pool at finalization; only [2][fury] is there and Darius can't add.
    const accel = await game.p1.try((p) => p.play("rear", { accelerate: true }));
    expect(accel.ok).toBe(false);
    // The plain play is fine: costs are paid, the permanent resolves immediately and enters exhausted.
    await game.p1.play("rear");
    expect(game.zoneOf("rear")).toBe("base");
    expect(game.state("rear").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // base [2] only; the Accelerate pip was never spent
    // Now a card HAS been played — Darius wakes up, but too late for that Accelerate.
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.can("activate", "darius")).toBe(true);
  });

  test("contrast: play another card first → Legion is met, Darius adds [1] (no chain item), and Rearguard is played accelerated and enters ready", async () => {
    const game = await board(1).build(); // [3][fury]: Trinket [1] leaves exactly [2][fury] — one short of Accelerate
    await game.p1.play("trinket");
    expect(game.zoneOf("trinket")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    // Still can't accelerate on [2][fury] alone…
    expect((await game.p1.try((p) => p.play("rear", { accelerate: true }))).ok).toBe(false);
    // …but Darius is now live: [Add] [1] resolves immediately.
    expect(game.p1.can("activate", "darius")).toBe(true);
    await game.p1.activate("darius");
    expect(game.state("darius").isExhausted).toBe(true);
    expect(game.p1.energy()).toBe(3);
    expect(game.chain()).toEqual([]);
    await game.p1.play("rear", { accelerate: true });
    expect(game.zoneOf("rear")).toBe("base");
    expect(game.state("rear").isExhausted).toBe(false); // Accelerate paid → enters ready
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });
});
