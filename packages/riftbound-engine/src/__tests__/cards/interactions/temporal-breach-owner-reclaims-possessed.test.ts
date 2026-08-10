/**
 * Interaction: Possession (ogn-203-298) · Spell · Chaos · 8 + [chaos]×3 · Action
 *     "Choose an enemy unit at a battlefield. Take control of it and recall it. (Send it to your base. This isn't a move.)"
 *   × Temporal Breach (ven-066-166) · Spell · Mind · 2 + [mind] · [Hidden]
 *     "Banish a unit, then its owner plays it to the same location, ignoring its cost."
 *   × Vanguard Sergeant (ogn-219-298) · Unit · Order · 4 · 4 Might (vanilla)          — OWNED by P2, borrowed by P1
 *
 * Rules: 355.9.a.1 ("a unit" = any unit on the board — no friendly/enemy word), 056 / 056.1 / 108.6.a (a banished card
 * goes to its OWNER's banishment), 127.1 (owner = who brought the card), 124 / 124.1 (board → non-board → board = a
 * new object: damage, buffs, exhaustion, layer-1 control changes all gone), 191.1 / 191.3 (whoever PLAYS a permanent is
 * its controller as it enters), 477.1.a (control is a layer-1 trait Possession altered on the OLD object), 190.3.a /
 * 190.3.a.1 (a unit played to a battlefield its controller doesn't control applies Contested), 190.4.c / 323.6 (no
 * unit there in an Open Cleanup → control lapses), 344 / 344.2 / 345 (non-combat Showdown, Focus to the contester),
 * 348.2.a / 469.1 (sole remaining player establishes control = Conquer, 1 point if not yet scored), 359.3.d.
 *
 * Question: on P1's turn P1 Possessed P2's buffed Vanguard Sergeant and walked it onto the empty bf1 (P1 conquers, the
 * Sergeant is exhausted); on P2's turn it takes 2 damage. bf1: P1's, the borrowed Sergeant its ONLY unit. P2 (Neutral
 * Open, hasn't scored bf1) plays Temporal Breach on the Sergeant.
 *   (a) Is a unit P2 owns but doesn't control a legal choice?
 *   (b) Whose banishment; who replays it; who controls it afterwards; damage / buff / exhaustion?
 *   (c) It re-enters at bf1, which P1 controls with no unit of its own: contested? showdown? does P2 conquer and score?
 *   (d) Contrast: P1 casts Temporal Breach on the borrowed Sergeant on its own turn — who replays and controls it?
 *
 * Expected: (a) yes. (b) P2's banishment (owner); P2 plays it (owner) → P2 controls it (191.3); a new object: printed
 * 4 Might, no damage, no buff, enters exhausted; P1 never gets it back; Breach → P2's trash. (c) P2's arrival contests
 * bf1; at the Cleanup P1 (no units) loses bf1; non-combat Showdown with P2's Focus; pass/pass → P2 conquers, +1.
 * (d) identical routing — banished to P2's banishment, replayed and controlled by P2: the borrower loses it (and bf1).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const POSSESSION = "ogn-203-298";
const TEMPORAL_BREACH = "ven-066-166";
const VANGUARD_SERGEANT = "ogn-219-298";

/** Card ids `seat`'s cast option for `alias` offers as targets. */
function targetsOffered(game: Game, seat: typeof P1 | typeof P2, alias: string): string[] {
  const field = game.seat(seat).option("cast", alias)?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))].sort();
}

const topShowdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);
const sergeant = (game: Game) => {
  const s = game.state("sergeant");
  return { controller: s.controller, owner: s.owner, zone: s.zone };
};

