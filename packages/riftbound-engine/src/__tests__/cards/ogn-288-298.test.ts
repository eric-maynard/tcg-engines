/**
 * Startipped Peak — ogn-288-298 · Battlefield
 *
 *   When you hold here, you may channel 1 rune exhausted.
 *
 * Rules: 469.2 / 315.2.b (Hold = keep control during YOUR Beginning Phase → 1 point), 383.4.d + 471.2.b
 * (hold abilities trigger at the held battlefield, once per turn — 471.2.c), 190.6.d ("you" = the
 * battlefield's controller), 430.2 (channel "exhausted" overrides the ready default), 430.3 (empty rune
 * deck → channel as many as possible, i.e. none), 315.1 → 315.2 → 315.3 (Awaken precedes Beginning, and
 * the Channel Phase's 2 ready runes come after), 469.1 (Conquer is not Hold).
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. Ordering: Awaken already happened, so the exhausted rune is dead weight THIS turn (no energy from
 *      it) and only readies at your NEXT Awaken; the Channel Phase still adds its 2 ready runes → 3 total.
 *   2. It channels the TOP rune of your rune deck (we pin a Mind Rune on top of a Fury filler deck).
 *   3. "you may": a P1 yes/no; declining still leaves the hold point and the normal 2 runes.
 *   4. Only YOUR hold, only HERE: the opponent's Beginning Phase, holding a different battlefield, and
 *      conquering the Peak during your turn are all silent.
 *   5. Empty rune deck: accepting does nothing and the turn proceeds cleanly (430.3).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-288-298";
const MIND_RUNE = "ogn-089-298";

/** End of P2's turn 2; P1 controls the Peak (live text) with a unit on it; a Mind Rune sits on top of P1's (Fury) rune deck. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("peak", { controller: P1, def: CARD, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "peak", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Their Holder" }, "theirs")
    .card("topRune", { def: MIND_RUNE, owner: P1, zone: "runeDeck" });
}

describe("Startipped Peak (ogn-288-298)", () => {
  test("registry payload: an optional hold-here trigger for the controller whose effect channels 1 rune exhausted", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Startipped Peak" });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { amount: 1, exhausted: true, type: "channel" },
      optional: true,
      trigger: { event: "hold", location: "here", on: "controller" },
      type: "triggered",
    });
  });

  test("holding the Peak scores 1, puts its trigger on the chain under P1 and asks P1 a payable yes/no", async () => {
    const game = await board().build();
    expect(game.p1.runeDeck()[0]).toBe("topRune");
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "peak", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "peak" } });
  });

  test("yes → the TOP rune of the rune deck enters the pool EXHAUSTED; the Channel Phase then adds 2 ready runes (3 in pool, 9 left in deck)", async () => {
    const game = await board().build();
    expect(game.p1.runeDeck()).toHaveLength(12);
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(3);
    expect(game.p1.runes()).toContain("topRune");
    expect(game.state("topRune")).toMatchObject({ isExhausted: true, name: "Mind Rune", zone: "runePool" });
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toEqual(["topRune"]);
    expect(game.p1.runeDeck()).toHaveLength(9);
    expect(game.violations()).toEqual([]);
  });

  test("Awaken already happened (315.1 < 315.2): the exhausted rune yields no energy this turn — only the 2 ready runes can be tapped", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.p1.can("tapRune", "topRune")).toBe(false);
    await game.p1.tapRunes(2);
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.runes({ ready: true })).toEqual([]);
    expect(game.p1.can("tapRune")).toBe(false);
  });

  test("the exhausted rune readies at P1's NEXT Awaken; the Peak asks again on that turn's hold (once per turn, 471.2.c)", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.yes();
    await game.settle();
    expect(game.state("topRune").isExhausted).toBe(true);
    await game.advanceTurn(); // → P2's turn 3
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("topRune").isExhausted).toBe(true); // not P1's Awaken
    await game.p2.endTurn(); // → P1's turn 4: Awaken readies it, then the hold re-triggers
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("topRune").isExhausted).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "peak" } });
    expect(game.p1.points()).toBe(2);
    await game.p1.no();
    await game.settle();
    expect(game.p1.runes()).toHaveLength(5); // 3 + this turn's 2, nothing extra after declining
  });

  test("'you may' — declining channels nothing extra: hold point kept, 2 ready runes from the Channel Phase, top rune is now a normal ready channel", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.p1.no();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toEqual([]);
    expect(game.state("topRune")).toMatchObject({ isExhausted: false, zone: "runePool" }); // channelled ready by the phase itself
    expect(game.p1.runeDeck()).toHaveLength(10);
  });

  test("only YOUR hold: during P2's Beginning Phase a P1-controlled Peak does nothing for anyone", async () => {
    const game = await board().turn(3).active(P1).build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p2.runes()).toHaveLength(2); // just P2's channel phase
    expect(game.p2.runes({ ready: false })).toEqual([]);
    expect(game.p2.points()).toBe(1); // P2 held bf2 — a plain hold
  });

  test("only HERE: P1 holding a different battlefield while P2 controls the Peak scores 1 with no channel prompt", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("peak", { controller: P2, def: CARD, inert: false })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "peak", { might: 2 }, "theirs")
      .unit(P1, "bf2", { might: 2 }, "holder")
      .build();
    await game.p2.endTurn();
    expect(game.decision()?.kind).not.toBe("yes-no");
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.p1.runes({ ready: false })).toEqual([]);
  });

  test("the controller is 'you': P2 holding a P2-controlled Peak gets the prompt and the exhausted rune; P1 gets nothing", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .battlefield("peak", { controller: P2, def: CARD, inert: false })
      .unit(P2, "peak", { might: 2 }, "theirs")
      .build();
    await game.p1.endTurn();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P2, source: { cardId: "peak" } });
    await game.p2.yes();
    await game.settle();
    expect(game.p2.runes()).toHaveLength(3);
    expect(game.p2.runes({ ready: false })).toHaveLength(1);
    expect(game.p1.runes()).toHaveLength(0);
  });

  test("Conquer is not Hold (469.1 vs 469.2): taking the empty Peak on your turn scores 1 but offers no channel", async () => {
    const game = await scenario()
      .battlefield("peak", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .build();
    await game.p1.move("walker", "peak");
    await game.settle();
    expect(game.gameState.battlefields.peak?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.runeDeck()).toHaveLength(12);
  });

  test("empty rune deck (430.3): accepting channels nothing, no invariant breaks, the turn reaches the main phase", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks({ main: 10, runes: 0 })
      .battlefield("peak", { controller: P1, def: CARD, inert: false })
      .unit(P1, "peak", { might: 2 }, "holder")
      .build();
    expect(game.p1.runeDeck()).toHaveLength(0);
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(0);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
