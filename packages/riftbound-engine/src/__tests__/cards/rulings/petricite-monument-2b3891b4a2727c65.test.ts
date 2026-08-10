/**
 * Ruling 2b3891b4a2727c65 — Petricite Monument (SFD-104 → sfd-104-221) · Gear · Body · [2]
 *   "[Temporary] (Kill this at the start of its controller's Beginning Phase, before scoring.)
 *    Friendly units have [Deflect]."
 *
 * Q: Does the Deflect the Monument gives persist after the gear leaves play?
 * A: No. It is an ongoing aura: friendly units have Deflect only while the gear is on the board (including units that
 *    arrive after it was played); when the Monument goes to the trash the units lose Deflect. It is not "for the rest of
 *    the game" and not limited to units present when it was played.
 * Rules: 522 (static/continuous abilities apply while the source is in play), 809 (Deflect), 816 (Temporary).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const MONUMENT = "sfd-104-221";
const SKULKER = "ogn-175-298"; // vanilla 3-cost 3-Might unit
/** Inline "[Action] Kill a gear." — a generic gear-removal spell for the opponent. */
const SMASH = {
  abilities: [{ effect: { target: { type: "gear" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Smash (inline)",
  rulesText: "[Action] Kill a gear.",
  timing: "action",
} as const;
/** Inline "[Action] Deal 2 to a unit." — something for P2 to aim at P1's units. */
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Bolt (inline)",
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

const hasDeflect = (game: { state: (c: string) => { keywords: readonly string[] } }, card: string) => game.state(card).keywords.includes("Deflect");

describe("Ruling 2b3891b4a2727c65 — Petricite Monument's Deflect is an aura that ends when the gear leaves play", () => {
  test("while the Monument is on the board every friendly unit has Deflect — including a Skulker played AFTER the Monument — and enemy units do not", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .unit(P1, "base", { might: 2, name: "Veteran" }, "veteran")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, MONUMENT, "mon")
      .hand(P1, SKULKER, "newcomer")
      .build();
    expect(hasDeflect(game, "veteran")).toBe(false);
    await game.p1.play("mon");
    expect(game.zoneOf("mon")).toBe("base");
    expect(hasDeflect(game, "veteran")).toBe(true);
    await game.p1.play("newcomer");
    await game.settle();
    expect(game.zoneOf("newcomer")).toBe("base");
    expect(hasDeflect(game, "newcomer")).toBe(true); // not limited to units present when it was played
    expect(hasDeflect(game, "foe")).toBe(false);
  });

  test("when the Monument is killed (opponent's gear removal) the units lose Deflect at once — afterwards P2's Bolt may choose the Veteran with no [rainbow] to pay", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 2 })
      .gear(P1, MONUMENT, "mon")
      .unit(P1, "base", { might: 3, name: "Veteran" }, "veteran")
      .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
      .hand(P2, SMASH, "smash")
      .hand(P2, BOLT, "bolt")
      .build();
    expect(hasDeflect(game, "veteran")).toBe(true);
    // With the aura up and an empty power pool, P2's Bolt cannot choose the Veteran (Deflect surcharge unpayable).
    const before = (game.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(before.flat()).not.toContain("veteran");
    await game.p2.cast("smash", { targets: "mon" });
    await game.settle();
    expect(game.zoneOf("mon")).toBe("trash");
    expect(hasDeflect(game, "veteran")).toBe(false);
    expect(game.state("veteran").grantedKeywords).toEqual([]);
    const after = (game.p2.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][];
    expect(after.flat()).toContain("veteran");
    await game.p2.cast("bolt", { targets: "veteran" });
    await game.settle();
    expect(game.state("veteran").damage).toBe(2);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} }); // no Deflect surcharge paid
  });

  test("same when it leaves via [Temporary]: it survives P2's turn (aura still up), dies as P1's next turn begins, and the aura is gone — not 'for the rest of the game'", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2, name: "Veteran" }, "veteran")
      .hand(P1, MONUMENT, "mon")
      .build();
    await game.p1.play("mon");
    await game.advanceTurn(); // P2's turn
    expect(game.zoneOf("mon")).toBe("base");
    expect(hasDeflect(game, "veteran")).toBe(true);
    await game.advanceTurn(); // P1's turn: Temporary kills it in the Beginning Phase
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("mon")).toBe("trash");
    expect(hasDeflect(game, "veteran")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
