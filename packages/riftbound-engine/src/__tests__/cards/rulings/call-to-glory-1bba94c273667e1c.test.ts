/**
 * Ruling 1bba94c273667e1c — Call to Glory (OGN-207 → ogn-207-298) · Reaction · [3]
 *     "As you play this, you may spend a buff as an additional cost. If you do, ignore this spell's cost.
 *      Give a unit +3 [Might] this turn."
 *   × Wind Wall (OGN-064 → ogn-064-298) · Reaction · [3][calm][calm] · "Counter a spell."
 *   × Sett, Kingpin (ogn-240-298) as the buffed unit whose buff pays the additional cost.
 *
 * Q: When is an additional cost paid — as the spell is played, or when it resolves?
 * A: At FINALIZATION, part of putting the spell on the chain, long before it resolves. The spell is added
 *    pending → finalized (all costs, including additional costs, paid and all choices made) → everyone
 *    passes → it resolves. Because the payment happens before resolution, countering the spell refunds
 *    nothing.
 * Rules: 337.1 / 383.3.b (finalization), 402–404 (costs and choices at finalization), 425.1.c/.c.1
 *        (countering refunds no costs, additional ones included), 340.1 (LIFO resolution).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CALL_TO_GLORY = "ogn-207-298";
const WIND_WALL = "ogn-064-298";
const SETT = "ogn-240-298";

/** P1's turn. A BUFFED Sett holds bf1; P1 has exactly [3] and Call to Glory. P2 sits on Wind Wall + [3][calm][calm]. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", SETT, "sett", { buffed: true })
    .hand(P1, CALL_TO_GLORY, "glory")
    .resources(P1, { energy: 3 })
    .hand(P2, WIND_WALL, "wall")
    .resources(P2, { energy: 3, power: { calm: 2 } });
}

describe("Ruling 1bba94c273667e1c — Call to Glory's additional cost is paid at finalization, before the spell resolves", () => {
  test("baseline: buffed Sett alone at his battlefield is 7 Might (5 + buff + his own per-buffed-unit passive)", async () => {
    const game = await board().build();
    expect(game.state("sett")).toMatchObject({ baseMight: 5, isBuffed: true, might: 7 });
  });

  test("paying the additional cost (spend a buff) happens WHILE the spell is still on the chain: the buff is gone and [3] is ignored before anything resolves", async () => {
    const game = await board().build();
    await game.p1.cast("glory", { payOptional: true, targets: "sett" });
    // Still pending on the chain — nothing has resolved yet …
    expect(game.zoneOf("glory")).toBe("chain");
    expect(game.chain().map((c) => c.cardId)).toEqual(["glory"]);
    // … yet the additional cost is already paid, and paying it made the Energy cost be ignored.
    expect(game.state("sett").isBuffed).toBe(false);
    expect(game.state("sett").might).toBe(5); // 7 - 1 buff - 1 passive
    expect(game.p1.energy()).toBe(3);
    // Only now, on resolution, does the spell's own instruction apply.
    await game.settle();
    expect(game.zoneOf("glory")).toBe("trash");
    expect(game.state("sett").might).toBe(8);
  });

  test("declining the optional additional cost pays the printed [3] instead — also at finalization, before resolution", async () => {
    const game = await board().build();
    await game.p1.cast("glory", { targets: "sett" });
    expect(game.zoneOf("glory")).toBe("chain");
    expect(game.p1.energy()).toBe(0); // charged as the spell went on the chain
    expect(game.state("sett").isBuffed).toBe(true);
    expect(game.state("sett").might).toBe(7);
    await game.settle();
    expect(game.state("sett").might).toBe(10); // 7 + 3
    expect(game.zoneOf("glory")).toBe("trash");
  });

  test("proof the cost precedes resolution: P2 counters Call to Glory — the spent buff is NOT refunded and Sett never gets +3 (425.1.c)", async () => {
    const game = await board().build();
    await game.p1.cast("glory", { payOptional: true, targets: "sett" });
    expect(game.state("sett").isBuffed).toBe(false);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "wall")).toBe(true);
    await game.p2.cast("wall", { targets: "glory" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("glory")).toBe("trash"); // countered, cleared from the chain
    expect(game.state("sett")).toMatchObject({ isBuffed: false, might: 5 }); // no +3, no refunded buff
    expect(game.p1.energy()).toBe(3);
  });
});
