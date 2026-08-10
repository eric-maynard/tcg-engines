/**
 * Ruling c00549a6b4686d41 — Friendship (UNL-046 → unl-046-219) · Spell · Calm · 1 · [Reaction]
 *     "Choose a unit. Give it +1 [Might] this turn for each of the following tags among your units — Bird, Cat, Dog, and Poro."
 *   × Bird token (unl-t02) · 1 Might · [Deflect] · BIRD.  (+ Stalwart Poro ogn-052-298 · PORO; an inline CAT unit — no printed Cat/Dog
 *     unit exists in this pool.)
 *
 * Q: +1 per UNIT with a listed tag, or +1 per UNIQUE listed tag present among my units?
 * A: Per unique tag: with 3 Birds, 2 Poros and 1 Cat it is +3 (three tags present), not +6; the maximum is +4 with all four tags.
 * Rules: card text "for each of the following tags among your units" counts tags, not units.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FRIENDSHIP = "unl-046-219";
const BIRD = "unl-t02";
const STALWART_PORO = "ogn-052-298";
const CAT = { might: 2, name: "Test Cat", tags: ["Cat"] } as const;
const DOG = { might: 2, name: "Test Dog", tags: ["Dog"] } as const;

/** P1's turn: 3 Birds, 2 Poros, 1 Cat in P1's base plus a tagless 3-Might Target; Friendship + [1]. P2 has a Poro too (must not count). */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .unit(P1, "base", BIRD, "bird1")
    .unit(P1, "base", BIRD, "bird2")
    .unit(P1, "base", BIRD, "bird3")
    .unit(P1, "base", STALWART_PORO, "poro1")
    .unit(P1, "base", STALWART_PORO, "poro2")
    .unit(P1, "base", CAT, "cat")
    .unit(P1, "base", { might: 3, name: "Target" }, "target")
    .unit(P2, "base", STALWART_PORO, "theirPoro")
    .hand(P1, FRIENDSHIP, "fs");
}

describe("Ruling c00549a6b4686d41 — Friendship counts UNIQUE listed tags among your units, not units", () => {
  test("3 Birds + 2 Poros + 1 Cat = three distinct tags → the chosen unit gets exactly +3 this turn (3 → 6), not +6", async () => {
    const game = await board().build();
    expect(game.state("bird1")).toMatchObject({ isToken: true, might: 1 });
    await game.p1.cast("fs", { targets: "target" });
    await game.settle();
    expect(game.zoneOf("fs")).toBe("trash");
    expect(game.state("target")).toMatchObject({ might: 6, mightModifier: 3 });
    expect(game.violations()).toEqual([]);
  });

  test("multiple units sharing one tag add nothing beyond +1: three Birds alone → +1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", BIRD, "bird1")
      .unit(P1, "base", BIRD, "bird2")
      .unit(P1, "base", BIRD, "bird3")
      .unit(P1, "base", { might: 3, name: "Target" }, "target")
      .hand(P1, FRIENDSHIP, "fs")
      .build();
    await game.p1.cast("fs", { targets: "target" });
    await game.settle();
    expect(game.state("target")).toMatchObject({ might: 4, mightModifier: 1 });
  });

  test("maximum: one Bird, one Cat, one Dog and one Poro → +4", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", BIRD, "bird")
      .unit(P1, "base", CAT, "cat")
      .unit(P1, "base", DOG, "dog")
      .unit(P1, "base", STALWART_PORO, "poro")
      .unit(P1, "base", { might: 3, name: "Target" }, "target")
      .hand(P1, FRIENDSHIP, "fs")
      .build();
    await game.p1.cast("fs", { targets: "target" });
    await game.settle();
    expect(game.state("target")).toMatchObject({ might: 7, mightModifier: 4 });
  });

  test("only YOUR units count: with no tagged units of your own (the opponent's Poro doesn't help) Friendship gives +0; and the bonus lasts only this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 3, name: "Target" }, "target")
      .unit(P2, "base", STALWART_PORO, "theirPoro")
      .hand(P1, FRIENDSHIP, "fs")
      .build();
    await game.p1.cast("fs", { targets: "target" });
    await game.settle();
    expect(game.state("target")).toMatchObject({ might: 3, mightModifier: 0 });

    const full = await board().build();
    await full.p1.cast("fs", { targets: "target" });
    await full.settle();
    expect(full.state("target").might).toBe(6);
    await full.advanceTurn();
    expect(full.state("target")).toMatchObject({ might: 3, mightModifier: 0 });
  });
});
