/**
 * Deadly Flourish — unl-073-219 · Spell · Mind · 4 energy
 *
 *   Deal 3 to an enemy unit. When it dies this turn, play a Gold gear token exhausted.
 *   (It has "[Reaction][>] Kill this, [Exhaust]: [Add] [rainbow].")
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. Two parts: an immediate "Deal 3" and a DELAYED triggered ability (390.2) tied to that unit for
 *      the rest of the turn. The Gold comes whether the 3 itself is lethal or the unit dies LATER this
 *      turn (e.g. finished off in combat) — and never if it survives into the next turn (damage heals
 *      at end of turn anyway, 143.3.b.1).
 *   2. The delayed trigger belongs to the caster (392): the Gold token is played by, owned and
 *      controlled by the caster (182/183), enters EXHAUSTED (184.1) so it cannot be cashed this turn.
 *   3. "an enemy unit" — anywhere (base or battlefield), never a friendly one; no enemy unit → the
 *      spell has no legal target and cannot be cast (402.3-style legality for spells, 355).
 *   4. Timing: the printed text carries no [Action]/[Reaction] (the "[Reaction]" in the reminder text
 *      is the GOLD token's ability), so it is your-turn, open-state, empty-chain only.
 *   5. Exactly-lethal vs one short: 3 into a 3-Might unit kills; into a 4-Might unit it does not.
 *   6. Cost: 4 energy flat; spell → trash.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-073-219";

const golds = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].gear().filter((id) => game.state(id).name === "Gold");

/** P1's turn with 4 energy; P2 has Small(3) at bf1, Big(5) and Four(4) in base; P1 has Mine(2) in base. */
function board(energy = 4) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "base", { might: 5, name: "Big" }, "big")
    .unit(P2, "base", { might: 4, name: "Four" }, "four")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "df");
}

describe("Deadly Flourish (unl-073-219)", () => {
  test("registry payload should carry BOTH clauses — deal 3 to an enemy unit AND a delayed 'when it dies this turn → Gold token (exhausted)' rider", async () => {
    // Expected: the spell ability encodes the damage plus a delayed death trigger creating a Gold gear token.
    // Actual: only `{ type: "damage", amount: 3, target: enemy unit }` was parsed; the Gold clause is dropped.
    await scenario().build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 4 });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(JSON.stringify(abilities)).toContain('"amount":3');
    expect(JSON.stringify(abilities)).toContain('"controller":"enemy"');
    expect(JSON.stringify(abilities)).toMatch(/Gold/);
  });

  test("cost and first clause: 4 energy, 3 damage to the chosen enemy unit (Big 5 survives with 3 marked), spell to trash; 3 energy cannot cast it", async () => {
    const game = await board().build();
    await game.p1.cast("df", { targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("big")).toMatchObject({ damage: 3, zone: "base" });
    expect(game.zoneOf("df")).toBe("trash");
    expect((await board(3).build()).p1.can("cast", "df")).toBe(false);
  });

  test("targets: ENEMY units only, in base or at a battlefield — your own unit is never offered; with no enemy unit it cannot be cast", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "df")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["small"], ["big"], ["four"]]));
    expect((await game.p1.try((p) => p.cast("df", { targets: "mine" }))).ok).toBe(false);
    const none = await scenario().resources(P1, { energy: 4 }).unit(P1, "base", { might: 2 }, "mine").hand(P1, CARD, "df").build();
    expect(none.p1.can("cast", "df")).toBe(false);
  });

  test("exactly lethal: 3 into the 3-Might Small kills it (owner's trash); one short: 3 into the 4-Might Four leaves it alive with 3 damage", async () => {
    const game = await board().build();
    await game.p1.cast("df", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.p2.trash()).toContain("small");
    const short = await board().build();
    await short.p1.cast("df", { targets: "four" });
    await short.settle();
    expect(short.state("four")).toMatchObject({ damage: 3, zone: "base" });
  });

  test("when the 3 kills it, the caster plays a Gold gear TOKEN, EXHAUSTED, in their base (182-184.1) — and cannot cash it this turn", async () => {
    // Expected: Small dies → delayed trigger → one Gold gear token for P1, exhausted, isToken; P2 gets nothing.
    // Actual: no delayed trigger exists; nothing is created.
    const game = await board().build();
    await game.p1.cast("df", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    const made = golds(game);
    expect(made).toHaveLength(1);
    expect(game.state(made[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, owner: P1, zone: "base" });
    expect(golds(game, "p2")).toEqual([]);
    expect(game.p1.can("activate", made[0] as string)).toBe(false);
  });

  test("'when it dies THIS TURN' also covers a later death — Big (5) takes 3, then dies in combat to a 2-Might attacker → Gold for the caster", async () => {
    // Expected: 3 marked + 2 combat damage = 5 ≥ 5 kills Big at bf1 this turn → the delayed trigger fires → Gold.
    // Actual: Big dies as expected but no Gold token is ever created.
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, CARD, "df")
      .build();
    await game.p1.cast("df", { targets: "big" });
    await game.settle();
    expect(game.state("big").damage).toBe(3);
    await game.p1.move("mine", "bf1");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("trash"); // took 5
    expect(golds(game)).toHaveLength(1);
  });

  test("the later-death line without the token: the combat math itself holds (Big dies to 3 + 2, the 2-Might attacker dies to 5, nobody conquers)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P1, CARD, "df")
      .build();
    await game.p1.cast("df", { targets: "big" });
    await game.settle();
    await game.p1.move("mine", "bf1");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.p1.points()).toBe(0);
  });

  test("negative space: the unit survives the turn → damage heals at end of turn (143.3.b.1) and no Gold ever appears, even when it dies on a later turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
      .unit(P1, "base", { might: 5, name: "Bruiser" }, "bruiser")
      .hand(P1, CARD, "df")
      .build();
    await game.p1.cast("df", { targets: "big" });
    await game.settle();
    expect(game.state("big").damage).toBe(3);
    await game.advanceTurn(); // → P2
    expect(game.state("big").damage).toBe(0);
    expect(golds(game)).toEqual([]);
    await game.advanceTurn(); // → P1 again: kill Big now (5 vs 5 trade)
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(golds(game)).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
  });

  test("timing (no [Action]/[Reaction] printed): not on the opponent's turn, not inside a showdown, not onto an open chain", async () => {
    expect((await board().active(P2).build()).p1.can("cast", "df")).toBe(false);
    const showdown = await board().build();
    await showdown.p1.move("mine", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(showdown.p1.can("cast", "df")).toBe(false);
    const chained = await board(8).hand(P1, CARD, "df2").build();
    await chained.p1.cast("df", { targets: "big" });
    expect(chained.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(chained.p1.can("cast", "df2")).toBe(false);
  });

  test("responded to: if the target is bounced before resolution the spell fizzles — no damage anywhere, cost stays paid, spell in trash", async () => {
    const YANK = {
      abilities: [{ effect: { target: { controller: "friendly", type: "unit" }, type: "return-to-hand" }, timing: "reaction", type: "spell" }],
      cardType: "spell",
      domain: "chaos",
      energyCost: 0,
      name: "Yank",
      timing: "reaction",
    } as const;
    const game = await board().hand(P2, YANK, "yank").build();
    await game.p1.cast("df", { targets: "small" });
    await game.p1.passPriority();
    await game.p2.cast("yank", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("hand");
    expect(game.state("big").damage).toBe(0);
    expect(game.state("four").damage).toBe(0);
    expect(game.zoneOf("df")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(golds(game)).toEqual([]);
  });
});
