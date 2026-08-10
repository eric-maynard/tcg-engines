/**
 * Interaction: Consult the Past (ogn-083-298) · Spell · Mind · 4 · "[Hidden] [Reaction] Draw 2."  — FACEDOWN at bf1
 *   × Mushroom Pouch (ogn-101-298) · Gear · Mind · "At the start of your Beginning Phase, if you control a
 *     facedown card at a battlefield, draw 1."                                                — in P1's base
 *
 * Rules: 107.3.f (a Facedown Zone is a PUBLIC zone; the facedown card in it is PRIVATE), 109.2 (the state of
 * game objects — that a facedown card exists there and who controls it — is public), 128.4 (the controller
 * of a facedown card may look at it), 421.4 ("if a facedown card would change zones OR IF THE GAME ENDS, its
 * owner reveals it to all players"), 424.2.a / 424.2.b (cards in private states are only revealed when an
 * effect instructs; voluntarily showing is not a reveal), 194.2 / 196 (reaching the Victory Score ends the
 * game), 811.1.b (a hidden card may be played later for 0 as a Reaction).
 *
 * Question: P1 (7 points, Victory 8) controls bf1 with a Keeper, hid Consult the Past there on turn 1, and
 * has Mushroom Pouch in base. P2's turn 2 is ending.
 *   (a) Does Pouch draw at the start of P1's Beginning Phase, and is its condition checkable from PUBLIC
 *       information — what does P2's view of the bf1 Facedown Zone contain vs P1's?
 *   (b) Nothing moves the card during the turn: is its face ever exposed to P2; can P1 voluntarily reveal it?
 *   (c) P1 holds bf1 for the 8th point and the game ends with Consult still facedown: is it now revealed to
 *       P2 (identity in P2's post-game view / the public reveal record)? Does its Draw 2 ever happen?
 *   (d) Contrast: P1 only reaches 7 — into P2's turn the card is still facedown and still redacted for P2.
 *
 * Expected: (a) yes — P2 sees exactly one anonymous facedown object at bf1 owned by P1 (no id/name/defId) and
 * bf1's controller P1; P1's own view names Consult; Pouch draws 1. (b) no exposure; the only thing P1 can do
 * with it is PLAY it from hidden (which would move it) — there is no "show" action. (c) 421.4 second limb:
 * when the game ends every facedown card is revealed → P2's final view / the public reveal log names Consult
 * for the bf1 slot; it was never played → no Draw 2, not in the trash. (d) at 7 nothing ends; the slot stays
 * occupied, private, and redacted for P2.
 */
import { describe, expect, test } from "bun:test";
import type { CardView } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const CONSULT_THE_PAST = "ogn-083-298";
const MUSHROOM_POUCH = "ogn-101-298";

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Turn 2, P2 active (about to end the turn), Victory 8, P1 on `p1Points`. P1 controls bf1 with a vanilla
 * Keeper and has Consult the Past facedown there since turn 1; Mushroom Pouch in P1's base. P2 holds bf2.
 */
function board(p1Points: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .victoryScore(8)
    .points(P1, p1Points)
    .points(P2, 3)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Keeper" }, "keeper")
    .unit(P2, "bf2", { might: 3, name: "Guard" }, "guard")
    .facedown(P1, "bf1", CONSULT_THE_PAST, "consult", { hiddenOnTurn: 1 })
    .gear(P1, MUSHROOM_POUCH, "pouch");
}

/** The bf1 Facedown Zone as `seat` sees it. */
function slot(game: Game, seat: typeof P1 | typeof P2): readonly CardView[] {
  return game.seat(seat).view().zones["facedown-bf1"] ?? [];
}

/** Card ids named in the shared public-reveal record (rule 424.1 / 421.4). */
function publiclyRevealed(game: Game): string[] {
  return (game.gameState.publicReveals ?? []).flatMap((r) => [...r.cardIds]);
}

