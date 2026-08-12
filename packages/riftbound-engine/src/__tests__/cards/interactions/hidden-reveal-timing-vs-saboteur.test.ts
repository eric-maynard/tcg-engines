/**
 * Interaction: Consult the Past (ogn-083-298) · Spell · Mind · [4] · "[Hidden] [Reaction] Draw 2."
 *   × Ember Monk (ogn-167-298) · Unit · Chaos · [4] · 4 Might
 *     "When you play a card from [Hidden], give me +2 [Might] this turn."
 *   × Noxus Saboteur (ogn-018-298) · Unit · Fury · [3] · 3 Might
 *     "Your opponents' [Hidden] cards can't be revealed here."
 *
 * Rules: 811.1.b ("Beginning on the NEXT turn, this gains [Reaction] and you may play this, ignoring its base
 * cost" — the next turn is the opponent's, not your own second turn), 811.6 / 811.6.a (a facedown card has
 * [Reaction] and playing it from facedown reveals it), 421.3 (the play costs [0] — the base cost is ignored),
 * 159.2.b.2 (a Closed State is a legal window for [Reaction]), 358.4 (a play must pass the permission check),
 * 383.1 (a triggered ability fires whenever its event happens, on anyone's turn).
 *
 * Question — on P1's turn P1 hides Consult the Past at bfA, which P1 controls and where P1's Ember Monk stands.
 *   (a) During P2's VERY NEXT turn, with a chain open, may P1 play the hidden card for [0] — and does Ember
 *       Monk's trigger fire on the opponent's turn?
 *   (b) NO side: P2 first moves Noxus Saboteur to bfA. Is the card now playable, and is the reason TIMING or
 *       PERMISSION? (A client whose disabled Reveal button says "— not yet (from your next turn)" while its own
 *       tooltip says "from the turn after it was hidden, at Reaction speed" cannot have both right.)
 *
 * Answer:
 *  (a) YES. 811.1.b's "next turn" is the next turn of the GAME — P2's — not P1's next turn. 811.6 gives the
 *      facedown card [Reaction], so it is legal in the Closed State P2's own chain opens (159.2.b.2), for [0]
 *      (421.3). Ember Monk's trigger is controller-scoped, not turn-scoped (383.1), so the Monk is +2 Might for
 *      that turn — P2's turn — and back to 4 afterwards. A label reading "not yet (from your next turn)" is
 *      therefore a LIE; the tooltip wording ("from the turn after it was hidden, at [Reaction] speed") is right.
 *      This file pins the engine half: the same seat, the same card, is refused on the hiding turn and offered
 *      on the very next turn.
 *  (b) NO — and for a completely different reason. Saboteur is a static permission denial at bfA (358.4), not a
 *      timing gate: the turn requirement is provably satisfied, because with Saboteur swapped for an ordinary
 *      attacker the identical window offers the reveal. Removing Saboteur from bfA restores it immediately.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CONSULT_THE_PAST = "ogn-083-298";
const EMBER_MONK = "ogn-167-298";
const SABOTEUR = "ogn-018-298";

/** P2's own [Action] spell — the cheapest way to open a chain (a Closed State) on P2's turn. */
const PONDER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Ponder",
  rulesText: "Draw 1.",
  timing: "action",
} as const;

/**
 * Turn 2, P1's open Main Phase. bfA is P1's, held by Ember Monk; P1 has exactly one [rainbow] Power — the
 * whole cost of hiding. P2 has a Noxus Saboteur, an ordinary 3-Might Raider (the control attacker) and a
 * free [Action] spell to open a chain with on its own turn.
 */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bfA", { controller: P1 })
    .unit(P1, "bfA", EMBER_MONK, "monk")
    .hand(P1, CONSULT_THE_PAST, "ctp")
    .unit(P2, "base", SABOTEUR, "sab")
    .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P2, PONDER, "ponder");
}

/** P1 hides Consult the Past at bfA on P1's turn, then the turn passes to P2. */
async function hiddenThenP2Turn(): Promise<Game> {
  const game = await board().build();
  await game.p1.hide("ctp", "bfA");
  expect(game.zoneOf("ctp")).toBe("facedown-bfA");
  expect(game.p1.can("reveal", "ctp")).toBe(false); // 811.1.b — never on the turn it was hidden
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P2);
  expect(game.turnNumber()).toBe(3);
  return game;
}

