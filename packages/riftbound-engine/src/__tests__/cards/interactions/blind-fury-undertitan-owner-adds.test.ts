/**
 * Interaction: Blind Fury (ogn-025-298) · Spell · Fury · 4+[fury][fury] · Action
 *     "Each opponent reveals the top card of their Main Deck. Choose one and banish it, then play
 *      it, ignoring its cost. Then recycle the rest."
 *   × Undertitan (sfd-175-221) · Unit · Order · 6+[order] · 5 Might
 *     "When you play me, give your other units +2 [Might] this turn.
 *      As I'm revealed from your deck, [Add] [2]."
 *   (+ Discipline (ogn-058-298) · 2-cost pip-less [Reaction] — P1's way to spend energy off-turn)
 *
 * Question: P2's turn, Neutral Open. P2 casts Blind Fury; the top card of P1's deck is Undertitan.
 * P1's pool is 0/0 and P1 holds a pip-less 2-cost Reaction; each player has one unit on board.
 *   (a) When Undertitan is revealed, WHO adds [2] — P1 (whose deck) or P2 (who performed the
 *       reveal)? Does it use the chain?
 *   (b) P2 banishes and plays Undertitan: who controls it, what does P2 pay, whose "other units"
 *       get +2?
 *   (c) Can P1 spend that [2] during P2's turn — is the 2-cost Reaction enumerated when P1 gets
 *       priority with Undertitan's play trigger on the chain?
 *   (d) If P1 never spends it, how much energy does P1 have when P1's next Main Phase opens?
 *
 * Rules: 370.1.b.1 ("As I'm revealed" = the reveal is replaced by reveal + Add — no chain item),
 * 166.1 (added Energy goes to the CONTROLLING player's pool; in P1's deck Undertitan is P1's),
 * 429.2 (Add resolves on the spot, no priority), 356.1.b.1 (ignoring cost zeroes energy AND power),
 * 191.1 / 143.4 (the player who plays it controls it; enters exhausted), 317.2.d (every pool
 * empties in P2's Expiration Step), 316.3 (pools empty again as P1's turn opens).
 *
 * Expected: (a) P1: 0→2 energy, P2 nothing, no chain item, no priority. (b) P2 chooses, banishes
 * (through P1's banishment) and plays it to P2's base exhausted, paying nothing beyond Blind Fury;
 * the play trigger is P2's → P2's other unit +2, P1's unit untouched; nothing to recycle. (c) Yes —
 * with the trigger on the chain P1 has priority and 2 unrestricted energy, so the Reaction is
 * enumerated and casting it debits 2→0 (before the reveal, at 0 energy, it was not). (d) 0.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BLIND_FURY = "ogn-025-298";
const UNDERTITAN = "sfd-175-221";
const DISCIPLINE = "ogn-058-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P2's turn with exactly Blind Fury's cost. P1: 0/0, Undertitan on top of the deck, Discipline in
 * hand, one vanilla unit in base. P2: one vanilla unit in base, no battlefield (so the stolen
 * Undertitan's location is forced to P2's base).
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4, power: { fury: 2 } })
    .unit(P2, "base", { might: 2, name: "P2 Grunt" }, "p2grunt")
    .unit(P1, "base", { might: 2, name: "P1 Grunt" }, "p1grunt")
    .deckTop(P1, UNDERTITAN, "titan")
    .hand(P2, BLIND_FURY, "fury")
    .hand(P1, DISCIPLINE, "disc");
}

/** Blind Fury cast and both players passed → it is resolving: Undertitan is revealed, P2 must pick. */
async function revealed(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("fury");
  await game.p2.passPriority();
  await game.p1.passPriority();
  const d = game.decision();
  expect(d?.kind).toBe("pick");
  expect(d?.seat).toBe(P2);
  return game;
}

/** …P2 picked Undertitan (banish → play to P2's base); its play trigger is on the chain, P2 has priority. */
async function stolen(): Promise<Game> {
  const game = await revealed();
  await game.p2.pick("titan");
  return game;
}

