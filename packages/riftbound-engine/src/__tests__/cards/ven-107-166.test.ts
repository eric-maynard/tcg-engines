/**
 * Decree of Discord — ven-107-166 · Spell · Chaos · 1 energy + [chaos] · (no timing keyword)
 *
 *   Return any number of enemy Order ([order]) units with total Might 5 or less to their owners' hands.
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. 355.13 — "any number" includes zero: the spell is castable with no target at all (even with no
 *     enemy Order unit anywhere) and then resolves doing nothing but going to the trash.
 *  2. 355.11 — a GROUP restriction: only ENEMY units, only ORDER units, and the group's total (effective)
 *     Might ≤ 5. Exactly 5 is legal, 6 is not; a friendly Order unit or an enemy non-Order unit is never
 *     offered. Unlike Fox-Fire there is no "at a battlefield" clause — units in a base and at different
 *     battlefields may be mixed in one cast.
 *  3. "their OWNERS' hands" (108.2): a unit the opponent controls but YOU own is an enemy unit, and it
 *     comes back to YOUR hand, not theirs.
 *  4. Returning to hand is not dying: Soaring Scout's [Deathknell] (channel 1 rune) must not fire.
 *  5. No [Action]/[Reaction]: standard speed only — your turn, Open state, empty chain; not in a showdown,
 *     not in response to anything, not on the opponent's turn.
 *  6. Cost 1 + [chaos]: both deducted on cast; no chaos pip or 0 energy → not castable.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-107-166";
const SOARING_SCOUT = "ogn-216-298"; // Order unit · 1 Might · [Deathknell] — Channel 1 rune exhausted.

const O = (might: number, name: string) => ({ domain: "order", might, name });

/** P1 to act with exactly the cost; enemy Order units of 1 (bf1), 2 (P2 base), 3 (bf2); an enemy Fury 2; a friendly Order 1. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", O(1, "Order One"), "o1")
    .unit(P2, "base", O(2, "Order Two"), "o2")
    .unit(P2, "bf2", O(3, "Order Three"), "o3")
    .unit(P2, "bf1", { domain: "fury", might: 2, name: "Fury Two" }, "f2")
    .unit(P1, "base", O(1, "My Order"), "mine")
    .hand(P1, CARD, "dd");
}

function targetSets(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>): string[] {
  const sets = game.p1.option("cast", "dd")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  return sets.map((s) => [...(s as string[])].sort().join("+")).sort();
}

describe("Decree of Discord (ven-107-166)", () => {
  test("cost: 1 energy + [chaos] deducted on cast, one non-triggered chain item, spell ends in the trash; unaffordable without the chaos pip or the energy", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "dd")).toBe(true);
    await game.p1.cast("dd", targetSets(game).length > 0 ? { targets: [] } : {});
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "dd", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("dd")).toBe("trash");
    expect((await board().resources(P1, { energy: 1, power: { chaos: 0, fury: 2 } }).build()).p1.can("cast", "dd")).toBe(false);
    expect((await board().resources(P1, { energy: 0, power: { chaos: 2 } }).build()).p1.can("cast", "dd")).toBe(false);
  });

  test("355.13 — zero targets is legal: castable with no enemy Order unit on the board, resolves as a no-op", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .unit(P2, "base", { domain: "fury", might: 1, name: "Fury One" }, "f1")
      .unit(P1, "base", O(2, "My Order"), "mine")
      .hand(P1, CARD, "dd")
      .build();
    expect(game.p1.can("cast", "dd")).toBe(true);
    await game.p1.cast("dd", targetSets(game).length > 0 ? { targets: [] } : {});
    await game.settle();
    expect(game.zoneOf("dd")).toBe("trash");
    expect(game.zoneOf("f1")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
  });

  // BUG — expected (355.11 / 355.13): a `targets` field offering every ENEMY+ORDER subset totalling ≤ 5
  // across any locations: {}, o1, o2, o3, o1+o2, o1+o3, o2+o3 — never f2 (Fury), never mine (friendly),
  // never o1+o2+o3 (6). Actual: the rules text did not parse; the spell has no target field at all.
  test("legal target sets = any subset of enemy Order units with total Might ≤ 5, mixed locations allowed (355.11)", async () => {
    const game = await board().build();
    expect(targetSets(game)).toEqual(["", "o1", "o1+o2", "o1+o3", "o2", "o2+o3", "o3"]);
    const six = await game.p1.try((p) => p.cast("dd", { targets: ["o1", "o2", "o3"] }));
    expect(!six.ok && six.error.code).toBe("ILLEGAL_ARGS");
    const fury = await game.p1.try((p) => p.cast("dd", { targets: ["f2"] }));
    expect(!fury.ok && fury.error.code).toBe("ILLEGAL_ARGS");
    const friendly = await game.p1.try((p) => p.cast("dd", { targets: ["mine"] }));
    expect(!friendly.ok && friendly.error.code).toBe("ILLEGAL_ARGS");
  });

  // BUG — expected: o2 (in P2's base) and o3 (at bf2) total exactly 5 → both go back to P2's hand; the
  // untargeted o1 / f2 stay. Actual: no effect is parsed, so nothing is returned.
  test("returns the chosen enemy Order units (2 + 3 = exactly 5, base + battlefield) to their owner's hand", async () => {
    const game = await board().build();
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("dd", { targets: ["o2", "o3"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("o2")).toBe("hand");
    expect(game.zoneOf("o3")).toBe("hand");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("o1")).toBe("battlefield-bf1");
    expect(game.zoneOf("f2")).toBe("battlefield-bf1");
    expect(game.zoneOf("mine")).toBe("base");
    expect(game.zoneOf("dd")).toBe("trash");
  });

  // BUG — expected: effective Might counts — a buffed 3-Might Order unit is 4, so pairing it with a
  // 2-Might one (6) is illegal while alone (4) it is fine. Actual: no target field exists.
  test("total uses EFFECTIVE Might — a buffed 3 (=4) plus a 2 is over the limit, the buffed unit alone is legal", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .unit(P2, "base", O(3, "Buffed Three"), "b3", { buffed: true })
      .unit(P2, "base", O(2, "Order Two"), "o2")
      .hand(P1, CARD, "dd")
      .build();
    expect(game.state("b3").might).toBe(4);
    const sets = (game.p1.option("cast", "dd")?.fields.find((f) => f.arg === "targets")?.options ?? []).map((s) => [...(s as string[])].sort().join("+")).sort();
    expect(sets).toEqual(["", "b3", "o2"]);
    await game.p1.cast("dd", { targets: ["b3"] });
    await game.settle();
    expect(game.zoneOf("b3")).toBe("hand");
    expect(game.state("b3").isBuffed).toBe(false); // a card in hand carries no buff
  });

  // BUG — expected (108.2 / "owners' hands"): a unit P2 controls but P1 owns is an ENEMY unit for P1 and
  // returns to P1's hand. Actual: no effect / no targets.
  test("controller ≠ owner — an enemy-controlled unit you own is a legal target and returns to YOUR hand", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .card("stolen", { controller: P2, def: { cardType: "unit", ...O(3, "Stolen Order") }, owner: P1, zone: "bf1" })
      .hand(P1, CARD, "dd")
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P2, owner: P1 });
    await game.p1.cast("dd", { targets: ["stolen"] });
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("hand");
    expect(game.p1.hand()).toContain("stolen");
    expect(game.p2.hand()).not.toContain("stolen");
  });

  // BUG — expected: Soaring Scout goes to P2's hand and, since returning is not dying, its Deathknell
  // channels nothing (P2's rune pool unchanged, nothing on the chain). Actual: nothing is returned.
  test("return-to-hand is not a death — Soaring Scout's [Deathknell] does not channel a rune", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", SOARING_SCOUT, "scout")
      .hand(P1, CARD, "dd")
      .build();
    const runesBefore = game.p2.runes().length;
    await game.p1.cast("dd", { targets: ["scout"] });
    await game.settle();
    expect(game.zoneOf("scout")).toBe("hand");
    expect(game.p2.runes()).toHaveLength(runesBefore);
    expect(game.chain()).toHaveLength(0);
    expect(game.p2.trash()).not.toContain("scout");
  });

  test("standard speed: not castable on the opponent's turn, nor inside a showdown on your own turn", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "dd")).toBe(false);
    const game = await board().unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "dd")).toBe(false);
  });

  test("standard speed: not castable in response while another item is on the chain (a second copy waits for an empty chain)", async () => {
    const game = await board().resources(P1, { energy: 2, power: { chaos: 2 } }).hand(P1, CARD, "dd2").build();
    await game.p1.cast("dd", targetSets(game).length > 0 ? { targets: [] } : {});
    expect(game.chain()).toHaveLength(1);
    expect(game.actingSeat()).toBe(P1);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("cast", "dd2")).toBe(false);
    await game.settle();
    expect(game.p1.can("cast", "dd2")).toBe(true);
  });

  // BUG — expected: one spell ability {type:"return-to-hand", target:{type:"unit", controller:"enemy",
  // filter domain order, quantity:"any", totalMight:{lte:5}}} (cf. Fox-Fire / Tricksy Tentacles shapes).
  // Actual: "enemy Order ([order]) units" defeats the parser — the card reaches the engine with no abilities.
  test("parsed abilities — a single return-to-hand spell effect over any number of enemy Order units with totalMight ≤ 5", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "chaos", energyCost: 1, name: "Decree of Discord", powerCost: ["chaos"] });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        target: { controller: "enemy", quantity: "any", totalMight: { lte: 5 }, type: "unit" },
        type: "return-to-hand",
      },
      type: "spell",
    });
    expect(JSON.stringify((def?.abilities?.[0] as { effect?: { target?: unknown } })?.effect?.target)).toContain("order");
  });
});
