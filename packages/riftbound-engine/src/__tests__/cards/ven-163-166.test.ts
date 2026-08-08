/**
 * Risen Altar — ven-163-166 · Battlefield · no domain · no cost
 *
 *   [Empower] costs of your units here cost [1] or [rainbow] less.
 *
 * Rules: 827.1 (Empower is an ACTIVATED ability "[Cost]: Empower this. Play only if not
 * Empowered"; 827.1.c.3 text altering the Empower cost is taken into account), 356.4 (discounts;
 * "cost [1] or [rainbow] less" removes ONE resource — an energy OR a power pip — at the payer's
 * choice, cf. the Ezreal, Prodigy wording in 356.4.c), 190.6.d ("your" on a battlefield = the
 * battlefield's CONTROLLER — whoever controls it now, not whoever brought the card), 108.2 (units
 * you control), 145.2 / 381 (activated abilities: your turn, Open state), 441.1.b (an Empowered
 * object cannot be Empowered again — Kayle's own text excepted).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Scope is the [Empower] ACTIVATION cost only: a unit's other activated abilities (Renata's
 *     "[1][mind]: Draw 1") and the unit's PLAY cost are untouched.
 *  2. "here": the same unit in base or at another battlefield pays full price.
 *  3. "units": a legend's [Empower] (Rogue Assassin) is never discounted, Altar or not.
 *  4. "[1] OR [rainbow]": on a mixed cost ([2][fury] Shadow Fiend) the payer picks which part
 *     shrinks — [1][fury] with a fury power, or plain [2] with no fury at all.
 *  5. Pure-energy costs: Kinkou's [2] → [1]; Legion Marauder's "[1] or [body]" → free; Kayle's
 *     repeatable [3] → [2] EACH time (three Empowers for 6).
 *  6. Live control: conquer the OPPONENT's Risen Altar and your units there get the discount the
 *     same turn (Empower needs no ready unit, so the exhausted conqueror can use it at once).
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-163-166";
const KINKOU = "ven-093-166"; // 4-cost 4-Might · [Empower] [2] · Empowered: +1 Might and Ganking
const SHADOW_FIEND = "ven-014-166"; // [Empower] [2][fury] · Empowered: Assault 3
const KAYLE = "ven-134-166"; // [Empower] [3], up to three times, +2 Might per Empower
const MARAUDER = "ven-074-166"; // [Empower] — [1] or [body] · Empowered: +1 Might
const RENATA = "sfd-088-221"; // [1][mind]: Draw 1 (only at a battlefield) — NOT an Empower cost
const ROGUE_ASSASSIN = "ven-139-166"; // Legend · [Empower] [3][rainbow]

function altar(pool: { energy?: number; power?: Record<string, number> }, controller: string | null = P1) {
  return scenario().resources(P1, pool).battlefield("altar", { controller, def: CARD, inert: false, owner: P1 }).battlefield("other", { controller: P1 });
}

const empowerOffered = (game: { p1: { legal(): readonly { label: string }[] } }, alias: string) =>
  game.p1.legal().some((o) => o.label.includes(`[${alias}] ability #0`));

describe("Risen Altar (ven-163-166)", () => {
  test("registry payload: one static 'empower-cost-reduction' scoped to FRIENDLY UNITS HERE", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Risen Altar" });
    expect(def?.abilities).toEqual([
      { effect: { target: { controller: "friendly", location: "here", type: "unit" }, type: "empower-cost-reduction" }, type: "static" },
    ]);
  });

  test("Kinkou Lifeblade ([Empower] [2]) standing at my Altar Empowers for exactly [1]: legal with 1 energy, pool → 0, resolves to Empowered 5 Might with Ganking; then 'only if not Empowered' switches it off", async () => {
    const game = await altar({ energy: 1 }).unit(P1, "altar", KINKOU, "kin").build();
    expect(game.p1.can("activate", "kin")).toBe(true);
    await game.p1.activate("kin");
    expect(game.p1.energy()).toBe(0); // paid on activation
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kin", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.state("kin")).toMatchObject({ isEmpowered: true, might: 5 });
    expect(game.state("kin").keywords).toContain("Ganking");
    await game.p1.do("addResources", { energy: 5 });
    expect(game.p1.can("activate", "kin")).toBe(false); // 441.1.b / 827.1.c.1
    expect(game.violations()).toEqual([]);
  });

  test("'here' — the same Kinkou in BASE or at ANOTHER battlefield I control still needs the full [2]: not activatable with 1 energy, fine with 2 (and 2 is taken)", async () => {
    const inBase = await altar({ energy: 1 }).unit(P1, "base", KINKOU, "kin").build();
    expect(inBase.p1.can("activate", "kin")).toBe(false);
    const elsewhere = await altar({ energy: 1 }).unit(P1, "other", KINKOU, "kin").build();
    expect(elsewhere.p1.can("activate", "kin")).toBe(false);
    const full = await altar({ energy: 2 }).unit(P1, "base", KINKOU, "kin").build();
    await full.p1.activate("kin");
    expect(full.p1.energy()).toBe(0);
  });

  test("no Altar control at all (uncontrolled, nobody there): a Kinkou in base pays full price — 1 energy is not enough", async () => {
    const game = await altar({ energy: 1 }, null).unit(P1, "base", KINKOU, "kin").build();
    expect(game.p1.can("activate", "kin")).toBe(false);
  });

  test("scope is the EMPOWER cost only: Renata Glasc's '[1][mind]: Draw 1' at the Altar still needs both the [1] and the [mind]", async () => {
    const noEnergy = await altar({ energy: 0, power: { mind: 1 } }).unit(P1, "altar", RENATA, "renata").build();
    expect(noEnergy.p1.can("activate", "renata")).toBe(false);
    const noPower = await altar({ energy: 1 }).unit(P1, "altar", RENATA, "renata").build();
    expect(noPower.p1.can("activate", "renata")).toBe(false);
    const both = await altar({ energy: 1, power: { mind: 1 } }).unit(P1, "altar", RENATA, "renata").build();
    const hand0 = both.p1.hand().length;
    await both.p1.activate("renata");
    expect(both.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await both.settle();
    expect(both.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("scope is not the PLAY cost: with the Altar controlled, a 4-cost Kinkou in hand is not playable on 3 energy and costs the full 4 on 4", async () => {
    const short = await altar({ energy: 3 }).unit(P1, "altar", { might: 2, name: "Holder" }, "holder").hand(P1, KINKOU, "kin").build();
    expect(short.p1.can("play", "kin")).toBe(false);
    const exact = await altar({ energy: 4 }).unit(P1, "altar", { might: 2, name: "Holder" }, "holder").hand(P1, KINKOU, "kin").build();
    await exact.p1.play("kin", { to: "base" });
    expect(exact.p1.energy()).toBe(0);
  });

  test("'units' — a LEGEND's [Empower] (Rogue Assassin, [3][rainbow]) gets no discount from a controlled Altar: not offered on 2 energy + 1 power, offered on 3 + 1", async () => {
    const short = await altar({ energy: 2, power: { rainbow: 1 } }).unit(P1, "altar", { might: 2 }, "holder").legend(P1, ROGUE_ASSASSIN, "rogue").build();
    expect(empowerOffered(short, "rogue")).toBe(false);
    const full = await altar({ energy: 3, power: { rainbow: 1 } }).unit(P1, "altar", { might: 2 }, "holder").legend(P1, ROGUE_ASSASSIN, "rogue").build();
    expect(empowerOffered(full, "rogue")).toBe(true);
  });

  test("mixed cost, energy branch: Shadow Fiend ([2][fury]) at the Altar Empowers for [1][fury] — 1 energy + 1 fury drains to 0/0 and it gains Assault 3", async () => {
    const game = await altar({ energy: 1, power: { fury: 1 } }).unit(P1, "altar", SHADOW_FIEND, "fiend").build();
    expect(game.p1.can("activate", "fiend")).toBe(true);
    await game.p1.activate("fiend");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("fiend").isEmpowered).toBe(true);
    expect(game.state("fiend").keywords).toContain("Assault");
    // Control: away from the Altar the same pool cannot pay [2][fury].
    const away = await altar({ energy: 1, power: { fury: 1 } }).unit(P1, "base", SHADOW_FIEND, "fiend").build();
    expect(away.p1.can("activate", "fiend")).toBe(false);
  });

  test.failing("BUG: '[1] OR [rainbow] less' is the payer's choice — Shadow Fiend at the Altar with 2 energy and NO fury power may drop the [fury] pip and Empower for plain [2] (356.4)", async () => {
    // Expected: activatable; pays 2 energy; Empowered. Actual: the engine always shaves the energy
    // first ([1][fury]) and, lacking a fury power, refuses the activation.
    const game = await altar({ energy: 2 }).unit(P1, "altar", SHADOW_FIEND, "fiend").build();
    expect(game.p1.can("activate", "fiend")).toBe(true);
    await game.p1.activate("fiend");
    expect(game.p1.resources().energy).toBe(0);
    await game.settle();
    expect(game.state("fiend").isEmpowered).toBe(true);
  });

  test("either-or cost collapses to free: Legion Marauder ('[1] or [body]') at the Altar Empowers with an EMPTY pool → 3 Might; the copy in base cannot", async () => {
    const game = await altar({ energy: 0 }).unit(P1, "altar", MARAUDER, "lm").unit(P1, "base", MARAUDER, "lmHome").build();
    expect(game.p1.can("activate", "lmHome")).toBe(false);
    expect(game.p1.can("activate", "lm")).toBe(true);
    await game.p1.activate("lm");
    await game.settle();
    expect(game.state("lm")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.p1.resources().energy).toBe(0);
  });

  test("repeatable Empower is discounted EVERY time: Kayle, Justified ([3], up to three times) at the Altar goes 3 → 5 → 7 → 9 Might for 2+2+2 = exactly 6 energy, ending with Deflect and Ganking; a fourth is not offered", async () => {
    const game = await altar({ energy: 6 }).unit(P1, "altar", KAYLE, "kayle").build();
    for (const [energyLeft, might] of [
      [4, 5],
      [2, 7],
      [0, 9],
    ] as const) {
      await game.p1.activate("kayle");
      await game.settle();
      expect(game.p1.energy()).toBe(energyLeft);
      expect(game.state("kayle").might).toBe(might);
    }
    expect(game.state("kayle").keywords).toEqual(expect.arrayContaining(["Deflect", "Ganking"]));
    await game.p1.do("addResources", { energy: 3 });
    expect(game.p1.can("activate", "kayle")).toBe(false);
    // Control: off the Altar 6 energy buys only two Empowers (3 + 3).
    const away = await altar({ energy: 6 }).unit(P1, "base", KAYLE, "kayle").build();
    await away.p1.activate("kayle");
    await away.settle();
    await away.p1.activate("kayle");
    await away.settle();
    expect(away.p1.energy()).toBe(0);
    expect(away.state("kayle").might).toBe(7);
    expect(away.p1.can("activate", "kayle")).toBe(false);
  });

  test("walk-in: Kinkou takes MY empty Altar (1 point), and — Empower needing no ready unit — the exhausted conqueror Empowers there at once for [1] in the same main phase", async () => {
    const game = await altar({ energy: 1 }, null).unit(P1, "base", KINKOU, "kin").build();
    expect(game.p1.can("activate", "kin")).toBe(false); // in base: [2]
    await game.p1.move("kin", "altar");
    await game.settle();
    expect(game.gameState.battlefields.altar?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("kin").isExhausted).toBe(true);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "kin")).toBe(true);
    await game.p1.activate("kin");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("kin")).toMatchObject({ isEmpowered: true, might: 5 });
  });

  test.failing("BUG: 190.6.d live control — after conquering the OPPONENT's Risen Altar (their card, their control) my Kinkou there must Empower for [1]; the engine keys the discount on the battlefield CARD's owner and denies it", async () => {
    // Expected: P1 controls the Altar after the combat → Kinkou activatable on 1 energy, Empowered.
    // Actual: can("activate") stays false because the Altar card belongs to P2.
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("altar", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P2, "altar", { might: 2, name: "Cultist" }, "cultist")
      .unit(P1, "base", KINKOU, "kin")
      .build();
    await game.p1.move("kin", "altar");
    await game.settle();
    expect(game.zoneOf("cultist")).toBe("trash");
    expect(game.gameState.battlefields.altar?.controller).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "kin")).toBe(true);
    await game.p1.activate("kin");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("kin").isEmpowered).toBe(true);
  });

  test("timing (145.2 / 381): the discount does not change WHEN Empower may be used — never on the opponent's turn, never while holding Focus in a showdown", async () => {
    const theirTurn = await altar({ energy: 1 }).active(P2).unit(P1, "altar", KINKOU, "kin").build();
    expect(theirTurn.p1.can("activate", "kin")).toBe(false);
    const showdown = await altar({ energy: 2 })
      .battlefield("enemy", { controller: P2 })
      .unit(P2, "enemy", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "altar", KINKOU, "kin")
      .unit(P1, "base", { might: 1, name: "Scout" }, "scout")
      .build();
    expect(showdown.p1.can("activate", "kin")).toBe(true);
    await showdown.p1.move("scout", "enemy");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("activate", "kin")).toBe(false);
  });
});
