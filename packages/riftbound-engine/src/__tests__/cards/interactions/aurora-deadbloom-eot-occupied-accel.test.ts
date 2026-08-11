/**
 * Interaction: Dazzling Aurora (ogn-160-298) · Body Gear · [9][body][body]
 *     "At the end of your turn, reveal cards from the top of your Main Deck until you reveal a unit
 *      and banish it. Play it, ignoring its cost, and recycle the rest."
 *   × Deadbloom Predator (ogn-161-298) · Body Unit · [8][body][body] · 8 Might
 *     "[Deflect] … You may play me to an occupied enemy battlefield."
 *   × Rek'Sai, Breacher (sfd-029-221) · Fury Champion Unit · [3] · 3 Might
 *     "[Accelerate] [Assault] Friendly units played from anywhere other than a player's hand have [Accelerate]."
 *
 * Q: Aurora's Ending-Phase trigger banishes Deadbloom Predator off the top of P1's deck and plays it while
 *    P1 also controls Rek'Sai, Breacher.
 *  (a) Does Deadbloom's own play-permission still work when the play happens from BANISHMENT rather than
 *      hand — is P2's occupied battlefield offered alongside P1's base / P1's own battlefields — and does a
 *      combat showdown really begin after the turn was already declared over?
 *  (b) Contrast: a vanilla 8-drop with no such text — which destinations are offered?
 *  (c) Is the Accelerate election offered on a play that ignores its cost, and what exactly is charged?
 *  (d) With an EMPTY pool but a ready rune and an untapped Seal of Strength, is the Accelerate variant listed?
 *  (e) Does the banished Predator get swept up by "recycle the rest"?
 *
 * A: (a) YES — "You may play me to an occupied enemy battlefield" is a self-describing passive about how the
 *        card may be played, so it is live in every zone the card can be played from, banishment included
 *        (366.1). Step 2 of Play enumerates P1's base, every battlefield P1 controls AND P2's occupied
 *        battlefield (355.2.a + 355.2.b). Choosing it: the Predator enters, P1 applies Contested (190.3.a) and
 *        is the Attacker (464.2.c.1); the combat is STAGED and begins only once the chain empties and the
 *        state is Neutral Open (323.13) — still inside P1's Ending Phase, i.e. still P1's turn.
 *    (b) NO — a vanilla unit gets only P1's base and battlefields P1 controls (355.2.a).
 *    (c) YES — Rek'Sai grants Accelerate because banishment is not a hand; it is an optional additional cost
 *        declared in step 2 (355.1.a, 356.2.b.1, 805.2). "Ignoring its cost" zeroes only the BASE 8+[body][body]
 *        (356.1.b.1); an additional cost added later still raises the total above zero (356.1.b.3), so the
 *        election charges exactly [1] + one [body] Power — Deadbloom has the Body domain, so the pip cannot be
 *        paid with another domain (805.1.a.1). Paid ⇒ the delayed replacement has it ENTER ready (805.6);
 *        declined ⇒ exhausted (143.4).
 *    (d) NO — DESIGN deviation (manual rune payment): the engine offers only what the CURRENT pool covers and
 *        never credits or auto-taps a ready rune or an uncracked Seal (vs 357.1.a / 429.3). P1 must tap the
 *        rune and crack Seal of Strength BEFORE the trigger resolves.
 *    (e) NO — the Predator changed zones (deck → banishment) before the play, so "the rest" is only the
 *        non-unit cards revealed above it; they go to the bottom of the Main Deck.
 *
 * Rules: 366.1, 355.1.a, 355.2.a, 355.2.b, 356.1.b.1, 356.1.b.3, 356.2.b.1, 357.1.a, 419.3.b, 429.3,
 *        805.1.a.1, 805.2, 805.6, 143.4, 190.3.a, 323.13, 464.2.c.1.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAZZLING_AURORA = "ogn-160-298";
const DEADBLOOM_PREDATOR = "ogn-161-298";
const REKSAI_BREACHER = "sfd-029-221";
const SEAL_OF_STRENGTH = "ogn-163-298";
const CLEAVE = "ogn-004-298"; // a non-unit on top: revealed, then recycled
const SKULKER = "ogn-175-298"; // the NEXT unit down — must never be revealed

/** A vanilla 8-drop: same cost/might as the Predator, none of its text. */
const BRUISER = { cardType: "unit", domain: "body", energyCost: 8, might: 8, name: "Bruiser" } as const;

