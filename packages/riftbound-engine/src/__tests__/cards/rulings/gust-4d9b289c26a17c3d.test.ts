/**
 * Ruling 4d9b289c26a17c3d — Gust (OGN-169 → ogn-169-298) · Spell · [1] · [Reaction]
 *   "Return a unit at a battlefield with 3 [Might] or less to its owner's hand."
 *   × Teemo, Strategist (OGN-121 → ogn-121-298) · Unit · 2 Might · [Hidden]
 *     "When I defend, choose an enemy unit here and reveal the top 5 cards of your Main Deck. Deal 1 to that unit
 *      for each card with [Hidden] revealed this way, then recycle the revealed cards."
 *
 * Q: Does Teemo still deal damage if Gust removes him after he has declared his target — and are cards revealed?
 * A: Gust invalidates "here", so the chosen unit is no longer a legal target and no damage is dealt. The rest of
 *    the instruction still happens: the cards are revealed and then recycled.
 * Rules: 340 (LIFO — Gust resolves first), 359.3.e.5 / 355.15 (an illegal target is dropped, the instruction
 *        fizzles), 359.3 (the remaining instructions still execute).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const TEEMO_STRATEGIST = "ogn-121-298";
const HIDDEN_BLADE = "ogn-213-298"; // a [Hidden] card, to fill the top five
const SKULKER = "ogn-175-298";

/** P2's turn. P1 holds bf1 with Teemo (2) behind a 9-Might [Tank] Wall; P2 attacks with a Raider (4) and holds Gust + [1]. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", TEEMO_STRATEGIST, "teemo")
    .unit(P1, "bf1", { keywords: ["Tank"], might: 9, name: "Wall" }, "wall")
    .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, GUST, "gust")
    .deck(P1, [HIDDEN_BLADE, HIDDEN_BLADE, HIDDEN_BLADE, HIDDEN_BLADE, HIDDEN_BLADE, SKULKER], ["h1", "h2", "h3", "h4", "h5", "below"]);
}

/** P2 attacks; Teemo's "when I defend" trigger goes on the chain with the Raider chosen. */
async function teemoTriggered(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("teemo").combatRole).toBe("defender");
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("raider"); // the only enemy unit here
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["teemo"]);
  return game;
}

describe("Ruling 4d9b289c26a17c3d — Gusting Teemo away kills the damage but not the reveal", () => {
  test("baseline: left alone, the trigger reveals five [Hidden] cards and deals 5 to the Raider, then recycles them", async () => {
    const game = await teemoTriggered();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 5 damage on a 4-Might Raider
    expect(game.p1.deck()[0]).toBe("below"); // the five revealed cards went to the bottom
    expect(game.violations()).toEqual([]);
  });

  test("Gust may be played in response and resolves first, sending Teemo to P1's hand", async () => {
    const game = await teemoTriggered();
    await game.acting().passPriority();
    expect(game.p2.can("cast", "gust")).toBe(true);
    await game.p2.cast("gust", { targets: "teemo" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo", "gust"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("teemo")).toBe("hand");
    expect(game.p1.hand()).toContain("teemo");
    expect(game.chain().map((c) => c.cardId)).toEqual(["teemo"]); // the trigger is still there
  });

  test("ruling: with Teemo gone 'here' is invalid — the Raider takes NO damage", async () => {
    const game = await teemoTriggered();
    await game.acting().passPriority();
    await game.p2.cast("gust", { targets: "teemo" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Gust resolves
    await game.acting().passPriority();
    await game.acting().passPriority(); // Teemo's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("raider").damage).toBe(0);
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the cards are still revealed and then recycled", async () => {
    const game = await teemoTriggered();
    await game.acting().passPriority();
    await game.p2.cast("gust", { targets: "teemo" });
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.p1.deck()[0]).toBe("h1"); // untouched so far
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.p1.deck()[0]).toBe("below"); // the five were revealed and recycled to the bottom
    expect(game.p1.deck()).not.toContain("teemo");
    expect(game.violations()).toEqual([]);
  });
});
