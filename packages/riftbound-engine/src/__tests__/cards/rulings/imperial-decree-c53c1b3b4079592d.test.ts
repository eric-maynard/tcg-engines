/**
 * Ruling c53c1b3b4079592d — Imperial Decree (OGN-221 → ogn-221-298) · Action [5][order][order]
 *   "When any unit takes damage this turn, kill it."
 *
 * Q: Can Imperial Decree kill units that survived a combat and have already healed?
 * A: No. Decree only kills units that TAKE damage after it resolves; it does not look back at units that
 *    were damaged earlier and have since healed. From then on, though, one point of damage is lethal to
 *    anything — including your own units.
 * Rules: 391 ("when it takes damage" is a delayed trigger armed from now on), 466.2 (survivors heal at the
 *        end of combat), 320/323 (nothing re-examines old damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";

/** A [1] Action "Deal 1 to a unit." — the smallest possible scratch. */
const SCRATCH = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Test Scratch (deal 1)",
  timing: "action",
} as const;

/** P1's turn: an 8-Might Colossus, Imperial Decree and two Scratches in hand; P2's 6-Might Guard holds bf1. */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 1, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 8, name: "Colossus" }, "colossus")
    .unit(P1, "base", { might: 4, name: "Squire" }, "squire")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, SCRATCH, "scratch");
}

/** Fight first: the Colossus kills the Guard, takes 6 and then heals at the end of combat. */
async function fightThenDecree(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("colossus", "bf1");
  await game.settle();
  expect(game.zoneOf("guard")).toBe("trash");
  expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
  expect(game.state("colossus").damage).toBe(0); // healed at the end of the combat
  await game.p1.cast("decree");
  await game.settle();
  return game;
}

describe("Ruling c53c1b3b4079592d — Imperial Decree looks forward only: a healed survivor is safe", () => {
  test("ruling: the Colossus survived the combat and healed; Imperial Decree resolving afterwards does not kill it", async () => {
    const game = await fightThenDecree();
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    expect(game.state("colossus").damage).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("ruling: a unit still CARRYING old damage is equally safe — Decree only reacts to new damage", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { order: 2 } })
      .unit(P1, "base", { might: 5, name: "Veteran" }, "vet", { damage: 2 })
      .hand(P1, IMPERIAL_DECREE, "decree")
      .build();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("vet")).toBe("base");
    expect(game.state("vet").damage).toBe(2);
  });

  test("ruling: from then on ANY damage is lethal — one point kills the healed 8-Might Colossus", async () => {
    const game = await fightThenDecree();
    await game.p1.cast("scratch", { targets: "colossus" });
    await game.settle();
    expect(game.zoneOf("colossus")).toBe("trash");
  });

  test("ruling: 'the effect works both ways' — it kills your own units just as readily", async () => {
    const game = await fightThenDecree();
    await game.p1.cast("scratch", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the Decree lasts only 'this turn' — a scratch on the next turn is just a scratch", async () => {
    const game = await fightThenDecree();
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("squire")).toBe("base");
    await game.p1.tapRune();
    await game.p1.recycleRune({ domain: "fury" }, "fury");
    await game.p1.cast("scratch", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.state("squire").damage).toBe(1);
  });
});
