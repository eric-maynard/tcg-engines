/**
 * Interaction: Targon's Peak (ogn-289-298) · Battlefield
 *     "When you conquer here, ready up to 2 runes at the end of this turn."
 *   × Startipped Peak (ogn-288-298) · Battlefield
 *     "When you hold here, you may channel 1 rune exhausted."
 *   × Retreat (ogn-104-298) · Spell · Mind · [1] · [Reaction]
 *     "Return a friendly unit to its owner's hand. Its owner channels 1 rune exhausted."
 *
 * Question. P1's turn, two battlefields. P1 starts with exhausted runes r1 and r2 (plus one already-READY
 * rune, rReady) and P2 has a rune of its own, e1.
 *   (a) P1 conquers Targon's Peak in the first showdown — does ANY rune Decision surface at the conquer
 *       trigger, i.e. are r1/r2 bound then?
 *   (b) Later that turn another rune (r3) is channelled EXHAUSTED. At the Ending Step the delayed trigger
 *       finalizes: what exactly is the option set — does it include r3 (channelled AFTER the conquer), may
 *       P1 pick zero, may P1 pick an already-ready rune, or an enemy rune?
 *   (c) With the delayed trigger finalized on r3 + r2, P1 responds with Retreat on its own unit, channelling
 *       r4 exhausted: does r4 get readied instead of / in addition to the locked pair?
 *   (d) NO side: had the runes been bound at conquer time, r1 + r2 would ready and r3 would stay exhausted —
 *       that outcome must not occur.
 *
 * Rules: 355.5 / 355.5.b (which names THIS card: readying is the effect of a DELAYED trigger, so no choices
 * are made when the conquer effect is finalized), 389 / 390.2 (the conquer trigger generates a player-scoped
 * delayed ability), 317.1.a (end-of-turn Game Effects take place in the Ending Step), 402.2 / 355.7 (a
 * triggered ability makes ITS choices when IT is finalized), 355.13 ("up to 2" = 0–2 picks), 355.15 (the
 * choices cannot be changed afterwards), 430.1 / 430.2 (channelling; "exhausted" overrides the ready
 * default), 359.3.e.2 / 359.3.e.8 (a chosen object that becomes illegal is skipped and the other target is
 * still operated on — never a re-pick).
 *
 * Note on the Startipped rune. "When you hold here" fires in the Beginning Phase (469.2 / 315.2.b), which
 * necessarily precedes a Main-Phase conquer, so the rune that is demonstrably channelled AFTER the conquer
 * is supplied by Retreat instead; a separate test walks the hold flow and shows the Startipped rune is in
 * the same Ending-Step option set.
 *
 * Expected. (a) No rune choice at the conquer: the trigger goes on the chain, resolves, and installs the
 * delayed ability — the chain item names no rune and nothing readies. (b) At the Ending Step the delayed
 * trigger's own finalization asks: every rune on the board at THAT moment, exhausted or ready, 0–2 picks.
 * (c) The pair is locked; Retreat's r4 is neither substituted in nor added on — exactly r3 and r2 ready.
 * (d) r1 stays exhausted and r3 ends ready.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const TARGONS_PEAK = "ogn-289-298";
const STARTIPPED_PEAK = "ogn-288-298";
const RETREAT = "ogn-104-298";
const FURY_RUNE = "ogn-007-298";

/**
 * P1's main phase, turn 2. Targon's Peak (live text) is P2's, guarded by a 1-Might Grunt; P1 holds
 * Startipped Peak with a Holder. P1's rune pool: r1 + r2 exhausted and rReady ready; P2 owns e1. Two named
 * Fury Runes sit on top of P1's rune deck so anything that channels produces r3 then r4.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("targon", { controller: P2, def: TARGONS_PEAK, inert: false })
    .battlefield("star", { controller: P1, def: STARTIPPED_PEAK, inert: false })
    .unit(P2, "targon", { might: 1, name: "Grunt" }, "grunt")
    .unit(P1, "star", { might: 2, name: "Holder" }, "holder")
    .unit(P1, "base", { might: 3, name: "Hero" }, "hero")
    .unit(P1, "base", { might: 1, name: "Spare" }, "spare")
    .unit(P1, "base", { might: 1, name: "Spare Two" }, "spare2")
    .rune(P1, "fury", { alias: "r1", exhausted: true })
    .rune(P1, "fury", { alias: "r2", exhausted: true })
    .rune(P1, "fury", { alias: "rReady" })
    .rune(P2, "chaos", { alias: "e1", exhausted: true })
    .card("r3", { def: FURY_RUNE, owner: P1, zone: "runeDeck" })
    .card("r4", { def: FURY_RUNE, owner: P1, zone: "runeDeck" })
    .hand(P1, RETREAT, "ret1")
    .hand(P1, RETREAT, "ret2")
    .fillDecks({ main: 10, runes: 4 });
}

/** Hero walks into the Peak; both pass Focus → combat resolves, P1 conquers, the trigger is on the chain. */
async function atConquerTrigger(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("hero", "targon");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

/** …both pass priority → the conquer trigger resolves and P1 is back in an open main phase. */
async function afterConquer(): Promise<Game> {
  const game = await atConquerTrigger();
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

/** …then Retreat bounces Spare, so its owner channels r3 EXHAUSTED — a rune created after the conquer. */
async function afterConquerAndChannel(): Promise<Game> {
  const game = await afterConquer();
  await game.p1.cast("ret1", { targets: "spare" });
  await game.settle();
  return game;
}

/** …then P1 ends the turn; the Ending Step puts the delayed trigger on the chain and asks its runes. */
async function atEndingStepPrompt(): Promise<Game> {
  const game = await afterConquerAndChannel();
  await game.p1.endTurn();
  return game;
}

const runePrompt = (game: Game): PickDecision => {
  const d = game.decision();
  expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "targon" } });
  return d as PickDecision;
};

