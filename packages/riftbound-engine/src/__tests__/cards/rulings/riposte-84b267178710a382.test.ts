/**
 * Ruling 84b267178710a382 — Riposte (SFD-206 → sfd-206-221) × Call to Glory (OGN-207 → ogn-207-298)
 *
 *   Riposte — Spell · Body/Order · 2 · [Reaction]
 *     "Choose a friendly unit and a spell. Counter that spell and give that unit +[Might] equal to that
 *      spell's Energy cost this turn."
 *   Call to Glory — Spell · Order · 3 · [Reaction]
 *     "As you play this, you may spend a buff as an additional cost. If you do, ignore this spell's cost.
 *      Give a unit +3 [Might] this turn."
 *
 * Q: Does Riposte grant Might equal to the PRINTED energy cost of the spell, or the modified cost paid?
 * A: The printed Energy cost, regardless of modifications / alternative costs. Riposte on a Call to Glory
 *    that was paid for by spending a buff (0 energy actually paid) still grants +3.
 * Rules: 137 (a card's cost is its printed cost), 356.1.b.1 (ignore cost → pay 0), 425.1 (counter).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPOSTE = "sfd-206-221";
const CALL_TO_GLORY = "ogn-207-298";

function board(p1Energy: number) {
  return scenario()
    .resources(P1, { energy: p1Energy })
    .resources(P2, { energy: 2, power: { body: 1, order: 1, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 2, name: "Buff Donor" }, "donor", { buffed: true })
    .unit(P2, "bf1", { might: 4, name: "Fencer" }, "fencer")
    .hand(P1, CALL_TO_GLORY, "ctg")
    .hand(P2, RIPOSTE, "riposte");
}

async function riposteTheGlory(game: Game): Promise<void> {
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", "riposte")).toBe(true);
  await game.p2.cast("riposte", { targets: "fencer" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ctg", "riposte"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
}

describe("Ruling 84b267178710a382 — Riposte reads the countered spell's PRINTED Energy cost", () => {
  test("Call to Glory paid by spending a buff (0 energy paid): Riposte counters it and still grants +3 (printed cost 3)", async () => {
    const game = await board(0).build();
    // P1 casts Call to Glory for free by spending donor's buff.
    await game.p1.cast("ctg", { payOptional: true, targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("donor").isBuffed).toBe(false);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ctg"]);

    await riposteTheGlory(game);
    // Call to Glory was countered: ally did not get +3; the buff spent as a cost is not refunded (425.1.c.1).
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("ally").might).toBe(2);
    expect(game.state("donor").isBuffed).toBe(false);
    // Riposte grants the PRINTED cost (3), not the 0 energy actually paid.
    expect(game.state("fencer").might).toBe(7);
    expect(game.zoneOf("riposte")).toBe("trash");
  });

  test("control: Call to Glory paid normally with 3 energy — Riposte grants the same +3", async () => {
    const game = await board(3).build();
    await game.p1.cast("ctg", { payOptional: false, targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("donor").isBuffed).toBe(true);
    await riposteTheGlory(game);
    expect(game.zoneOf("ctg")).toBe("trash");
    expect(game.state("ally").might).toBe(2);
    expect(game.state("fencer").might).toBe(7);
  });

  test("the +Might is 'this turn' only", async () => {
    const game = await board(0).build();
    await game.p1.cast("ctg", { payOptional: true, targets: "ally" });
    await riposteTheGlory(game);
    expect(game.state("fencer").might).toBe(7);
    await game.advanceTurn();
    expect(game.state("fencer").might).toBe(4);
  });
});