/** The keys the pending destination `pick` offers. */
function destinationsOffered(game: Game): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
}

/**
 * P1's turn, about to end. P1: Dazzling Aurora + Rek'Sai, Breacher in base, a Sitter holding bf2;
 * deck top→: Cleave, <the unit under test>, Shipyard Skulker. P2 holds bf1 with a 3-Might Guard —
 * an OCCUPIED ENEMY battlefield.
 */
function board(
  top: string | typeof BRUISER,
  pool: { energy?: number; power?: Record<string, number> } = {},
  opts: { reksai?: boolean; seal?: boolean; rune?: boolean } = {},
) {
  let s = scenario()
    .resources(P1, { energy: pool.energy ?? 0, power: pool.power ?? {} })
    .gear(P1, DAZZLING_AURORA, "aurora")
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Sitter" }, "sitter")
    .deck(P1, [CLEAVE, top, SKULKER], ["cleave", "revealed", "later"]);
  if (opts.reksai !== false) {
    s = s.unit(P1, "base", REKSAI_BREACHER, "reksai");
  }
  if (opts.seal) {
    s = s.gear(P1, SEAL_OF_STRENGTH, "seal");
  }
  if (opts.rune) {
    s = s.rune(P1, "body", { alias: "bodyRune" });
  }
  return s;
}

/** End P1's turn, let Aurora's trigger resolve up to the revealed unit's destination prompt. */
async function auroraToDestination(game: Game): Promise<Decision | null> {
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.turnPlayer()).toBe(P1);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "aurora", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game.decision();
}

describe("(a) Deadbloom's play permission survives the zone change: Aurora plays it from BANISHMENT", () => {
  test("the destination menu offers P2's occupied bf1 alongside P1's base and P1's own bf2, while the Predator sits in banishment (366.1 / 355.2.a / 355.2.b)", async () => {
    const game = await board(DEADBLOOM_PREDATOR, { energy: 1, power: { body: 1 } }).build();
    const d = await auroraToDestination(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(destinationsOffered(game)).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    expect(game.zoneOf("revealed")).toBe("banishment"); // banished first, then played from there
  });

  test("choosing bf1: the Predator enters under P1, bf1 becomes Contested and P1 is the Attacker; the combat showdown begins only once the chain is EMPTY — still P1's Ending Phase (190.3.a / 464.2.c.1 / 323.13)", async () => {
    const game = await board(DEADBLOOM_PREDATOR).build();
    await auroraToDestination(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("revealed")).toBe("battlefield-bf1");
    expect(game.state("revealed")).toMatchObject({ combatRole: "attacker", controller: P1, might: 8 });
    expect(game.state("guard").combatRole).toBe("defender");
    expect(game.chain()).toEqual([]); // 323.13 — Neutral Open State before combat begins
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({
      attackingPlayer: P1,
      battlefieldId: "bf1",
      focusPlayer: P1,
      isCombatShowdown: true,
    });
    expect(game.phase()).toBe("ending");
    expect(game.turnPlayer()).toBe(P1); // the turn was declared over, the combat still happens inside it
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  });

  test("fought out: the 8-Might Predator kills the 3-Might Guard and conquers bf1 (+1 point) before the turn passes to P2", async () => {
    const game = await board(DEADBLOOM_PREDATOR).build();
    await auroraToDestination(game);
    await game.p1.pick("battlefield-bf1");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.violations()).toEqual([]);
  });
});

