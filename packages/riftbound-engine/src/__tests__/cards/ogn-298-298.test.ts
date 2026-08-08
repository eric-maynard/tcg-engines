/**
 * Zaun Warrens — ogn-298-298 · Battlefield
 *
 *   When you conquer here, discard 1, then draw 1.
 *
 * Rules: 383.4.c.2.b / 471.2.a ("When you conquer here" = Conquer Effect of the conquering player, at
 * the battlefield conquered; not a Hold effect), 422.1 (discard = hand → trash, the discarding player
 * picks the card), 422.4 (as part of an effect discard as many as possible; with an empty hand the discard
 * is ignored and — per the Undercover Agent example — you STILL draw), 422.1.b ("when you discard"
 * triggers fire after the discard), 431.1.a / 431.2 (drawing from an empty Main Deck burns out: recycle
 * the trash into the deck, an opponent gains 1 point, then finish the draw).
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. Sequencing "discard 1, THEN draw 1": with exactly one card in hand you must bin THAT card and then
 *     draw — you never get to see the new card first; hand size is unchanged (1 → 1) but the card is new.
 *  2. Empty hand: no discard possible → still draw 1 (0 → 1). Rummaging is not "if you do".
 *  3. The draw can burn you out: empty deck → the just-discarded card is shuffled back with the trash,
 *     the OPPONENT scores 1, then you draw.
 *  4. Discard payoffs in Chaos/Fury: Flame Chompers discarded here may be played for [fury] straight
 *     away; Jinx, Rebel readies and gets +1 Might this turn (gone next turn).
 *  5. "you"/"here": P1 conquering P2's Warrens rummages P1's hand (P1 chooses, P2 never does); holding
 *     it or conquering elsewhere does nothing.
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-298-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker, vanilla 3-Might unit
const FLAME_CHOMPERS = "ogn-006-298"; // When you discard me, you may pay [fury] to play me.
const JINX_REBEL = "ogn-202-298"; // 5 Might · When you discard one or more cards, ready me and give me +1 [Might] this turn.

/** P1's 3-Might raider vs P2's 1-Might defender at Zaun Warrens (P2's card); P1's next draw is `top`. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .unit(P2, "bf1", { might: 1, name: "Defender" }, "def")
    .hand(P2, FILLER, "p2card")
    .deckTop(P1, FILLER, "top");
}

describe("Zaun Warrens (ogn-298-298)", () => {
  test("registry payload: one conquer-here trigger whose effect is discard 1 THEN draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Zaun Warrens" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 1, then: { amount: 1, type: "draw" }, type: "discard" },
        trigger: { event: "conquer", location: "here", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("conquering here: P1 (the conqueror, not the card's owner) is asked which of P1's hand cards to discard — P2's hand is never on offer", async () => {
    const game = await board().hand(P1, FILLER, "junk").hand(P1, FLAME_CHOMPERS, "keeper").build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).toBe("unanswered");
    expect(game.actingSeat()).toBe(P1);
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", max: 1, min: 1, seat: P1 });
    expect(d.options.map((o) => o.key).sort()).toEqual(["junk", "keeper"]);
  });

  test("discard the chosen card, THEN draw the top card: hand size unchanged, the binned card is in the trash, the kept card stays", async () => {
    const game = await board().hand(P1, FILLER, "junk").hand(P1, FILLER, "keeper").build();
    const deck0 = game.p1.deck().length;
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p1.pick("junk");
    await game.settle();
    expect(game.zoneOf("junk")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["keeper", "top"]);
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.p2.hand()).toEqual(["p2card"]);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("exactly one card in hand: it MUST go first (forced, no prompt) and only then is the new card drawn — you end holding just the fresh card", async () => {
    const game = await board().hand(P1, FILLER, "only").build();
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.zoneOf("only")).toBe("trash");
    expect(game.p1.hand()).toEqual(["top"]);
  });

  test("empty hand: the discard is skipped but you still draw 1 (422.4) — 0 → 1 cards, nothing in the trash", async () => {
    const game = await board().build();
    expect(game.p1.hand()).toEqual([]);
    await game.p1.move("raider", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p1.hand()).toEqual(["top"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.points()).toBe(1);
  });

  test("the draw from an EMPTY deck burns P1 out: the discarded card is recycled with the trash, P2 gains 1 point, then P1 draws (431.2)", async () => {
    const game = await scenario()
      .fillDecks({ main: 0, runes: 12 })
      .battlefield("bf1", { controller: P2, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 3 }, "raider")
      .unit(P2, "bf1", { might: 1 }, "def")
      .deck(P2, [FILLER])
      .hand(P1, FILLER, "only")
      .trash(P1, FILLER, "old")
      .build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1); // the conquer
    expect(game.p2.points()).toBe(1); // the burn out
    expect(game.p1.trash()).toEqual([]); // recycled into the deck
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(1);
    expect([...game.p1.hand(), ...game.p1.deck()].sort()).toEqual(["old", "only"]);
  });

  test("partner — Flame Chompers discarded to the Warrens: P1 may pay [fury] to play it; paying puts it onto the board (base chosen) exhausted and spends the fury", async () => {
    const game = await board().hand(P1, FLAME_CHOMPERS, "chompers").hand(P1, FILLER, "keeper").resources(P1, { power: { fury: 1 } }).build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p1.pick("chompers");
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.p1.hand().sort()).toEqual(["keeper", "top"]); // the draw already happened
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("base");
      await game.settle();
    }
    expect(game.zoneOf("chompers")).toBe("base");
    expect(game.state("chompers").isExhausted).toBe(true);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("partner — Jinx, Rebel: the Warrens discard readies an exhausted Jinx and gives her +1 Might for this turn only", async () => {
    const game = await board().hand(P1, FILLER, "junk").hand(P1, FILLER, "keeper").unit(P1, "base", JINX_REBEL, "jinx", { exhausted: true }).build();
    expect(game.state("jinx")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.move("raider", "bf1");
    await game.settle();
    await game.p1.pick("junk");
    await game.settle();
    expect(game.state("jinx")).toMatchObject({ isReady: true, might: 6 });
    await game.advanceTurn();
    expect(game.state("jinx").might).toBe(5);
  });

  test("negative space — HOLDING the Warrens scores but rummages nothing: hand grows only by the draw-phase card, trash stays empty", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .hand(P1, FILLER, "h")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.hand()).toContain("h");
    expect(game.p1.trash()).toEqual([]);
  });

  test("negative space — conquering a DIFFERENT battlefield leaves the hand alone", async () => {
    const game = await board().hand(P1, FILLER, "junk").battlefield("bf2", { controller: P2 }).unit(P2, "bf2", { might: 1 }, "other").build();
    await game.p1.move("raider", "bf2");
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.hand()).toEqual(["junk"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("top");
  });

  test("P2 taking their Warrens back rummages P2's hand: P2 discards their card and draws; P1's hand untouched", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P2 })
      .unit(P2, "base", { might: 3 }, "raider")
      .unit(P1, "bf1", { might: 1 }, "def")
      .hand(P2, FILLER, "p2card")
      .hand(P1, FILLER, "p1card")
      .deckTop(P2, FILLER, "p2top")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle(); // single card → forced discard
    expect(game.p2.points()).toBe(1);
    expect(game.zoneOf("p2card")).toBe("trash");
    expect(game.p2.hand()).toEqual(["p2top"]);
    expect(game.p1.hand()).toEqual(["p1card"]);
  });
});
