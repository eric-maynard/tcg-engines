/**
 * The Candlelit Sanctum — ogn-291-298 · Battlefield · no domain · no cost
 *
 *   When you conquer here, look at the top two cards of your Main Deck. You may recycle one or
 *   both of them. Put those you don't back in any order.
 *
 * Rules: 469.1 (Conquer = gaining control of a battlefield you have not scored this turn), 471.2.a
 * (conquer abilities trigger at the battlefield conquered — a chain item), 190.6.d ("you"/"your Main
 * Deck" = the battlefield's controller, i.e. the conqueror), 594 (recycle → bottom of the Main Deck),
 * 416 (look: private to the looker), 471.1.b.1 (at Victory−1 a conquer without every battlefield
 * scored draws instead of scoring — the conquer, and so this trigger, still happens).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Three outcomes must all be expressible: recycle one (the other stays on top), recycle BOTH
 *     (third card becomes the top), recycle none but REORDER the two ("in any order").
 *  2. It is the CONQUEROR's deck: P2 taking P1-owned Sanctum in combat looks at P2's deck.
 *  3. Negative space: HOLDING the Sanctum does nothing; conquering a DIFFERENT battlefield does
 *     nothing; the opponent never sees the looked-at cards.
 *  4. Final-point interplay: at 7 points with another battlefield unscored, the conquer yields a
 *     draw (c1) instead of the point, and the look then sees c2/c3.
 *  5. Short deck: with one card left you look at just that one; nothing burns out.
 *  6. Combat conquer: the trigger only appears after combat resolves and control flips.
 */

import { describe, expect, test } from "bun:test";
import type { Decision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ogn-291-298";
const FILLER = "ogn-175-298"; // Shipyard Skulker — vanilla 3-Might unit

/** P1 walks a unit onto the empty, uncontrolled Sanctum; P1's deck is c1, c2, c3 (top first) + filler. */
function walkIn() {
  return scenario()
    .battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P1 })
    .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
    .deck(P1, [FILLER, FILLER, FILLER], ["c1", "c2", "c3"])
    .deck(P2, [FILLER, FILLER], ["d1", "d2"]);
}

const pickOptions = (d: Decision | null) => (d?.kind === "pick" ? d.options.map((o) => o.card) : []);

