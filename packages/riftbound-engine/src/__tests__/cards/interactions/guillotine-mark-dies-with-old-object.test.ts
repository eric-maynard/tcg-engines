/**
 * Interaction: Noxian Guillotine (ogn-254-298) · Spell · Fury/Order · 4 + [rainbow] · [Action]
 *     "Choose a unit. Kill it the next time it takes damage this turn.
 *      [Legion] — Kill it now instead. (Get the effect if you've played another card this turn.)"
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · [Reaction]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *   × Sudden Storm (sfd-017-221) · Spell · Fury · 3 · [Hidden] [Action]
 *     "Deal 2 to a unit at a battlefield. If it's attacking, deal 4 to it instead."
 *
 * Rules: 390 / 390.3 (a delayed replacement is keyed to the object chosen when it was created),
 * 355.10.c ("choose a unit" targets), 124 / 124.1 (a card that changes zones to or from a non-board
 * zone becomes a NEW object and nothing is tracked on it any more), 056.1 (hand is a non-board zone),
 * 446.1 (a permanent changing spaces on the board is a Move, not a zone change), 143.4 (a unit enters
 * exhausted), 359.3.e.2 / 359.3.e.4 (a target that left for a non-board zone is illegal on resolution,
 * and the same card replayed is a different object that is never re-acquired).
 *
 * Question: P1 marks a 5-Might unit with Noxian Guillotine. (A) The unit MOVES (base → a battlefield) —
 * board to board, no zone change (446.1) — so the mark rides along and Sudden Storm's 2 damage kills it
 * outright despite 2 < 5. (B) The unit is instead returned to hand by Retreat and replayed: the replayed
 * unit is a new object with no mark, so Sudden Storm's 2 damage just marks 2 damage on a 5-Might unit.
 * (C) Retreat is played while Guillotine is still ON THE CHAIN: Guillotine's chosen object is in a
 * non-board zone when it resolves, so nothing is marked at all.
 *
 * Premise note: the marked unit is P1's OWN. Guillotine says "choose a unit" (any unit — see the target
 * enumeration facet), and identity does not care who controls the object; making it P1's is what lets ONE
 * turn contain the Move, the bounce, the replay and the damage — a defender can neither Standard-Move nor
 * play a unit during P1's turn. Case C additionally turns [Legion] ON (P1 finalized Retreat first,
 * 419.4.b / 812.1.b.1), so Guillotine takes its "Kill it now" branch there — and that kill finds the same
 * illegal object. Either way nothing is marked and nothing dies.
 *
 * Expected: (A) dead. (B) alive with 2 damage. (C) alive with 2 damage and no armed replacement ever.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUILLOTINE = "ogn-254-298";
const RETREAT = "ogn-104-298";
const SUDDEN_STORM = "sfd-017-221";

/** The armed delayed replacements, as the public state reports them. */
function armed(game: Game): { replaces?: string; sourceCardId?: string; targetCardIds?: string[] }[] {
  return (game.gameState.activeReplacements ?? []) as { replaces?: string; sourceCardId?: string; targetCardIds?: string[] }[];
}

/** Flatten a cast option's `targets` field into the set of card ids offered. */
function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p1.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn, nothing played yet (so Guillotine's [Legion] is off when it is the first card).
 * P1 holds bf1 with a 4-Might holder (2 damage does not kill it); the 5-Might "Marked One" waits in P1's base, so the Move,
 * the bounce and the replay all have somewhere to go. Energy: 4+[rainbow] Guillotine, 1 Retreat,
 * 3 Sudden Storm, 2 to replay the unit.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 4, name: "Holder" }, "holder")
    .unit(P1, "base", { energyCost: 2, might: 5, name: "Marked One" }, "victim")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "foe")
    .hand(P1, GUILLOTINE, "guillotine")
    .hand(P1, RETREAT, "retreat")
    .hand(P1, SUDDEN_STORM, "storm");
}

/** Cast Guillotine on the victim with nothing in response — Legion off, delayed kill armed. */
async function markVictim(game: Game): Promise<void> {
  await game.p1.cast("guillotine", { targets: "victim" });
  await game.settle();
  expect(game.zoneOf("guillotine")).toBe("trash");
  expect(game.zoneOf("victim")).toBe("base"); // not killed: [Legion] was off (first card this turn)
  expect(armed(game)).toEqual([expect.objectContaining({ replaces: "take-damage", targetCardIds: ["victim"] })]);
}

