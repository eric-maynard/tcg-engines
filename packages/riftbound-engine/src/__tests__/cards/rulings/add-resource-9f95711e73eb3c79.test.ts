/**
 * Ruling 9f95711e73eb3c79 — Daughter of the Void (OGN-247 → ogn-247-298) · Legend (Kai'Sa) ·
 *   "[Exhaust]: [Reaction] — [Add] [rainbow]. Use only to play spells. (Abilities that add resources can't be
 *   reacted to.)"
 *
 * Q: What does the [Add] tag mean, and what is the universal ([rainbow]) Power it adds?
 * A: [Add] puts the resource straight into your temporary rune pool — it does not use the chain, cannot be
 *    responded to and does not pass Focus. The universal Power symbol pays a Power cost of any domain, unlike
 *    Power made by recycling a rune of one colour. Anything left in the pool is gone at the end of the turn.
 * Rules: 429 ([Add] abilities resolve immediately and are not put on the chain), 429.4 ("use only to play
 *        spells" earmarks the resource), 205 (rune pool), 317.2 (Empty Pools in the Ending Phase).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DAUGHTER = "ogn-247-298";

/** [Action] "Deal 2 to a unit." — costs [1] plus one [fury] Power pip. */
const FURY_BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Fury Bolt",
  powerCost: ["fury"],
  rulesText: "[Action] Deal 2 to a unit.",
  timing: "action",
} as const;

/** P1's turn: the Kai'Sa legend ready, one Energy, NO Power of any colour, and a fury spell in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .legend(P1, DAUGHTER, "kaisa")
    .unit(P2, "base", { might: 4, name: "Target" }, "target")
    .hand(P1, FURY_BOLT, "bolt");
}

async function added(): Promise<Game> {
  const game = await board().build();
  expect(game.p1.power("rainbow")).toBe(0);
  await game.p1.activate("kaisa", 0);
  return game;
}

describe("Ruling 9f95711e73eb3c79 — [Add] puts universal Power straight into the pool, unrespondably and temporarily", () => {
  test("activating it adds [rainbow] to the pool and exhausts the legend", async () => {
    const game = await added();
    expect(game.p1.power("rainbow")).toBe(1);
    expect(game.state("kaisa").isExhausted).toBe(true);
  });

  test("it never reaches the chain: nothing to respond to, and the turn player keeps the open state", async () => {
    const game = await added();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("the universal Power pays a coloured Power pip — the [fury] spell becomes castable with no fury Power at all", async () => {
    const game = await added();
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.can("cast", "bolt")).toBe(true);
    await game.p1.cast("bolt", { targets: "target" });
    await game.settle();
    expect(game.state("target").damage).toBe(2);
    expect(game.p1.power("rainbow")).toBe(0); // spent
  });

  test("without the [Add] the same spell is unaffordable — the added Power is doing the work", async () => {
    const game = await board().build();
    expect(game.p1.can("cast", "bolt")).toBe(false);
  });

  test("unspent, it is gone at the end of the turn (Empty Pools)", async () => {
    const game = await added();
    expect(game.p1.power("rainbow")).toBe(1);
    await game.advanceTurn();
    expect(game.p1.power("rainbow")).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