const offered = (d: PickDecision): string[] => d.options.map((o) => o.card ?? o.key).toSorted();

describe("Targon's Peak — the delayed 'ready up to 2 runes' picks its runes at the END of the turn, not at the conquer", () => {
  // ── (a) nothing is chosen when the conquer effect is finalized ────────────────────────────────

  test("(a) the conquer trigger is P1's chain item and names NO rune: rule 355.5.b uses this very card — the readying is a delayed trigger's effect, so no choice is made while the conquer effect is finalized", async () => {
    const game = await atConquerTrigger();
    expect(game.zoneOf("grunt")).toBe("trash");
    expect(game.gameState.battlefields.targon).toMatchObject({ contested: false, controller: P1 });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "targon", controller: P1, triggered: true })]);
    expect(game.chain()[0]).not.toHaveProperty("targets");
    // The seat is holding ordinary chain priority — not a rune pick.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.runes({ ready: false }).toSorted()).toEqual(["r1", "r2"]);
  });

  test("(a) the trigger resolves into a player-scoped end-of-turn delayed ability (389 / 390.2) and STILL readies nothing — r1 and r2 are untouched and no rune Decision ever appeared", async () => {
    const game = await afterConquer();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.playerDelayedTriggers ?? []).toEqual([
      expect.objectContaining({ playerId: P1, sourceCardId: "targon", trigger: expect.objectContaining({ event: "end-of-turn" }) }),
    ]);
    expect(game.p1.runes({ ready: false }).toSorted()).toEqual(["r1", "r2"]);
    expect(game.p1.runes({ ready: true })).toEqual(["rReady"]);
  });

  // ── (b) the option set, read at the Ending Step ───────────────────────────────────────────────

  test("(b) the delayed trigger goes on the chain in the Ending Step (317.1.a) and its runes are chosen at ITS finalization (402.2 / 355.5): a FIN pick sourced from the Peak, max 2, declinable", async () => {
    const game = await atEndingStepPrompt();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "targon", controller: P1, triggered: true })]);
    const d = runePrompt(game);
    expect(d.timing).toBe("FIN");
    expect(d.max).toBe(2);
    expect(d.allowDecline).toBe(true); // rule 355.13 — zero picks is a legal finalization
  });

  test("(b) the option set is every friendly rune on the board AT THAT MOMENT: r3 — channelled by Retreat AFTER the conquer — is fully eligible, and so is the already-READY rune (the text says 'ready up to 2 runes', not 'exhausted runes')", async () => {
    const game = await atEndingStepPrompt();
    expect(game.p1.runes().toSorted()).toEqual(["r1", "r2", "r3", "rReady"]);
    expect(game.state("r3").isExhausted).toBe(true); // 430.2 — Retreat channels it exhausted
    expect(offered(runePrompt(game))).toEqual(["r1", "r2", "r3", "rReady"]);
  });

  // Expected (355.7 / 355.13): "ready up to 2 runes" carries no "friendly" qualifier — unlike Sona,
  // Harmonious, which says "up to 4 friendly runes" — so every rune on the board is an available target,
  // P2's included. Actual: the engine's target descriptor pins controller:"friendly" and offers only P1's.
  test.failing("BUG: 'ready up to 2 runes' has no friendly qualifier, so the ENEMY rune e1 must be in the option set too (355.7, 355.13); the engine filters the pick to friendly runes", async () => {
    const game = await atEndingStepPrompt();
    expect(offered(runePrompt(game))).toContain("e1");
  });

  test("(b) zero picks are legal (355.13): declining finalizes the delayed trigger with no targets and nothing readies — r1, r2 and r3 all stay exhausted", async () => {
    const game = await atEndingStepPrompt();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.runes({ ready: true })).toEqual(["rReady"]);
    expect(game.p1.runes({ ready: false }).toSorted()).toEqual(["r1", "r2", "r3"]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) the pair is locked at finalization ────────────────────────────────────────────────────

  test("(c) picking r3 + r2 LOCKS them onto the chain item (355.15) — the item now shows exactly those two targets and nothing has readied yet", async () => {
    const game = await atEndingStepPrompt();
    await game.p1.pick("r3", "r2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "targon", controller: P1, targets: ["r3", "r2"] })]);
    expect(game.p1.runes({ ready: true })).toEqual(["rReady"]);
  });

  test("(c) answering with Retreat while the finalized trigger waits channels r4 exhausted — r4 is not a chosen object and is neither substituted in nor added on: exactly r3 and r2 ready", async () => {
    const game = await atEndingStepPrompt();
    await game.p1.pick("r3", "r2");
    expect(game.p1.can("cast", "ret2")).toBe(true);
    await game.p1.cast("ret2", { targets: "spare2" });
    await game.settle();
    expect(game.zoneOf("spare2")).toBe("hand");
    expect(game.p1.runes().toSorted()).toEqual(["r1", "r2", "r3", "r4", "rReady"]);
    expect(game.p1.runes({ ready: true }).toSorted()).toEqual(["r2", "r3", "rReady"]);
    expect(game.state("r4").isExhausted).toBe(true); // channelled after the choices were locked
    expect(game.violations()).toEqual([]);
  });

  // ── (d) the losing timing must not occur ──────────────────────────────────────────────────────

  test("(d) NO side: the runes were NOT bound at the conquer — r1, which was there all along and would have been picked then, is still exhausted at the end of the turn, and r3, which did not exist at the conquer, is ready", async () => {
    const game = await atEndingStepPrompt();
    await game.p1.pick("r3", "r2");
    await game.p1.cast("ret2", { targets: "spare2" });
    await game.settle();
    expect(game.state("r1").isExhausted).toBe(true);
    expect(game.state("r3").isExhausted).toBe(false);
    expect(game.turnPlayer()).toBe(P2);
  });

  // ── Startipped Peak: a rune channelled by the hold trigger is in the same option set ───────────

  test("Startipped Peak: the rune its hold trigger channels EXHAUSTED in P1's Beginning Phase (430.2) is one of the runes the Peak's delayed trigger may ready that same turn", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("targon", { controller: P2, def: TARGONS_PEAK, inert: false })
      .battlefield("star", { controller: P1, def: STARTIPPED_PEAK, inert: false })
      .unit(P2, "targon", { might: 1, name: "Grunt" }, "grunt")
      .unit(P1, "star", { might: 2, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 3, name: "Hero" }, "hero")
      .card("holdRune", { def: FURY_RUNE, owner: P1, zone: "runeDeck" })
      .fillDecks({ main: 12, runes: 6 })
      .build();
    await game.p2.endTurn();
    expect(game.phase()).toBe("beginning");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "star" } });
    await game.p1.yes();
    await game.settle();
    expect(game.p1.runes({ ready: false })).toEqual(["holdRune"]);

    await game.p1.move("hero", "targon");
    await game.settle();
    expect(game.gameState.battlefields.targon?.controller).toBe(P1);
    expect(game.p1.runes({ ready: false })).toEqual(["holdRune"]); // still nothing readied by the conquer

    await game.p1.endTurn();
    const d = runePrompt(game);
    expect(offered(d)).toContain("holdRune");
    // The "up to 2" is asked as two declinable single-target slots: name the hold rune, then stop at one.
    await game.p1.pick("holdRune");
    await game.p1.decline();
    await game.settle();
    expect(game.state("holdRune").isExhausted).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