describe("Noxian Guillotine × Retreat × Sudden Storm — the delayed mark belongs to the OBJECT it chose", () => {
  // ---- premise ---------------------------------------------------------------------------------

  test("premise: Guillotine chooses ANY unit (355.10.c) — friendly or enemy, base or battlefield — while Sudden Storm only sees units at a battlefield", async () => {
    const game = await board().build();
    expect(targetsOffered(game, "guillotine")).toEqual(expect.arrayContaining(["victim", "holder", "foe"]));
    expect(targetsOffered(game, "storm")).toEqual(["holder"]); // the base is not "at a battlefield"
  });

  // ---- Case A: a Move keeps the mark ------------------------------------------------------------

  test("(A) the mark survives a Move: base → bf1 is a change of space on the board (446.1), not a zone change, so the delayed replacement still names the same object", async () => {
    const game = await board().build();
    await markVictim(game);
    await game.p1.move("victim", "bf1");
    await game.settle();
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, might: 5 });
    expect(armed(game)).toEqual([expect.objectContaining({ replaces: "take-damage", targetCardIds: ["victim"] })]);
  });

  test("(A) Sudden Storm deals 2 to the moved unit — not attacking, so 2 and not 4 — and the delayed replacement KILLS it despite 2 < 5 (390.3)", async () => {
    const game = await board().build();
    await markVictim(game);
    await game.p1.move("victim", "bf1");
    await game.settle();
    await game.p1.cast("storm", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p1.trash()).toContain("victim");
    expect(game.zoneOf("storm")).toBe("trash");
    expect(armed(game)).toEqual([]); // one-shot: consumed by the death it replaced
    expect(game.violations()).toEqual([]);
  });

  test("(A) the mark is on THAT object only: Sudden Storm on the holder instead deals plain damage and nothing dies, and the victim's mark is still armed", async () => {
    const game = await board().build();
    await markVictim(game);
    await game.p1.move("victim", "bf1");
    await game.settle();
    await game.p1.cast("storm", { targets: "holder" });
    await game.settle();
    expect(game.zoneOf("holder")).toBe("battlefield-bf1");
    expect(game.state("holder").damage).toBe(2);
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(armed(game)).toEqual([expect.objectContaining({ targetCardIds: ["victim"] })]);
  });

  // ---- Case B: a bounce + replay is a new object ------------------------------------------------

  test("(B) Retreat returns the marked unit to its owner's hand (a non-board zone, 056.1) and channels its owner 1 rune exhausted", async () => {
    const game = await board().build();
    await markVictim(game);
    const runesBefore = game.p1.runes().length;
    await game.p1.cast("retreat", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("hand");
    expect(game.p1.hand()).toContain("victim");
    expect(game.p1.runes()).toHaveLength(runesBefore + 1);
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // the channelled rune arrived exhausted
  });

  test("(B) the replayed unit enters exhausted at bf1 (143.4) as a fresh object with no damage", async () => {
    const game = await board().build();
    await markVictim(game);
    await game.p1.cast("retreat", { targets: "victim" });
    await game.settle();
    await game.p1.play("victim", { to: "bf1" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim")).toMatchObject({ combatRole: null, damage: 0, isExhausted: true, might: 5 });
  });

  // Expected (124 / 124.1 + 390.3): the unit went to hand and came back, so it is a NEW object; the
  // delayed replacement Guillotine installed can no longer be tracked on it. Sudden Storm's 2 damage
  // is just 2 damage on a 5-Might unit and it lives.
  // Actual: the engine keeps the delayed entry keyed by the card id, re-attaches it to the replayed
  // copy and kills a unit that the rules say was never marked.
  test("BUG: the replayed unit is a new object with NO mark — Sudden Storm's 2 must merely mark 2 damage on it (124/124.1, 390.3); the engine kills it", async () => {
    const game = await board().build();
    await markVictim(game);
    await game.p1.cast("retreat", { targets: "victim" });
    await game.settle();
    await game.p1.play("victim", { to: "bf1" });
    await game.settle();
    expect(armed(game)).toEqual([]); // nothing may still name the departed object
    await game.p1.cast("storm", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim")).toMatchObject({ damage: 2, might: 5 });
    expect(game.p1.trash()).not.toContain("victim");
  });

  // ---- Case C: the bounce happens while Guillotine is still on the chain -------------------------

  test("(C) Retreat played in response resolves first (LIFO): when Guillotine resolves its chosen object is in hand, so nothing is marked and nothing is killed", async () => {
    const game = await board().build();
    await game.p1.cast("guillotine", { targets: "victim" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["guillotine"]);
    await game.p1.cast("retreat", { targets: "victim" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["guillotine", "retreat"]);
    await game.settle();
    expect(game.zoneOf("retreat")).toBe("trash");
    expect(game.zoneOf("guillotine")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("hand"); // untouched by either branch of Guillotine
    expect(armed(game)).toEqual([]); // 359.3.e.2 — no delayed replacement was installed on anything
    expect(game.chain()).toEqual([]);
  });

  test("(C) the card cannot even be replayed until the chain empties, and the replayed copy is never re-acquired: Sudden Storm's 2 leaves it alive at 5 Might (359.3.e.4)", async () => {
    const game = await board().build();
    await game.p1.cast("guillotine", { targets: "victim" });
    await game.p1.cast("retreat", { targets: "victim" });
    expect(game.p1.can("play", "victim")).toBe(false); // units are played in a Neutral Open State only
    await game.settle();
    await game.p1.play("victim", { to: "bf1" });
    await game.settle();
    expect(armed(game)).toEqual([]);
    await game.p1.cast("storm", { targets: "victim" });
    await game.settle();
    expect(game.zoneOf("victim")).toBe("battlefield-bf1");
    expect(game.state("victim")).toMatchObject({ damage: 2, might: 5 });
    expect(game.violations()).toEqual([]);
  });

  // ---- the three end states, side by side --------------------------------------------------------

  test("A = dead, B = alive with 2 damage, C = alive with 2 damage — one spell, one target, three identity histories", async () => {
    const a = await board().build();
    await markVictim(a);
    await a.p1.move("victim", "bf1");
    await a.settle();
    await a.p1.cast("storm", { targets: "victim" });
    await a.settle();

    const c = await board().build();
    await c.p1.cast("guillotine", { targets: "victim" });
    await c.p1.cast("retreat", { targets: "victim" });
    await c.settle();
    await c.p1.play("victim", { to: "bf1" });
    await c.settle();
    await c.p1.cast("storm", { targets: "victim" });
    await c.settle();

    const outcome = (g: Game) => ({ damage: g.has("victim") ? g.state("victim").damage : -1, zone: g.zoneOf("victim") });
    expect(outcome(a)).toEqual({ damage: 0, zone: "trash" });
    expect(outcome(c)).toEqual({ damage: 2, zone: "battlefield-bf1" });
  });
});
