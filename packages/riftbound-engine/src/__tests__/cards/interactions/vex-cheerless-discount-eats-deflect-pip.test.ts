/**
 * Interaction: Vex, Cheerless (sfd-146-221) — 5 Might Chaos champion unit, [5]
 *     "While I'm in combat, friendly spells cost [1][rainbow] less to a minimum of [1], and enemy
 *      spells cost [1][rainbow] more."
 *   × Pouty Poro (ogn-013-298) — 2 Might Fury unit, [2]
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)"
 *   × Hextech Ray (ogn-009-298) — Fury Action spell, [1]+[fury]
 *     "Deal 3 to a unit at a battlefield."
 *
 * Question: Hextech Ray aimed at an enemy Pouty Poro while a Vex is in combat.
 *   Case A: P1's OWN Vex attacks alone into P2's bf1 where the Poro defends; during the combat
 *           showdown P1 casts Ray at the Poro. Total cost? Castable with {energy:1, fury:1}?
 *           With {energy:1, calm:1}?
 *   Case B (control): Vex sits in P1's base, a vanilla P1 unit attacks instead — cost at the Poro?
 *   Case C: P2's Vex and P2's Poro attack P1's bf1 together; P1 (defender) casts Ray at the Poro
 *           during the showdown. Total? Is {energy:2, fury:1, calm:1} enough?
 *
 * Rules:
 *   809.1.c / 809.1.c.1 / 356.2.a.2 — Deflect is a Mandatory Additional Cost of +1 Power of ANY
 *              domain per choice, added in step 356.2 (before increases 356.3 and discounts 356.4).
 *   356.4.d / 356.4.d.1 — Vex's "cost [1][rainbow] less" is a total-cost discount, applied after
 *              component discounts, in the order the player likes.
 *   356.4.f  — discounts can reduce additional costs (so the [rainbow] discount may eat the Deflect
 *              pip — riftboundfaq Vex ruling).
 *   356.4.e  — "to a minimum of [1]" floors only Vex's own energy discount.  356.6 — never below 0.
 *   356.3    — enemy Vex in combat: +[1][rainbow] increase.
 *   355.8    — a target whose total cost cannot be paid is not a valid choice (not enumerated).
 *
 * Expected:
 *   A: 1 energy (floored) + {fury, any} − one any-domain pip = [1] + 1 power. {1,fury:1} → legal,
 *      pool ends {0,0}, Poro takes 3 and dies. {1,calm:1} → ALSO legal under the player-optimal
 *      application (the [rainbow] discount removes the [fury] pip; calm pays the Deflect pip).
 *   B: no Vex modifier → [1] + [fury] + 1 any → {1,fury:1} is one pip short: Poro not offered,
 *      the non-Deflect grunt is.
 *   C: enemy Vex → [2] + [fury] + 2 any. {2,fury:1,calm:1} → illegal; {2,fury:1,calm:2} → legal,
 *      pool ends empty.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VEX = "sfd-146-221";
const POUTY_PORO = "ogn-013-298";
const HEXTECH_RAY = "ogn-009-298";

/** Flatten the `targets` field of `seat`'s cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: typeof P1, alias: string): string[] {
  const opt = game.seat(seat).option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * Case A / B board: P2 holds bf1 with Pouty Poro + a vanilla 2-Might grunt (non-Deflect control
 * target). P1 has Vex and a vanilla 3-Might unit in base and Hextech Ray in hand.
 */
function attackBoard(power: Record<string, number>) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .resources(P1, { energy: 1, power })
    .unit(P1, "base", VEX, "vex")
    .unit(P1, "base", { might: 3, name: "Vanilla" }, "vanilla")
    .unit(P2, "bf1", POUTY_PORO, "poro")
    .unit(P2, "bf1", { might: 2, name: "Grunt" }, "grunt")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Case A: Vex attacks bf1 alone → combat showdown, P1 (attacker) holds Focus. */
