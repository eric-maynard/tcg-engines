/**
 * Interaction: Steel Paws (ven-043-166) · Unit · Calm · 1 · 0 Might
 *     "[Deflect] (Opponents must pay [rainbow] to choose me with a spell or ability.)
 *      [Empower] [7] ([7]: Empower me. Use only if not Empowered.)  [Empowered][>] I have +7 [Might]."
 *   × Zhonya's Hourglass (ogn-077-298) · Gear · Calm · 2
 *     "[Hidden] If a friendly unit would die, kill this instead. Heal that unit, exhaust it, and recall it.
 *      (Send it to base. This isn't a move.)"                                                   — face up in P1's base
 *   × Retreat (ogn-104-298) · Spell · Mind · 1 · Reaction
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."          — in P1's hand
 *   (+ Vengeance ogn-229-298 · Spell · Order · 4 + [order][order] · "Kill a unit." as P2's kill spell,
 *      and an inline "When a friendly unit moves, draw 1" Watcher in P1's base as a move-trigger probe.)
 *
 * Rules: 458 / 458.1 (a Recall does not affect the permanent's state — damage and STATUSES stay), 455 / 456.1 /
 * 456.2 (a Recall is a location change, not a Move: move triggers do not fire), 124 / 124.1 / 124.2 (a board ↔
 * non-board zone change makes a NEW object: damage, counters, keywords and statuses — Empowered is listed —
 * are cleared), 441.1.b / 441.2 / 827.1.c.1 (Empowered is a binary status; "[Cost]: Empower this. Play only if not
 * Empowered"), 369 / 370.1 (Zhonya's replaces the death — a mandatory replacement), 359.3.e.5 (a spell whose
 * target became illegal does nothing to it), 705 / 748 (buffs / counters cleared off-board), 190.4.c / 323.6 (no
 * unit of the controller at a battlefield in an Open Cleanup → control lapses), 809 (Deflect surcharge is a cost
 * paid at finalization — never refunded).
 *
 * Question: 458.1 vs 124.1 — Empowered survives a RECALL but not a RETURN-TO-HAND. P1's Empowered (7-Might) Steel
 * Paws holds bf1 alone; P1 has a face-up Zhonya's and Retreat in hand. On P2's turn P2 Vengeances the Paws, paying
 * the Deflect [rainbow].
 *   (a) P1 does not respond: Zhonya's dies instead; Paws healed, exhausted, RECALLED — same object, still
 *       Empowered 7, no move trigger; [Empower] not offered next turn; bf1 lapses.
 *   (b) P1 Retreats the Paws in response: to P1's hand as a fresh 0-Might un-Empowered card, P1 channels 1
 *       exhausted; Vengeance whiffs (still to trash, Deflect not refunded); Zhonya's untouched; replayed next
 *       turn it is 0 Might and [Empower] [7] is offered again at full price.
 *   (c) the per-operation diff (location, zone, identity, {exhausted, damage, empowered}, trigger log).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STEEL_PAWS = "ven-043-166";
const ZHONYAS = "ogn-077-298";
const RETREAT = "ogn-104-298";
const VENGEANCE = "ogn-229-298";

/** Inline P1 unit — "When a friendly unit moves, draw 1." A Recall / bounce must leave it silent (456.1). */
const WATCHER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "friendly-units" }, type: "triggered" }],
  might: 1,
  name: "Watcher (inline: When a friendly unit moves, draw 1)",
};

