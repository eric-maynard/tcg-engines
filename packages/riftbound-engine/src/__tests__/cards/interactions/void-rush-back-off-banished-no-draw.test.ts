/**
 * Interaction: Void Rush (sfd-188-221) · Action spell · Fury/Order · 2+[rainbow]
 *     "Reveal the top 2 cards of your Main Deck. You may banish one, then play it, reducing its cost by [2]. Draw any
 *      you didn't banish."
 *   × Back Off (unl-042-219) · Action spell · Calm · 3 · [Hidden]
 *     "[Stun] a unit. If you played this from your hand, draw 1."
 *   × Defy (ogn-045-298) · Reaction · 1+[calm] — "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Trifarian Gloryseeker (ogn-217-298) · 2 · "[Legion] — When you play me, buff me." (later-Legion witness)
 *   revealed pair: Back Off on top of "V" (inline vanilla unit, 2 energy / 2 Might), then "Third".
 *
 * Rules: 419.3 / 419.3.a / 419.3.b (an effect-instructed play is a Limited Action that runs the normal Play steps — the
 * card's own [Action] tag is irrelevant), 419.3.c + 355.16 / 357.3 spirit ("banish one, then play it" commits to a play
 * that must be legal: no legal target ⇒ not an eligible pick), 354.3 (the played card becomes a Pending item; Void Rush
 * finishes — "Draw any you didn't banish", → trash — before Back Off's steps 2–5), 355.5 (target chosen at play), 356.4
 * (−[2] energy discount ⇒ 3−2 = [1]), 357.1.a (Reaction [Add] while paying), 811.1.b / 811.1.c.1 (Hide is a distinct
 * discretionary action from HAND / Champion Zone only — not a subset of Play), 811.1.d (the "here" lock rides only on
 * plays FROM facedown), 359.3.d / 157 (a resolved spell → owner's trash; Void Rush has no "then banish it" rider, so
 * the banish was transit only), 425.1.a.1 (countered → trash), 206 (Defy reads printed cost 3 / no power), 419.4.b
 * (Legion keys off Finalization — Void Rush AND Back Off count even if Back Off is countered).
 *
 * Question: P1's turn, Open state, first card of the turn. Void Rush reveals [Back Off, V]. P2's unit E sits at bf2; P1
 * holds bf1 (Holder there, empty facedown slot).
 *  (a) May P1 banish Back Off and HIDE it at bf1 instead of playing it? — No: it must be played.
 *  (b) Origin = banishment; cost [1]; any unit is a legal target (no facedown "here" lock) — E at bf2 is fine.
 *  (c) V is drawn and Void Rush trashed BEFORE Back Off's target/pay; [Add] is usable while paying.
 *  (d) E stunned; NOT played from hand ⇒ no draw; Back Off → P1's TRASH (not banishment). Defied ⇒ trash too; Legion on.
 *  (e) No unit anywhere ⇒ Back Off is not an eligible pick; P1 ends up drawing both.
 *  (f) Contrast: hard-cast from hand — [3], any unit, stuns E, draws 1, → trash (and from hand it COULD be hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_RUSH = "sfd-188-221";
const BACK_OFF = "unl-042-219";
const DEFY = "ogn-045-298";
const GLORYSEEKER = "ogn-217-298";
const V = { cardType: "unit", energyCost: 2, might: 2, name: "Vanilla V" } as const;
const THIRD = { cardType: "unit", energyCost: 3, might: 1, name: "Third Card" } as const;

const cardsOf = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);
const actionKeys = (d: Decision | null) =>
  d?.kind === "action" ? d.options.map((o) => o.moveId) : d && "actions" in d ? (d.actions ?? []).map((o) => o.moveId) : [];

/** Flatten the `targets` field of a seat's cast option into the set of card ids offered. */
function targetsOffered(game: Game, seat: "p1" | "p2", alias: string): string[] {
  const opt = game[seat].option("cast", alias);
  const field = opt?.fields.find((f) => f.name === "targets");
  return [...new Set((field?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

/**
 * P1's turn, nothing played yet. P1: `energy` + 2 rainbow (one pays Void Rush's pip; the spare one would pay a Hide if
 * Hide were ever legal), Void Rush + a Gloryseeker in hand, deck top→: Back Off, V, Third. P1 holds bf1 with Holder
 * (durable control, empty facedown slot). P2 holds bf2 with E (3 Might) and has Defy + 1+[calm].
 */
function board(energy: number, opts: { units?: boolean } = {}) {
  let s = scenario()
    .resources(P1, { energy, power: { rainbow: 2 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .hand(P1, VOID_RUSH, "vr")
    .hand(P1, GLORYSEEKER, "glory")
    .hand(P2, DEFY, "defy")
    .deck(P1, [BACK_OFF, V, THIRD], ["bo", "v", "third"]);
  if (opts.units !== false) {
    s = s.unit(P1, "bf1", { might: 1, name: "Holder" }, "holder").unit(P2, "bf2", { might: 3, name: "Unit E" }, "e");
  }
  return s;
}

/** Cast Void Rush as P1's first card, both pass → the reveal-and-pick prompt. */
async function rushToReveal(game: Game): Promise<PickDecision> {
  expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  await game.p1.cast("vr");
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "vr" } });
  return d as PickDecision;
}

/** Void Rush → banish Back Off → choose E. Leaves Back Off finalized on the chain with P1 holding priority. */
async function rushIntoBackOffOnE(game: Game): Promise<void> {
  await rushToReveal(game);
  await game.p1.pick("bo");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, semantics: "target", source: { cardId: "bo" } });
  await game.p1.pick("e");
}

describe("Void Rush banishes-and-plays Back Off — must be played (not hidden), [1], any unit, no 'from hand' draw, → trash", () => {
  // ── setup ───────────────────────────────────────────────────────────────────────────────

  test("setup: Void Rush costs 2 + [rainbow]; with 3 energy it reveals [Back Off, V] and BOTH are eligible picks (Back Off 3−2 = 1 ≤ 1 left)", async () => {
    const game = await board(3).build();
    const d = await rushToReveal(game);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { rainbow: 1 } });
    expect(cardsOf(d)).toEqual(["bo", "v"]);
    expect(game.zoneOf("bo")).toBe("mainDeck"); // revealed, not yet moved
    expect(game.zoneOf("vr")).toBe("chain"); // still resolving
    expect(game.p1.hand()).toEqual(["glory"]);
  });

  // ── (a) must be PLAYED — Hide is never on offer ─────────────────────────────────────────

  test("(a) Hide is a hand/Champion-Zone action (811.1.b/c.1): at the reveal prompt no hideCard action is offered even though P1 holds bf1 and has a spare [rainbow]; picking Back Off PLAYS it (it lands on the chain, never facedown)", async () => {
    const game = await board(3).build();
    const d = await rushToReveal(game);
    expect(actionKeys(d)).not.toContain("hideCard");
    expect(game.p1.can("hide", "bo")).toBe(false);
    expect((await game.p1.try((p) => p.hide("bo", "bf1"))).ok).toBe(false);
    await game.p1.pick("bo");
    expect(game.zoneOf("bo")).toBe("chain");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.p1.can("hide", "bo")).toBe(false); // nor now that it is a chain item
    expect(actionKeys(game.decision())).not.toContain("hideCard");
    expect(game.p1.power("rainbow")).toBe(1); // the spare pip was never spent on a Hide
  });

  // ── (b) origin, cost, targets ───────────────────────────────────────────────────────────

  test("(b) target prompt (FIN) offers ANY unit — Holder at bf1 AND E at bf2 (no facedown 'here' lock, 811.1.d is for plays from facedown only); E is a legal pick", async () => {
    const game = await board(3).build();
    await rushToReveal(game);
    await game.p1.pick("bo");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", seat: P1, semantics: "target", source: { cardId: "bo" }, timing: "FIN" });
    expect(cardsOf(d).sort()).toEqual(["e", "holder"]);
    await game.p1.pick("e");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bo", controller: P1, targets: ["e"], triggered: false, type: "spell" })]);
  });

  test("(b) exact cost: Back Off off Void Rush costs 3−2 = [1] and no power — pool 3 → 1 (Void Rush) → 0; the second rainbow is untouched; both cards count as played", async () => {
    const game = await board(3).build();
    await rushIntoBackOffOnE(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2);
  });

  test("(b) the [Action] tag is irrelevant for an effect-instructed play (419.3.a/b): Back Off is played mid-resolution on P1's own chain-less turn and P1 (controller) then holds priority first, then P2 (Reaction window)", async () => {
    const game = await board(3).build();
    await rushIntoBackOffOnE(game);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "defy")).toBe(true);
  });

  // ── (c) ordering + [Add] ────────────────────────────────────────────────────────────────

  test("(c) 354.3 ordering: at Back Off's target prompt V is ALREADY in P1's hand, Third is the deck top, Void Rush is in the trash, banishment is empty (transit only) and Back Off is the only chain item — no priority window in between", async () => {
    const game = await board(3).build();
    await rushToReveal(game);
    await game.p1.pick("bo");
    expect(game.decision()).toMatchObject({ kind: "pick", semantics: "target", source: { cardId: "bo" }, timing: "FIN" });
    expect(game.p1.hand().sort()).toEqual(["glory", "v"]);
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.zoneOf("vr")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bo"]);
  });

  // DESIGN: the engine treats the banish-and-play pick prompt as the Pay step of the mandatory play (357.1.a / 419.2.a —
  // same convention as the Void Rush × Guillotine interaction test): a Reaction [Add] is legal while it is open and
  // eligibility is re-evaluated against the grown pool.
  test("(c) [Add] while paying (357.1.a): with 2 energy Back Off (needs [1] after Void Rush) is not offered; exhausting a ready rune at the prompt makes it eligible and it is then played for exactly that energy", async () => {
    const game = await board(2).rune(P1, "calm", { alias: "calmRune" }).build();
    const d = await rushToReveal(game);
    expect(game.p1.energy()).toBe(0);
    expect(cardsOf(d)).toEqual(["v"]); // V costs 2−2 = 0
    expect(actionKeys(d)).toContain("exhaustRune");
    expect((await game.p1.try((p) => p.tapRune("calmRune"))).ok).toBe(true);
    expect(game.p1.energy()).toBe(1);
    expect(cardsOf(game.decision())).toEqual(["bo", "v"]);
    await game.p1.pick("bo");
    await game.p1.pick("e");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bo"]);
  });

  // ── (d) resolution: stun, NO draw, → trash; Defy; Legion ────────────────────────────────

  test("(d) nobody responds: E is stunned, Back Off goes to P1's TRASH (359.3.d — not back to banishment), chain empty, back to P1's main phase", async () => {
    const game = await board(3).build();
    await rushIntoBackOffOnE(game);
    await game.settle();
    expect(game.state("e").isStunned).toBe(true);
    expect(game.state("holder").isStunned).toBe(false);
    expect(game.zoneOf("bo")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["bo", "vr"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  // Expected: "If you played this from your hand" is FALSE — Back Off was played from banishment by Void Rush — so P1
  // draws nothing: hand stays {glory, V} and Third stays on top of the deck. Actual: the engine only folds the gate for
  // plays from facedown (chain/resolve.ts resolvePlayedFromHandGates); an effect play from banishment still draws 1.
  test("(d) played from BANISHMENT, not from hand ⇒ NO 'draw 1' — P1's hand stays {glory, V} and Third is still the deck top (811.1 / Back Off's own condition)", async () => {
    const game = await board(3).build();
    await rushIntoBackOffOnE(game);
    expect(game.p1.hand().sort()).toEqual(["glory", "v"]);
    await game.settle();
    expect(game.state("e").isStunned).toBe(true); // the stun is unconditional
    expect(game.p1.hand().sort()).toEqual(["glory", "v"]);
    expect(game.p1.deck()[0]).toBe("third");
  });

  test("(d) Defy checks PRINTED cost (206): the discounted Back Off (printed 3, no power) is Defy's offered target; countered → P1's TRASH (425.1.a.1), E NOT stunned, nothing drawn, no refund", async () => {
    const game = await board(3).build();
    await rushIntoBackOffOnE(game);
    await game.p1.passPriority();
    expect(targetsOffered(game, "p2", "defy")).toEqual(["bo"]);
    await game.p2.cast("defy", { targets: "bo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bo", "defy"]);
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("bo")).toBe("trash");
    expect(game.p1.trash().sort()).toEqual(["bo", "vr"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.state("e").isStunned).toBe(false);
    expect(game.p1.hand().sort()).toEqual(["glory", "v"]); // countered: certainly no draw
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } }); // 425.1.c
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) Legion is on either way (419.4.b): after Defy counters Back Off, P1's play count is still 2 and a Gloryseeker played next gets its Legion buff (3 Might, buffed)", async () => {
    const game = await board(5).build(); // 5 − 2 (VR) − 1 (BO) = 2 left for the Gloryseeker
    await rushIntoBackOffOnE(game);
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "bo" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(2);
    expect(game.p1.energy()).toBe(2);
    await game.p1.play("glory");
    await game.settle();
    expect(game.zoneOf("glory")).toBe("base");
    expect(game.state("glory")).toMatchObject({ isBuffed: true, might: 3 });
  });

  // ── (e) NO side: no unit anywhere ───────────────────────────────────────────────────────

  test("(e) with NO unit on the board Back Off has no legal target ⇒ it is NOT an eligible 'banish one, then play it' pick (419.3.c / 355.16): offered = {V} + decline; naming Back Off is rejected and nothing is banished", async () => {
    const game = await board(3, { units: false }).build();
    const d = await rushToReveal(game);
    expect(cardsOf(d)).toEqual(["v"]);
    expect(d.allowDecline).toBe(true);
    expect((await game.p1.try((p) => p.pick("bo"))).ok).toBe(false);
    expect(game.zoneOf("bo")).toBe("mainDeck");
    expect(game.p1.banishment()).toEqual([]);
  });

  test("(e) … declining then draws BOTH revealed cards — Back Off never rots in banishment; energy left at 1", async () => {
    const game = await board(3, { units: false }).build();
    await rushToReveal(game);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["bo", "glory", "v"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.trash()).toEqual(["vr"]);
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.violations()).toEqual([]);
  });

  // ── (f) contrast: hard-cast from hand ───────────────────────────────────────────────────

  function handBoard(energy = 3) {
    return scenario()
      .resources(P1, { energy, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "bf2", { might: 3, name: "Unit E" }, "e")
      .hand(P1, BACK_OFF, "bo")
      .deck(P1, [V, THIRD], ["v", "third"]);
  }

  test("(f) contrast — from HAND: costs the full [3], any unit is offered (Holder, E), stuns E and P1 DRAWS 1 (V); Back Off → trash", async () => {
    const game = await handBoard(3).build();
    expect(targetsOffered(game, "p1", "bo").sort()).toEqual(["e", "holder"]);
    await game.p1.cast("bo", { targets: "e" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 1 } });
    expect(game.p1.hand()).toEqual([]);
    await game.settle();
    expect(game.state("e").isStunned).toBe(true);
    expect(game.p1.hand()).toEqual(["v"]); // "if you played this from your hand, draw 1"
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.zoneOf("bo")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(f) … from hand with only 2 energy the cast is illegal (no Void Rush discount) — but from HAND the [Hidden] card CAN instead be hidden at bf1 for the [rainbow] (811.1.b), which is exactly what the banished copy could not do", async () => {
    const game = await handBoard(2).build();
    expect(game.p1.can("cast", "bo")).toBe(false);
    expect(game.p1.can("hide", "bo")).toBe(true);
    expect(game.p1.option("hide", "bo")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
    await game.p1.hide("bo", "bf1");
    expect(game.zoneOf("bo")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
  });
});
