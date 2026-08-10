/**
 * Interaction: Here to Help (sfd-111-221) flipped from facedown at Mystic Vortex (ven-160-166)
 *              to drop Vanguard Sergeant (ogn-219-298) into a combat on the OPPONENT's turn.
 *
 *   Here to Help — Spell (Action) · Body · 2 · [Hidden]
 *     "You may play a unit from hand to a battlefield you control, reducing its cost by [3]."
 *   Mystic Vortex — Battlefield
 *     "During showdowns here, cards with [Reaction] cost [rainbow] more to play. (Hidden cards have [Reaction].)"
 *   Vanguard Sergeant — Unit · Order · 4 · 4 Might, no keywords.      Cleave — Action spell, 1: Assault 3.
 *
 * Rules: 811.6 (a Hidden card has [Reaction] while facedown / played from facedown), 811.3 + 811.5.a
 * (played from hand it is just its printed self — an [Action] card), 811.1.b (from facedown: ignore base
 * cost), 356.1.b.3 + 356.3 (a cost INCREASE still applies on top of an ignored base cost), 811.1.d.3 (a
 * unit a hidden spell makes you play must be played AT that battlefield), 806.1.b / 338.1.a.2 / 309.1.a /
 * 358.4 (an Action card may start a chain in a showdown but never join one), 419.3 / 419.3.b (a play by a
 * resolving effect is a Limited play whose timing is the effect's), 813.3 / 813.5 (Reaction is permission
 * on the card that has it; it transfers nothing to the unit that card plays), 323.2.a (a unit arriving
 * mid-combat takes its controller's designation), 337.2 (LIFO).
 *
 * Question. P2's turn. P1 controls the Vortex with D (2) and also bf2. P1 has Here to Help facedown at the
 * Vortex (since last turn), another copy in hand, and Vanguard Sergeant in hand; 3 energy + [body] +
 * [rainbow]. P2 attacks the Vortex with A (2), Cleaves A (+Assault 3) and passes priority.
 *  (a) Which Here to Help is legal in this Closed state, and what does the flip cost here?
 *  (b) On resolution P1 plays the Sergeant: timing keyword needed? where may it go? cost? Vortex surcharge?
 *  (c) Contrast: P2 passed Focus instead (Open showdown) and P1 plays the HAND copy.
 *  (d) Combat result vs doing nothing; and with 0 [rainbow].
 *
 * Expected. (a) hand copy illegal (Action can't join a chain); facedown copy legal — it has Reaction, base
 * cost ignored, but the Vortex adds [rainbow] → exactly 1 rainbow; it sits above Cleave and resolves first.
 * (b) The Sergeant needs no keyword (effect-play); from-facedown → Vortex ONLY (bf2 not allowed); costs
 * 4−3 = 1 energy and NO [rainbow] (it is not a card with Reaction); enters exhausted as a Defender.
 * (c) hand copy: 2 + [body], no surcharge; Sergeant may go to the Vortex OR bf2 for 1.
 * (d) A attacks at 5 into 2+4 = 6 → A dies, at most one defender dies, P1 holds. Doing nothing: D dies, P2
 * conquers. With 0 rainbow the flip at the Vortex is unaffordable (free anywhere else).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HERE_TO_HELP = "sfd-111-221";
const MYSTIC_VORTEX = "ven-160-166";
const VANGUARD_SERGEANT = "ogn-219-298";
const CLEAVE = "ogn-004-298";

/**
 * Turn 3, P2 active. mv = Mystic Vortex (live text) controlled by P1 with D (2) and a facedown Here to Help;
 * bf2 (inert) controlled by P1 with a 1-Might Outrider. P2: A (2) in base, Cleave in hand, 1 energy.
 */
function board(p1Power: Record<string, number> = { body: 1, rainbow: 1 }) {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 3, power: p1Power })
    .resources(P2, { energy: 1 })
    .battlefield("mv", { controller: P1, def: MYSTIC_VORTEX, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "mv", { might: 2, name: "Defender D" }, "d")
    .unit(P1, "bf2", { might: 1, name: "Outrider" }, "out")
    .unit(P2, "base", { might: 2, name: "Attacker A" }, "a")
    .facedown(P1, "mv", HERE_TO_HELP, "hthHidden")
    .hand(P1, HERE_TO_HELP, "hthHand")
    .hand(P1, VANGUARD_SERGEANT, "sarge")
    .hand(P2, CLEAVE, "cleave");
}

/** P2 attacks the Vortex with A, Cleaves A while holding Focus, and passes priority → P1 has priority (Closed). */
async function closedState(p1Power?: Record<string, number>): Promise<Game> {
  const game = await board(p1Power).build();
  await game.p2.move("a", "mv");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  await game.p2.cast("cleave", { targets: "a" });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  return game;
}