describe("The Candlelit Sanctum (ogn-291-298)", () => {
  test("registry payload: one triggered 'conquer (controller)' ability → look 2 from deck, then recycle-or-keep", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "The Candlelit Sanctum" });
    expect(def?.abilities).toEqual([
      {
        effect: { amount: 2, from: "deck", then: { recycle: "rest" }, type: "look" },
        trigger: { event: "conquer", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("conquering it (walk-in) scores 1 and puts the Sanctum's trigger on the chain; on resolution P1 is shown exactly the top two cards of P1's deck", async () => {
    const game = await walkIn().build();
    await game.p1.move("walker", "bf1");
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1, source: { cardId: "bf1" } });
    expect(pickOptions(d)).toEqual(["c1", "c2"]);
  });

  test("recycle one: the picked card goes to the BOTTOM of the deck (594), the other stays on top, nothing is drawn", async () => {
    const game = await walkIn().build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    await game.p1.pick("c1");
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.deck()[0]).toBe("c2");
    expect(game.p1.deck()[1]).toBe("c3");
    expect(game.p1.deck().at(-1)).toBe("c1");
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("recycle none: declining keeps both cards on top — the arrangement (386.2) may repeat their original order", async () => {
    const game = await walkIn().build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    await game.p1.decline();
    // rule 386.2 — "put those you don't back in any order": keeping both opens
    // the arrangement; answering with the order they were in is legal.
    expect(game.decision()?.kind).toBe("order");
    await game.p1.order(["c1", "c2"]);
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.deck().slice(0, 3)).toEqual(["c1", "c2", "c3"]);
    expect(game.p1.hand()).toEqual([]);
  });

  test("'one or both' — both looked-at cards can be recycled in one answer", async () => {
    // Expected: a 0..2 pick (or two successive prompts) so that c1 AND c2 end at the bottom and c3 becomes the top card.
    // Actual: the reveal-and-pick prompt has max 1 and a two-key answer is rejected.
    const game = await walkIn().build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    const d = game.decision();
    expect(d?.kind === "pick" ? d.max : 0).toBe(2);
    await game.p1.pick("c1", "c2");
    await game.settle();
    expect(game.p1.deck()[0]).toBe("c3");
    expect(game.p1.deck().slice(-2).sort()).toEqual(["c1", "c2"]);
  });

  test("'put those you don't back in any order' — keeping both lets P1 put c2 above c1", async () => {
    // Expected: after choosing to recycle neither, P1 arranges the two kept cards (deck-arrange / order prompt) → c2 can be made the top card.
    // Actual: declining the recycle ends the effect with the original order; no arrange step exists.
    const game = await walkIn().build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    let d = game.decision();
    if (d?.kind === "pick") {
      await game.p1.decline();
      d = game.decision();
    }
    expect(d?.kind === "deck-arrange" || d?.kind === "order").toBe(true);
    if (d?.kind === "deck-arrange") {
      await game.p1.answer({ kind: "deck-arrange", recycle: [], top: ["c2", "c1"] });
    } else if (d?.kind === "order") {
      await game.p1.order(["c2", "c1"]);
    }
    await game.settle();
    expect(game.p1.deck().slice(0, 3)).toEqual(["c2", "c1", "c3"]);
  });

  test("private information (416): while P1 is looking, P2's view of P1's deck shows only hidden cards", async () => {
    const game = await walkIn().build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    expect(game.decision()?.kind).toBe("pick");
    const seenByP2 = game.view(P2).zones.mainDeck?.filter((c) => c.owner === P1) ?? [];
    expect(seenByP2.length).toBeGreaterThan(0);
    expect(seenByP2.every((c) => "hidden" in c && c.hidden === true)).toBe(true);
  });

  test("controller ≠ owner: P2 conquering P1's Sanctum in combat (4 into a lone 1) scores and looks at the top two of P2's OWN deck", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bf1", { might: 1, name: "Weak" }, "weak")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .deck(P1, [FILLER, FILLER], ["c1", "c2"])
      .deck(P2, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"])
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([]); // nothing triggers before combat resolves
    await game.settle();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2 });
    expect(pickOptions(d)).toEqual(["d1", "d2"]);
    await game.p2.pick("d2");
    await game.settle();
    expect(game.p2.deck()[0]).toBe("d1");
    expect(game.p2.deck().at(-1)).toBe("d2");
    expect(game.p1.deck().slice(0, 2)).toEqual(["c1", "c2"]); // P1's deck untouched
  });

  test("negative space — HOLDING the Sanctum is not conquering it: hold point, no look prompt, deck untouched", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .deck(P1, [FILLER, FILLER, FILLER], ["c1", "c2", "c3"])
      .build();
    await game.p2.endTurn();
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).not.toBe("unanswered");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toEqual(["c1"]); // draw phase only
    expect(game.p1.deck().slice(0, 2)).toEqual(["c2", "c3"]);
  });

  test("'When you conquer HERE' does not fire when the Sanctum's controller conquers a DIFFERENT battlefield (471.2.a — only the conquered battlefield's abilities trigger)", async () => {
    // Expected: conquering plain bf2 scores 1 and opens no look prompt; P1's deck untouched.
    // Actual: the Sanctum (bf1, merely controlled by P1) puts its look-2 prompt up for the bf2 conquer.
    const game = await scenario()
      .battlefield("bf1", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "bf1", { might: 3 }, "keeper")
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 3 }, "walker")
      .deck(P1, [FILLER, FILLER, FILLER], ["c1", "c2", "c3"])
      .build();
    await game.p1.move("walker", "bf2");
    const r = await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(r.reason).not.toBe("unanswered");
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.deck().slice(0, 3)).toEqual(["c1", "c2", "c3"]);
  });

  test("final-point interplay (471.1.b.1): at 7 points with bf2 unscored the conquer draws c1 instead of scoring — and the Sanctum still triggers, now showing c2 and c3", async () => {
    const game = await walkIn().points(P1, 7).battlefield("bf2", { controller: P2 }).build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(7);
    expect(game.p1.hand()).toEqual(["c1"]);
    expect(game.isOver()).toBe(false);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "bf1" } });
    expect(pickOptions(d)).toEqual(["c2", "c3"]);
    await game.p1.pick("c3");
    await game.settle();
    expect(game.p1.deck()[0]).toBe("c2");
    expect(game.p1.deck().at(-1)).toBe("c3");
  });

  test("short deck: with a single card left P1 looks at just that card (may recycle it); no burn-out, no crash", async () => {
    const game = await scenario()
      .fillDecks(false)
      .battlefield("bf1", { controller: null, def: CARD, inert: false, owner: P1 })
      .unit(P1, "base", { might: 3 }, "walker")
      .deck(P1, [FILLER], ["only"])
      .build();
    await game.p1.move("walker", "bf1");
    await game.settle();
    const d = game.decision();
    expect(pickOptions(d)).toEqual(["only"]);
    await game.p1.pick("only");
    await game.settle();
    expect(game.p1.deck()).toEqual(["only"]);
    expect(game.p1.points()).toBe(1);
    expect(game.isOver()).toBe(false);
  });
});