describe("(b) contrast — a vanilla 8-drop gets only the DEFAULT locations (355.2.a)", () => {
  test("base and P1's own bf2 are offered; P2's occupied bf1 is absent and naming it is refused with the state untouched", async () => {
    const game = await board(BRUISER, { energy: 1, power: { body: 1 } }).build();
    await auroraToDestination(game);
    expect(destinationsOffered(game)).toEqual(["base", "battlefield-bf2"]);
    const r = await game.p1.try((p) => p.pick("battlefield-bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("revealed")).toBe("banishment"); // nothing moved
    expect(game.gameState.battlefields.bf1?.contested).toBeFalsy();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // the same prompt is still open
    await game.p1.pick("base");
    // Rek'Sai's grant is not Deadbloom-specific — this Body 8-drop is offered the same [1][body] election.
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("revealed")).toBe("base");
    expect(game.state("revealed").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});

describe("(c) Rek'Sai's granted Accelerate on a cost-ignoring play (355.1.a / 356.1.b.1 / 356.1.b.3 / 805)", () => {
  test("the election IS offered (banishment is not a hand) and charges exactly [1] + one [body] — the printed 8+[body][body] is never paid — and the Predator ENTERS ready (805.2 / 805.6)", async () => {
    const game = await board(DEADBLOOM_PREDATOR, { energy: 1, power: { body: 1 } }).build();
    await auroraToDestination(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } }); // base cost zeroed by 356.1.b.1
    await game.p1.pick("battlefield-bf1");
    const d = game.decision();
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    expect(d?.prompt ?? "").toMatch(/\[1\]\[body\]/);
    await game.p1.yes();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } }); // exactly [1][body], nothing else
    expect(game.state("revealed")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
  });

  test("declining it: the Predator still enters for free but EXHAUSTED (143.4) and the pool is untouched", async () => {
    const game = await board(DEADBLOOM_PREDATOR, { energy: 1, power: { body: 1 } }).build();
    await auroraToDestination(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    expect(game.state("revealed")).toMatchObject({ isExhausted: true, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
  });

  test("a WRONG-domain pip cannot pay it: with [3] and three [fury] the Body Predator gets no payable election and enters exhausted, fury untouched (805.1.a.1)", async () => {
    const game = await board(DEADBLOOM_PREDATOR, { energy: 3, power: { fury: 3 } }).build();
    await auroraToDestination(game);
    await game.p1.pick("battlefield-bf1");
    // No affordable Accelerate offer: the next decision is the showdown itself.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("revealed").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 3 } });
  });

  test("control: with NO Rek'Sai on the board the play from banishment offers no Accelerate at all", async () => {
    const game = await board(DEADBLOOM_PREDATOR, { energy: 1, power: { body: 1 } }, { reksai: false }).build();
    await auroraToDestination(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("revealed").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
  });
});

describe("(d) an EMPTY pool lists no Accelerate variant even with a ready rune and an uncracked Seal of Strength", () => {
  // DESIGN: manual rune payment (DESIGN.md §Paying costs — a deliberate deviation from 357.1.a / 429.3): the
  // engine offers only the elections the CURRENT pool covers and never credits or auto-exhausts a ready rune or
  // an uncracked Seal of Strength during Pay Costs. Under the Core Rules P1 could Add [1][body] inside that step;
  // here they must tap and crack first, before the trigger resolves.
  test("at 0/0 the free, exhausted-entry variant is the only one: no Accelerate prompt is raised, the rune stays ready and the Seal untapped", async () => {
    const game = await board(DEADBLOOM_PREDATOR, {}, { rune: true, seal: true }).build();
    await auroraToDestination(game);
    await game.p1.pick("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
    expect(game.state("revealed").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true })).toEqual(["bodyRune"]);
    expect(game.state("seal").isExhausted).toBe(false);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test("tapping the rune and cracking the Seal BEFORE the trigger resolves (the chain priority window) does buy the election: [1][body] is spent and the Predator enters ready", async () => {
    const game = await board(DEADBLOOM_PREDATOR, {}, { rune: true, seal: true }).build();
    await game.p1.endTurn();
    // Both [Add] sources are live while Aurora's trigger sits on the chain.
    expect(game.p1.can("exhaustRune", "bodyRune")).toBe(true);
    expect(game.p1.can("activateAbility", "seal")).toBe(true);
    await game.p1.tapRune("bodyRune");
    await game.p1.activate("seal");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 1 } });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("battlefield-bf1");
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.state("revealed")).toMatchObject({ isReady: true, zone: "battlefield-bf1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });
});

describe("(e) 'recycle the rest' never touches the banished Predator", () => {
  test("only Cleave (revealed above it) goes to the bottom of the Main Deck; the Predator is on the board, banishment is empty, and Skulker was never revealed", async () => {
    const game = await board(DEADBLOOM_PREDATOR, { energy: 1, power: { body: 1 } }).build();
    await auroraToDestination(game);
    await game.p1.pick("battlefield-bf1");
    await game.p1.yes();
    expect(game.zoneOf("revealed")).toBe("battlefield-bf1");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.zoneOf("cleave")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("cleave"); // recycled to the bottom
    expect(game.p1.deck()).not.toContain("revealed");
    expect(game.zoneOf("later")).toBe("mainDeck"); // Aurora stopped at the first unit
    await game.settle();
    expect(game.violations()).toEqual([]);
  });
});
