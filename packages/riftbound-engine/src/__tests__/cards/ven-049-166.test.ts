/**
 * Dredge Up — ven-049-166 · Spell · Mind · 2 energy · (no Action/Reaction → standard timing)
 *
 *   Draw 1.
 *   [Flow] [2] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Flow (829) is an ALTERNATE cost paid from the trash (829.1.c.1) — here it happens to equal the
 *     base cost, so both plays cost exactly 2 energy; 1 energy affords neither.
 *  2. Where it ends up: cast from HAND it goes to the trash (and is then Flow-able); cast from TRASH
 *     the delayed replacement banishes it as it leaves the chain (829.1.b.1) — banished, never trash,
 *     so a card is Flowed at most once. Hand → trash → Flow → banishment is 2 cards for 4 energy.
 *  3. Countered while Flowed: it still "leaves the chain after becoming finalized" → banished, not
 *     trashed (829.1.b.1), and no card is drawn.
 *  4. Timing is unchanged by Flow (829.1.b.2): no [Action]/[Reaction], so from hand OR trash it is
 *     only playable in your own open main phase — not on the opponent's turn, not onto a chain.
 *  5. Only YOUR trash: an opponent cannot Flow your Dredge Up, and you cannot Flow theirs.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-049-166";
const WIND_WALL = "ogn-064-298"; // Reaction · 3 + [calm][calm] · Counter a spell.
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.

describe("Dredge Up (ven-049-166)", () => {
  test("registry: a 'draw 1' spell effect plus the Flow keyword costed at 2 energy", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "mind", energyCost: 2, timing: "standard" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({ effect: { amount: 1, type: "draw" }, type: "spell" });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { energy: 2 }, keyword: "Flow", type: "keyword" });
  });

  test("from hand: costs 2 energy, draws 1 on resolution (not on cast), and goes to the TRASH", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "du").deckTop(P1, "ogn-175-298", "topcard").build();
    await game.p1.cast("du");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "du", controller: P1, triggered: false })]);
    expect(game.p1.hand()).toEqual([]); // nothing drawn until it resolves
    await game.settle();
    expect(game.p1.hand()).toEqual(["topcard"]);
    expect(game.zoneOf("du")).toBe("trash");
    expect(game.p1.banishment()).toEqual([]);
  });

  test("cost negative space: 1 energy cannot cast it from hand, and cannot Flow it from trash", async () => {
    const hand = await scenario().resources(P1, { energy: 1, power: { mind: 3 } }).hand(P1, CARD, "du").build();
    expect(hand.p1.can("cast", "du")).toBe(false);
    const trash = await scenario().resources(P1, { energy: 1, power: { mind: 3 } }).trash(P1, CARD, "du").build();
    expect(trash.p1.can("cast", "du")).toBe(false);
    const r = await trash.p1.try((p) => p.cast("du", { flow: true }));
    expect(r.ok).toBe(false);
    expect(trash.zoneOf("du")).toBe("trash");
  });

  test("Flow: from the trash for exactly 2 energy → draws 1, then it is BANISHED (not back to trash)", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).trash(P1, CARD, "du").deckTop(P1, "ogn-175-298", "topcard").build();
    expect(game.p1.option("cast", "du")?.fields).toEqual([expect.objectContaining({ arg: "flow", options: [true] })]);
    await game.p1.cast("du", { flow: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("du")).toBe("chain");
    await game.settle();
    expect(game.p1.hand()).toEqual(["topcard"]);
    expect(game.zoneOf("du")).toBe("banishment");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.can("cast", "du")).toBe(false); // banished: no third use
  });

  test("full loop in one turn: hand (2) → trash → Flow (2) → banishment = 2 cards for 4 energy, then nothing left to play", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "du").build();
    await game.p1.cast("du");
    await game.settle();
    expect(game.zoneOf("du")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    await game.p1.cast("du", { flow: true });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.zoneOf("du")).toBe("banishment");
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.legal().some((o) => o.card === "du")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("standard timing from hand: not castable on the opponent's turn, nor as a response with a chain open on your own turn", async () => {
    const oppTurn = await scenario().active(P2).resources(P1, { energy: 2 }).hand(P1, CARD, "du").build();
    expect(oppTurn.p1.can("cast", "du")).toBe(false);

    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, DISCIPLINE, "disc")
      .hand(P1, CARD, "du")
      .build();
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("cast", "du")).toBe(false); // closed state: only Action/Reaction may respond
    await game.settle();
    expect(game.p1.can("cast", "du")).toBe(true); // open again
  });

  test("Flow does not change timing (829.1.b.2): from the trash it is likewise illegal on the opponent's turn and during a chain", async () => {
    const oppTurn = await scenario().active(P2).resources(P1, { energy: 2 }).trash(P1, CARD, "du").build();
    expect(oppTurn.p1.can("cast", "du")).toBe(false);

    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, DISCIPLINE, "disc")
      .trash(P1, CARD, "du")
      .build();
    await game.p1.cast("disc", { targets: "ally" });
    expect(game.p1.can("cast", "du")).toBe(false);
  });

  test("only YOUR trash: the opponent cannot Flow a Dredge Up sitting in your trash on their turn", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 4 }).trash(P1, CARD, "du").build();
    expect(game.p2.can("cast", "du")).toBe(false);
    expect(game.p2.legal().some((o) => o.card === "du")).toBe(false);
  });

  test("countered from hand: no draw, and it lands in the trash (still Flow-able later)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .hand(P1, CARD, "du")
      .hand(P2, WIND_WALL, "wall")
      .build();
    await game.p1.cast("du");
    await game.p1.passPriority();
    await game.p2.cast("wall");
    expect(game.chain().map((i) => i.cardId)).toEqual(["du", "wall"]);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("du")).toBe("trash");
    // …and the trash copy can now be Flowed for the remaining 2 energy.
    expect(game.p1.can("cast", "du")).toBe(true);
    await game.p1.cast("du", { flow: true });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.zoneOf("du")).toBe("banishment");
  });

  test("countered while Flowed (829.1.b.1): no draw, and it is still BANISHED rather than returned to the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .trash(P1, CARD, "du")
      .hand(P2, WIND_WALL, "wall")
      .build();
    await game.p1.cast("du", { flow: true });
    await game.p1.passPriority();
    await game.p2.cast("wall");
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("du")).toBe("banishment");
    expect(game.p1.can("cast", "du")).toBe(false);
  });
});
