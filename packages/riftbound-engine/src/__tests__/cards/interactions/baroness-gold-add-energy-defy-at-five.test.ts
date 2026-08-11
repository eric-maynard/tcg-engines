/**
 * Interaction: Chem-Baroness (sfd-201-221) · Legend · Mind/Order
 *     "When you or an ally hold, you may exhaust me to play a Gold gear token exhausted.
 *      While your score is within 3 points of the Victory Score, your Gold [ADD] an additional [1]."
 *   × Gold (sfd-t03) · Gear token · "Kill this, [Exhaust]: [Reaction] — [Add] [A]."
 *   × Defy (ogn-045-298) · Spell · Calm · 1+[calm] · "[Reaction] Counter a spell that costs no more than [4] and no
 *     more than [rainbow]."
 *
 * Position: Victory Score 8. It is P2's turn; P1 (Chem-Baroness, legend EXHAUSTED, empty pool, no ready runes) controls
 * ready Gold token(s) and holds Defy. P2 casts a 3-cost spell ("Bolt", inline: draw 2).
 *
 * Question:
 *  (a) P1 at 5 points: can ONE Gold fund Defy — does it add [1]+[A], does the added [A] pay the [calm] pip, does the
 *      legend being exhausted matter?
 *  (b) P1 at 4 points: what does the Gold add; is Defy castable?
 *  (c) P1 at 4 cracks Gold #1, later this turn reaches 5 (a conquer point), then cracks Gold #2: what does #2 add — is
 *      the bonus evaluated when the ability resolves? Is #1 topped up retroactively?
 *  (d) Threshold: in an 8-point game is "within 3" satisfied at exactly 5? at 4?
 *  (e) Parity (engine pays manually): before cracking, is Defy listed? After cracking at 5 → pool {1, A:1}: Defy offered,
 *      pool → {0,0}, Gold gone? After cracking at 4 → {0, A:1}: Defy absent?
 *
 * Rules: 429.2 / 429.3 / 429.3.a (Reaction Add abilities finalize+resolve immediately, usable whenever a payment is
 * required, never on the chain), 357.1.a, 135.2.e.5.b (ADDED [A] pays a Power cost of any Domain), 356.1 (Defy costs
 * 1 + [calm]), 186.1 (a killed token ceases to exist), 167 / 317.2 (pools empty at end of turn).
 * DESIGN (DESIGN.md §Paying costs): the play-time Add sub-step is not implemented — a play is OFFERED only when the
 * CURRENT pool covers it, so the Gold is cracked before initiating the cast; an uncracked Gold is never credited.
 *
 * Expected: (a) yes — at 5 of 8 the Gold adds [1]+[A] → {1, A:1}; [A] pays [calm], [1] pays the energy; the bonus is a
 * passive of the legend, exhaustion irrelevant; Defy counters Bolt. (b) at 4: [A] only → {0, A:1}; Defy not castable;
 * the [A] floats and empties at end of turn. (c) evaluated per Add as it resolves: #1 (at 4) gave [A] only and is never
 * topped up; #2 (at 5) gives [1][A] → pool {1, A:2}. (d) 5/6/7 yes, 4/3 no. (e) before cracking Defy is NOT listed; at 5
 * after cracking listed, accepted, drains to {0,0}, Gold gone; at 4 after cracking absent and rejected.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHEM_BARONESS = "sfd-201-221";
const GOLD = "sfd-t03";
const DEFY = "ogn-045-298";

/** P2's inline 3-cost pip-less Action spell "Draw 2" — a legal Defy target (3 ≤ 4, no pips ≤ [rainbow]). */
const BOLT = { abilities: [{ effect: { amount: 2, type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 3, name: "Bolt", timing: "action" };

/**
 * P2's turn (main phase, Neutral Open). P1: Chem-Baroness EXHAUSTED in the legend zone, `points` of 8, empty pool, no
 * runes, two READY Gold tokens (`token-gold1/2` — tokens are recognised by their `token-` id, 186.1) and Defy in hand.
 * P2: exactly 3 energy and Bolt in hand.
 */
function board(points: number) {
  return scenario()
    .active(P2)
    .victoryScore(8)
    .points(P1, points)
    .card("baroness", { def: CHEM_BARONESS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
    .resources(P2, { energy: 3 })
    .gear(P1, GOLD, "token-gold1")
    .gear(P1, GOLD, "token-gold2")
    .hand(P1, DEFY, "defy")
    .hand(P2, BOLT, "bolt");
}

/** P2 casts Bolt and passes → P1 holds priority with Bolt alone on the chain. */
async function boltOnChain(points: number): Promise<Game> {
  const game = await board(points).build();
  expect(game.state("baroness").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  expect(game.p1.runes()).toEqual([]);
  await game.p2.cast("bolt");
  expect(game.p2.energy()).toBe(0);
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bolt"]);
  return game;
}

/** Crack a Gold: "Kill this, [Exhaust]: [Reaction] — [Add] [A]". */
async function crack(game: Game, gold: string): Promise<void> {
  expect(game.p1.can("activate", gold)).toBe(true);
  await game.p1.activate(gold, 0, { sacrifice: gold });
}

function totalPower(game: Game): number {
  return game.p1.power();
}

describe("Chem-Baroness × Gold × Defy — 'within 3 of the Victory Score' adds [1] to a Gold's [A]; one Gold funds Defy at 5, not at 4", () => {
  // ── (e)/(a) before cracking ───────────────────────────────────────────────────────────────────

  test("(e) before cracking anything (pool empty) Defy is NOT listed for P1 even at 5 points — a ready Gold is never credited (DESIGN manual pay); a forced cast is rejected with no residue; both Golds ARE activatable at Reaction speed on the opponent's turn (429.3)", async () => {
    // DESIGN (DESIGN.md §Paying costs): rule 357.1.a's Add-during-payment sub-step is not implemented; the Gold is
    // cracked first, then the play is offered from the pool.
    const game = await boltOnChain(5);
    expect(game.p1.can("cast", "defy")).toBe(false);
    expect(game.p1.legal().map((o) => o.key)).toEqual(expect.arrayContaining(["activateAbility:token-gold1#0", "activateAbility:token-gold2#0", "passChainPriority:-"]));
    await expect(game.p1.cast("defy", { targets: "bolt" })).rejects.toThrow();
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt"]);
    expect(game.has("token-gold1")).toBe(true);
  });

  // ── (a) at 5 points ───────────────────────────────────────────────────────────────────────────

  test("(a) at 5 of 8, cracking ONE Gold adds [A] + the Baroness's extra [1] → pool {1 energy, 1 any-domain}; nothing goes on the chain (429.2/429.3.a); the Gold token ceases to exist (186.1); the legend being exhausted is irrelevant (passive)", async () => {
    const game = await boltOnChain(5);
    await crack(game, "token-gold1");
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(totalPower(game)).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt"]); // Add never lingers on the chain
    expect(game.has("token-gold1")).toBe(false);
    expect(game.zoneOf("token-gold1")).toBe("gone");
    expect(game.p1.trash()).not.toContain("token-gold1"); // a token is in no zone — it cannot be 'returned'
    expect(game.state("baroness").isExhausted).toBe(true); // still exhausted; the bonus applied anyway
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 still holds priority
  });

  test("(a)/(e) at 5 after cracking: Defy IS listed with Bolt as its target; casting it drains the pool to {0,0} — the added [A] paid the [calm] pip (135.2.e.5.b), the bonus [1] paid the energy; Defy sits on top of Bolt", async () => {
    const game = await boltOnChain(5);
    await crack(game, "token-gold1");
    expect(game.p1.can("cast", "defy")).toBe(true);
    const targets = game.p1.option("cast", "defy")?.fields.find((f) => f.name === "targets");
    expect(targets?.options).toEqual([["bolt"]]);
    await game.p1.cast("defy", { targets: "bolt" });
    expect(game.p1.energy()).toBe(0);
    expect(totalPower(game)).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt", "defy"]);
    expect(game.has("token-gold2")).toBe(true); // the second Gold was never needed
  });

  test("(a) Defy resolves first and counters the 3-cost Bolt (≤4, no pips): P2 draws nothing, both spells → their owners' trashes, back to P2's open main phase", async () => {
    const game = await boltOnChain(5);
    await crack(game, "token-gold1");
    await game.p1.cast("defy", { targets: "bolt" });
    const p2Hand = game.p2.hand().length;
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p2.hand()).toHaveLength(p2Hand); // countered: no draw 2
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.p2.trash()).toContain("bolt");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.trash()).toContain("defy");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) at 4 points ───────────────────────────────────────────────────────────────────────────

  test("(b)/(e) at 4 of 8 (not within 3), cracking a Gold adds ONLY [A] → pool {0, A:1}; Defy (needs 1 energy) stays absent and a forced cast is rejected — Defy in hand, chain untouched", async () => {
    const game = await boltOnChain(4);
    await crack(game, "token-gold1");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("rainbow")).toBe(1);
    expect(totalPower(game)).toBe(1);
    expect(game.has("token-gold1")).toBe(false);
    expect(game.p1.can("cast", "defy")).toBe(false);
    await expect(game.p1.cast("defy", { targets: "bolt" })).rejects.toThrow();
    expect(game.zoneOf("defy")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["bolt"]);
    expect(game.p1.power("rainbow")).toBe(1); // nothing spent on the refused play
  });

  test("(b) at 4 even BOTH Golds cannot fund Defy — {0, A:2} still has no energy; Bolt resolves (P2 draws 2) and the floating [A][A] is lost when the turn ends (167 / 317.2)", async () => {
    const game = await boltOnChain(4);
    await crack(game, "token-gold1");
    await crack(game, "token-gold2");
    expect(game.p1.energy()).toBe(0);
    expect(totalPower(game)).toBe(2);
    expect(game.p1.can("cast", "defy")).toBe(false);
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("bolt")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(totalPower(game)).toBe(2); // still floating during P2's main phase
    await game.advanceTurn(); // P2 ends the turn → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(totalPower(game)).toBe(0);
    expect(game.zoneOf("defy")).toBe("hand");
  });

  // ── (c) bonus evaluated per Add, when it resolves ─────────────────────────────────────────────

  test("(c) P1's own turn at 4: Gold #1 adds [A] only; P1 conquers an open battlefield → 5 points; Gold #2 NOW adds [1][A] → pool {1, A:2} — #1 is never topped up retroactively (bonus read as each Add resolves, 429.1)", async () => {
    const game = await scenario()
      .victoryScore(8)
      .points(P1, 4)
      .card("baroness", { def: CHEM_BARONESS, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .gear(P1, GOLD, "token-gold1")
      .gear(P1, GOLD, "token-gold2")
      .hand(P1, DEFY, "defy")
      .build();
    await crack(game, "token-gold1");
    expect(game.p1.energy()).toBe(0);
    expect(totalPower(game)).toBe(1);
    await game.p1.move("scout", "bf1");
    await game.settle(); // the non-combat showdown closes → P1 conquers bf1 → +1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(5);
    expect(game.p1.energy()).toBe(0); // Gold #1's Add is history — no retroactive [1]
    expect(totalPower(game)).toBe(1);
    await crack(game, "token-gold2");
    expect(game.p1.energy()).toBe(1); // #2 resolved while within 3 → [1][A]
    expect(totalPower(game)).toBe(2);
    expect(game.has("token-gold2")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) threshold ─────────────────────────────────────────────────────────────────────────────

  test("(d) 'within 3 points of the Victory Score' (VS 8): a cracked Gold adds the extra [1] at 5, 6 and 7 points, and does NOT at 4 or 3", async () => {
    for (const [points, bonus] of [[3, 0], [4, 0], [5, 1], [6, 1], [7, 1]] as const) {
      const game = await boltOnChain(points);
      await crack(game, "token-gold1");
      expect({ energy: game.p1.energy(), points, power: totalPower(game) }).toEqual({ energy: bonus, points, power: 1 });
      expect(game.p1.can("cast", "defy")).toBe(bonus === 1); // enumerated ≡ payable
    }
  });

  test("(d) the bonus is the BARONESS's passive: without the legend a Gold at 5 points adds [A] only and Defy stays uncastable", async () => {
    const game = await scenario()
      .active(P2)
      .victoryScore(8)
      .points(P1, 5)
      .resources(P2, { energy: 3 })
      .gear(P1, GOLD, "token-gold1")
      .hand(P1, DEFY, "defy")
      .hand(P2, BOLT, "bolt")
      .build();
    await game.p2.cast("bolt");
    await game.p2.passPriority();
    await crack(game, "token-gold1");
    expect(game.p1.energy()).toBe(0);
    expect(totalPower(game)).toBe(1);
    expect(game.p1.can("cast", "defy")).toBe(false);
  });
});
