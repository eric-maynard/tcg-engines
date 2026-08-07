/**
 * Stellacorn Herder — sfd-048-221 · Unit · Calm · 4 energy · 3 might
 *
 *   When I move, draw 1.
 *
 * Head-judge notes (the tricky spots this file covers):
 *  1. ANY move of this unit triggers — base→battlefield, battlefield→base, and being moved by a
 *     spell (even an opponent's Charm): the trigger's controller (P1) draws (449, 383).
 *  2. A Recall is NOT a move (455–456.1): the attacker recall after a "no result" combat draws
 *     nothing.
 *  3. Moving several units together (one Standard Move) triggers once → exactly one card.
 *  4. Only "I": other friendly / enemy units moving draw nothing.
 *  5. Moving into an enemy battlefield: the trigger lands on the chain as the showdown opens and
 *     resolves (draw) before combat damage; a Herder that then dies still drew.
 *  6. Empty main deck when the trigger resolves → Burn Out (opponent gains 1 point), not a crash.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-048-221";
const CHARM = "ogn-043-298"; // Calm spell, 1 energy + [calm]: "Move an enemy unit."

function board() {
  return scenario()
    .battlefield("bf1", { controller: null })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "herder")
    .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
    .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe");
}

describe("Stellacorn Herder (sfd-048-221)", () => {
  test("parsed abilities: exactly one triggered ability — on self move, draw 1", async () => {
    const abilities = (await import("../../../../riftbound-cards/src/data/all-cards")).getAllCards().find((c) => c.id === CARD)?.abilities as unknown as Record<string, unknown>[];
    expect(abilities).toEqual([{ effect: { amount: 1, type: "draw" }, trigger: { event: "move", on: "self" }, type: "triggered" }]);
  });

  test("cost: 4 energy, no power; a 3-Might unit that enters exhausted; playing it is not a move (no draw); 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "herder").build();
    await game.p1.play("herder", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("herder")).toBe("base");
    expect(game.state("herder")).toMatchObject({ isExhausted: true, might: 3 });
    expect(game.p1.hand()).toHaveLength(0);
    const poor = await scenario().resources(P1, { energy: 3, power: { calm: 2 } }).hand(P1, CARD, "herder").build();
    expect(poor.p1.can("play", "herder")).toBe(false);
  });

  test("moving to an open battlefield puts the trigger on the chain; on resolution P1 draws exactly 1", async () => {
    const game = await board().build();
    const top = game.p1.deck()[0];
    await game.p1.move("herder", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herder", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(0); // not yet — it is a chain item, not instantaneous
    await game.settle();
    expect(game.p1.hand()).toEqual([top!]);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.locationOf("herder")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("moving from a battlefield back to base is also a move → draw 1", async () => {
    const game = await scenario().battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "herder").build();
    await game.p1.move("herder", "base");
    await game.settle();
    expect(game.locationOf("herder")).toBe("base");
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("a multi-unit Standard Move including the Herder triggers once (one card, not one per unit)", async () => {
    const game = await board().build();
    await game.p1.move(["herder", "buddy"], "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.units("bf1").sort()).toEqual(["buddy", "herder"]);
  });

  test("negative: another friendly unit moving, or an enemy unit moving, draws nothing", async () => {
    const game = await board().build();
    await game.p1.move("buddy", "bf1");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(0);
    await game.advanceTurn(); // P2's turn now (P2 drew its draw-phase card)
    const p2Hand = game.p2.hand().length;
    await game.p2.move("foe", "bf2");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p2.hand()).toHaveLength(p2Hand);
  });

  test("moving into an enemy-held battlefield: draws as the showdown opens, before combat — the Herder then dies to the 6-Might Wall but the card stays drawn", async () => {
    const game = await board().build();
    await game.p1.move("herder", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "herder", triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(1); // drawn while the Herder is still alive at bf2
    expect(game.locationOf("herder")).toBe("bf2");
    await game.settle();
    expect(game.zoneOf("herder")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("a Recall is not a move (456.1): surviving a no-result combat and being recalled to base draws nothing extra", async () => {
    const game = await scenario()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall", { stunned: true }) // deals no combat damage
      .unit(P1, "base", CARD, "herder")
      .build();
    await game.p1.move("herder", "bf2");
    await game.settle();
    expect(game.locationOf("wall")).toBe("bf2");
    expect(game.locationOf("herder")).toBe("base"); // recalled
    expect(game.p1.hand()).toHaveLength(1); // only the draw from moving IN
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
  });

  test("being moved by the OPPONENT's spell (Charm) is still 'I move': the Herder's controller draws, the caster does not", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1, power: { calm: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "herder")
      .hand(P2, CHARM, "charm")
      .build();
    await game.p2.cast("charm", { targets: "herder" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p2.pick("battlefield-bf1");
    }
    await game.settle();
    expect(game.locationOf("herder")).toBe("bf1");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("the draw happens per move: out to bf1 this turn, back to base next turn → 2 cards over two of P1's turns", async () => {
    const game = await board().build();
    await game.p1.move("herder", "bf1");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (draw phase +1)
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.state("herder").isReady).toBe(true);
    await game.p1.move("herder", "base");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(3);
  });

  test("empty Main Deck when the trigger resolves → Burn Out (431.2): trash recycled into the deck, opponent scores 1, then the draw completes", async () => {
    const game = await scenario()
      .fillDecks(false)
      .runeDeck(P1, ["ogn-042-298", "ogn-042-298"])
      .trash(P1, "ogn-175-298", "spent")
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "herder")
      .build();
    expect(game.p1.deck()).toHaveLength(0);
    await game.p1.move("herder", "bf1");
    await game.settle();
    expect(game.p2.points()).toBe(1);
    expect(game.p1.hand()).toEqual(["spent"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
