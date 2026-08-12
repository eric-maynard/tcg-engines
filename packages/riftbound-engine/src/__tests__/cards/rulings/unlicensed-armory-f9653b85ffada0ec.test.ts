/**
 * Ruling f9653b85ffada0ec — Unlicensed Armory (OGN-023 → ogn-023-298) · Gear [2]
 *   "Discard 1, [Exhaust]: Choose a friendly unit. The next time it would die this turn, you may pay [fury] to
 *    heal it, exhaust it, and recall it instead."
 *
 * Q: Can I activate Unlicensed Armory at any point in my turn, or must it be set up before combat starts?
 * A: It is a plain activated ability (no [Action]/[Reaction]): only during YOUR Main Phase in an OPEN state,
 *    and never once a showdown/combat has begun. It also needs a legal friendly unit AND a card to discard.
 * Rules: 145.2 (activated abilities: your Main Phase, Open state), 310 (Open/Closed), FAQ #8278 / #362 / #3642.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ARMORY = "ogn-023-298";

/** P1's turn. Armory ready, a friendly unit at bf1, a spare card to discard, and a [fury] for the save. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, ARMORY, "armory")
    .unit(P1, "bf1", { might: 3, name: "Ward" }, "ward")
    .hand(P1, { cardType: "spell", energyCost: 1, name: "Chaff" }, "chaff")
    .unit(P2, "base", { might: 6, name: "Bruiser" }, "bruiser");
}

describe("Ruling f9653b85ffada0ec — Unlicensed Armory only fires in your own OPEN Main Phase, never in a showdown", () => {
  test("premise: it needs a card in hand to discard — with an empty hand it is not activatable", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .gear(P1, ARMORY, "armory")
      .unit(P1, "bf1", { might: 3, name: "Ward" }, "ward")
      .build();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.can("activate", "armory")).toBe(false);
  });

  test("in P1's own OPEN Main Phase it works: the card is discarded, the Armory exhausts, and the shield is set", async () => {
    const game = await board().build();
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("activate", "armory")).toBe(true);
    await game.p1.activate("armory", 0, { discard: "chaff", targets: "ward" });
    await game.settle();
    expect(game.zoneOf("chaff")).toBe("trash");
    expect(game.state("armory").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("with a chain open (Closed state) on P1's own turn it is NOT available", async () => {
    const game = await board()
      .hand(P1, { abilities: [{ effect: { amount: 1, type: "draw" }, type: "spell" }], cardType: "spell", domain: "fury", energyCost: 1, name: "Study" }, "study")
      .build();
    await game.p1.cast("study");
    expect(game.chain()).toHaveLength(1);
    expect(game.p1.can("activate", "armory")).toBe(false);
    const r = await game.p1.try((p) => p.activate("armory", 0, { discard: "chaff", targets: "ward" }));
    expect(r.ok).toBe(false);
    expect(game.state("armory").isExhausted).toBe(false);
  });

  test("once a showdown has begun it is unavailable — you must have set it up BEFORE combat", async () => {
    const game = await board().active(P2).build();
    await game.p2.move("bruiser", "bf1");
    expect(game.state("ward").combatRole).toBe("defender");
    expect(game.p1.can("activate", "armory")).toBe(false);
    const r = await game.p1.try((p) => p.activate("armory", 0, { discard: "chaff", targets: "ward" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("chaff")).toBe("hand");
  });

  test("set up BEFORE combat in the same turn, the shield does its job: the Ward is recalled instead of dying", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf2", { controller: P2 })
      .gear(P1, ARMORY, "armory")
      .unit(P1, "base", { might: 3, name: "Ward" }, "ward")
      .hand(P1, { cardType: "spell", energyCost: 1, name: "Chaff" }, "chaff")
      .unit(P2, "bf2", { might: 6, name: "Wall" }, "wall")
      .build();
    await game.p1.activate("armory", 0, { discard: "chaff", targets: "ward" });
    await game.settle();
    await game.p1.move("ward", "bf2"); // 3 into a 6 — lethal without the shield
    await game.settle();
    if (game.decision()?.kind === "yes-no") await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("ward")).toBe("base"); // recalled, not trashed
    expect(game.state("ward")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.violations()).toEqual([]);
  });
});
