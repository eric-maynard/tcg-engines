/**
 * Gem Jammer — sfd-007-221 · Unit · Fury · 2 energy · 2 might
 *
 *   When you play me, give a unit [Ganking] this turn. (It can move from battlefield to battlefield.)
 *
 * Rules: 810 Ganking (a passive keyword adding the battlefield → battlefield option to the unit's
 * Standard Move), 383 triggered "When you play me" abilities (target chosen on resolution).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-007-221";

function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P2, "bf2", { might: 2, name: "Foe" }, "foe")
    .hand(P1, CARD, "gj");
}

describe("Gem Jammer (sfd-007-221)", () => {
  test("cost: 2 energy, no power; a 2-might unit; unaffordable with 1", async () => {
    const game = await board().build();
    await game.p1.play("gj", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("gj")).toBe("base");
    expect(game.state("gj").might).toBe(2);
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "gj").build();
    expect(poor.p1.can("play", "gj")).toBe(false);
  });

  test("play trigger: goes on the chain, then asks for a unit (friendly or enemy) and grants it Ganking this turn", async () => {
    const game = await board().build();
    await game.p1.play("gj", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gj", controller: P1, triggered: true })]);
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect(offered).toEqual(expect.arrayContaining(["ally", "foe", "gj"]));
    await game.p1.pick("ally");
    await game.settle();
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Ganking", value: undefined }]);
    expect(game.state("ally").keywords).toContain("Ganking");
    expect(game.state("foe").keywords).not.toContain("Ganking");
  });

  test("Ganking lets the chosen unit move battlefield → battlefield (bf1 → bf2) this turn", async () => {
    const game = await board().build();
    expect(game.p1.can("gank", "ally")).toBe(false); // not before the grant
    await game.p1.play("gj", { to: "base" });
    await game.settle();
    await game.p1.pick("ally");
    await game.settle();
    expect(game.p1.can("gank", "ally")).toBe(true);
    await game.p1.gank("ally", "bf2");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash"); // 3 into 2
    expect(game.locationOf("ally")).toBe("bf2");
  });

  test("'this turn': the granted Ganking is gone after the turn ends", async () => {
    const game = await board().build();
    await game.p1.play("gj", { to: "base" });
    await game.settle();
    await game.p1.pick("ally");
    await game.settle();
    await game.advanceTurn();
    expect(game.state("ally").grantedKeywords).toEqual([]);
    expect(game.state("ally").keywords).not.toContain("Ganking");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("gank", "ally")).toBe(false);
  });
});
