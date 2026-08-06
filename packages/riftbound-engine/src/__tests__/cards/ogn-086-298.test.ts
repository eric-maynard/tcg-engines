/**
 * Jeweled Colossus — ogn-086-298 · Unit · Mind · 5 energy · 5 Might
 *
 *   [Vision] (When you play me, look at the top card of your Main Deck. You may recycle it.)
 *   [Shield] (+1 [Might] while I'm a defender.)
 *
 * Rules: 817 (Vision is a triggered "when this is played" look/recycle; one instance →
 * one trigger), 594 (recycle → bottom of deck), 814 (Shield), 142.4 (lethal ≥ Might).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-086-298";
const FILLER = "ogn-175-298";

function played() {
  return scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "col").deckTop(P1, FILLER, "top");
}

describe("Jeweled Colossus (ogn-086-298)", () => {
  test("costs 5 energy (no power); enters base exhausted; Vision trigger goes on the chain once", async () => {
    const game = await played().build();
    await game.p1.play("col");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.zoneOf("col")).toBe("base");
    expect(game.state("col").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "col", triggered: true })]);
    const poor = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "col").build();
    expect(poor.p1.can("play", "col")).toBe(false);
  });

  test("Vision: looks at the top card and may recycle it (→ bottom of the Main Deck)", async () => {
    const game = await played().build();
    expect(game.p1.deck()[0]).toBe("top");
    await game.p1.play("col");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, allowDecline: true, source: { cardId: "col" } });
    expect((game.decision() as { options: { key: string }[] }).options.map((o) => o.key)).toEqual(["top"]);
    await game.p1.pick("top");
    await game.settle();
    const deck = game.p1.deck();
    expect(deck[0]).not.toBe("top");
    expect(deck[deck.length - 1]).toBe("top");
    expect(game.decision()?.kind).toBe("action"); // exactly one Vision prompt
  });

  test("Vision: declining leaves the card on top; nothing is drawn", async () => {
    const game = await played().build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("col");
    await game.settle();
    await game.p1.decline();
    await game.settle();
    expect(game.p1.deck()[0]).toBe("top");
    expect(game.p1.hand()).toHaveLength(handBefore - 1);
    expect(game.decision()?.kind).toBe("action");
  });

  test("Vision only looks at YOUR deck: the opponent is never asked anything", async () => {
    const game = await played().deckTop(P2, FILLER, "theirTop").build();
    await game.p1.play("col");
    await game.settle();
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.decline();
    await game.settle();
    expect(game.p2.deck()[0]).toBe("theirTop");
  });

  test("Shield: defending against a 5-Might attacker it survives (6 Might) and kills the attacker", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "col")
      .unit(P2, "base", { might: 5 }, "foe")
      .build();
    expect(game.state("col").keywords).toEqual(expect.arrayContaining(["Vision", "Shield"]));
    await game.p2.move("foe", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("col")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("Shield does not apply while attacking: 5 into a 5-Might defender trades", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "col")
      .unit(P2, "bf1", { might: 5 }, "foe")
      .build();
    await game.p1.move("col", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("col")).toBe("trash");
  });
});