describe("Consult the Past hidden at bfA — 'from the next turn' is the OPPONENT'S turn, and Saboteur is a permission gate, not a timing one", () => {
  // ── the hiding turn: the only turn the timing gate really bites ──────────────────────────────────

  test("on the turn it is hidden the reveal is refused for TIMING (811.1.b): not on P1's own menu, and the move is rejected — while bfA still has no Saboteur on it", async () => {
    const game = await board().build();
    await game.p1.hide("ctp", "bfA");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } }); // hiding cost exactly [rainbow]
    expect(game.p1.can("reveal", "ctp")).toBe(false);
    expect(game.p1.legal().filter((o) => o.verb === "reveal")).toEqual([]);
    expect((await game.p1.try((p) => p.reveal("ctp"))).ok).toBe(false);
    expect(game.p2.units("bfA")).toEqual([]); // nothing is denying permission — this really is the clock
  });

  // ── (a) P2's very next turn, chain open ──────────────────────────────────────────────────────────

  test("(a) on P2's VERY NEXT turn, with P2's own spell on the chain, the reveal is on P1's menu — 811.1.b's 'next turn' is the next turn of the game, not P1's second turn", async () => {
    const game = await hiddenThenP2Turn();
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.chain().map((i) => i.cardId)).toEqual(["ponder"]); // a Closed State (159.2.b.2)
    expect(game.p1.can("reveal", "ctp")).toBe(true);
  });

  test("(a) it plays for [0] (421.3): P1's pool is empty before and after, the flipped spell goes on the chain above P2's, and P1 draws 2 when it resolves", async () => {
    const game = await hiddenThenP2Turn();
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("ctp");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} }); // base cost ignored
    expect(game.chain().map((i) => i.cardId)).toContain("ctp");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.zoneOf("ctp")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(a) Ember Monk's trigger is controller-scoped, not turn-scoped (383.1): playing from [Hidden] on P2's turn gives the Monk +2 for THAT turn (4 → 6), and it is 4 again once the turn ends", async () => {
    const game = await hiddenThenP2Turn();
    expect(game.state("monk").might).toBe(4);
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    await game.p1.reveal("ctp");
    await game.settle();
    expect(game.state("monk").might).toBe(6);
    expect(game.state("monk").grantedKeywords).toEqual([]); // a Might modifier, not a keyword
    await game.advanceTurn(); // P2's turn ends
    expect(game.state("monk").might).toBe(4);
  });

  test("(a) no chain at all is needed either — in P2's quiet Open State P1 still holds no priority, so the flip waits for a window rather than being 'not yet'", async () => {
    const game = await hiddenThenP2Turn();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("reveal", "ctp")).toBe(false); // 811.6 / 312.1.a — Reaction still needs Priority
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "ctp")).toBe(true); // …and the moment P1 has it, the card is live
  });

  // ── (b) NO side: Noxus Saboteur at bfA ───────────────────────────────────────────────────────────

  test("(b) control — an ORDINARY attacker into bfA on the same turn: P1 takes Focus in the showdown and the reveal IS offered (proving the clock is satisfied)", async () => {
    const game = await hiddenThenP2Turn();
    await game.p2.move("raider", "bfA");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "ctp")).toBe(true);
  });

  test("(b) with Noxus Saboteur at bfA instead, the very same window refuses it — a PERMISSION denial (358.4), not a timing one: absent from the menu and rejected as a move", async () => {
    const game = await hiddenThenP2Turn();
    await game.p2.move("sab", "bfA");
    expect(game.p2.units("bfA")).toEqual(["sab"]);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "ctp")).toBe(false);
    expect(game.p1.legal().filter((o) => o.verb === "reveal")).toEqual([]);
    expect((await game.p1.try((p) => p.reveal("ctp"))).ok).toBe(false);
    expect(game.zoneOf("ctp")).toBe("facedown-bfA");
    expect(game.chain()).toEqual([]);
  });

  test("(b) the denial travels with the Saboteur: it does not touch a card hidden at a DIFFERENT battlefield (its text is 'here')", async () => {
    const game = await board()
      .battlefield("bfB", { controller: P1 })
      .unit(P1, "bfB", { might: 2, name: "Bf B Guard" }, "guardB")
      .facedown(P1, "bfB", CONSULT_THE_PAST, "ctpB")
      .build();
    await game.p1.hide("ctp", "bfA");
    await game.advanceTurn();
    await game.p2.move("sab", "bfA");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "ctp")).toBe(false); // bfA — Saboteur is here
    expect(game.p1.can("reveal", "ctpB")).toBe(true); // bfB — untouched
  });

  test("(b) removing the Saboteur from bfA restores the play immediately, in the same turn: the Monk still gets its +2 and P1 still draws 2", async () => {
    const game = await hiddenThenP2Turn();
    await game.p2.move("sab", "bfA");
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "ctp")).toBe(false);
    // Ember Monk (4) beats the Saboteur (3) in the combat the move opened — the lock leaves with it.
    await game.settle();
    expect(game.zoneOf("sab")).toBe("trash");
    expect(game.p2.units("bfA")).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.cast("ponder");
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "ctp")).toBe(true);
    const hand0 = game.p1.hand().length;
    await game.p1.reveal("ctp");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 2);
    expect(game.state("monk").might).toBe(6);
    expect(game.violations()).toEqual([]);
  });
});
