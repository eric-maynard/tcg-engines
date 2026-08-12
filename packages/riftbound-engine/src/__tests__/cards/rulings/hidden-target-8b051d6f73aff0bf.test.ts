/**
 * Ruling 8b051d6f73aff0bf — (general targeting of facedown cards)
 *   Stand-ins: Hidden Blade (OGN-213 → ogn-213-298) "[Hidden] [Action] Kill a unit at a battlefield. Its
 *   controller draws 2." (a UNIT-targeting spell) × Pack of Wonders (OGN-181 → ogn-181-298) "[Exhaust]: Return
 *   another friendly gear, unit, or facedown card to its owner's hand." (an effect that names facedown cards).
 *
 * Q: Can a spell that targets a unit or gear on the battlefield target a hidden (facedown) card?
 * A: No. A facedown card sits in a public zone and is publicly visible AS a facedown card, but it is not a unit
 *    and not gear for targeting purposes. Only an effect whose descriptor says "facedown card" (or "card") may
 *    name it.
 * Rules: 355.5 / 355.8 (a play offers only legal targets), 107.3 (Facedown Zone), 811.5.a (having [Hidden] is a
 *        characteristic of the card, independent of being facedown), 421.3 (facedown cards are public objects).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const PACK_OF_WONDERS = "ogn-181-298";

/** [Action] "Deal 2 to a unit." — a plain unit-targeting spell with no Hidden clause of its own. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Bolt",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

/** P1 holds bf1 (Sentry there) with a Hidden Blade facedown; P1 also has Pack of Wonders, a Bolt and a Blade in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 2, order: 2, rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "holder")
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .gear(P1, PACK_OF_WONDERS, "pack")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, BOLT, "bolt")
    .hand(P1, HIDDEN_BLADE, "blade2");
}

describe("Ruling 8b051d6f73aff0bf — a facedown card is not a unit or gear for targeting", () => {
  test("the facedown card really is there, in a public facedown zone at bf1", async () => {
    const game = await board().build();
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.p1.facedown("bf1")).toEqual(["blade"]);
  });

  test("a 'deal 2 to a unit' spell offers the units and NOT the facedown card", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "bolt")?.fields.find((f) => f.name === "targets");
    const options = (targets?.options ?? []).flat();
    expect(options).toContain("holder");
    expect(options).toContain("wall");
    expect(options).not.toContain("blade");
  });

  test("naming it anyway is refused — the play is illegal, not silently redirected", async () => {
    const game = await board().build();
    const res = await game.p1.try((p) => p.cast("bolt", { targets: "blade" }));
    expect(res.ok).toBe(false);
    expect(game.zoneOf("blade")).toBe("facedown-bf1");
    expect(game.zoneOf("bolt")).toBe("hand");
  });

  test("a 'kill a unit at a battlefield' spell is the same: units only", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "blade2")?.fields.find((f) => f.name === "targets");
    expect((targets?.options ?? []).flat()).not.toContain("blade");
  });

  test("an effect that DOES name facedown cards can target it — Pack of Wonders offers it alongside the unit and gear", async () => {
    const game = await board().build();
    const field = game.p1.option("activateAbility", "pack")?.fields.find((f) => f.name === "targets");
    const options = (field?.options ?? []).flat();
    expect(options).toContain("blade");
    expect(options).toContain("holder");
    await game.p1.activate("pack", 0, { targets: "blade" });
    await game.settle();
    expect(game.zoneOf("blade")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });
});
