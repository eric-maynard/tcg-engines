/**
 * Interaction: [Predict N] vs Draw when EVERY zone is empty, and the Burn Out
 * recursion Loose Cannon (ogn-251-298) forces every turn.
 *
 *   Scryer's Bloom (unl-136-219) — "Kill this, [1], [Exhaust]: [Predict 2],
 *     then draw 1. Gain 1 XP."   ← one resolution straddling both sides of the rule
 *   Concentrate (unl-091-219)   — "[Action] Draw 2."
 *   Loose Cannon (ogn-251-298)  — "At start of your Beginning Phase, draw 1 if
 *     you have one or fewer cards in your hand."
 *
 * NOTE: the question was posed with Clairvoyance (ven-056-166) — "[Predict 5].
 * Draw 2." — which is not in this card pool (there is no `ven` set here). The
 * two halves it tests are covered by the two cards above: Scryer's Bloom is a
 * single resolution that Predicts and then draws, and Concentrate supplies the
 * Draw 2 against a genuinely empty trash.
 *
 * Rules: 431.1.c / 431.1.c.1 (looking at more cards than the Main Deck holds:
 * look at as many as possible, do NOT Burn Out, dependent instructions are
 * simply ignored), 436.4.a (Predict never Burns Out), 431.2 / 431.2.a–d (the
 * Burn Out sequence: recycle trash, an opponent gains 1 point, then complete
 * the causing action), 194.1.d, 431.3 / 431.3.a / 431.3.b / 431.3.c /
 * 431.3.c.1 (a still-empty deck Burns Out again, repeatedly, until an opponent
 * passes the Victory Score and wins IMMEDIATELY), 315.4.b / 315.4.b.1 /
 * 315.4.b.2 (the Draw Phase draw and its Burn Out).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SCRYERS_BLOOM = "unl-136-219";
const CONCENTRATE = "unl-091-219";
const LOOSE_CANNON = "ogn-251-298";

const filler = (name: string) => ({ cardType: "spell", energyCost: 1, name });

describe("Predict on an empty deck never Burns Out; Draw always does", () => {
  test("[Predict 2] with 0 cards in the Main Deck: no prompt is opened and no Burn Out happens (431.1.c / 431.1.c.1 / 436.4.a)", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 5 })
      .gear(P1, SCRYERS_BLOOM, "bloom")
      .build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual([]);

    await game.p1.activate("bloom");
    const settled = await game.settle();
    // Nothing to look at ⇒ nothing to recycle or reorder: the engine must not
    // stall on a reorder/recycle prompt over an empty list.
    expect(settled.reason).toBe("open");
    expect(game.decision()?.kind).toBe("action");
  });

  test("[Predict 2] with cards present DOES open the look-at prompt — proving the empty case is a rules exemption, not a missing feature", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 5 })
      .gear(P1, SCRYERS_BLOOM, "bloom")
      .deck(P1, [filler("D1"), filler("D2")], ["d1", "d2"])
      .build();
    await game.p1.activate("bloom");
    const settled = await game.settle();
    expect(settled.reason).toBe("unanswered");
    const d = game.decision();
    expect(d?.kind).toBe("pick");
    expect((d as { semantics?: string }).semantics).toBe("from-revealed");
    expect((d as { options: { key: string }[] }).options.map((o) => o.key).sort()).toEqual(["d1", "d2"]);
  });

  test("the Draw in the SAME resolution does Burn Out: an opponent gains 1 point and the draw still completes (431.2.b–d / 194.1.d)", async () => {
    const game = await scenario()
      .fillDecks(false)
      .resources(P1, { energy: 5 })
      .gear(P1, SCRYERS_BLOOM, "bloom")
      .build();
    await game.p1.activate("bloom");
    await game.settle();

    expect(game.seat(P2).points()).toBe(1); // exactly one Burn Out
    expect(game.p1.points()).toBe(0);
    // 431.2.b then 431.2.d: the trash — which now holds the Bloom itself, killed
    // as an activation cost — is recycled, so the draw finds a card after all.
    expect(game.p1.hand()).toEqual(["bloom"]);
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.xp()).toBe(1); // "Gain 1 XP" still runs
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("Draw 2 against a genuinely empty deck AND trash Burns Out repeatedly until an opponent wins (431.3 / 431.3.a / 431.3.c / 431.3.c.1)", async () => {
    // The naive reading is "two draws ⇒ two Burn Outs ⇒ two points". 431.3 is
    // explicit that the deck STAYS empty, so re-attempting the same action
    // Burns Out again and again; 431.3.a/431.3.c end that loop by handing an
    // opponent the game the moment they reach the Victory Score.
    const game = await scenario()
      .fillDecks(false)
      .victoryScore(8)
      .resources(P1, { energy: 9, power: { body: 3 } })
      .hand(P1, CONCENTRATE, "conc")
      .build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);

    await game.p1.cast("conc");
    const settled = await game.settle();

    expect(settled.reason).toBe("game-over");
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.seat(P2).points()).toBe(8); // 431.3.c.1 — wins immediately, no Cleanup needed
    expect(game.p1.points()).toBe(0);
  });

  test("contrast: 3 cards in the trash ⇒ exactly ONE Burn Out, both draws then succeed against a real deck", async () => {
    const game = await scenario()
      .fillDecks(false)
      .victoryScore(8)
      .resources(P1, { energy: 9, power: { body: 3 } })
      .hand(P1, CONCENTRATE, "conc")
      .trash(P1, filler("T1"), "t1")
      .trash(P1, filler("T2"), "t2")
      .trash(P1, filler("T3"), "t3")
      .build();
    await game.p1.cast("conc");
    const settled = await game.settle();

    expect(settled.reason).toBe("open");
    expect(game.isOver()).toBe(false);
    expect(game.seat(P2).points()).toBe(1); // one Burn Out, no second one
    expect(game.p1.hand()).toHaveLength(2); // both draws landed
    expect(game.p1.deck()).toHaveLength(1); // 3 recycled − 2 drawn
    expect(game.p1.trash()).toEqual(["conc"]); // the spell lands in the trash AFTER it resolves
  });

  test("Loose Cannon's forced every-turn draw plus the mandatory Draw Phase draw TERMINATE on the win check rather than looping (315.4.b.1 / 315.4.b.2 / 431.3.a)", async () => {
    const game = await scenario()
      .fillDecks(false)
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .legend(P1, LOOSE_CANNON, "cannon")
      .build();
    expect(game.p1.deck()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.hand()).toEqual([]); // ≤1 card ⇒ the legend's draw fires

    await game.advanceTurn(); // P2 ends → P1's Beginning/Draw phases
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P2);
    expect(game.seat(P2).points()).toBe(8);
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("an empty RUNE deck is orthogonal — there is no rune Burn Out, so nobody gains a point from it", async () => {
    const game = await scenario()
      .fillDecks({ main: 12, runes: 0 })
      .turn(2)
      .active(P2)
      .victoryScore(8)
      .build();
    expect(game.p1.runeDeck()).toEqual([]);
    const before = { p1: game.p1.points(), p2: game.seat(P2).points() };

    await game.advanceTurn(); // P1's Channel Phase finds no runes to channel

    expect(game.p1.runes()).toEqual([]);
    expect({ p1: game.p1.points(), p2: game.seat(P2).points() }).toEqual(before);
    expect(game.isOver()).toBe(false);
  });
});
