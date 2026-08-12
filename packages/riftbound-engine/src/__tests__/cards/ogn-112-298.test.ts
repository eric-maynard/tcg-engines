/**
 * Kai'Sa, Evolutionary — ogn-112-298 · Unit (Champion, Kai'Sa) · Mind · 6 energy + 1 mind · 6 Might
 *
 *   [Ganking] (I can move from battlefield to battlefield.)
 *   When I conquer, you may play a spell from your trash with Energy cost less
 *   than your points without paying its Energy cost. Then recycle it.
 *   (You must still pay its Power cost.)
 *
 * Rules: 810 / 144.4.c (Ganking lets the Standard Move go battlefield → battlefield),
 * 466.5.d + 469.1 (conquer), 206 (printed cost is what "Energy cost" checks), 594 (recycle).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-112-298";
const DISCIPLINE = "ogn-058-298"; // 2 energy: give a unit +2 Might this turn, draw 1
const FIND_YOUR_CENTER = "ogn-047-298"; // 3 energy: draw 1, channel 1 rune exhausted

function conquerBoard(points: number) {
  return scenario()
    .points(P1, points)
    .resources(P1, { energy: 0 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", CARD, "kaisa")
    .unit(P2, "bf1", { might: 1 }, "foe")
    .trash(P1, DISCIPLINE, "disc")
    .trash(P1, FIND_YOUR_CENTER, "fyc");
}

describe("Kai'Sa, Evolutionary (ogn-112-298)", () => {
  test("Ganking: from a battlefield she may move to another battlefield; a unit without Ganking may not", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", CARD, "kaisa")
      .unit(P1, "bf1", { might: 2 }, "plain")
      .build();
    expect(game.state("kaisa").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "kaisa")).toBe(true);
    expect(game.p1.can("gank", "plain")).toBe(false);
    expect(game.p1.option("move")?.key).toBe("standardMove:to:base"); // the only standard destination from bf1
    await game.p1.gank("kaisa", "bf2");
    await game.settle();
    expect(game.locationOf("kaisa")).toBe("bf2");
    expect(game.state("kaisa").isExhausted).toBe(true);
    expect(game.locationOf("plain")).toBe("bf1");
  });

  test("cost: 6 energy + 1 mind deducted; not playable without the mind power or with 5 energy", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { mind: 1 } }).hand(P1, CARD, "kaisa").build();
    await game.p1.play("kaisa");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0 } });
    expect(game.zoneOf("kaisa")).toBe("base");
    const noMind = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "kaisa").build();
    expect(noMind.p1.can("play", "kaisa")).toBe(false);
    const low = await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).hand(P1, CARD, "kaisa").build();
    expect(low.p1.can("play", "kaisa")).toBe(false);
  });

  test("When I conquer: the optional trigger is offered to her controller; declining leaves the trash untouched", async () => {
    const game = await conquerBoard(3).build();
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(4);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "kaisa" } });
    await game.p1.no();
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.zoneOf("disc")).toBe("trash");
    expect(game.zoneOf("fyc")).toBe("trash");
  });

  test("accepting lets you play a trash spell with Energy cost < points for free, and it is recycled afterwards", async () => {
    // With 2 points → 3 after the conquer: Discipline (2) qualifies, Find Your Center (3) does not.
    // Expected: pick among eligible trash spells → Discipline is played (0 energy spent) targeting Kai'Sa
    // (+2 Might, draw 1) and then goes to the bottom of the main deck instead of the trash.
    // Actual: after answering "yes" nothing further happens — the play-from-trash effect is unimplemented.
    const game = await conquerBoard(2).build();
    const handBefore = game.p1.hand().length;
    await game.p1.move("kaisa", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(3);
    await game.p1.yes();
    // rule 355.10.a / 383.3.b — the trash is a PUBLIC zone, so the spell is a
    // TARGET named as the trigger is FINALIZED; Discipline is the only eligible
    // one, and a sole legal option is a one-click confirm (355.10.d.2).
    expect(game.chain()[0]?.targets).toEqual(["disc"]);
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("kaisa"); // Discipline's target
      await game.settle();
    }
    expect(game.p1.energy()).toBe(0);
    expect(game.state("kaisa").might).toBe(8);
    expect(game.p1.hand()).toHaveLength(handBefore + 1);
    const deck = game.p1.deck();
    expect(deck[deck.length - 1]).toBe("disc");
    expect(game.zoneOf("fyc")).toBe("trash");
  });
});