/**
 * Turn 2, P1 active. bf1: empty, uncontrolled. bf2: P2's, held only by P2's READY, BUFFED Vanguard Sergeant (4+1).
 * P1: Possession + a Temporal Breach of its own in hand, 10 energy + 3 chaos + 1 mind (8+[chaos]×3, then 2+[mind]).
 * P2: Temporal Breach in hand and a vanilla 1-Might Pawn at home (a second "a unit" candidate); P2's resources for
 * turn 3 are added when that turn comes (pools empty at end of turn).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 10, power: { chaos: 3, mind: 1 } })
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", VANGUARD_SERGEANT, "sergeant", { buffed: true })
    .unit(P2, "base", { might: 1, name: "Pawn" }, "pawn")
    .hand(P1, POSSESSION, "possession")
    .hand(P1, TEMPORAL_BREACH, "p1Breach")
    .hand(P2, TEMPORAL_BREACH, "breach");
}

/** Turn 2: P1 resolves Possession on the Sergeant (→ P1's base, P1's control) and Standard-Moves it onto empty bf1 (P1 conquers, +1). */
async function borrowedAtBf1(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("possession", { targets: "sergeant" });
  await game.settle();
  expect(game.state("sergeant")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
  await game.p1.move("sergeant", "bf1");
  expect((await game.settle()).reason).toBe("open");
  expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
  expect(game.p1.points()).toBe(1);
  return game;
}

/** …then P2's turn 3 (Neutral Open): the borrowed Sergeant takes 2 damage and P2 floats exactly 2 energy + 1 mind for the Breach. */
async function p2Turn(): Promise<Game> {
  const game = await borrowedAtBf1();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  await game.p2.do("addDamage", { amount: 2, cardId: "sergeant" });
  await game.p2.do("addResources", { energy: 2, power: { mind: 1 } });
  expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  return game;
}

/** P2 casts Temporal Breach on the Sergeant and both pass → it resolves (banish + owner's replay happen inside it). */
async function breachResolved(): Promise<Game> {
  const game = await p2Turn();
  await game.p2.cast("breach", { targets: "sergeant" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("breach")).toBe("trash");
  expect(game.chain()).toEqual([]);
  return game;
}

describe("premise — the borrowed Sergeant on P2's turn", () => {
  test("(owner P2, controller P1, at bf1): P1 controls bf1 with the Sergeant as its ONLY unit; it is exhausted (P2's Awaken doesn't ready P1's permanent), buffed (5 Might, kept through the Possession recall — 458.1) and now carries 2 damage; P2 has not scored bf1; 1–0", async () => {
    const game = await p2Turn();
    expect(sergeant(game)).toEqual({ controller: P1, owner: P2, zone: "battlefield-bf1" });
    expect(game.state("sergeant")).toMatchObject({ damage: 2, isBuffed: true, isExhausted: true, might: 5 });
    expect(game.cardsAt("bf1")).toEqual(["sergeant"]);
    expect(game.p1.units()).toEqual(["sergeant"]); // rule 108.2 — it counts as P1's unit
    expect(game.p2.units()).toEqual(["pawn"]);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 0]);
    expect(game.zoneOf("possession")).toBe("trash");
  });
});

describe("(a) 'Banish a unit' — ownership and control words are absent (355.9.a.1)", () => {
  test("P2's Temporal Breach offers the Sergeant (owned, NOT controlled by P2) alongside P2's own Pawn; casting it at the Sergeant is accepted and costs exactly 2 + [mind]", async () => {
    const game = await p2Turn();
    expect(targetsOffered(game, P2, "breach")).toEqual(["pawn", "sergeant"]);
    await game.p2.cast("breach", { targets: "sergeant" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "breach", controller: P2, targets: ["sergeant"], triggered: false })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });
});