async function vexAttacks(power: Record<string, number>): Promise<Game> {
  const game = await attackBoard(power).build();
  await game.p1.move("vex", "bf1");
  expect(game.state("vex").combatRole).toBe("attacker");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/**
 * Case C board: P2's turn. P1 holds bf1 with a 9-Might wall (survives anything). P2 has Vex + Poro
 * in base and attacks with both; P2 then passes Focus so P1 may cast Ray in the showdown.
 */
async function enemyVexAttacks(power: Record<string, number>): Promise<Game> {
  const game = await scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .resources(P1, { energy: 2, power })
    .unit(P1, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P2, "base", VEX, "vex")
    .unit(P2, "base", POUTY_PORO, "poro")
    .hand(P1, HEXTECH_RAY, "ray")
    .build();
  await game.p2.move(["vex", "poro"], "bf1");
  expect(game.state("vex").combatRole).toBe("attacker");
  expect(game.state("poro").combatRole).toBe("attacker");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Vex, Cheerless discount / surcharge × Pouty Poro Deflect × Hextech Ray", () => {
  // ── Case A: friendly Vex in combat ────────────────────────────────────────────────────

  test("A: with own Vex attacking, {energy:1, fury:1} is enough to Ray the Deflect Poro — it is offered and the cast empties the pool to {0,0} (356.4.d, 356.4.f)", async () => {
    const game = await vexAttacks({ fury: 1 });
    expect(game.p1.can("cast", "ray")).toBe(true);
    expect(targetsOffered(game, P1, "ray")).toContain("poro");
    await game.p1.cast("ray", { targets: "poro" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, targets: ["poro"] })]);
    // [1] floored energy + exactly one power pip: the Deflect tax was fully absorbed by the discount.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("A: Ray resolves — Poro takes 3 (≥ 2 Might) and dies; Ray goes to trash", async () => {
    const game = await vexAttacks({ fury: 1 });
    await game.p1.cast("ray", { targets: "poro" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("grunt").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("A: the energy discount is floored at Vex's minimum of [1] — with {energy:0, fury:1} Ray is not castable at all (356.4.e)", async () => {
    const game = await attackBoard({ fury: 1 }).resources(P1, { energy: 0, power: { fury: 1 } }).build();
    await game.p1.move("vex", "bf1");
    expect(game.p1.can("cast", "ray")).toBe(false);
    await expect(game.p1.cast("ray", { targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("ray")).toBe("hand");
  });

  test("A: at a NON-Deflect target the [rainbow] discount removes the [fury] pip — grunt is castable with {energy:1, calm:1} and only the [1] is charged", async () => {
    const game = await vexAttacks({ calm: 1 });
    expect(targetsOffered(game, P1, "ray")).toContain("grunt");
    await game.p1.cast("ray", { targets: "grunt" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 1 } });
  });

  // Expected (356.4.d.1 / 356.4.f, riftboundfaq Vex ruling): the player may apply Vex's [rainbow]
  // discount to the printed [fury] pip and pay the remaining Deflect pip with calm (809.1.c.1: any
  // domain) → {1, calm:1} is a legal casting at the Poro, ending {0,0}. Actual: the engine pins the
  // discount onto the Deflect/any pip, leaving [fury] which calm cannot pay → Poro not offered.
  test("A: {energy:1, calm:1} should also be legal at the Poro — discount eats [fury], calm pays Deflect (356.4.d.1, 356.4.f, 809.1.c.1)", async () => {
    const game = await vexAttacks({ calm: 1 });
    expect(targetsOffered(game, P1, "ray")).toContain("poro");
    await game.p1.cast("ray", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", targets: ["poro"] })]);
  });

  // ── Case B: Vex NOT in combat (control) ───────────────────────────────────────────────

  test("B: Vex in base, vanilla attacks — no discount: Ray at the Poro costs [1]+[fury]+1 any, so {energy:1, fury:1} does NOT offer the Poro (355.8) but does offer the grunt", async () => {
    const game = await attackBoard({ fury: 1 }).build();
    await game.p1.move("vanilla", "bf1");
    expect(game.state("vex").combatRole).toBeNull();
    expect(game.state("vanilla").combatRole).toBe("attacker");
    const offered = targetsOffered(game, P1, "ray");
    expect(offered).toContain("grunt");
    expect(offered).not.toContain("poro");
    await expect(game.p1.cast("ray", { targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("ray")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("B: with one spare power of any domain ({energy:1, fury:1, calm:1}) the Poro IS payable — cast drains everything (809.1.c.1)", async () => {
    const game = await attackBoard({ calm: 1, fury: 1 }).build();
    await game.p1.move("vanilla", "bf1");
    expect(targetsOffered(game, P1, "ray")).toContain("poro");
    await game.p1.cast("ray", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
  });

  // ── Case C: enemy Vex in combat ───────────────────────────────────────────────────────

  test("C: enemy Vex + Poro attacking — Ray at the Poro is [2]+[fury]+2 any: {energy:2, fury:1, calm:1} is one pip short → Poro not offered, cast rejected (356.3 + 809.1.c)", async () => {
    const game = await enemyVexAttacks({ calm: 1, fury: 1 });
    const offered = targetsOffered(game, P1, "ray");
    expect(offered).not.toContain("poro");
    expect(offered).toContain("vex"); // [2]+[fury]+1 any is payable → Vex herself is a legal target
    await expect(game.p1.cast("ray", { targets: "poro" })).rejects.toThrow();
    expect(game.zoneOf("ray")).toBe("hand");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 1, fury: 1 } });
  });

  test("C: {energy:2, fury:1, calm:2} is exactly enough — Poro offered, cast empties the pool, Poro dies on resolution", async () => {
    const game = await enemyVexAttacks({ calm: 2, fury: 1 });
    expect(targetsOffered(game, P1, "ray")).toContain("poro");
    await game.p1.cast("ray", { targets: "poro" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P1, targets: ["poro"] })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.zoneOf("vex")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("C: the surcharge only exists while Vex is IN COMBAT — before P2 attacks (Vex in base, no showdown) Ray is simply not castable on P2's turn (Action timing)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .resources(P1, { energy: 2, power: { calm: 1, fury: 1 } })
      .unit(P1, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P2, "base", VEX, "vex")
      .unit(P2, "base", POUTY_PORO, "poro")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    expect(game.state("vex").combatRole).toBeNull();
    expect(game.p1.can("cast", "ray")).toBe(false);
  });
});