/** From the Closed state: P1 flips the facedown copy, both pass, Here to Help resolves → P1 is offered the hand unit. */
async function flipAndResolve(p1Power?: Record<string, number>): Promise<Game> {
  const game = await closedState(p1Power);
  await game.p1.reveal("hthHidden");
  while (game.decision()?.kind === "action" && game.chain().some((c) => c.cardId === "hthHidden")) {
    await game.acting().passPriority();
  }
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  return game;
}

/** P2 attacks the Vortex and passes Focus without acting → P1 has Focus in an Open showdown. */
async function openState(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("a", "mv");
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Here to Help flipped at Mystic Vortex → untaxed Vanguard Sergeant mid-combat", () => {
  // ── (a) legality & cost in the Closed state ───────────────────────────────────────────────

  test("(a) the HAND copy is an [Action] card and cannot join P2's Cleave chain — not offered, cast rejected (338.1.a.2, 309.1.a, 358.4)", async () => {
    const game = await closedState();
    expect(game.p1.can("cast", "hthHand")).toBe(false);
    await expect(game.p1.cast("hthHand")).rejects.toThrow();
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    expect(game.zoneOf("hthHand")).toBe("hand");
  });

  test("(a) the FACEDOWN copy has [Reaction] (811.6) and IS legal now; it lands on top of Cleave (LIFO, 337.2)", async () => {
    const game = await closedState();
    expect(game.p1.can("reveal", "hthHidden")).toBe(true);
    await game.p1.reveal("hthHidden");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "hthHidden"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "hthHidden", controller: P1, triggered: false });
    expect(game.zoneOf("hthHidden")).toBe("chain");
  });

  // Expected (811.6 + 356.1.b.3 + 356.3): the flip ignores the base 2+[body] but, being a card WITH Reaction
  // played during a showdown at the Vortex, pays the [rainbow] surcharge → {energy 3, body 1, rainbow 0}.
  // Actual: the engine only surcharges cards with PRINTED Reaction; the Hidden-granted Reaction is missed → free.
  test("(a) flipping Here to Help at the Vortex during the showdown costs exactly [rainbow] — base cost ignored, surcharge not (811.1.b, 811.6, 356.1.b.3)", async () => {
    const game = await closedState();
    await game.p1.reveal("hthHidden");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1, rainbow: 0 } });
  });

  test("(a) it resolves BEFORE Cleave: after both pass, P1 is asked for the unit while Cleave is still on the chain", async () => {
    const game = await flipAndResolve();
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave"]);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, allowDecline: true }); // "you MAY play a unit"
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["sarge"]);
    expect(game.state("a").grantedKeywords).toEqual([]); // Cleave has not resolved yet
  });

  // ── (b) the Sergeant played by the resolving effect ───────────────────────────────────────

  test("(b) the keyword-less Sergeant IS offered and enters mid-combat on P2's turn — the effect supplies the timing (419.3/419.3.b)", async () => {
    const game = await flipAndResolve();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("sarge").keywords).toEqual([]);
    await game.p1.pick("sarge");
    expect(game.locationOf("sarge")).toBe("mv");
    expect(game.p1.hand()).not.toContain("sarge");
  });

  test("(b) played via the FACEDOWN copy the Sergeant must go to THAT battlefield — no destination choice, never bf2 although P1 controls it (811.1.d.3)", async () => {
    const game = await flipAndResolve();
    await game.p1.pick("sarge");
    // No destination prompt follows: the next decision is P2's priority on the remaining Cleave.
    const d = game.decision();
    expect(d?.kind === "pick" && d.seat === P1).toBe(false);
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.zoneOf("sarge")).toBe("battlefield-mv");
    expect(game.p1.units("bf2")).toEqual(["out"]);
  });

  test("(b) the Sergeant costs 4 − 3 = 1 energy and NO [rainbow]: it is not a card with Reaction — Here to Help's Reaction does not transfer (813.3, 813.5)", async () => {
    const game = await flipAndResolve({ body: 1, rainbow: 2 });
    const afterFlip = game.p1.resources();
    await game.p1.pick("sarge");
    expect(game.locationOf("sarge")).toBe("mv");
    expect(game.p1.energy()).toBe(afterFlip.energy - 1);
    expect(game.p1.resources().power).toEqual(afterFlip.power); // no power of any kind spent on the unit
  });

  test("(b) with exactly 1 [rainbow] (spent — or owed — on the flip) the 1-energy Sergeant is still affordable and lands at the Vortex", async () => {
    const game = await flipAndResolve();
    await game.p1.pick("sarge");
    expect(game.locationOf("sarge")).toBe("mv");
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.power("body")).toBe(1); // the [body] pip was never touched (base cost ignored on the flip)
  });

  test("(b) the Sergeant enters EXHAUSTED and is designated a Defender in the ongoing combat (323.2.a)", async () => {
    const game = await flipAndResolve();
    await game.p1.pick("sarge");
    expect(game.state("sarge")).toMatchObject({ combatRole: "defender", controller: P1, isExhausted: true, location: "mv" });
    expect(game.state("a").combatRole).toBe("attacker");
    expect(game.state("d").combatRole).toBe("defender");
    expect(game.zoneOf("hthHidden")).toBe("trash");
  });

  // ── (d) combat outcomes ───────────────────────────────────────────────────────────────────

  test("(d) combat: Cleave resolves (A → 5) into D 2 + Sergeant 4 = 6 — A dies, at most one defender dies, P1 keeps the Vortex, P2 scores nothing", async () => {
    const game = await flipAndResolve();
    await game.p1.pick("sarge");
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    const dead = ["d", "sarge"].filter((u) => game.zoneOf(u) === "trash");
    expect(dead.length).toBeLessThanOrEqual(1);
    expect(game.p1.units("mv").length).toBeGreaterThanOrEqual(1);
    expect(game.gameState.battlefields.mv?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("(d) control — P1 does nothing: A (5 with Assault 3) kills D (2) and P2 conquers the Vortex (+1)", async () => {
    const game = await closedState();
    await game.settle();
    expect(game.zoneOf("d")).toBe("trash");
    expect(game.locationOf("a")).toBe("mv");
    expect(game.gameState.battlefields.mv?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("hthHidden")).not.toBe("chain");
  });

  // RULING-CONFLICT: the doc facet asked for "with 0 [rainbow] the flip is unaffordable", but the Vortex surcharge is
  // the [A] symbol (rule 135.2.e.5, "Power of any Domain") and rule 135.2.e.5.a says "[A] can be paid by Power of any
  // Domain" — so the lone [body] pip pays it and the flip stays legal. The engine applies the surcharge (811.6 +
  // 356.1.b.3) and settles it from whatever Power the seat holds; that is the behaviour asserted here.
  test("(d) with only [body] the facedown flip at the Vortex is still legal — the [A] surcharge is payable by Power of any Domain (135.2.e.5.a, 356.1.b.3, 811.6)", async () => {
    const game = await closedState({ body: 1 });
    expect(game.p1.can("cast", "hthHand")).toBe(false); // still timing-illegal regardless
    expect(game.p1.can("reveal", "hthHidden")).toBe(true);
    await game.p1.reveal("hthHidden");
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "hthHidden"]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 0 } });
  });

  test("(d) control — at any OTHER battlefield the same flip with 0 [rainbow] is legal and free (811.1.b)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 3, power: { body: 1 } })
      .resources(P2, { energy: 1 })
      .battlefield("mv", { controller: P1, def: MYSTIC_VORTEX, inert: false, owner: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Defender D" }, "d")
      .unit(P2, "base", { might: 2, name: "Attacker A" }, "a")
      .facedown(P1, "bf2", HERE_TO_HELP, "hthHidden")
      .hand(P1, VANGUARD_SERGEANT, "sarge")
      .hand(P2, CLEAVE, "cleave")
      .build();
    await game.p2.move("a", "bf2");
    await game.p2.cast("cleave", { targets: "a" });
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "hthHidden")).toBe(true);
    await game.p1.reveal("hthHidden");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { body: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "hthHidden"]);
  });

  // ── (c) contrast: Open showdown, HAND copy ────────────────────────────────────────────────

  test("(c) with Focus passed (Open showdown) the HAND copy is legal via [Action] and costs its printed 2 + [body] — no Vortex surcharge for a Reaction-less card (806.1.b, 811.3, 811.5.a)", async () => {
    const game = await openState();
    expect(game.p1.can("cast", "hthHand")).toBe(true);
    await game.p1.cast("hthHand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hthHand"]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0, rainbow: 1 } });
  });

  test("(c) played from HAND there is no 'here' lock: the Sergeant's destination prompt offers the Vortex AND bf2 (any battlefield P1 controls); bf2 works, for 1 energy", async () => {
    const game = await openState();
    await game.p1.cast("hthHand");
    while (game.decision()?.kind === "action" && game.chain().length > 0) {
      await game.acting().passPriority();
    }
    await game.p1.pick("sarge");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.key).toSorted() : [];
    expect(offered).toEqual(["battlefield-bf2", "battlefield-mv"]);
    await game.p1.pick("battlefield-bf2");
    expect(game.zoneOf("sarge")).toBe("battlefield-bf2");
    expect(game.state("sarge").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, rainbow: 1 } });
    expect(game.zoneOf("hthHand")).toBe("trash");
  });

  test("(c) …or the Vortex: picking it puts the Sergeant into the combat as a Defender, also for 1 energy and no [rainbow]", async () => {
    const game = await openState();
    await game.p1.cast("hthHand");
    while (game.decision()?.kind === "action" && game.chain().length > 0) {
      await game.acting().passPriority();
    }
    await game.p1.pick("sarge");
    await game.p1.pick("battlefield-mv");
    expect(game.state("sarge")).toMatchObject({ combatRole: "defender", isExhausted: true, location: "mv" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0, rainbow: 1 } });
  });
});
