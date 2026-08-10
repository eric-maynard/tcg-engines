/**
 * Interaction: Sandswept Tomb (ven-164-166) × Rampage (ven-083-166) × Pouty Poro (ogn-013-298)
 *
 *   Sandswept Tomb — Battlefield  "Each spell that chooses one or more units here that are friendly to it costs
 *                                  [rainbow] less."
 *   Rampage — Spell · Body · 3     "As you play this, you may pay [body] as an additional cost. Choose a friendly
 *                                  unit and an enemy unit. If you paid the additional cost, give the friendly unit
 *                                  +2 [Might] this turn. They deal damage equal to their Mights to each other."
 *   Pouty Poro — Unit · Fury · 2 · 2 Might  "[Deflect]" (opponents pay [rainbow] more to choose it — 809.1.c)
 *
 * Rules: 356.2.a.2 / 809.1.d (Deflect is a MANDATORY additional cost added in step 2), 356.2.b.1 (optional
 * additional costs are declared and added in step 2 too), 356.4 / 356.4.d (discounts are applied AFTER, to the
 * total), 356.4.f (a discount may reduce an additional cost, including to 0), 356.4.f.1 (an optional cost reduced
 * to nothing still counts as "paid"), 809.1.c.1 (Deflect pip is any domain), 355.16 / 358.5 (an unaffordable
 * choice is not a legal target and is not offered).
 *
 * Question / expected:
 *   (a) friendly = P1's 4-Might Local AT the Tomb, enemy = Poro, optional cost declined, pool {3 energy, 0 power}:
 *       +[A] Deflect then −[A] Tomb → 3 energy, 0 power; legal; Poro (2) dies, Local takes 2 and lives.
 *   (b) friendly = Homebody in BASE → no unit "here" chosen → no rebate → 3 + 1 power; with {3, 0} the Poro pairing
 *       is not offered / rejected, a Deflect-less enemy still is.
 *   (c) friendly at the Tomb, enemy = vanilla, P1 OPTS IN to [body] holding {3, 0}: the rebate zeroes the optional
 *       pip (356.4.f) yet it counts as paid (356.4.f.1) → Local gets +2 (6) before the exchange.
 *   (d) P2's Rampage choosing P1's units at the Tomb gets NO rebate ("friendly to it" = friendly to the spell): with
 *       {3, 0} P2 cannot pick P1's Poro there, and P2's optional [body] is not payable either.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SANDSWEPT_TOMB = "ven-164-166";
const RAMPAGE = "ven-083-166";
const POUTY_PORO = "ogn-013-298";

/** Legal [friendly, enemy] pairs offered for the seat's Rampage, as "friendly→enemy". */
function pairsOffered(game: Game, seat: "p1" | "p2" = "p1"): string[] {
  const opts = game[seat].option("cast", "ramp")?.fields.find((f) => f.arg === "targets")?.options ?? [];
  return (opts as string[][]).map((t) => t.join("→")).sort();
}

/** Whether a "pay the optional [body]" variant is offered at all, and for which pairs. */
function paidPairsOffered(game: Game, seat: "p1" | "p2" = "p1"): string[] {
  const variants = game[seat].option("cast", "ramp")?.variants ?? [];
  return variants
    .filter((v) => v.params.paidAdditionalCost === true)
    .map((v) => (v.params.targets as string[]).join("→"))
    .sort();
}

/**
 * P1's turn. Sandswept Tomb is LIVE and controlled by P1 with Local (4) on it; Homebody (4) sits in P1's base.
 * P2's base: Pouty Poro (2, Deflect) and Plain (3, vanilla). Rampage in P1's hand; P1 holds exactly 3 energy and
 * the given body power (default none).
 */
function board(body = 0) {
  return scenario()
    .resources(P1, { energy: 3, power: body > 0 ? { body } : {} })
    .battlefield("tomb", { controller: P1, def: SANDSWEPT_TOMB, inert: false })
    .unit(P1, "tomb", { might: 4, name: "Local" }, "local")
    .unit(P1, "base", { might: 4, name: "Homebody" }, "homebody")
    .unit(P2, "base", POUTY_PORO, "poro")
    .unit(P2, "base", { might: 3, name: "Plain" }, "plain")
    .hand(P1, RAMPAGE, "ramp");
}

/**
 * (d) mirror: P2's turn. The Tomb is still P1's, holding P1's Pouty Poro and P1's Local (2). P2 has Raider (4) in
 * base, Rampage in hand and exactly 3 energy + the given body power.
 */
function mirror(body = 0) {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: body > 0 ? { body } : {} })
    .battlefield("tomb", { controller: P1, def: SANDSWEPT_TOMB, inert: false })
    .unit(P1, "tomb", POUTY_PORO, "myPoro")
    .unit(P1, "tomb", { might: 2, name: "Local" }, "local")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, RAMPAGE, "ramp");
}

