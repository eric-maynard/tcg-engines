/**
 * Ruling ef7d2a2df398059f — Daughter of the Void (OGN-247 → ogn-247-298, the Kai'Sa LEGEND)
 *   "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells."
 *   × Fox-Fire (OGN-256 → ogn-256-298) · [Hidden] · [Action] · [3] "Kill any number of units at a
 *     battlefield with total Might 4 or less."
 *
 * Q: What do you pay to hide a card facedown, and what do you pay when you later play it from hidden?
 * A: Hiding costs 1 Power of ANY domain — not the card's Energy cost. Playing it later out of the hidden
 *    zone costs nothing at all. (Playing the same card straight from hand instead would cost its printed
 *    Energy cost.)
 * Rules: 811 ([Hidden]: hide for [rainbow], react later for [0]), 205 (Power is paid by recycling runes or
 *        by [Add] abilities), 355 (playing from hand pays the printed cost).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const KAISA = "ogn-247-298";
const FOX_FIRE = "ogn-256-298";

describe("Ruling ef7d2a2df398059f — hiding costs 1 Power of any domain; playing from hidden costs nothing", () => {
  test("ruling: hiding Fox-Fire ([3] printed) costs exactly 1 Power and no Energy", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .legend(P1, KAISA, "kaisa")
      .hand(P1, FOX_FIRE, "fox")
      .build();
    expect(game.state("fox").energyCost).toBe(3);
    expect(game.p1.can("hide", "fox")).toBe(true); // affordable with 0 energy — the [3] is irrelevant
    await game.p1.hide("fox", "bf1");
    expect(game.zoneOf("fox")).toBe("facedown-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.violations()).toEqual([]);
  });

  test("any domain pays it: the same hide works off a [calm] Power just as well", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { calm: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .hand(P1, FOX_FIRE, "fox")
      .build();
    await game.p1.hide("fox", "bf1");
    expect(game.zoneOf("fox")).toBe("facedown-bf1");
    expect(game.p1.power("calm")).toBe(0);
  });

  test("with no Power at all the card cannot be hidden — the 1 Power really is the cost", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .hand(P1, FOX_FIRE, "fox")
      .build();
    expect(game.p1.can("hide", "fox")).toBe(false);
    const attempt = await game.p1.try((p) => p.hide("fox", "bf1"));
    expect(attempt.ok).toBe(false);
    expect(game.zoneOf("fox")).toBe("hand");
    expect(game.p1.energy()).toBe(9); // its Energy cost was never in play
  });

  test("ruling: playing the card back out of hidden costs NOTHING — no Energy, no Power", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .legend(P1, KAISA, "kaisa")
      .facedown(P1, "bf1", FOX_FIRE, "fox")
      .build();
    expect(game.p1.can("reveal", "fox")).toBe(true);
    await game.p1.reveal("fox");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // untouched
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fox", controller: P1 })]);
    await game.settle();
    expect(game.zoneOf("fox")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("contrast: playing the very same card from HAND costs its printed [3] instead", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .hand(P1, FOX_FIRE, "fox")
      .build();
    await game.p1.cast("fox", { targets: ["foe"] });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
  });

  test("the Kai'Sa legend's [Add] provides Power for spells, but it is exhausting it — not the card's cost — that pays", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
      .legend(P1, KAISA, "kaisa")
      .hand(P1, FOX_FIRE, "fox")
      .build();
    expect(game.p1.power("rainbow")).toBe(0);
    await game.p1.activate("kaisa");
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("kaisa").isExhausted).toBe(true);
  });
});
