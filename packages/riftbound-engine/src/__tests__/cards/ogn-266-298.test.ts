/**
 * Siphon Power — ogn-266-298 · Spell · Mind/Order · 2 energy + [rainbow] · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Choose a battlefield. Give friendly units there +1 [Might] this turn and enemy units there
 *   -1 [Might] this turn, to a minimum of 1 [Might].
 *
 * Rules: the only choice is a BATTLEFIELD; every friendly unit there gets +1 and every enemy unit
 * there −1 (floored at 1) until end of turn; units elsewhere are untouched. Reaction timing = any
 * turn, including onto an open chain.
 *
 * The cast names the chosen battlefield (`targets: "bf1"`); a [rainbow] pip is paid from `power.rainbow`.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-266-298";

function board(res: { energy: number; power?: Record<string, number> } = { energy: 2, power: { rainbow: 1 } }) {
  return scenario()
    .resources(P1, res)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Friend A" }, "f1")
    .unit(P1, "bf1", { might: 2, name: "Friend B" }, "f1b")
    .unit(P2, "bf1", { might: 3, name: "Enemy Big" }, "e1")
    .unit(P2, "bf1", { might: 1, name: "Enemy Small" }, "e1s")
    .unit(P1, "bf2", { might: 2, name: "Friend Far" }, "f2")
    .unit(P2, "bf2", { might: 3, name: "Enemy Far" }, "e2")
    .unit(P1, "base", { might: 2, name: "Friend Home" }, "fb")
    .hand(P1, CARD, "sp");
}

describe("Siphon Power (ogn-266-298)", () => {
  test("cost: 2 energy + 1 rainbow; resolves to trash; unaffordable without the power or with 1 energy", async () => {
    const game = await board().build();
    await game.p1.cast("sp", { targets: "bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle();
    expect(game.zoneOf("sp")).toBe("trash");
    const noPower = await board({ energy: 2 }).build();
    expect(noPower.p1.can("cast", "sp")).toBe(false);
    const lowEnergy = await board({ energy: 1, power: { rainbow: 1 } }).build();
    expect(lowEnergy.p1.can("cast", "sp")).toBe(false);
  });

  test("at the chosen battlefield a friendly unit gets +1 and an enemy unit −1 this turn; other locations untouched", async () => {
    const game = await board().build();
    await game.p1.cast("sp", { targets: "bf1" });
    await game.settle();
    expect(game.state("f1").might).toBe(3);
    expect(game.state("e1").might).toBe(2);
    expect(game.state("f2").might).toBe(2);
    expect(game.state("e2").might).toBe(3);
    expect(game.state("fb").might).toBe(2);
  });

  test("ALL friendly units there get +1 and ALL enemy units there get −1", async () => {
    const game = await board().build();
    await game.p1.cast("sp", { targets: "bf1" });
    await game.settle();
    expect(game.state("f1").might).toBe(3);
    expect(game.state("f1b").might).toBe(3);
    expect(game.state("e1").might).toBe(2);
    expect(game.state("e1s").might).toBe(1);
  });

  test("'to a minimum of 1 [Might]': a 1-might enemy unit there stays at 1", async () => {
    const game = await board().build();
    await game.p1.cast("sp", { targets: "bf1" });
    await game.settle();
    expect(game.state("e1s").might).toBe(1);
    expect(game.state("f1").might).toBe(3);
  });

  test("the choice is a battlefield — the legal targets are exactly the battlefields, never units", async () => {
    const game = await board().build();
    const opts = (game.p1.option("cast", "sp")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(opts.map((o) => [...o]).sort()).toEqual([["bf1"], ["bf2"]]);
    const bad = await game.p1.try((p) => p.cast("sp", { targets: ["f1", "e1"] }));
    expect(bad.ok).toBe(false);
  });

  test("'this turn': the modifiers are gone after the turn ends", async () => {
    const game = await board().build();
    await game.p1.cast("sp", { targets: "bf1" });
    await game.settle();
    expect(game.state("f1").might).toBe(3);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("f1").might).toBe(2);
    expect(game.state("e1").might).toBe(3);
  });

  test("Reaction timing: castable on the opponent's turn in response to their spell (lands on top of the chain, resolves first)", async () => {
    const game = await board()
      .active(P2)
      .resources(P2, { energy: 2 })
      .hand(P2, { abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 2, name: "Slow Draw", timing: "action" }, "theirs")
      .build();
    await game.p2.cast("theirs");
    await game.p2.passPriority();
    expect(game.p1.can("cast", "sp")).toBe(true);
    await game.p1.cast("sp", { targets: "bf1" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["theirs", "sp"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Siphon Power resolves first (LIFO)
    expect(game.state("f1").might).toBe(3);
    expect(game.chain().map((c) => c.cardId)).toEqual(["theirs"]);
    await game.settle();
    expect(game.zoneOf("sp")).toBe("trash");
  });
});
