/**
 * Interaction: Void Rush (sfd-188-221) · Action spell · Fury/Order · 2 + [rainbow]
 *     "Reveal the top 2 cards of your Main Deck. You may banish one, then play it, reducing its cost by [2]. Draw any
 *      you didn't banish."
 *   × Cruel Patron (ogn-208-298) · Unit · Order · 4 · 6 Might — "As an additional cost to play me, kill a friendly unit."
 *   revealed pair: Cruel Patron on top of X (inline vanilla unit, 3 energy / 2 Might), then "Third".
 *   (+ Recruit token ogn-272-298 as the lone friendly unit at bf1 in line (b).)
 *
 * Rules: 424.1 / 424.1.a.3 (the reveal is public and lasts until Void Rush finishes resolving), 419.3 / 419.3.b (an
 * effect-instructed play runs the normal Play steps), 356.2.a.1 + 357 + 358.2 / 358.5 (a MANDATORY additional cost must
 * be paid; a play whose costs cannot be paid is undone), 356.4 (−[2] energy), 354.3 (the played card pends; Void Rush
 * finishes — draw the rest, → trash — before Patron's steps 2–5), 337.2 (a unit resolves immediately once finalized —
 * no Reaction window), 355.2.a + 190.4 / 323.6 + official clarification 9a32c2cc829f221a (control of bf1 is not lost
 * mid-play, so bf1 stays a legal destination even though paying the cost empties it), 143.4 (enters exhausted), 186.1
 * (a killed token ceases to exist).
 * Ruling: riftjudge 1bf52a7cfc76b405 (Baited Hook × Cruel Patron): "You can still choose to banish Cruel Patron even
 * if you cannot afford to play it … it remains banished."
 *
 * Question / expected:
 *  (a) P1 controls NO units. Both cards are revealed publicly. Per the ruling the banish is a real, separate choice:
 *      Patron IS a legal "banish one" pick; the ensuing play fails at costs (no friendly unit to kill) and is undone,
 *      which for a card banished first means it STAYS in banishment face up; no location prompt, no chain item, no
 *      error; "Draw any you didn't banish" → P1 draws X only; Void Rush → trash.
 *  (b) P1's only unit is a Recruit token alone at bf1 (P1 controls bf1). Banish Patron, play it: destination = base or
 *      bf1 (still controlled mid-play); cost = 4 − 2 = [2] + kill the Recruit (the only candidate); Patron enters bf1
 *      exhausted and P1 keeps bf1. Ordering: X is drawn and Void Rush trashed BEFORE Patron's destination/pay steps;
 *      Patron then resolves immediately with no window for P2. The Recruit dies as a cost and ceases to exist.
 *  (c) Decline → P1 draws both Patron and X.
 *  (d) P2 sees both revealed identities during resolution, Patron publicly wherever it lands (banishment / bf1), and
 *      only P1's hand COUNT afterwards.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Game, PickDecision } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const VOID_RUSH = "sfd-188-221";
const CRUEL_PATRON = "ogn-208-298";
const RECRUIT = "ogn-272-298";
const X = { cardType: "unit", energyCost: 3, might: 2, name: "Vanilla X" } as const;
const THIRD = { cardType: "unit", energyCost: 3, might: 1, name: "Third Card" } as const;

/**
 * P1's turn, Open state. P1: exactly 4 energy + 1 rainbow (2+[rainbow] for Void Rush, [2] left for the discounted
 * Patron), Void Rush in hand, deck top→: Cruel Patron, X, Third. P1 "controls" bf1 (durably only when the Recruit
 * stands there); P2 holds bf2 with a bystander E.
 */
function board(opts: { recruit?: boolean } = {}) {
  const b = scenario()
    .resources(P1, { energy: 4, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf2", { might: 3, name: "Unit E" }, "e")
    .hand(P1, VOID_RUSH, "vr")
    .deck(P1, [CRUEL_PATRON, X, THIRD], ["patron", "x", "third"]);
  if (opts.recruit) {
    b.unit(P1, "bf1", RECRUIT, "recruit");
  }
  return b;
}

/** Cast Void Rush, both pass → the reveal-and-pick prompt. */
async function rushToReveal(game: Game): Promise<PickDecision> {
  await game.p1.cast("vr");
  expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "vr" } });
  return d as PickDecision;
}

const cardsOf = (d: ReturnType<Game["decision"]>) => (d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []);

