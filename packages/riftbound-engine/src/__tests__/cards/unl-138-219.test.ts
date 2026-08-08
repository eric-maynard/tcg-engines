/**
 * The List — unl-138-219 · Gear · Chaos · 1 energy
 *
 *   As you play this, name a tag. (For example, Miss Fortune, Demacia, and
 *   Poro are tags.)
 *   [Exhaust]: Give a unit with the named tag -2 [Might] this turn.
 *
 * Rule 762: naming happens as the card is played and is recorded on the
 * card; the activated ability's "the named tag" filter reads it back.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-138-219";

function board() {
  return scenario()
    .resources(P1, { energy: 10 })
    .unit(P1, "base", { might: 4, tags: ["Poro"] }, "poro")
    .unit(P1, "base", { might: 4, tags: ["Yordle"] }, "yordle")
    .hand(P1, CARD, "list");
}

describe("The List (unl-138-219)", () => {
  test("playing it prompts the controller to name a tag", async () => {
    const game = await board().build();
    await game.p1.play("list");
    await game.settle();
    const decision = game.decision();
    expect(decision?.kind).toBe("name");
    await game.p1.pick("Poro");
    await game.settle();
    expect(game.state("list").meta.namedTag).toBe("Poro");
  });

  test("[Exhaust] gives a unit with the named tag -2 might this turn", async () => {
    const game = await board().build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.pick("Poro");
    await game.settle();
    await game.p1.activate("list", 1, { answers: ["poro"] });
    await game.settle();
    expect(game.state("list").isExhausted).toBe(true);
    expect(game.state("poro").might).toBe(2);
    expect(game.state("yordle").might).toBe(4);
  });

  test("only units carrying the named tag are affected", async () => {
    const game = await board().build();
    await game.p1.play("list");
    await game.settle();
    await game.p1.pick("Yordle");
    await game.settle();
    await game.p1.activate("list", 1, { answers: ["yordle"] });
    await game.settle();
    expect(game.state("yordle").might).toBe(2);
    expect(game.state("poro").might).toBe(4);
  });
});
