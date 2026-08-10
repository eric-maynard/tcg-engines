/**
 * Ruling a121d543e5f0e0f6 — Baited Hook (OGN-242 → ogn-242-298) · Gear · Order · [3]
 *     "[1][order], [Exhaust]: Kill a friendly unit. Look at the top 5 cards of your Main Deck. You may banish a unit
 *      from among them that has Might up to 1 more than the killed unit and play it, ignoring its cost. Then recycle
 *      the rest."
 *   × Harnessed Dragon (OGN-234 → ogn-234-298) · Unit · [8][order][order] · 6 · "When you play me, kill an enemy unit."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction · "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *
 * Q: Can I exhaust Baited Hook with NO friendly unit on board just to look at / recycle 5 cards?
 * A: No. An activated ability needs all its targets to be legal to be put on the chain; "Kill a friendly unit" targets,
 *    so with no friendly unit the activation is reverted and never enters the chain (do-as-much-as-you-can only applies
 *    on resolution). Contrast: Harnessed Dragon can be PLAYED with no enemy unit — the card itself has no target; only
 *    its trigger does. And if the Hook's target is removed in response (Gust), the ability still resolves: look at 5,
 *    no unit can be played (no Might to compare to), recycle them.
 * Rules: 355.6–355.8 (targets chosen/required at finalization), 359.3.e (DAMAYC at resolution), 376 (triggered
 *        ability with no legal target simply isn't added).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const BAITED_HOOK = "ogn-242-298";
const HARNESSED_DRAGON = "ogn-234-298";
const GUST = "ogn-169-298";
const THREE = { cardType: "unit", energyCost: 3, might: 3, name: "Three" } as const;
const ONE = { cardType: "unit", energyCost: 1, might: 1, name: "One" } as const;
const LOOKED_AT = ["c1", "c2", "c3", "c4", "c5"];

/** P1's turn. Baited Hook in base with exactly [1][order]; P1 controls NO unit. Deck top-5 known. P2 has a unit (irrelevant: not friendly). */
function emptyBoard() {
  return scenario()
    .resources(P1, { energy: 1, power: { order: 1 } })
    .battlefield("bf1", { controller: null })
    .gear(P1, BAITED_HOOK, "hook")
    .unit(P2, "base", { might: 2, name: "Onlooker" }, "onlooker")
    .deck(P1, [THREE, ONE, THREE, ONE, THREE, ONE], [...LOOKED_AT, "sixth"]);
}

describe("Ruling a121d543e5f0e0f6 — Baited Hook cannot be activated without a friendly unit to kill", () => {
  test("with no friendly unit on board the Hook's ability is not a legal action at all; forcing it fails and nothing is paid, exhausted, looked at or recycled", async () => {
    const game = await emptyBoard().build();
    expect(game.p1.units()).toEqual([]);
    expect(game.p1.can("activate", "hook")).toBe(false);
    expect(game.p1.legal().some((o) => o.moveId === "activateAbility" && o.card === "hook")).toBe(false);
    const deckBefore = game.p1.deck();
    const r = await game.p1.try((p) => p.activate("hook", 0));
    expect(r.ok).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { order: 1 } });
    expect(game.state("hook").isExhausted).toBe(false);
    expect(game.p1.deck()).toEqual(deckBefore); // no look / recycle happened
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.banishment()).toEqual([]);
  });

  test("the moment P1 does control a unit the very same activation becomes legal and goes on the chain (cost paid, Hook exhausted)", async () => {
    const game = await emptyBoard().unit(P1, "base", { might: 2, name: "Bait" }, "bait").build();
    expect(game.p1.can("activate", "hook")).toBe(true);
    await game.p1.activate("hook");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.state("hook").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", controller: P1 })]);
  });

  test("contrast — Harnessed Dragon with NO enemy unit anywhere: the card is playable (it has no target itself); it resolves onto the board and its 'kill an enemy unit' trigger simply has nothing to do", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 2 } })
      .battlefield("bf1", { controller: null })
      .hand(P1, HARNESSED_DRAGON, "dragon")
      .build();
    expect(game.p2.units()).toEqual([]);
    expect(game.p1.can("play", "dragon")).toBe(true);
    await game.p1.play("dragon");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance — target removed in response: Hook targets the 2-Might Bait at bf1, P2 Gusts it to hand; the ability still resolves (look at 5, recycle them) but the Bait is not killed and no unit is played", async () => {
    const game = await emptyBoard()
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Bait" }, "bait")
      .resources(P2, { energy: 1 })
      .hand(P2, GUST, "gust")
      .build();
    await game.p1.activate("hook");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hook", controller: P1 })]);
    await game.p1.passPriority();
    await game.p2.cast("gust", { targets: "bait" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves first
    expect(game.zoneOf("bait")).toBe("hand");
    expect(game.chain().map((c) => c.cardId)).toEqual(["hook"]);
    const stop = await game.settle();
    if (stop.reason === "unanswered") {
      const d = game.decision();
      expect(d).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
      const offered = d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
      for (const c of LOOKED_AT) {
        expect(offered).not.toContain(c);
      }
      await game.p1.decline();
      await game.settle();
    }
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bait")).toBe("hand"); // not killed
    expect(game.p1.trash()).not.toContain("bait");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p1.units()).toEqual([]); // nothing played
    const deck = game.p1.deck();
    expect(deck[0]).toBe("sixth"); // the five looked-at cards were recycled to the bottom
    expect(deck.slice(-5).toSorted()).toEqual([...LOOKED_AT].toSorted());
  });
});