describe("(b) resolution — banished to its OWNER's zone, replayed BY its owner, controlled by its owner", () => {
  test("after resolution the Sergeant is back on the board at bf1 as (owner P2, CONTROLLER P2): 'its owner plays it' (127.1) and the player who plays a permanent controls it (191.3) — Possession's control change died with the old object (124)", async () => {
    const game = await breachResolved();
    expect(game.has("sergeant")).toBe(true);
    expect(sergeant(game)).toEqual({ controller: P2, owner: P2, zone: "battlefield-bf1" });
    expect(game.p2.units("bf1")).toEqual(["sergeant"]);
    expect(game.p1.units()).toEqual([]); // P1 never gets it back
  });

  test("it passed through banishment and came out a NEW object (124.1): printed 4 Might, no buff, 0 damage — and it enters EXHAUSTED like any played unit; neither banishment holds anything afterwards (056 / 108.6.a: it was P2's zone it visited)", async () => {
    const game = await breachResolved();
    expect(game.state("sergeant")).toMatchObject({ baseMight: 4, damage: 0, isBuffed: false, isExhausted: true, might: 4, mightModifier: 0 });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
  });

  test("'enters exhausted' is the play rule, not leftover state: even if the borrowed Sergeant is READY when Breached, the replayed one is exhausted", async () => {
    const game = await p2Turn();
    await game.p2.do("readyCard", { cardId: "sergeant" });
    expect(game.state("sergeant").isReady).toBe(true);
    await game.p2.cast("breach", { targets: "sergeant" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("sergeant")).toMatchObject({ controller: P2, isExhausted: true, zone: "battlefield-bf1" });
  });

  test("Temporal Breach itself resolved normally → P2's trash; the chain is empty; the replay 'ignoring its cost' charged P2 nothing beyond the spell (pool still 0/0)", async () => {
    const game = await breachResolved();
    expect(game.p2.trash()).toContain("breach");
    expect(game.chain()).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });
});

describe("(c) 'to the same location' = bf1, a battlefield P1 controls with no unit of its own", () => {
  test("P2's Sergeant being played to bf1 applies Contested for P2 (190.3.a.1); at the Cleanup P1 — unit-less there — has LOST control (190.4.c / 323.6): bf1 contested by P2, controller nobody", async () => {
    const game = await breachResolved();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.battlefields({ controlled: true })).toEqual([]);
  });

  test("a NON-combat Showdown has opened at bf1 (344.2 — no opposing units) with P2, the contester, holding Focus (345); nobody has scored yet", async () => {
    const game = await breachResolved();
    expect(topShowdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P2, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.state("sergeant").combatRole).toBeNull();
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 0]);
  });

  test("pass / pass → P2 establishes control of bf1 = a Conquer (348.2.a / 469.1) and scores 1: the owner reclaims the unit AND takes the battlefield; 1–1, back to P2's open main phase, no violations", async () => {
    const game = await breachResolved();
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.battlefields({ controlled: true })).toEqual(["bf1"]);
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 1]);
    expect(sergeant(game)).toEqual({ controller: P2, owner: P2, zone: "battlefield-bf1" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(owner, controller, zone/location) at each step: (P2,P2,bf2) → Possession → (P2,P1,P1's base) → move → (P2,P1,bf1) → Breach → (P2,P2,bf1)", async () => {
    const game = await board().build();
    const steps: ReturnType<typeof sergeant>[] = [sergeant(game)];
    await game.p1.cast("possession", { targets: "sergeant" });
    await game.settle();
    steps.push(sergeant(game));
    await game.p1.move("sergeant", "bf1");
    await game.settle();
    steps.push(sergeant(game));
    await game.advanceTurn();
    await game.p2.do("addResources", { energy: 2, power: { mind: 1 } });
    await game.p2.cast("breach", { targets: "sergeant" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    steps.push(sergeant(game));
    expect(steps).toEqual([
      { controller: P2, owner: P2, zone: "battlefield-bf2" },
      { controller: P1, owner: P2, zone: "base" },
      { controller: P1, owner: P2, zone: "battlefield-bf1" },
      { controller: P2, owner: P2, zone: "battlefield-bf1" },
    ]);
    expect(game.p1.base()).not.toContain("sergeant"); // "P1's base" above = while P1 controlled it
  });
});

describe("(d) contrast — no rescue for the borrower: P1 Breaches the borrowed Sergeant on its OWN turn", () => {
  test("P1's Temporal Breach may choose the Sergeant it controls; on resolution the routing is the same — through P2's banishment, replayed by its OWNER P2, so it comes back as (owner P2, CONTROLLER P2) at bf1: 4 Might, unbuffed, exhausted; both banishments empty; P1's Breach → P1's trash", async () => {
    const game = await borrowedAtBf1();
    expect(targetsOffered(game, P1, "p1Breach")).toContain("sergeant");
    await game.p1.cast("p1Breach", { targets: "sergeant" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, mind: 0 } });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("p1Breach")).toBe("trash");
    expect(game.p1.trash()).toContain("p1Breach");
    expect(sergeant(game)).toEqual({ controller: P2, owner: P2, zone: "battlefield-bf1" });
    expect(game.state("sergeant")).toMatchObject({ damage: 0, isBuffed: false, isExhausted: true, might: 4 });
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]);
  });

  test("…and it backfires completely: P2's arrival contests bf1, P1 (no units) loses it at the Cleanup, a non-combat Showdown opens with P2's Focus ON P1'S TURN; pass/pass → P2 conquers bf1 and scores (+1) on the opponent's turn — 1–1", async () => {
    const game = await borrowedAtBf1();
    await game.p1.cast("p1Breach", { targets: "sergeant" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P2 });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(topShowdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", focusPlayer: P2, isCombatShowdown: false });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    await game.p2.passFocus();
    await game.p1.passFocus();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect([game.p1.points(), game.p2.points()]).toEqual([1, 1]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
