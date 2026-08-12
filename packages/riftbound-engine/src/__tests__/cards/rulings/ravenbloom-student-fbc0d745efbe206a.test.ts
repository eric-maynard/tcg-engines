/**
 * Ruling fbc0d745efbe206a — Ravenbloom Student (OGN-103 → ogn-103-298) · Unit · Mind · [2] · 2 Might
 *     "When you play a spell, give me +1 [Might] this turn."
 *   × Fox-Fire (OGN-256 → ogn-256-298) · [Hidden] [Action] · "Kill any number of units at a battlefield with
 *     total Might 4 or less." (played from hidden naming nothing — 355.13 — so only the PLAY itself matters)
 *
 * Q: With a Ravenbloom Student at a battlefield, does hiding a card there buff her, or only when the hidden
 *    spell is later played (flipped up)?
 * A: Only when it is PLAYED. Hiding — paying [rainbow] to put the card facedown — is its own action and is not
 *    playing the spell, so nothing triggers. Flipping it up on a later turn IS playing a spell and does buff her.
 * Rules: 421 (Hide is an action that puts a card facedown; it does not play it), 811.1.c.3 (playing from hidden
 *        is playing the card), 383.4 ("when you play a spell" triggers on the play).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RAVENBLOOM_STUDENT = "ogn-103-298";
const FOX_FIRE = "ogn-256-298";

/** P1's turn. P1 controls bf1 with the Student standing there alone; Fox-Fire is the card to hide. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
    .hand(P1, FOX_FIRE, "foxfire")
    .resources(P1, { power: { mind: 1 } });
}

describe("Ruling fbc0d745efbe206a — hiding a spell does not trigger Ravenbloom Student; playing it from hidden does", () => {
  test("ruling: paying [rainbow] to hide Fox-Fire at her battlefield leaves the Student on 2 Might and puts nothing on the chain", async () => {
    const game = await board().build();
    expect(game.state("student").might).toBe(2);
    await game.p1.hide("foxfire", "bf1");
    expect(game.zoneOf("foxfire")).toBe("facedown-bf1");
    expect(game.chain()).toEqual([]);
    expect(game.state("student").might).toBe(2); // no "+1 this turn"
    expect(game.violations()).toEqual([]);
  });

  test("nor does hiding it later in the same turn ever catch up — the buff simply never happened", async () => {
    const game = await board().build();
    await game.p1.hide("foxfire", "bf1");
    await game.settle();
    expect(game.state("student").might).toBe(2);
    expect(game.state("student").mightModifier).toBe(0);
  });

  test("ruling: flipping the hidden Fox-Fire up on a later turn IS playing a spell — the Student gets +1 this turn", async () => {
    const game = await scenario()
      .turn(4)
      .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
        .facedown(P1, "bf1", FOX_FIRE, "foxfire")
      .build();
    expect(game.state("student").might).toBe(2);
    await game.p1.reveal("foxfire");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "foxfire", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Fox-Fire resolves; the play trigger goes on the chain afterwards (419.4.a)
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "student", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("student").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("and that buff is only for the turn: the Student is 2 Might again next turn", async () => {
    const game = await scenario()
      .turn(4)
      .battlefield("bf1", { controller: P1 })
        .unit(P1, "bf1", RAVENBLOOM_STUDENT, "student")
        .facedown(P1, "bf1", FOX_FIRE, "foxfire")
      .build();
    await game.p1.reveal("foxfire");
    await game.settle();
    expect(game.state("student").might).toBe(3);
    await game.advanceTurn();
    expect(game.state("student").might).toBe(2);
  });
});
