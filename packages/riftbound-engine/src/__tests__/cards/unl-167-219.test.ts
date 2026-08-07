/**
 * Starhound — unl-167-219 · Unit · Order · 5 energy · 6 [Might]
 *
 *   When you play me, return a Bird, Cat, Dog, or Poro from your trash to
 *   your hand.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "unl-167-219";
const DARING_PORO = "ogn-210-298"; // tags: ["Poro"]

describe("Starhound (unl-167-219)", () => {
  // rule 355.8 — "a Bird, Cat, Dog, or Poro" is a disjunction of tags; a card
  // carrying any ONE of them is a legal choice.
  test("returns a Poro from trash to hand when played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .trash(P1, DARING_PORO, "poro")
      .hand(P1, CARD, "starhound")
      .build();

    await game.p1.play("starhound", { to: "base" });
    await game.settle();

    expect(game.zoneOf("poro")).toBe("hand");
  });

  test("leaves an untagged trash card alone", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 1 } })
      .trash(P1, { might: 2 }, "plain")
      .hand(P1, CARD, "starhound")
      .build();

    await game.p1.play("starhound", { to: "base" });
    await game.settle();

    expect(game.zoneOf("plain")).toBe("trash");
  });
});
