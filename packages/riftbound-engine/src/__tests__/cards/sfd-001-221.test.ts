/**
 * Against the Odds — sfd-001-221 · Spell · Fury · 2 energy · Reaction
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   Give a friendly unit at a battlefield +2 [Might] this turn for each enemy unit there.
 *
 * Rules: 813 (Reaction timing — playable with priority/focus on any turn, incl.
 * showdowns and open chains), 355.6 (target = friendly unit AT A BATTLEFIELD),
 * "there" = the target's battlefield only.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-001-221";

function board(enemiesHere: number) {
  const b = scenario()
    .resources(P1, { energy: 2 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 3, name: "Homebody" }, "home")
    .unit(P2, "bf2", { might: 3, name: "Far" }, "far")
    .unit(P2, "base", { might: 3, name: "EnemyHome" }, "ehome")
    .hand(P1, CARD, "ato");
  for (let i = 0; i < enemiesHere; i++) b.unit(P2, "bf1", { might: 3, name: `Enemy${i}` }, `e${i}`);
  return b;
}

describe("Against the Odds (sfd-001-221)", () => {
  test("costs 2 energy; target must be a FRIENDLY unit AT A BATTLEFIELD (base units and enemies are not offered)", async () => {
    const game = await board(2).build();
    const targets = game.p1.option("cast", "ato")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["ally"]]);
    await game.p1.cast("ato", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("ato")).toBe("trash");
    const poor = await board(2).resources(P1, { energy: 1 }).build();
    expect(poor.p1.can("cast", "ato")).toBe(false);
    const noBfAlly = await scenario().resources(P1, { energy: 2 }).unit(P1, "base", { might: 3 }, "home").hand(P1, CARD, "ato").build();
    expect(noBfAlly.p1.can("cast", "ato")).toBe(false);
  });

  test("+2 Might this turn for EACH enemy unit there — two enemies → 3 + 4 = 7, back to 3 next turn", async () => {
    // Expected: ally 7 this turn, 3 after the turn passes. Actual: the per-enemy count resolves to 0 for a
    // spell (`location: "here"` has no anchor), so ally stays at 3.
    const game = await board(2).build();
    await game.p1.cast("ato", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(7);
    expect(game.state("home").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("ally").might).toBe(3);
  });

  test("only enemies at THAT battlefield count — one enemy there (others at bf2/base) → 3 + 2 = 5", async () => {
    // Expected: 5 (far/ehome don't count). Actual: 3 (see above).
    const game = await board(1).build();
    await game.p1.cast("ato", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(5);
  });

  test("no enemy units there → +0: the ally stays at 3", async () => {
    const game = await board(0).build();
    await game.p1.cast("ato", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(3);
    expect(game.zoneOf("ato")).toBe("trash");
  });

  test("[Reaction]: castable by the defender during the opponent's showdown once focus passes to them", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "ally")
      .unit(P2, "base", { might: 3 }, "e1")
      .unit(P2, "base", { might: 3 }, "e2")
      .hand(P1, CARD, "ato")
      .build();
    await game.p2.move(["e1", "e2"], "bf1");
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P2 });
    await game.p2.passFocus();
    expect(game.p1.can("cast", "ato")).toBe(true);
    await game.p1.cast("ato", { targets: "ally" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ato", controller: P1, triggered: false })]);
    expect(game.p1.energy()).toBe(0);
  });

  test("cast mid-showdown vs two 3-Might attackers, the defender (3 + 4 = 7) survives 6 damage and holds the battlefield", async () => {
    // Expected: ally lives (6 < 7), both attackers die to 7 damage, bf1 stays P1's. Actual: no Might is
    // granted, so the 3-Might ally dies and P2 conquers.
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "ally")
      .unit(P2, "base", { might: 3 }, "e1")
      .unit(P2, "base", { might: 3 }, "e2")
      .hand(P1, CARD, "ato")
      .build();
    await game.p2.move(["e1", "e2"], "bf1");
    await game.p2.passFocus();
    await game.p1.cast("ato", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });
});
