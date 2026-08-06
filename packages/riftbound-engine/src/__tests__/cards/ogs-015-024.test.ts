/**
 * Recruit the Vanguard — ogs-015-024 · Spell · Order · 6 energy
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Play four 1 [Might] Recruit unit tokens. (They can be played to your base or to battlefields
 *   you control.)
 *
 * Rules: tokens are played like units — each may go to your base or a battlefield you control and
 * enters exhausted (143.4); the token's controller/owner is the spell's controller; Action timing.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogs-015-024";
const recruits = (ids: string[]) => ids.filter((c) => c.startsWith("token-recruit-"));

function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .hand(P1, CARD, "rtv");
}

describe("Recruit the Vanguard (ogs-015-024)", () => {
  test("cost: 6 energy, no power; plays four 1-Might Recruit unit tokens (all to base here); spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("rtv");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    for (let i = 0; i < 4; i++) {
      await game.settle();
      expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
      await game.p1.pick("base");
    }
    await game.settle();
    expect(game.decision()?.kind).toBe("action"); // exactly four placements
    const toks = recruits(game.p1.base());
    expect(toks).toHaveLength(4);
    for (const t of toks) {
      expect(game.state(t)).toMatchObject({ baseMight: 1, controller: P1, isToken: true, might: 1, name: "Recruit", owner: P1 });
      expect(game.state(t).isExhausted).toBe(true); // played tokens enter exhausted
    }
    expect(game.zoneOf("rtv")).toBe("trash");
    const poor = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "rtv").build();
    expect(poor.p1.can("cast", "rtv")).toBe(false);
  });

  test("each token may go to your base OR a battlefield you control — an enemy-controlled battlefield is never offered", async () => {
    const game = await board().build();
    await game.p1.cast("rtv");
    const dests = ["battlefield-bf1", "base", "battlefield-bf1", "base"];
    for (const d of dests) {
      await game.settle();
      const dec = game.decision();
      const keys = dec?.kind === "pick" ? dec.options.map((o) => o.key).sort() : [];
      expect(keys).toEqual(["base", "battlefield-bf1"]);
      await game.p1.pick(d);
    }
    await game.settle();
    expect(recruits(game.p1.base())).toHaveLength(2);
    expect(recruits(game.p1.units("bf1"))).toHaveLength(2);
    expect(recruits(game.p1.units("bf2"))).toHaveLength(0);
    expect(recruits(game.p2.base())).toHaveLength(0);
  });

  test("[Action]: not castable on the opponent's turn outside a showdown", async () => {
    const game = await board().active(P2).build();
    expect(game.p1.can("cast", "rtv")).toBe(false);
  });

  test("[Action]: castable during a showdown on the opponent's turn once P1 holds Focus", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 6 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Wall" }, "wall")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, CARD, "rtv")
      .build();
    await game.p2.move("raider", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "rtv")).toBe(true);
    await game.p1.cast("rtv");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rtv", controller: P1 })]);
  });
});
