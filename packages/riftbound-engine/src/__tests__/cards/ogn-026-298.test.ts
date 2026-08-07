/**
 * Brynhir Thundersong — ogn-026-298 · Unit · Fury · 6 energy · 5 Might
 *
 *   When you play me, opponents can't play cards this turn.
 *
 * The restriction is the effect of a "When you play me" triggered ability: it
 * applies once that trigger resolves and lasts until end of turn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-026-298";
const DISCIPLINE = "ogn-058-298"; // [Reaction] Give a unit +2 Might this turn. Draw 1. (2 energy)

function board(energy = 6) {
  return scenario()
    .resources(P1, { energy })
    .resources(P2, { energy: 4 })
    .unit(P2, "base", { might: 2 }, "foe")
    .hand(P2, DISCIPLINE, "react")
    .hand(P2, { cardType: "unit", energyCost: 1, might: 1, name: "Cheap Recruit" }, "recruit")
    .hand(P1, CARD, "bryn");
}

describe("Brynhir Thundersong (ogn-026-298)", () => {
  test("costs 6 energy, enters the base as a 5-Might unit; 5 energy is not enough", async () => {
    const game = await board().build();
    await game.p1.play("bryn");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("bryn")).toBe("base");
    expect(game.state("bryn").might).toBe(5);
    const poor = await board(5).build();
    expect(poor.p1.can("play", "bryn")).toBe(false);
  });

  test("control: without Brynhir the opponent may answer a spell with a Reaction", async () => {
    const game = await board(1).hand(P1, "ogn-004-298", "cleave").unit(P1, "base", { might: 2 }, "ally").build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.p1.passPriority(); // rule 312.1
    expect(game.p2.can("cast", "react")).toBe(true);
  });

  test("after she is played, opponents can't play a Reaction spell this turn", async () => {
    const game = await board(7).hand(P1, "ogn-004-298", "cleave").unit(P1, "base", { might: 2 }, "ally").build();
    await game.p1.play("bryn");
    await game.settle(); // play trigger resolves
    expect(game.zoneOf("bryn")).toBe("base");
    await game.p1.cast("cleave", { targets: "ally" }); // opens a chain, P2 gets priority
    expect(game.p2.can("cast", "react")).toBe(false);
    const t = await game.p2.try((p) => p.cast("react", { targets: "foe" }));
    expect(t.ok).toBe(false);
  });

  test("the opponent may still respond to the play trigger itself (restriction starts when it resolves)", async () => {
    const game = await board().build();
    await game.p1.play("bryn");
    // Brynhir resolves as a permanent; her trigger is now on the chain and P2 may react to it.
    expect(game.chain().some((i) => i.cardId === "bryn" && i.triggered)).toBe(true);
    await game.p1.passPriority();
    expect(game.p2.can("cast", "react")).toBe(true);
  });

  test("'this turn': on the opponent's next turn they can play cards again", async () => {
    const game = await board().build();
    await game.p1.play("bryn");
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRune(); // pools emptied at end of turn; pay for the recruit from a fresh rune
    expect(game.p2.can("play", "recruit")).toBe(true);
    await game.p2.play("recruit");
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("base");
  });

  test("the controller is not restricted — P1 can keep playing cards this turn", async () => {
    const game = await board(7).hand(P1, { cardType: "unit", energyCost: 1, might: 1, name: "Follower" }, "follower").build();
    await game.p1.play("bryn");
    await game.settle();
    expect(game.p1.can("play", "follower")).toBe(true);
  });
});
