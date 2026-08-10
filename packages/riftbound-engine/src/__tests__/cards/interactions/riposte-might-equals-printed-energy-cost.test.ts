/**
 * Interaction: Riposte (sfd-206-221, Body/Order Reaction spell, 2 + [rainbow][rainbow])
 *     "Choose a friendly unit and a spell. Counter that spell and give that unit +[Might] equal to that spell's Energy
 *      cost this turn."
 *   × Sky Splitter (ogn-014-298, Fury Action spell, printed 8 + [fury]) "This spell's Energy cost is reduced by the highest
 *     Might among units you control. Deal 5 to a unit at a battlefield."
 *   × Void Seeker (ogn-024-298, Fury Action spell, 3 + [fury]) "Deal 4 to a unit at a battlefield. Draw 1."
 *   with inline helpers: P1's 7-Might "Giant" (the cost reducer), P2's 3-Might "Unit Y" at bf1 and 2-Might "Bystander" in
 *   base, P1's inline Reaction "Test Zap" (1: deal 3 to a unit) and P2's inline Reaction "Test Spark" (1: deal 1 to a unit).
 *
 * Question (P1's turn):
 *   (a) P1 pays 1 + [fury] for Sky Splitter (8 − 7) at Y. P2 Ripostes choosing Y + Sky Splitter: +1 (paid) or +8 (printed)?
 *   (b) Same with Void Seeker (3 + [fury]) → ?
 *   (c) P2 Ripostes Void Seeker choosing Y; in response P1 Zaps Y dead before Riposte resolves. Is Void Seeker still
 *       countered? Does anything get +Might?
 *   (d) May Riposte choose P2's OWN spell, or a friendly unit that is not the spell's target? (Never Riposte itself.)
 *
 * Rules: 206 (a card's Energy cost is the printed value; reductions change what is PAID, not the cost), 359.3.e.12.a /
 * 359.3.e.13 (information is read from a legal target as the instruction executes / last-known), 359.3.e.1-2-5-8
 * (each target is checked independently; instructions about an illegal target are skipped, the rest still executes),
 * 355.9.c (a spell cannot target itself), 425.1.a / 425.1.c (a countered spell goes to trash without effect; costs are
 * not refunded), 340.1 (LIFO resolution).
 *
 * Expected: (a) Sky Splitter countered → trash, no damage, P1 keeps having paid 1 + [fury]; Y 3 → 11 (+8). (b) Void Seeker
 * countered, no damage, no draw; Y 3 → 6. (c) Zap resolves first and kills Y; Riposte still counters Void Seeker (no
 * damage, no draw) but its Might instruction is skipped — nobody gains Might; Riposte is not fizzled as a whole. (d) the
 * offered (unit, spell) pairs are {Y, Bystander} × {Void Seeker, Test Spark} — own spell yes, unrelated friendly unit
 * yes, Riposte itself never; countering its own Spark gives the chosen unit +1.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIPOSTE = "sfd-206-221";
const SKY_SPLITTER = "ogn-014-298";
const VOID_SEEKER = "ogn-024-298";

/** P1's inline Reaction removal: 1 energy, deal 3 to a unit (kills the 3-Might Y). */
const TEST_ZAP = {
  abilities: [{ effect: { amount: 3, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Zap",
  timing: "reaction",
};

/** P2's own inline Reaction spell: 1 energy, deal 1 to a unit — something for Riposte to counter on its own side. */
const TEST_SPARK = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 1,
  name: "Test Spark",
  timing: "reaction",
};

/**
 * P1's turn. P1: 7-Might Giant in base; Sky Splitter, Void Seeker, Test Zap in hand; 5 energy + 2 fury.
 * P2: Unit Y (3) at its bf1, Bystander (2) in base; Riposte + Test Spark in hand; 3 energy + body 1 + order 1
 * (Riposte = 2 + two pips of any domain, Spark = 1).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 2 } })
    .resources(P2, { energy: 3, power: { body: 1, order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 7, name: "Giant" }, "giant")
    .unit(P2, "bf1", { might: 3, name: "Unit Y" }, "y")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "z")
    .hand(P1, SKY_SPLITTER, "sky")
    .hand(P1, VOID_SEEKER, "void")
    .hand(P1, TEST_ZAP, "zap")
    .hand(P2, RIPOSTE, "riposte")
    .hand(P2, TEST_SPARK, "spark");
}

/** Riposte's offered target choices for P2, each rendered "unit" or "unit+spell". */
function riposteTargets(game: Game): string[] {
  const field = game.p2.option("cast", "riposte")?.fields.find((f) => f.name === "targets");
  return (field?.options ?? []).map((o) => (Array.isArray(o) ? (o as string[]).join("+") : String(o))).sort();
}

describe("Riposte × Sky Splitter / Void Seeker — +Might equals the PRINTED Energy cost; partial fizzle; own spells", () => {
  test("setup: Sky Splitter's printed cost is 8 but P1 pays only 1 + [fury] for it (8 − Giant's 7); Riposte is not castable with no spell on the chain", async () => {
    const game = await board().build();
    expect(game.state("sky").energyCost).toBe(8);
    expect(game.p2.can("cast", "riposte")).toBe(false);
    await game.p1.cast("sky", { targets: "y" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sky", controller: P1, targets: ["y"] })]);
    await game.p1.passPriority(); // 312.1 — the caster holds priority first
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "riposte")).toBe(true);
  });

  // ================================================================== (a) Sky Splitter → +8
  test("(a) Riposte on (Y, Sky Splitter): Sky Splitter is countered — trash, no damage to Y, P1's 1 + [fury] NOT refunded (425.1.c) — and Y gets +8 (printed cost, 206), 3 → 11", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "y" });
    await game.p1.passPriority();
    await game.p2.cast("riposte", { targets: ["y"] }); // the lone spell is bound automatically
    expect(game.chain().map((i) => i.cardId)).toEqual(["sky", "riposte"]);
    expect(game.p2.resources()).toEqual({ energy: 1, power: { body: 0, order: 0 } }); // 2 + [rainbow][rainbow]
    await game.settle();
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.zoneOf("riposte")).toBe("trash");
    expect(game.state("y")).toMatchObject({ damage: 0, location: "bf1", might: 11, mightModifier: 8 });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 1 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(a) the +8 is NOT +1: Y's Might is neither 4 (amount paid) nor 3 (nothing)", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "y" });
    await game.p1.passPriority();
    await game.p2.cast("riposte", { targets: ["y"] });
    await game.settle();
    expect(game.state("y").might).not.toBe(4);
    expect(game.state("y").might).not.toBe(3);
    expect(game.state("y").might).toBe(11);
  });

  test("(a) 'this turn': the +8 is gone on the next turn", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "y" });
    await game.p1.passPriority();
    await game.p2.cast("riposte", { targets: ["y"] });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("y").might).toBe(3);
  });

  // ================================================================== (b) Void Seeker → +3
  test("(b) Riposte on (Y, Void Seeker): countered — no 4 damage, P1 does NOT draw — and Y gets +3, 3 → 6", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("void", { targets: "y" });
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } });
    await game.p1.passPriority();
    await game.p2.cast("riposte", { targets: ["y"] });
    await game.settle();
    expect(game.zoneOf("void")).toBe("trash");
    expect(game.state("y")).toMatchObject({ damage: 0, location: "bf1", might: 6 });
    expect(game.p1.hand()).toHaveLength(p1Hand - 1); // Void Seeker left the hand; no "Draw 1"
    expect(game.p1.resources()).toEqual({ energy: 2, power: { fury: 1 } }); // no refund
  });

  // ================================================================== (c) Y dies in response — partial execution
  test("(c) after Riposte is on the chain P1 gets priority and may Zap Y in response; the chain is Void Seeker → Riposte → Zap (340.1)", async () => {
    const game = await board().build();
    await game.p1.cast("void", { targets: "y" });
    await game.p1.passPriority();
    await game.p2.cast("riposte", { targets: ["y"] });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "zap")).toBe(true);
    await game.p1.cast("zap", { targets: "y" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["void", "riposte", "zap"]);
  });

  test("(c) Zap kills Y first; Riposte then STILL counters Void Seeker (independent target, 359.3.e) — Void Seeker to trash with no damage dealt and NO draw for P1", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length; // sky, void, zap
    await game.p1.cast("void", { targets: "y" });
    await game.p1.passPriority();
    await game.p2.cast("riposte", { targets: ["y"] });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("zap", { targets: "y" });
    await game.settle();
    expect(game.zoneOf("y")).toBe("trash"); // Zap resolved first
    expect(game.zoneOf("zap")).toBe("trash");
    expect(game.zoneOf("riposte")).toBe("trash");
    expect(game.zoneOf("void")).toBe("trash");
    // Void Seeker countered, not resolved: had it resolved (target gone → damage skipped) P1 would still have drawn 1.
    expect(game.p1.hand()).toHaveLength(p1Hand - 2);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("(c) …and the Might instruction is simply skipped: no unit anywhere gains Might (Giant 7, Bystander 2), no stray prompt", async () => {
    const game = await board().build();
    await game.p1.cast("void", { targets: "y" });
    await game.p1.passPriority();
    await game.p2.cast("riposte", { targets: ["y"] });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    await game.p1.cast("zap", { targets: "y" });
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.state("giant")).toMatchObject({ might: 7, mightModifier: 0 });
    expect(game.state("z")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });

  // ================================================================== (d) own spell / unrelated friendly unit / never itself
  test("(d) the friendly unit need not be the spell's target: Riposte on (Bystander, Sky Splitter) counters it and gives the BYSTANDER +8 (2 → 10); Y untouched", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "y" });
    await game.p1.passPriority();
    expect(riposteTargets(game)).toEqual(["y", "z"]); // both friendly units offered; no enemy Giant
    await game.p2.cast("riposte", { targets: ["z"] });
    await game.settle();
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.state("z").might).toBe(10);
    expect(game.state("y")).toMatchObject({ damage: 0, might: 3 });
  });

  test("(d) an ENEMY unit is never a legal 'friendly unit' for Riposte", async () => {
    const game = await board().build();
    await game.p1.cast("sky", { targets: "y" });
    await game.p1.passPriority();
    expect(riposteTargets(game)).not.toContain("giant");
    await expect(game.p2.cast("riposte", { targets: ["giant"] })).rejects.toThrow();
  });

  test("(d) with P2's own Test Spark also on the chain, 'a spell' offers BOTH Void Seeker and P2's own Spark (no enemy restriction) paired with either friendly unit — and never Riposte itself (355.9.c)", async () => {
    const game = await board().build();
    await game.p1.cast("void", { targets: "y" });
    await game.p1.passPriority();
    await game.p2.cast("spark", { targets: "giant" });
    expect(game.actingSeat()).toBe(P2); // 312.1 — Spark's caster keeps priority
    expect(riposteTargets(game)).toEqual(["y+spark", "y+void", "z+spark", "z+void"]);
    expect(riposteTargets(game).some((t) => t.includes("riposte"))).toBe(false);
  });

  test("(d) countering its OWN Spark: Spark to trash without damaging the Giant, the chosen Bystander gets +1 (Spark's cost); Void Seeker then resolves normally (4 to Y → dies, P1 draws 1)", async () => {
    const game = await board().build();
    const p1Hand = game.p1.hand().length;
    await game.p1.cast("void", { targets: "y" });
    await game.p1.passPriority();
    await game.p2.cast("spark", { targets: "giant" });
    await game.p2.cast("riposte", { targets: ["z", "spark"] });
    expect(game.chain().map((i) => i.cardId)).toEqual(["void", "spark", "riposte"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { body: 0, order: 0 } });
    await game.settle();
    expect(game.zoneOf("spark")).toBe("trash");
    expect(game.state("giant").damage).toBe(0); // Spark countered
    expect(game.state("z")).toMatchObject({ might: 3, mightModifier: 1 });
    expect(game.zoneOf("y")).toBe("trash"); // Void Seeker was NOT the countered spell
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 1); // cast Void Seeker, drew 1
    expect(game.chain()).toEqual([]);
  });
});
