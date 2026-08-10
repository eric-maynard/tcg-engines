/**
 * Interaction: Sandstone Chimera (ven-036-166) "While I'm at a battlefield, players only channel 1 rune
 *   at the start of their Channel Phase."
 *   × Stormclaw Ursine (ogn-137-298) "[Tank] When you play me, channel 1 rune exhausted."
 *
 * Question: P1 controls the Chimera; P2's turn begins with 4 runes on board and 8 in the Rune Deck.
 *   (a) Chimera AT a battlefield: how many runes does P2 channel and do they enter ready? Symmetric for
 *       P1's own next turn?
 *   (b) Chimera in P1's BASE: how many?
 *   (c) In P2's Main Phase (Chimera still at a battlefield) P2 plays Stormclaw Ursine — does the
 *       Chimera stop or reduce that effect-channel?
 *   (d) Chimera at a battlefield and P2's Rune Deck has exactly 1 / exactly 0 runes: how many, and is
 *       there any Burn Out / point / shuffle from an empty Rune Deck?
 *
 * Rules: 315.3.b + 430.4.a (Channel Phase: channel 2), 364 / 365.1 (statics apply continuously
 * while the condition holds — "while I'm at a battlefield"), 430.2 / 430.2.a (channeled runes enter
 * ready unless the effect says otherwise), 430.4.b (effects may channel outside the phase — Chimera
 * only limits the phase channel), 315.3.b.1 / 430.3 (fewer runes → channel as many as possible),
 * 431.1 (Burn Out is defined for the MAIN deck only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const CHIMERA = "ven-036-166";
const URSINE = "ogn-137-298";
const BODY_RUNE = "ogn-126-298";

/** P1's turn 3 is about to end; P2 has 4 runes on board and (by default) 8 in the Rune Deck. */
function board(where: "bf1" | "base", runeDeck = 8) {
  return scenario()
    .turn(3)
    .active(P1)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, where, CHIMERA, "chimera")
    .runes(P2, "body", 4)
    .runeDeck(P2, Array.from({ length: runeDeck }, () => BODY_RUNE))
    .runes(P1, "calm", 4)
    .runeDeck(P1, Array.from({ length: 8 }, () => BODY_RUNE))
    .fillDecks({ main: 10, runes: 0 });
}

describe("Sandstone Chimera × Channel Phase / Stormclaw Ursine", () => {
  test("(a) Chimera at a battlefield: P2 channels exactly 1 rune in its Channel Phase, and it enters READY (430.2.a)", async () => {
    const game = await board("bf1").build();
    expect(game.p2.runes()).toHaveLength(4);
    expect(game.p2.runeDeck()).toHaveLength(8);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.runeDeck()).toHaveLength(7);
    expect(game.p2.runes({ ready: true })).toHaveLength(5);
    expect(game.violations()).toEqual([]);
  });

  test("(a) 'players' is symmetric: on P1's own next turn P1 also channels only 1", async () => {
    const game = await board("bf1").build();
    await game.advanceTurn(); // → P2
    const before = game.p1.runes().length;
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.runes()).toHaveLength(before + 1);
    expect(game.p1.runes({ ready: true })).toHaveLength(before + 1);
  });

  test("(b) Chimera in P1's base: the static is off — P2 channels the normal 2, both ready", async () => {
    const game = await board("base").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(6);
    expect(game.p2.runeDeck()).toHaveLength(6);
    expect(game.p2.runes({ ready: true })).toHaveLength(6);
  });

  test("(b→a live) the static is continuous: moving the Chimera from base to a battlefield before passing the turn makes P2 channel 1", async () => {
    const game = await board("base").build();
    await game.p1.move("chimera", "bf2");
    await game.settle();
    expect(game.locationOf("chimera")).toBe("bf2");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(5);
  });

  test("(c) Ursine's 'channel 1 rune exhausted' in P2's Main Phase is an effect-channel (430.4.b): Chimera at a battlefield does not stop it; the rune enters EXHAUSTED", async () => {
    const game = await board("bf1").hand(P2, URSINE, "bear").build();
    await game.advanceTurn(); // → P2 main; phase channel gave 1
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.runes({ ready: false })).toHaveLength(0);
    await game.p2.do("addResources", { energy: 7 }); // pools emptied at end of turn (317.2.d); pay for the 7-cost bear
    await game.p2.play("bear");
    await game.settle();
    expect(game.zoneOf("bear")).toBe("base");
    expect(game.p2.runes()).toHaveLength(6);
    expect(game.p2.runeDeck()).toHaveLength(6);
    expect(game.p2.runes({ ready: false })).toHaveLength(1); // the Ursine rune, exhausted as printed
  });

  test("(d) Rune Deck of exactly 1: P2 channels that 1 (as many as possible, 430.3) — no Burn Out, no point for anyone, main deck untouched beyond the draw", async () => {
    const game = await board("bf1", 1).build();
    const mainBefore = game.p2.deck().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.runeDeck()).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.deck()).toHaveLength(mainBefore - 1); // only the Draw Phase card left the main deck
    expect(game.p2.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("(d) Rune Deck of exactly 0: P2 channels nothing — still no Burn Out / point / trash movement (431.1 is main-deck only)", async () => {
    const game = await board("bf1", 0).build();
    const mainBefore = game.p2.deck().length;
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.phase()).toBe("main");
    expect(game.p2.runes()).toHaveLength(4);
    expect(game.p2.runeDeck()).toHaveLength(0);
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.deck()).toHaveLength(mainBefore - 1);
    expect(game.p2.trash()).toEqual([]);
    expect(game.isOver()).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("(d, control) without the Chimera and a Rune Deck of 1, the phase still channels just that 1 — the shortfall is silently forgiven (315.3.b.1)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("bf1", { controller: P1 })
      .runes(P2, "body", 4)
      .runeDeck(P2, [BODY_RUNE])
      .fillDecks({ main: 10, runes: 0 })
      .build();
    await game.advanceTurn();
    expect(game.p2.runes()).toHaveLength(5);
    expect(game.p2.runeDeck()).toHaveLength(0);
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });
});
