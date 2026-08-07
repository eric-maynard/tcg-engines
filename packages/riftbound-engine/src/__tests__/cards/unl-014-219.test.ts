/**
 * Monster Harpoon — unl-014-219 · Spell · Fury · 1 energy · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 2 to a unit at a battlefield. If you control a facedown card, deal 4 to it instead.
 *
 * Rules: 355.8 (one caster-chosen unit AT A BATTLEFIELD either way),
 * 811.1 (a facedown card is a board object its hider controls) — "it" is the
 * damaged unit, so the clause only raises the amount.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "unl-014-219";
// A [Hidden] card to sit facedown.
const HIDEABLE = "sfd-111-221";

function board(withFacedown: boolean) {
  const b = scenario()
    .active(P1)
    .resources(P1, { energy: 3, power: { fury: 3 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P2, "bf1", { might: 6, name: "Foe" }, "foe")
    .unit(P2, "base", { might: 6, name: "Homebody" }, "home")
    .hand(P1, CARD, "harpoon");
  if (withFacedown) {
    b.facedown(P1, "bf1", HIDEABLE, "hidden");
  }
  return b;
}

describe("Monster Harpoon (unl-014-219)", () => {
  test("with no facedown card: deals 2 to a unit at a battlefield (base units are not offered)", async () => {
    const game = await board(false).build();
    const targets = game.p1
      .option("cast", "harpoon")
      ?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["foe"]]);
    await game.p1.cast("harpoon", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(2);
    expect(game.state("home").damage).toBe(0);
  });

  test("while you control a facedown card it deals 4 instead", async () => {
    const game = await board(true).build();
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
    await game.p1.cast("harpoon", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(4);
  });

  test("an ENEMY facedown card does not raise the damage", async () => {
    const game = await scenario()
      .active(P1)
      .resources(P1, { energy: 3, power: { fury: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 6, name: "Foe" }, "foe")
      .facedown(P2, "bf1", HIDEABLE, "theirs")
      .hand(P1, CARD, "harpoon")
      .build();
    await game.p1.cast("harpoon", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").damage).toBe(2);
  });
});