/** What P2 sees of P1's cards in `zone`: ids for visible cards, "?" for redacted ones. */
function p2Sees(game: Game, zone: string): string[] {
  const cards = (game.p2.view().zones[zone] ?? []) as readonly CardView[];
  return cards.filter((c) => c.owner === P1).map((c) => (isHiddenView(c) ? "?" : c.id));
}

describe("Void Rush reveals Cruel Patron — banish-then-play with an unpayable / payable mandatory kill cost", () => {
  // ── shared: the reveal ──────────────────────────────────────────────────────────────────────

  test("(d) the reveal is public (424.1): at the pick prompt P2 sees the identities of P1's top two deck cards — Patron and X — but not the third; both are still IN the deck (424.1.a.2)", async () => {
    const game = await board({ recruit: true }).build();
    expect(p2Sees(game, "mainDeck").slice(0, 3)).toEqual(["?", "?", "?"]);
    await rushToReveal(game);
    expect(p2Sees(game, "mainDeck").slice(0, 3)).toEqual(["patron", "x", "?"]);
    expect(game.zoneOf("patron")).toBe("mainDeck");
    expect(game.zoneOf("x")).toBe("mainDeck");
    expect(game.p2.view().decision).toMatchObject({ kind: "pick", seat: P1 }); // P2 sees only that P1 is choosing
  });

  // ── (a) no friendly unit: the stranded-in-banish line ───────────────────────────────────────

  // Expected (riftjudge 1bf52a7cfc76b405; banish-before-play errata): the banish is its own choice, so Cruel Patron is a
  // legal "banish one" pick even though its mandatory kill cost cannot be paid. Actual: the engine filters the
  // reveal-and-pick options by playability (419.2.a-style `isAffordablePlayPick`) and offers only X.
  // NOTE (w4·7): the card-level `banishBeforePlay` flag is too blunt a fix — `playBanishFirst` short-circuits the WHOLE
  // affordability/legality gate in the coordinator-embargoed `pending-choice.ts isAffordablePlayPick`, which also makes
  // resource-unaffordable picks and a targetless spell pick legal (419.3.c / 355.16 — see the Back Off and Noxus
  // Hopeful Void Rush tests). The gate must be narrowed to the mandatory-additional-cost half only.
  test("(a) with NO friendly unit Cruel Patron is still offered as the 'banish one' pick alongside X (riftjudge 1bf52a7cfc76b405)", async () => {
    const game = await board().build();
    const d = await rushToReveal(game);
    expect(cardsOf(d)).toContain("x");
    expect(cardsOf(d)).toContain("patron");
  });

  // Banishing Patron commits nothing else — the play fails at Pay Costs (356.2.a.1 / 358.2) and is undone
  // (358.5), leaving Patron face up in BANISHMENT (public to P2); no destination prompt, no chain item, no violation;
  // Void Rush continues: P1 draws X only, Void Rush → trash, 2 energy untouched.
  test("(a) banishing the unplayable Patron strands it in banishment: no prompt dangles, X alone is drawn, Void Rush → trash, pool untouched (358.5, 424.1, riftjudge 1bf52a7cfc76b405)", async () => {
    const game = await board().build();
    await rushToReveal(game);
    await game.p1.pick("patron");
    if (game.decision()?.kind !== "action") {
      await game.settle();
    }
    expect(game.zoneOf("patron")).toBe("banishment");
    expect(p2Sees(game, "banishment")).toEqual(["patron"]);
    expect(game.p1.hand()).toEqual(["x"]);
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.zoneOf("vr")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(a) the offer with no friendly unit: X (3 − 2 = [1] ≤ 2 energy), Patron, and decline — reading the prompt moves and spends nothing", async () => {
    const game = await board().build();
    const d = await rushToReveal(game);
    expect(cardsOf(d).toSorted()).toEqual(["patron", "x"]);
    expect(d.allowDecline).toBe(true);
    expect(game.zoneOf("patron")).toBe("mainDeck");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) Recruit alone at bf1: banish, then play killing the Recruit ─────────────────────────

  test("(b) with the Recruit at bf1 BOTH revealed cards are eligible picks; picking Patron BANISHES it first and makes it a pending chain item (banish is transit, not the destination)", async () => {
    const game = await board({ recruit: true }).build();
    const d = await rushToReveal(game);
    expect(cardsOf(d).sort()).toEqual(["patron", "x"]);
    await game.p1.pick("patron");
    expect(game.zoneOf("patron")).toBe("banishment");
    expect(p2Sees(game, "banishment")).toEqual(["patron"]); // public while it sits there
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "patron", controller: P1, pending: true })]);
  });

  test("(b) 354.3 ordering: at Patron's destination prompt (FIN) X is ALREADY in P1's hand, Third is the deck top and Void Rush is in the trash — Void Rush finished before Patron's steps 2–5", async () => {
    const game = await board({ recruit: true }).build();
    await rushToReveal(game);
    await game.p1.pick("patron");
    expect(game.decision()).toMatchObject({ allowDecline: false, kind: "pick", seat: P1, semantics: "destination", timing: "FIN" });
    expect(game.p1.hand()).toEqual(["x"]);
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.zoneOf("vr")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("battlefield-bf1"); // the cost is not paid yet
  });

  // RULING-CONFLICT: pre-Unleashed riftjudge Cruel Patron rulings (7e1f5339aa98e7ce / 81bdefc55681da4a) called a
  // destination emptied by the cost illegal; CR 190.4 / 323.6 + official 9a32c2cc829f221a (Cruel Patron is its own first
  // example) say control cannot be lost mid-play — engine follows the CR: bf1 is offered.
  test("(b) destinations offered = base AND bf1 — bf1 stays 'a battlefield you control' although the only unit there is the one the cost will kill (355.2.a, 190.4/323.6, official 9a32c2cc829f221a)", async () => {
    const game = await board({ recruit: true }).build();
    await rushToReveal(game);
    await game.p1.pick("patron");
    expect(cardsOf(game.decision()).sort()).toEqual(["base", "battlefield-bf1"]);
    expect(cardsOf(game.decision())).not.toContain("battlefield-bf2");
  });

  test("(b) → bf1: the Recruit (sole candidate, auto-bound — no extra prompt) is killed as the cost and CEASES TO EXIST, exactly [2] more energy is paid (4 → 2 → 0), Patron enters bf1 EXHAUSTED and P1 keeps bf1 (357, 356.4, 143.4, 186.1)", async () => {
    const game = await board({ recruit: true }).build();
    await rushToReveal(game);
    await game.p1.pick("patron");
    await game.p1.pick("battlefield-bf1");
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.p1.trash()).toEqual(["vr"]); // the token is not in the trash
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.zoneOf("patron")).toBe("battlefield-bf1");
    expect(game.state("patron")).toMatchObject({ controller: P1, isExhausted: true, might: 6 });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.banishment()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(b) 337.2 — Patron resolves IMMEDIATELY once finalized: from P1's destination pick the game goes straight to P1's open main phase — empty chain, P2 never held priority in between", async () => {
    const game = await board({ recruit: true }).build();
    await rushToReveal(game);
    await game.p1.pick("patron");
    expect(game.actingSeat()).toBe(P1);
    await game.p1.pick("battlefield-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(2); // Void Rush + Patron both count as played
  });

  test("(b) → base instead: same [2] + Recruit; Patron in base exhausted; bf1 — now empty of P1 units — lapses to Uncontrolled at the Open cleanup that follows (323.6)", async () => {
    const game = await board({ recruit: true }).build();
    await rushToReveal(game);
    await game.p1.pick("patron");
    await game.p1.pick("base");
    expect(game.zoneOf("recruit")).toBe("gone");
    expect(game.state("patron")).toMatchObject({ isExhausted: true, zone: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
  });

  test("(d) after line (b): P2 sees Patron publicly on bf1, the Recruit gone, P1's banishment empty and exactly ONE redacted card in P1's hand (X's identity is private again)", async () => {
    const game = await board({ recruit: true }).build();
    await rushToReveal(game);
    await game.p1.pick("patron");
    await game.p1.pick("battlefield-bf1");
    expect(p2Sees(game, "battlefield-bf1")).toEqual(["patron"]);
    expect(p2Sees(game, "banishment")).toEqual([]);
    expect(p2Sees(game, "hand")).toEqual(["?"]);
    expect(p2Sees(game, "mainDeck")[0]).toBe("?"); // Third was never revealed
  });

  // ── (c) decline ─────────────────────────────────────────────────────────────────────────────

  test("(c) declining to banish: P1 draws BOTH Patron and X, nothing is banished, Void Rush → trash, the spare 2 energy is untouched; P2 sees two redacted hand cards", async () => {
    const game = await board({ recruit: true }).build();
    await rushToReveal(game);
    await game.p1.decline();
    await game.settle();
    expect(game.p1.hand().sort()).toEqual(["patron", "x"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.trash()).toEqual(["vr"]);
    expect(game.p1.deck()[0]).toBe("third");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { rainbow: 0 } });
    expect(game.zoneOf("recruit")).toBe("battlefield-bf1"); // nothing was paid
    expect(p2Sees(game, "hand")).toEqual(["?", "?"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
