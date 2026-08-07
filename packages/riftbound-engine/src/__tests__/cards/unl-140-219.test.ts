/**
 * Conscription — unl-140-219 · Spell · Chaos · 5 energy + [chaos][chaos] · (no timing keyword → standard)
 *
 *   You may spend 5 XP as an additional cost to play this.
 *   Choose an enemy unit at a battlefield with 3 [Might] or less. If you paid the additional cost,
 *   choose any enemy unit at a battlefield instead. Take control of it, exhaust it, and recall it.
 *
 * Rules: 356.2.b (optional additional costs are declared and paid while playing), 730.2 (spend XP),
 * 355.5 / 359.3.e.4 (a "≤3 Might" choice re-checked on resolution — no longer legal if its Might rose),
 * 434-ish take control (controller changes, owner does not), 455/458 (Recall: relocate to ITS
 * CONTROLLER's base without being a move; statuses such as exhausted persist), 159.2.a.1 (a spell
 * without [Action]/[Reaction] is playable only in your own open Main Phase).
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. ORDER of the three verbs matters: control changes FIRST, so "recall it" sends the unit to the
 *      NEW controller's (caster's) base — exhausted, still owned by the opponent, controlled by you
 *      with no expiry (it readies and can attack for you next turn; if it dies it goes to its OWNER's
 *      trash).
 *   2. Might is EFFECTIVE Might: a printed-2 unit buffed to 3 is legal; a printed-3 buffed to 4 is not;
 *      exactly 3 is the inclusive edge. Base-dwelling and friendly units are never choices.
 *   3. The XP mode: paying 5 XP widens the choice to ANY enemy unit at a battlefield (a 6-Might one);
 *      with 4 XP the option can't be taken; not paying keeps XP intact.
 *   4. Fizzle: if the chosen unit is pumped above 3 in response, the whole instruction is skipped —
 *      no control change, no exhaust, no recall — and the spell is still spent.
 *   5. Timing: standard speed — not in a showdown, not on the opponent's turn.
 *   6. Cost: 5 energy + 2 chaos power exactly; short on either → illegal.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-140-219";
const PUMP = {
  abilities: [{ effect: { amount: 2, duration: "turn", target: { type: "unit" }, type: "modify-might" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Pump",
  rulesText: "[Reaction] Give a unit +2 [Might] this turn.",
  timing: "reaction",
} as const;

function board(xp = 0) {
  return scenario()
    .xp(P1, xp)
    .resources(P1, { energy: 5, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 6, name: "Big" }, "big")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "con");
}

const targetsOf = (game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>) =>
  (game.p1.option("cast", "con")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];

describe("Conscription (unl-140-219)", () => {
  test("registry payload: 5 energy + 2 chaos, standard timing, an optional {xp:5} additional cost and a spell sequence take-control → exhaust → recall on one enemy ≤3-Might battlefield unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 5, name: "Conscription", timing: "standard" });
    expect(def?.powerCost).toEqual(["chaos", "chaos"]);
    const abilities = (def?.abilities ?? []) as { type: string; effect: Record<string, unknown> }[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { additionalCost: { xp: 5 }, optional: true, type: "additional-cost-option" }, type: "static" });
    expect(abilities[1].type).toBe("spell");
    const steps = (abilities[1].effect as { effects: { type: string; target: unknown }[] }).effects;
    expect(steps.map((s) => s.type)).toEqual(["take-control", "exhaust", "recall"]);
    expect(steps[0].target).toEqual({ controller: "enemy", filter: { might: { lte: 3 } }, location: "battlefield", type: "unit" });
  });

  test("cost: 5 energy + 2 chaos deducted on cast, XP untouched when the option is not taken; short on energy or on chaos → not castable", async () => {
    const game = await board(7).build();
    await game.p1.cast("con", { targets: "small" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p1.xp()).toBe(7);
    expect(game.zoneOf("con")).toBe("chain");
    expect((await scenario().resources(P1, { energy: 4, power: { chaos: 2 } }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "con").build()).p1.can("cast", "con")).toBe(false);
    expect((await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, CARD, "con").build()).p1.can("cast", "con")).toBe(false);
  });

  test("unpaid mode — legal choices are exactly the enemy ≤3-Might units AT A BATTLEFIELD: not the 6-Might one, not the enemy in base, not my own unit", async () => {
    const game = await board().build();
    expect(targetsOf(game)).toEqual([["small"]]);
    for (const bad of ["big", "home", "mine"]) {
      const r = await game.p1.try((p) => p.cast("con", { targets: bad }));
      expect(r.ok).toBe(false);
    }
    expect(game.zoneOf("con")).toBe("hand");
  });

  test("resolution: take control FIRST, then exhaust, then recall — the unit ends in the CASTER's base, exhausted, controlled by P1, still owned by P2; the spell is trashed", async () => {
    const game = await board().build();
    await game.p1.cast("con", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("con")).toBe("trash");
    expect(game.state("small")).toMatchObject({ controller: P1, isExhausted: true, location: "base", owner: P2 });
    expect(game.p1.units("base")).toContain("small");
    expect(game.p2.units("base")).not.toContain("small");
    expect(game.p2.units("bf1")).toEqual(["big"]);
    expect(game.violations()).toEqual([]);
  });

  test.failing("BUG: control has no expiry: next turn cycle the conscript readies and attacks FOR P1; when it dies it goes to its OWNER's (P2's) trash", async () => {
    const game = await board().build();
    await game.p1.cast("con", { targets: "small" });
    await game.settle();
    await game.advanceTurn(); // P2
    expect(game.state("small").controller).toBe(P1);
    await game.advanceTurn(); // P1 again: awaken readied it
    expect(game.state("small")).toMatchObject({ controller: P1, isReady: true, location: "base" });
    await game.p1.move("small", "bf1"); // 3 into Big (6): the conscript dies
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.p2.trash()).toContain("small");
    expect(game.p1.trash()).not.toContain("small");
  });

  test("Might is effective Might: a printed-2 unit BUFFED to 3 is a legal choice (inclusive edge); a printed-3 buffed to 4 is not", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "TwoBuffed" }, "two", { buffed: true })
      .unit(P2, "bf1", { might: 3, name: "ThreeBuffed" }, "three", { buffed: true })
      .hand(P1, CARD, "con")
      .build();
    expect(game.state("two").might).toBe(3);
    expect(game.state("three").might).toBe(4);
    expect(targetsOf(game)).toEqual([["two"]]);
    await game.p1.cast("con", { targets: "two" });
    await game.settle();
    expect(game.state("two")).toMatchObject({ controller: P1, isBuffed: true, location: "base" });
  });

  test.failing("BUG: fizzle (359.3.e.4) — target pumped to 5 in response → unit untouched AND the spell card goes to the trash (engine 'recalls' the Conscription card itself into P1's base)", async () => {
    // Expected: Small stays P2's, ready, on bf1 (this part holds) and Conscription lands in P1's trash.
    // Actual: with the target illegal the recall step falls back to the source — the SPELL card ends in zone "base".
    const game = await board().resources(P2, { energy: 0 }).hand(P2, PUMP, "pump").build();
    await game.p1.cast("con", { targets: "small" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("pump", { targets: "small" });
    await game.settle();
    expect(game.state("small").might).toBe(5);
    expect(game.state("small")).toMatchObject({ controller: P2, isExhausted: false, location: "bf1" });
    expect(game.zoneOf("con")).toBe("trash");
  });

  test("no legal target at all (only a 6-Might enemy at the battlefield, no XP) → the spell is not castable", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { chaos: 2 } }).battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 6 }, "big").hand(P1, CARD, "con").build();
    expect(game.p1.can("cast", "con")).toBe(false);
  });

  test("timing: no [Action]/[Reaction] → not castable inside a showdown, nor on the opponent's turn", async () => {
    const sd = await board().unit(P1, "base", { might: 1, name: "Scout" }, "scout").battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 1 }, "picket").build();
    await sd.p1.move("scout", "bf2");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("cast", "con")).toBe(false);
    const opp = await board().active(P2).build();
    expect(opp.p1.can("cast", "con")).toBe(false);
  });

  test.failing("BUG: paid mode — with 5 XP, paying the optional cost lets P1 choose the 6-Might enemy; 5 XP + 5 energy + 2 chaos are all deducted and Big ends up conscripted", async () => {
    // Expected (356.2.b + card text): cast with payOptional targeting "big" is legal at 5 XP; XP → 0,
    // energy → 0, chaos → 0; on resolution Big is in P1's base, exhausted, controlled by P1.
    // Actual: the optional XP cost path never widens the target descriptor, so "big" is not a legal choice.
    const game = await board(5).build();
    await game.p1.cast("con", { payOptional: true, targets: "big" });
    expect(game.p1.xp()).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.state("big")).toMatchObject({ controller: P1, isExhausted: true, location: "base", owner: P2 });
  });

  test("paid mode, small target: choosing to pay with 5 XP spends exactly 5 XP on top of 5 energy + 2 chaos (a ≤3 unit is still 'any enemy unit')", async () => {
    const game = await board(6).build();
    await game.p1.cast("con", { payOptional: true, targets: "small" });
    expect(game.p1.xp()).toBe(1);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.state("small")).toMatchObject({ controller: P1, isExhausted: true, location: "base" });
  });

  test("paid mode boundary: with only 4 XP the additional cost cannot be paid at all (730.2) — neither on Big nor on Small; nothing is spent", async () => {
    const game = await board(4).build();
    expect((await game.p1.try((p) => p.cast("con", { payOptional: true, targets: "big" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("con", { payOptional: true, targets: "small" }))).ok).toBe(false);
    expect(game.p1.xp()).toBe(4);
    expect(game.p1.resources()).toEqual({ energy: 5, power: { chaos: 2 } });
    expect(game.zoneOf("con")).toBe("hand");
    expect(game.state("big").controller).toBe(P2);
  });
});
