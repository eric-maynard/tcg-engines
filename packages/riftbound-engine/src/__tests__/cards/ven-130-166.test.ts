/**
 * Aurok General — ven-130-166 · Unit · Order · 5 energy · 5 Might
 *
 *   [Empower] [3][order] ([3][order]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] Your units that are [Empowered] have +2 [Might] (including me).
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. The aura has TWO gates: the General must itself be Empowered (828.1.c — dependent ability), AND
 *     each recipient must be Empowered. A plain friendly unit next to an Empowered General gets NOTHING;
 *     an Empowered ally next to a plain General gets NOTHING.
 *  2. "Your units": control, not ownership; enemy Empowered units never benefit.
 *  3. "(including me)": the General is 7 while Empowered — the self-reference does not double up.
 *  4. Continuous (rule 522): an ally that becomes Empowered LATER (its own Empower ability) picks up +2
 *     the moment it does; two Empowered Generals feed each other (5+2+2 = 9 each); the bonus vanishes
 *     when the General leaves the board.
 *  5. Empower cost 827.1.c.1: exactly 3 energy + 1 order power; "Use only if not Empowered" — a second
 *     activation is illegal; energy alone (no order pip) cannot pay it.
 *  6. Combat: the +2 is real Might — an Empowered General (7) defending against a 6 survives; a plain
 *     General (5) dies to the same attacker.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-130-166";
const SUNHAWK = "ven-122-166"; // Order · 3 Might · [Empower] [2] · [Empowered] I have +1 Might and Deflect 2
const PORO = "ven-007-166"; // Fury · 2 Might · [Empowered] I have +1 Might

describe("Aurok General (ven-130-166)", () => {
  test("costs 5 energy (no power); enters the base as a plain 5-Might unit; 4 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "gen").build();
    await game.p1.play("gen");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("gen")).toBe("base");
    expect(game.state("gen")).toMatchObject({ baseMight: 5, isEmpowered: false, might: 5 });
    const poor = await scenario().resources(P1, { energy: 4, power: { order: 3 } }).hand(P1, CARD, "gen").build();
    expect(poor.p1.can("play", "gen")).toBe(false);
  });

  test("[Empower] [3][order]: pays exactly 3 energy + 1 order, one chain item, Empowered on resolution → 7 Might (including me)", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { order: 2 } }).unit(P1, "base", CARD, "gen").build();
    expect(game.p1.can("activate", "gen")).toBe(true);
    await game.p1.activate("gen");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gen", controller: P1 })]);
    expect(game.state("gen").isEmpowered).toBe(false); // not until it resolves
    await game.settle();
    expect(game.state("gen")).toMatchObject({ baseMight: 5, isEmpowered: true, might: 7 });
  });

  test("Empower cost negative space: 3 energy but no order pip, or 2 energy + order → not activatable; already Empowered → not activatable (827.1.c.1)", async () => {
    const noPip = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).unit(P1, "base", CARD, "gen").build();
    expect(noPip.p1.can("activate", "gen")).toBe(false);
    const lowEnergy = await scenario().resources(P1, { energy: 2, power: { order: 1 } }).unit(P1, "base", CARD, "gen").build();
    expect(lowEnergy.p1.can("activate", "gen")).toBe(false);
    const done = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).unit(P1, "base", CARD, "gen", { empowered: true }).build();
    expect(done.p1.can("activate", "gen")).toBe(false);
    expect(done.state("gen").might).toBe(7);
  });

  test("aura: an Empowered friendly Poro next to an Empowered General is 2 +1 (own) +2 (General) = 5", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "gen", { empowered: true })
      .unit(P1, "base", PORO, "poro", { empowered: true })
      .build();
    expect(game.state("gen").might).toBe(7);
    expect(game.state("poro").might).toBe(5);
  });

  // BUG — expected: "Your units THAT ARE [Empowered]" — a non-Empowered friendly unit is not addressed by
  // the aura and stays at its printed Might. Actual: the parsed static targets every friendly unit
  // ({type:"unit", controller:"friendly"} with no `filter:"empowered"`), so the plain unit gets +2 too.
  test("aura must skip friendly units that are NOT Empowered — a plain 2-Might unit stays 2 beside an Empowered General", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "gen", { empowered: true })
      .unit(P1, "base", { might: 2, name: "Plain Recruit" }, "plain")
      .unit(P1, "base", PORO, "poro") // has an Empower line but is NOT empowered
      .build();
    expect(game.state("gen").might).toBe(7);
    expect(game.state("plain").might).toBe(2);
    expect(game.state("poro").might).toBe(2);
  });

  test("dependent ability (828.1.c): a General that is NOT Empowered gives nothing — an Empowered Poro beside it is just 3", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "gen")
      .unit(P1, "base", PORO, "poro", { empowered: true })
      .build();
    expect(game.state("gen")).toMatchObject({ isEmpowered: false, might: 5 });
    expect(game.state("poro").might).toBe(3);
  });

  test("'Your units': an ENEMY Empowered unit gets nothing from my Empowered General", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "gen", { empowered: true })
      .unit(P2, "bf1", PORO, "theirs", { empowered: true })
      .unit(P2, "base", CARD, "theirGen", { empowered: true })
      .build();
    expect(game.state("theirs").might).toBe(2 + 1 + 2); // own +1, THEIR General +2 — not mine
    expect(game.state("theirGen").might).toBe(7);
    expect(game.state("gen").might).toBe(7); // and theirs does not feed mine either
  });

  test("continuous: a Sunhawk that Empowers itself AFTER the General is already Empowered immediately reads 3 +1 +2 = 6", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "gen", { empowered: true })
      .unit(P1, "base", SUNHAWK, "hawk")
      .build();
    const before = game.state("hawk").might;
    await game.p1.activate("hawk");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.state("hawk")).toMatchObject({ isEmpowered: true, might: 6 });
    expect(game.state("hawk").might).toBeGreaterThan(before);
    expect(game.state("gen").might).toBe(7);
  });

  test("full sequence from scratch: Empower the General (5→7), then Empower the Sunhawk (→6); 3+order then 2 = 5 energy + 1 order spent", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .unit(P1, "base", CARD, "gen")
      .unit(P1, "base", SUNHAWK, "hawk", { empowered: true })
      .build();
    expect(game.state("hawk").might).toBe(4); // General not yet Empowered → only its own +1
    await game.p1.activate("gen");
    await game.settle();
    expect(game.state("gen").might).toBe(7);
    expect(game.state("hawk").might).toBe(6);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 0 } });
  });

  test("two Empowered Generals feed each other: each is 5 + 2 (self) + 2 (the other) = 9", async () => {
    const game = await scenario()
      .unit(P1, "base", CARD, "g1", { empowered: true })
      .unit(P1, "base", CARD, "g2", { empowered: true })
      .build();
    expect(game.state("g1").might).toBe(9);
    expect(game.state("g2").might).toBe(9);
  });

  test("combat: an Empowered General (7) defending alone against a 6-Might attacker kills it and survives with 6 damage; battlefield held", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gen", { empowered: true })
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("gen")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("near-miss combat: the same 6-Might attacker into a NON-Empowered General (5) kills it and conquers", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gen")
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("gen")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("the aura ends when the General leaves the board: kill the Empowered General in combat → the Empowered Poro in base drops from 5 back to 3", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "gen", { empowered: true })
      .unit(P1, "base", PORO, "poro", { empowered: true })
      .unit(P2, "base", { might: 8, name: "Giant" }, "giant")
      .build();
    expect(game.state("poro").might).toBe(5);
    await game.p2.move("giant", "bf1");
    await game.settle();
    expect(game.zoneOf("gen")).toBe("trash");
    expect(game.state("poro").might).toBe(3);
  });

  // BUG (parse) — expected: the static's target carries the recipient gate (`filter: "empowered"`, the
  // shape Sanction's "a unit that's [Empowered]" parses to). Actual: the filter is dropped.
  test("registry payload — Empower [3][order] activated + while-empowered static '+2 to your EMPOWERED units (including me)'", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 5, might: 5, name: "Aurok General" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({
      cost: { energy: 3, power: ["order"] },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(abilities[1]).toMatchObject({
      condition: { type: "while-empowered" },
      effect: { amount: 2, target: { controller: "friendly", filter: "empowered", includeSelf: true, type: "unit" }, type: "modify-might" },
      type: "static",
    });
  });
});
