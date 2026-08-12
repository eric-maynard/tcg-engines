/**
 * Ruling 2efbb5ecce4c4aef — The Zero Drive (SFD-090 → sfd-090-221) · Equipment · [3]
 *   "[Equip] [1][mind] … [3][mind], Banish this: Play all units banished with this, ignoring their costs.
 *    (Use only if unattached.) [Deathknell] — Banish me."
 *
 * Q: Can the Zero Drive revive tokens?
 * A: No. A token ceases to exist the moment it enters any non-board zone, banishment included. So even
 *    though the Drive's Deathknell "banishes" the token wearer, there is no token left in banishment for
 *    the [3][mind] ability to play — it only ever brings back real cards.
 * Rules: 186.1 (a token stops existing as soon as it leaves the board), 427.1 (banish → banishment zone),
 *        394–397 ("banished with this" = linked to the Drive's own banishes).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const ZERO_DRIVE = "sfd-090-221";
const realUnit = { cardType: "unit", energyCost: 4, might: 4, name: "Real Recruit" } as const;
const tokenUnit = { cardType: "unit", energyCost: 0, isToken: true, might: 3, name: "Sprite Token" } as const;

/** P1's turn with [3][mind]: the Drive sits unattached in base, already linked to one token and one real card. */
function loaded() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .card("zd", { def: ZERO_DRIVE, meta: { exiledByThis: ["tok", "real"] }, owner: P1, zone: "base" })
    .banishment(P1, tokenUnit, "tok")
    .banishment(P1, realUnit, "real");
}

describe("Ruling 2efbb5ecce4c4aef — The Zero Drive cannot revive tokens: a banished token has already ceased to exist", () => {
  test("a token that reaches banishment does not exist any more — it is not in the banishment zone at all", async () => {
    const game = await loaded().build();
    expect(game.has("tok")).toBe(false);
    expect(game.zoneOf("tok")).toBe("gone");
    expect(game.p1.banishment()).toEqual(["real"]);
  });

  test("ruling: activating [3][mind], Banish this plays back only the REAL card — there is no token to play", async () => {
    const game = await loaded().build();
    await game.p1.activate("zd");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle({ policy: "first" });
    expect(game.zoneOf("real")).toBe("base");
    expect(game.has("tok")).toBe(false);
    expect(game.p1.base()).not.toContain("tok");
    expect(game.zoneOf("zd")).toBe("banishment"); // "Banish this" was the cost
  });

  test("a token banished straight off the board likewise ceases to exist rather than waiting in banishment", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .unit(P1, "base", tokenUnit, "tok")
      .card("zd", { def: ZERO_DRIVE, owner: P1, zone: "base" })
      .build();
    expect(game.zoneOf("tok")).toBe("base");
    await game.p1.do("banishCard", { cardId: "tok" });
    await game.settle();
    expect(game.zoneOf("tok")).toBe("gone");
    expect(game.has("tok")).toBe(false);
    expect(game.p1.banishment()).toEqual([]);
    await game.p1.activate("zd");
    await game.settle({ policy: "first" });
    expect(game.p1.base()).not.toContain("tok");
    expect(game.violations()).toEqual([]);
  });
});