describe("Blind Fury reveals the opponent's Undertitan — whose [Add] [2] is it, and can it be spent off-turn", () => {
  // ── (a) the reveal rider ─────────────────────────────────────────────────────────────────────

  test("(a) premise: before the reveal P1 has 0 energy and, holding priority over Blind Fury, is NOT offered the 2-cost Discipline", async () => {
    const game = await board().build();
    await game.p2.cast("fury");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.can("cast", "disc")).toBe(false);
  });

  test("(a) the reveal happens inside Blind Fury's resolution: only P1's top card is revealed, P2 (the caster) is the one asked to choose, and there is NO chain item / priority for the [Add] (370.1.b.1, 429.2)", async () => {
    const game = await revealed();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["titan"]);
    expect(game.zoneOf("titan")).toBe("mainDeck"); // revealed in place, still P1's deck
    expect(game.state("titan").owner).toBe(P1);
    expect(game.chain()).toEqual([]); // Blind Fury is mid-resolution; no "Add" ability item exists
    expect(game.p2.energy()).toBe(0); // the revealer/caster gains nothing
  });

  // Expected (370.1.b.1, 166.1): "As I'm revealed from YOUR deck" is true for P1 — at that moment
  // Undertitan sits in P1's Main Deck, owned and controlled by P1 — so P1's pool goes 0 → 2 on the
  // spot, before P2 even chooses. Actual: the opponent-deck reveal path never fires the revealed
  // card's on-reveal rider; P1 stays at 0 (nobody gets the energy).
  test("(a) P1 — the deck's owner — adds [2] the moment Undertitan is revealed (0 → 2), P2 adds nothing (166.1, 370.1.b.1)", async () => {
    const game = await revealed();
    expect(game.p2.energy()).toBe(0);
    expect(game.p1.energy()).toBe(2);
  });

  // ── (b) the steal ────────────────────────────────────────────────────────────────────────────

  test("(b) P2 banishes Undertitan through its OWNER's (P1's) banishment and plays it: it lands in P2's base, controller P2, owner P1, EXHAUSTED (191.1, 143.4)", async () => {
    const game = await stolen();
    expect(game.zoneOf("titan")).toBe("base");
    expect(game.p2.base()).toContain("titan");
    expect(game.p1.base()).not.toContain("titan");
    expect(game.state("titan")).toMatchObject({ controller: P2, owner: P1, isExhausted: true, might: 5 });
    expect(game.p1.deck()).not.toContain("titan");
    expect(game.p1.banishment()).toEqual([]); // passed through, not parked
    expect(game.p2.banishment()).toEqual([]);
  });

  test("(b) 'ignoring its cost': P2 pays nothing beyond Blind Fury's 4+[fury][fury] — Undertitan's 6 energy AND its [order] pip are both zeroed (356.1.b.1)", async () => {
    const game = await stolen();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.zoneOf("titan")).toBe("base");
  });

  test("(b) the 'When you play me' trigger is P2's chain item; P1 then receives priority over it (Closed state) while it is still P2's turn", async () => {
    const game = await stolen();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "titan", controller: P2, triggered: true })]);
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "action", context: "chain", seat: P1 });
    expect(game.turnPlayer()).toBe(P2);
  });

  test("(b) on resolution P2's OTHER unit gets +2 this turn; Undertitan itself and P1's unit get nothing; nothing is left to recycle and Blind Fury is in P2's trash", async () => {
    const game = await stolen();
    const p1DeckBefore = game.p1.deck();
    const settled = await game.settle();
    expect(settled.reason).toBe("open");
    expect(game.state("p2grunt").might).toBe(4);
    expect(game.state("titan").might).toBe(5);
    expect(game.state("p1grunt").might).toBe(2);
    expect(game.p1.deck()).toEqual(p1DeckBefore); // single opponent, single revealed card → no recycle
    expect(game.zoneOf("fury")).toBe("trash");
    expect(game.p2.trash()).toContain("fury");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P2 });
    // "this turn": gone by P1's turn
    await game.advanceTurn();
    expect(game.state("p2grunt").might).toBe(2);
  });

  // ── (c) spending the [2] on P2's turn ────────────────────────────────────────────────────────

  // Expected (166.1 + ordinary priority, 337.4): the [2] from the reveal is plain energy in P1's
  // pool; when Undertitan's play trigger is on the chain and P2 passes, P1 holds priority and the
  // 2-cost [Reaction] Discipline IS enumerated; casting it debits P1 2 → 0. Actual: P1 never got
  // the energy (see (a)), so Discipline is not offered.
  test("(c) with Undertitan's trigger on the chain, P1's priority menu enumerates the 2-cost Reaction, paid from the reveal's [2] (2 → 0)", async () => {
    const game = await stolen();
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.can("cast", "disc")).toBe(true);
    await game.p1.cast("disc", { targets: "p1grunt" });
    expect(game.p1.energy()).toBe(0);
  });

  test("(c) control: energy sitting in P1's pool during P2's turn IS spendable — with 2 energy in P1's pool at that same priority window Discipline is enumerated, casting it debits 2 → 0 and it resolves (LIFO) before Undertitan's trigger", async () => {
    const game = await stolen();
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.energy()).toBe(2); // the reveal's [Add] [2] (see (a))
    expect(game.p1.can("cast", "disc")).toBe(true);
    const offered = (game.p1.option("cast", "disc")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toContain("p1grunt");
    const hand = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "p1grunt" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["titan", P2],
      ["disc", P1],
    ]);
    await game.settle();
    expect(game.state("p1grunt").might).toBe(4); // Discipline's +2 — not Undertitan's
    expect(game.state("p2grunt").might).toBe(4); // Undertitan's +2
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // spent Discipline, drew 1
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.turnPlayer()).toBe(P2);
  });

  // ── (d) unspent energy does not carry over ───────────────────────────────────────────────────

  test("(d) left unspent, P1's off-turn energy is emptied by P2's Expiration Step / P1's own turn start: P1 opens the next Main Phase with 0 energy (317.2.d, 316.3)", async () => {
    const game = await stolen();
    await game.p2.passPriority();
    await game.p1.passPriority(); // trigger resolves; P1 keeps the reveal's 2 floating on P2's turn
    expect(game.chain()).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.energy()).toBe(2);
    await game.advanceTurn(); // P2 ends → P1's Beginning Phase → P1's Main Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.energy()).toBe(0);
    expect(game.p2.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("(d) same via the real line (no stand-in): whatever P1 did or did not receive, P1's pool reads 0 when P1's Main Phase opens", async () => {
    const game = await stolen();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.energy()).toBe(0);
  });
});