describe("(a) friendly AT the Tomb → Pouty Poro, optional cost declined, pool {3 energy, 0 power}", () => {
  test("[Local → Poro] is offered with zero power: Deflect's +[A] (356.2.a.2) is eaten by the Tomb's −[A] (356.4.f)", async () => {
    const game = await board().build();
    expect(game.state("poro").keywords).toContain("Deflect");
    expect(game.p1.resources()).toEqual({ energy: 3, power: {} });
    expect(pairsOffered(game)).toContain("local→poro");
  });

  test("casting it spends exactly 3 energy and no power; Rampage waits on the chain with both targets bound", async () => {
    const game = await board().build();
    await game.p1.cast("ramp", { targets: ["local", "poro"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ramp", controller: P1, targets: ["local", "poro"] })]);
  });

  test("resolution: 4 and 2 dealt to each other → Poro dies, Local survives with 2 damage at 4 Might (no +2 — cost declined); spell to trash", async () => {
    const game = await board().build();
    await game.p1.cast("ramp", { targets: ["local", "poro"] });
    await game.settle();
    expect(game.zoneOf("ramp")).toBe("trash");
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("local")).toMatchObject({ damage: 2, might: 4, zone: "battlefield-tomb" });
    expect(game.violations()).toEqual([]);
  });

  test("even with a body power floating, [Local → Poro] unpaid takes only the 3 energy — the rebate, not the pool, covers Deflect", async () => {
    const game = await board(1).build();
    await game.p1.cast("ramp", { targets: ["local", "poro"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 1 } });
  });
});

describe("(b) friendly in BASE (not at the Tomb) → no rebate: 3 + 1 power for the Poro", () => {
  test("with {3, 0}: [Homebody → Poro] is NOT offered and is rejected (355.16/358.5); [Homebody → Plain] (no Deflect) is", async () => {
    const game = await board().build();
    const pairs = pairsOffered(game);
    expect(pairs).not.toContain("homebody→poro");
    expect(pairs).toContain("homebody→plain");
    const r = await game.p1.try((p) => p.cast("ramp", { targets: ["homebody", "poro"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ramp")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 3, power: {} });
  });

  test("with {3, 1 body}: [Homebody → Poro] becomes legal and the full Deflect pip is paid from the pool (any domain, 809.1.c.1) → {0, 0}", async () => {
    const game = await board(1).build();
    expect(pairsOffered(game)).toContain("homebody→poro");
    await game.p1.cast("ramp", { targets: ["homebody", "poro"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.state("homebody")).toMatchObject({ damage: 2, might: 4 });
  });
});

describe("(c) friendly at the Tomb, vanilla enemy, P1 OPTS IN to [body] holding {3, 0}: the rebate zeroes the optional pip and it still counts as paid", () => {
  test("the 'pay [body]' variant IS offered for [Local → Plain] with zero power (356.4.f) — and only for a Tomb pairing", async () => {
    const game = await board().build();
    const paid = paidPairsOffered(game);
    expect(paid).toContain("local→plain");
    // Homebody is not "here" → no rebate → the [body] pip is owed and unaffordable → no paid variant for it.
    expect(paid).not.toContain("homebody→plain");
    // Local → Poro paid would owe [A] + [body] − [A] = one pip → also unaffordable at 0 power.
    expect(paid).not.toContain("local→poro");
  });

  test("casting it paid: pool goes 3 → 0 energy, power untouched (nothing to take) — the decision to pay is what counts (356.4.f.1)", async () => {
    const game = await board().build();
    await game.p1.cast("ramp", { payOptional: true, targets: ["local", "plain"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("ramp")).toBe("chain");
  });

  test("resolution: Local gets +2 (6 Might) BEFORE the exchange → Plain (3) dies, Local takes 3 and survives at 6 this turn", async () => {
    const game = await board().build();
    await game.p1.cast("ramp", { payOptional: true, targets: ["local", "plain"] });
    await game.settle();
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.state("local")).toMatchObject({ damage: 3, might: 6, zone: "battlefield-tomb" });
    expect(game.state("plain").damage).toBe(0); // in trash, wiped
    await game.advanceTurn();
    expect(game.state("local")).toMatchObject({ damage: 0, might: 4 }); // "this turn" only, healed at end of turn
  });

  test("control — same opt-in with the friendly in BASE and {3, 1 body}: the pip is really taken (→ body 0) and Homebody fights at 6", async () => {
    const game = await board(1).build();
    await game.p1.cast("ramp", { payOptional: true, targets: ["homebody", "plain"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("plain")).toBe("trash");
    expect(game.state("homebody")).toMatchObject({ damage: 3, might: 6 });
  });
});

describe("(d) 'friendly to it' = friendly to the SPELL: P2's Rampage choosing P1's units at P1's Tomb gets no rebate", () => {
  test("P2 with {3, 0}: [Raider → P1's Local at the Tomb] is offered (no Deflect, plain 3), but [Raider → P1's Poro at the Tomb] is NOT — the full Deflect pip is owed", async () => {
    const game = await mirror().build();
    expect(game.turnPlayer()).toBe(P2);
    const pairs = pairsOffered(game, "p2");
    expect(pairs).toContain("raider→local");
    expect(pairs).not.toContain("raider→myPoro");
    const r = await game.p2.try((p) => p.cast("ramp", { targets: ["raider", "myPoro"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("myPoro")).toBe("battlefield-tomb");
  });

  test("nor does the Tomb zero P2's optional [body]: with 0 power no paid variant exists for P2 at all", async () => {
    const game = await mirror().build();
    expect(paidPairsOffered(game, "p2")).toEqual([]);
    const r = await game.p2.try((p) => p.cast("ramp", { payOptional: true, targets: ["raider", "local"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ramp")).toBe("hand");
    expect(game.p2.resources()).toEqual({ energy: 3, power: {} });
  });

  test("P2 casting [Raider → Local] unpaid costs the plain 3 energy; Local (2) dies, Raider takes 2", async () => {
    const game = await mirror().build();
    await game.p2.cast("ramp", { targets: ["raider", "local"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("local")).toBe("trash");
    expect(game.state("raider")).toMatchObject({ damage: 2, might: 4, zone: "base" });
  });

  test("with {3, 1 body} P2 CAN pick P1's Poro at the Tomb — and pays the whole pip (→ body 0): the Tomb never helped", async () => {
    const game = await mirror(1).build();
    expect(pairsOffered(game, "p2")).toContain("raider→myPoro");
    await game.p2.cast("ramp", { targets: ["raider", "myPoro"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("myPoro")).toBe("trash");
    expect(game.state("raider").damage).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