/**
 * P2's turn (turn 2, Neutral Open). bf1: P1's, held by P1's EMPOWERED Steel Paws (0 + 7 = 7 Might) alone.
 * P1: face-up Zhonya's Hourglass + the Watcher probe in base, Retreat in hand, exactly 1 energy (Retreat).
 * P2: Vengeance in hand and exactly 4 energy + [order][order] + one [rainbow] for the Deflect surcharge.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 4, power: { order: 2, rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", STEEL_PAWS, "paws", { empowered: true })
    .gear(P1, ZHONYAS, "zhonyas")
    .unit(P1, "base", WATCHER, "watcher")
    .hand(P1, RETREAT, "retreat")
    .hand(P2, VENGEANCE, "vengeance");
}

/** Card ids P2's cast option for `alias` offers as targets. */
function targetsOffered(game: Game, alias: string): string[] {
  const field = game.p2.option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

/** P2 casts Vengeance on the Paws (paying Deflect) and passes; P1 now holds priority with Retreat available. */
async function vengeanceCast(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("vengeance", { targets: "paws" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** (a) RECALL line: P1 lets Vengeance resolve — Zhonya's replaces the death. Stops right after resolution. */
async function recallLine(): Promise<Game> {
  const game = await vengeanceCast();
  await game.p1.passPriority();
  expect(game.zoneOf("vengeance")).toBe("trash");
  return game;
}

/** (b) BOUNCE line: P1 answers with Retreat on the Paws; both pass twice → Retreat, then Vengeance, resolve. */
async function bounceLine(): Promise<Game> {
  const game = await vengeanceCast();
  await game.p1.cast("retreat", { targets: "paws" });
  expect(game.chain().map((i) => i.cardId)).toEqual(["vengeance", "retreat"]);
  await game.p1.passPriority();
  await game.p2.passPriority(); // Retreat (LIFO)
  expect(game.zoneOf("retreat")).toBe("trash");
  expect(game.chain().map((i) => i.cardId)).toEqual(["vengeance"]);
  await game.acting().passPriority();
  await game.acting().passPriority(); // Vengeance
  expect(game.zoneOf("vengeance")).toBe("trash");
  return game;
}

describe("setup — the kill spell and its Deflect surcharge", () => {
  test("Steel Paws at bf1 is Empowered: 0 base + 7 = 7 Might, ready, [Deflect]; P2's Vengeance offers it and costs 4 + [order][order] PLUS the [rainbow] Deflect pip → P2's pool is emptied", async () => {
    const game = await board().build();
    expect(game.state("paws")).toMatchObject({ baseMight: 0, controller: P1, damage: 0, isEmpowered: true, isReady: true, might: 7, owner: P1, zone: "battlefield-bf1" });
    expect(game.state("paws").keywords).toContain("Deflect");
    expect(game.zoneOf("zhonyas")).toBe("base");
    expect(targetsOffered(game, "vengeance")).toEqual(["paws", "watcher"]);
    await game.p2.cast("vengeance", { targets: "paws" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "vengeance", controller: P2, targets: ["paws"] })]);
  });

  test("without the extra Power for Deflect P2 cannot choose the Paws (809 — pool-only affordability): only the untaxed Watcher is offered, aiming at the Paws is rejected", async () => {
    const game = await board().resources(P2, { energy: 4, power: { order: 2, rainbow: 0 } }).build();
    expect(targetsOffered(game, "vengeance")).toEqual(["watcher"]);
    expect((await game.p2.try((p) => p.cast("vengeance", { targets: "paws" }))).ok).toBe(false);
    expect(game.p2.resources()).toEqual({ energy: 4, power: { order: 2, rainbow: 0 } });
  });
});

describe("(a) RECALL line — P1 does not respond; Zhonya's Hourglass replaces the death", () => {
  test("the Hourglass is killed instead (→ P1's trash); Steel Paws is in P1's BASE: same object (same id, still on the board), 0 damage, EXHAUSTED; Vengeance resolved normally (→ P2's trash, not countered)", async () => {
    const game = await recallLine();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.p1.trash()).toContain("zhonyas");
    expect(game.has("paws")).toBe(true);
    expect(game.state("paws")).toMatchObject({ controller: P1, damage: 0, isExhausted: true, location: "base", owner: P1, zone: "base" });
    expect(game.p1.base()).toContain("paws");
    expect(game.p2.trash()).toContain("vengeance");
    expect(game.chain()).toEqual([]);
  });

  test("458 / 458.1: the recall leaves its statuses alone — still EMPOWERED, still 0 + 7 = 7 Might in base", async () => {
    const game = await recallLine();
    expect(game.state("paws")).toMatchObject({ baseMight: 0, isEmpowered: true, might: 7, staticMightBonus: 7 });
  });

  test("456.1: a recall is not a Move — the Watcher ('When a friendly unit moves, draw 1') stays silent: no item on the chain, P1's hand unchanged (only Retreat)", async () => {
    const game = await recallLine();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["retreat"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("bf1 has no P1 unit any more → P1 loses it at the Open-state Cleanup (190.4.c / 323.6); P2 does not get it; nobody scores", async () => {
    const game = await recallLine();
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
    expect(game.p2.battlefields({ controlled: true })).toEqual([]);
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]);
    expect(game.violations()).toEqual([]);
  });

  test("P1's next turn: the Paws readies still Empowered (7); even with 7 energy '[Empower] [7]' is NOT offered (827.1.c.1 'only if not Empowered' / 441.1.b)", async () => {
    const game = await recallLine();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("paws")).toMatchObject({ isEmpowered: true, isReady: true, might: 7, zone: "base" });
    await game.p1.do("addResources", { energy: 7 });
    expect(game.p1.energy()).toBeGreaterThanOrEqual(7);
    expect(game.p1.can("activate", "paws")).toBe(false);
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:paws"))).toBe(false);
  });

  test("probe sanity: the same Paws then Standard-Moves back to bf1 — a real Move DOES put the Watcher's trigger on the chain — and re-conquers bf1 as a 7-Might unit", async () => {
    const game = await recallLine();
    await game.advanceTurn();
    await game.p1.move("paws", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "watcher", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("paws")).toMatchObject({ isEmpowered: true, might: 7, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});

describe("(b) BOUNCE line — P1 responds with Retreat on the Paws", () => {
  test("Retreat is a legal Reaction answer for P1 (friendly unit, 1 energy) and sits on top of Vengeance", async () => {
    const game = await vengeanceCast();
    expect(game.p1.can("cast", "retreat")).toBe(true);
    await game.p1.cast("retreat", { targets: "paws" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "vengeance", controller: P2, targets: ["paws"] }),
      expect.objectContaining({ cardId: "retreat", controller: P1, targets: ["paws"] }),
    ]);
  });

  test("Retreat resolves first (LIFO): the Paws goes to its OWNER's hand — P1's — and arrives as a NEW object (124 / 124.1): NOT Empowered, 0 Might, no damage, not exhausted", async () => {
    const game = await vengeanceCast();
    await game.p1.cast("retreat", { targets: "paws" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("paws")).toBe("hand");
    expect(game.p1.hand()).toContain("paws");
    expect(game.p2.hand()).not.toContain("paws");
    expect(game.state("paws")).toMatchObject({ damage: 0, isBuffed: false, isEmpowered: false, isExhausted: false, might: 0, staticMightBonus: 0 });
    expect(game.chain().map((i) => i.cardId)).toEqual(["vengeance"]); // Vengeance still waiting
  });

  test("'Its owner channels 1 rune exhausted': P1's rune pool +1 (that rune exhausted), P1's rune deck −1; P2 channels nothing", async () => {
    const game = await vengeanceCast();
    const p1Runes0 = game.p1.runes().length;
    const p1Deck0 = game.p1.runeDeck().length;
    const p2Runes0 = game.p2.runes().length;
    await game.p1.cast("retreat", { targets: "paws" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.runes()).toHaveLength(p1Runes0 + 1);
    expect(game.p1.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runeDeck()).toHaveLength(p1Deck0 - 1);
    expect(game.p2.runes()).toHaveLength(p2Runes0);
  });

  test("Vengeance then resolves with its only target gone: it does nothing (359.3.e.5) and still goes to P2's trash; the Deflect [rainbow] and [order][order] P2 paid are NOT refunded; Zhonya's never saw a 'would die' and is still face up in base", async () => {
    const game = await bounceLine();
    expect(game.p2.trash()).toContain("vengeance");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { order: 0, rainbow: 0 } });
    expect(game.zoneOf("zhonyas")).toBe("base");
    expect(game.zoneOf("paws")).toBe("hand");
    expect(game.zoneOf("watcher")).toBe("base"); // nothing else was killed in its place
  });

  test("no move trigger fired (return-to-hand is not a Move either), the chain is empty, bf1 lapses to nobody at the Cleanup, 0–0, back to P2's open main phase", async () => {
    const game = await bounceLine();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().sort()).toEqual(["paws"]); // Retreat spent, Paws returned, nothing drawn
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect([game.p1.points(), game.p2.points()]).toEqual([0, 0]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("P1's next turn: replaying Steel Paws costs [1] and it enters the base as a FRESH unit — exhausted, un-Empowered, 0 Might", async () => {
    const game = await bounceLine();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes({ ready: true })).toHaveLength(3); // the Retreat rune readied + 2 channeled this turn
    await game.p1.tapRunes(3);
    expect(game.p1.energy()).toBe(3);
    await game.p1.play("paws");
    expect(game.p1.energy()).toBe(2);
    await game.settle();
    expect(game.state("paws")).toMatchObject({ baseMight: 0, isEmpowered: false, isExhausted: true, might: 0, zone: "base" });
  });

  test("…and '[Empower] [7]' IS offered again and must be paid in full: not with 6 energy, yes with 7 → pool 0 → resolves → Empowered, 7 Might, ability gone again", async () => {
    const game = await bounceLine();
    await game.advanceTurn();
    await game.p1.tapRunes(3); // no ready rune left to credit — pure pool affordability from here on
    await game.p1.play("paws");
    await game.settle();
    await game.p1.do("addResources", { energy: 6 - game.p1.energy() });
    expect(game.p1.energy()).toBe(6);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p1.can("activate", "paws")).toBe(false);
    await game.p1.do("addResources", { energy: 1 });
    expect(game.p1.can("activate", "paws")).toBe(true);
    await game.p1.activate("paws");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("paws")).toMatchObject({ isEmpowered: false, might: 0 }); // still on the chain
    await game.settle();
    expect(game.state("paws")).toMatchObject({ isEmpowered: true, might: 7 });
    expect(game.p1.can("activate", "paws")).toBe(false);
  });
});

describe("(c) the per-operation diff — recall vs bounce must not share one 'leave location' path", () => {
  test("RECALL: location bf1 → base, zone board → board, identity kept, {exhausted: true (Zhonya's), damage: 0 (healed), empowered: TRUE (unchanged) → 7 Might}, triggers: none | BOUNCE: zone board → hand, {exhausted: false, damage: 0, empowered: FALSE → 0 Might}, triggers: none, side effect: 1 rune channeled exhausted", async () => {
    const recalled = await recallLine();
    const r = recalled.state("paws");
    expect({ chain: recalled.chain().length, damage: r.damage, empowered: r.isEmpowered, exhausted: r.isExhausted, location: r.location, might: r.might, sameObject: recalled.has("paws"), zone: r.zone }).toEqual({
      chain: 0,
      damage: 0,
      empowered: true,
      exhausted: true,
      location: "base",
      might: 7,
      sameObject: true,
      zone: "base",
    });

    const bounced = await bounceLine();
    const b = bounced.state("paws");
    expect({ chain: bounced.chain().length, damage: b.damage, empowered: b.isEmpowered, exhausted: b.isExhausted, exhaustedRunes: bounced.p1.runes({ ready: false }).length, location: b.location, might: b.might, zone: b.zone }).toEqual({
      chain: 0,
      damage: 0,
      empowered: false,
      exhausted: false,
      exhaustedRunes: 1,
      location: undefined,
      might: 0,
      zone: "hand",
    });
  });
});