describe("Facedown slot: public zone, private face — and the game-end reveal (421.4)", () => {
  // ── (a) public occupancy vs private identity; Pouch's condition ──────────────────────────

  test("(a) P2's view of the bf1 Facedown Zone: exactly one object, flagged hidden, owner P1, and NO id / name / defId; the battlefield summary publicly shows controller P1 and facedownCount 1 (107.3.f, 109.2)", async () => {
    const game = await board(7).build();
    const p2sees = slot(game, P2);
    expect(p2sees).toHaveLength(1);
    const v = p2sees[0]!;
    expect(isHiddenView(v)).toBe(true);
    expect(v).toEqual({ hidden: true, index: 0, owner: P1, zone: "facedown-bf1" });
    expect("id" in v || "name" in v || "defId" in v).toBe(false);
    const bf1 = game.p2.view().battlefields.find((b) => b.id === "bf1");
    expect(bf1).toMatchObject({ controller: P1, facedownCount: 1 });
  });

  test("(a) P1's view of the same slot names the card (128.4 — the controller may look at it): id 'consult', Consult the Past, isHidden", async () => {
    const game = await board(7).build();
    const p1sees = slot(game, P1);
    expect(p1sees).toHaveLength(1);
    const v = p1sees[0]!;
    expect(isHiddenView(v)).toBe(false);
    expect(v).toMatchObject({ controller: P1, defId: CONSULT_THE_PAST, id: "consult", isHidden: true, name: "Consult the Past", owner: P1 });
  });

  test("(a) at the start of P1's Beginning Phase Mushroom Pouch triggers (its 'you control a facedown card at a battlefield' condition is met — a publicly verifiable fact) and P1 draws exactly 1 from it", async () => {
    const game = await board(6).build(); // 6 → 7: the game goes on, so the whole Beginning Phase plays out
    const hand0 = game.p1.hand().length;
    const deck0 = game.p1.deck().length;
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pouch", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(hand0); // still a chain item
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(hand0 + 2); // Pouch + the normal Draw Phase card
    expect(game.p1.deck()).toHaveLength(deck0 - 2);
    expect(game.p1.points()).toBe(7);
    // Control: the same morning without the Pouch is just the one rule draw.
    const bare = await scenario()
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .points(P1, 6)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Keeper" }, "keeper")
      .facedown(P1, "bf1", CONSULT_THE_PAST, "consult", { hiddenOnTurn: 1 })
      .build();
    const bareHand0 = bare.p1.hand().length;
    await bare.p2.endTurn();
    expect(bare.chain()).toEqual([]);
    await bare.settle();
    expect(bare.p1.hand()).toHaveLength(bareHand0 + 1);
  });

  // ── (b) no exposure during the turn; no voluntary reveal ─────────────────────────────────

  test("(b) through P1's whole turn (Pouch, scoring, rune actions, Ending Step) the card never changes zones, so P2's view stays redacted at every checkpoint and the public reveal record never names it (424.2.a)", async () => {
    const game = await board(6).build();
    const redacted = [{ hidden: true, index: 0, owner: P1, zone: "facedown-bf1" }];
    await game.p2.endTurn(); // Pouch on the chain
    expect(slot(game, P2)).toEqual(redacted);
    await game.settle(); // Pouch resolves, hold scored, channel, draw → P1's main phase
    expect(game.turnPlayer()).toBe(P1);
    expect(slot(game, P2)).toEqual(redacted);
    await game.p1.tapRune();
    expect(slot(game, P2)).toEqual(redacted);
    await game.p1.endTurn();
    expect(game.zoneOf("consult")).toBe("facedown-bf1");
    expect(game.state("consult").isHidden).toBe(true);
    expect(slot(game, P2)).toEqual(redacted);
    expect(publiclyRevealed(game)).not.toContain("consult");
  });

  test("(b) P1 has no 'show it' action: the only menu entry touching the card is PLAYING it from hidden (revealHidden = rule 811 play, which would move it to the chain) — voluntary showing is not a game action (424.2.b)", async () => {
    const game = await board(6).build();
    await game.advanceTurn();
    const touching = game.p1.legal().filter((o) => o.card === "consult");
    expect(touching.map((o) => o.key)).toEqual(["revealHidden:consult"]);
    expect(touching[0]).toMatchObject({ moveId: "revealHidden", verb: "reveal" });
    // Not taking it: the card stays put and private.
    expect(game.state("consult")).toMatchObject({ isHidden: true, zone: "facedown-bf1" });
    expect(slot(game, P2).every(isHiddenView)).toBe(true);
  });

  // ── (c) the game ends with the card still facedown ───────────────────────────────────────

  test("(c) P1 on 7: Pouch draws, then the Scoring Step holds bf1 for the 8th point → game over, P1 wins, still in P1's Beginning Phase; Consult was never played: still in the bf1 facedown slot (not trash, not chain) and its Draw 2 never happened (hand +1 from Pouch only)", async () => {
    const game = await board(7).build();
    const hand0 = game.p1.hand().length;
    await game.p2.endTurn();
    const r = await game.settle();
    expect(r.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);
    expect(game.p1.points()).toBe(8);
    expect(game.phase()).toBe("beginning");
    expect(game.zoneOf("consult")).toBe("facedown-bf1");
    expect(game.p1.trash()).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.violations()).toEqual([]);
  });

  // BUG — expected (421.4, second limb: "…or if the game ends, its owner reveals it to all players"): once the
  // game is over the bf1 facedown card's identity is public — P2's final view of the slot names Consult the
  // Past (a full CardState, not a redacted HiddenCardView). Actual: P2 still sees
  // { hidden: true, owner: P1 } with no identity after status = finished.
  test("(c) at game end the facedown card is revealed to all players — P2's post-game view of facedown-bf1 carries Consult the Past's identity (421.4)", async () => {
    const game = await board(7).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(true);
    const p2sees = slot(game, P2);
    expect(p2sees).toHaveLength(1);
    const v = p2sees[0]!;
    expect(isHiddenView(v)).toBe(false);
    expect(v).toMatchObject({ defId: CONSULT_THE_PAST, id: "consult", name: "Consult the Past", owner: P1 });
  });

  // BUG — expected (421.4 + 424.1): the game-end reveal is a real reveal "to all players", so the shared
  // public-reveal record (gameState.publicReveals — written by every other 421.4 path, e.g. a facedown card
  // trashed from an uncontrolled battlefield) gains an entry by P1 naming 'consult'. Actual: no entry is
  // written when the game ends; publicReveals stays empty.
  test("(c) the game-end reveal is written to the public reveal record: an entry by P1 naming 'consult' (421.4, 424.1)", async () => {
    const game = await board(7).build();
    await game.p2.endTurn();
    await game.settle();
    expect(game.isOver()).toBe(true);
    expect(game.gameState.publicReveals ?? []).toContainEqual(expect.objectContaining({ cardIds: ["consult"], playerId: P1 }));
  });

  // ── (d) contrast: only 7 — nothing ends, nothing is revealed ─────────────────────────────

  test("(d) P1 on 6 → 7: no game end; through P1's turn and into P2's next turn the card is still facedown at bf1, still playable-from-hidden on P1's turn (811.1.b), P2's view still an anonymous occupied slot, and the reveal record never names it", async () => {
    const game = await board(6).build();
    await game.advanceTurn(); // P1's turn
    expect(game.p1.points()).toBe(7);
    expect(game.isOver()).toBe(false);
    expect(game.p1.can("reveal", "consult")).toBe(true);
    expect(slot(game, P2)).toEqual([{ hidden: true, index: 0, owner: P1, zone: "facedown-bf1" }]);
    await game.advanceTurn(); // → P2's turn
    expect(game.turnPlayer()).toBe(P2);
    expect(game.isOver()).toBe(false);
    expect(game.zoneOf("consult")).toBe("facedown-bf1");
    expect(game.state("consult").isHidden).toBe(true);
    expect(slot(game, P2)).toEqual([{ hidden: true, index: 0, owner: P1, zone: "facedown-bf1" }]);
    expect(game.p2.view().battlefields.find((b) => b.id === "bf1")).toMatchObject({ controller: P1, facedownCount: 1 });
    expect(publiclyRevealed(game)).not.toContain("consult");
    expect(game.violations()).toEqual([]);
  });
});
