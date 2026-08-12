/**
 * Ruling 42bfb230388bb333 — Star-Crossed (UNL-128 → unl-128-219) · Spell · Chaos · [3][chaos] · [Reaction]
 *   "Return a friendly unit and an enemy unit to their owners' hands."
 *   × Loyal Poro (UNL-156 → unl-156-219) — "[Deathknell] If I didn't die alone, draw 1."
 *   × Fox-Fire (OGN-256 → ogn-256-298) — the kill being answered.
 *
 * Q: Can I answer a Deathknell trigger with Star-Crossed, bouncing the unit to stop the Deathknell effect?
 * A: No. By the time the Deathknell trigger is on the chain the unit is already dead and in the trash, and
 *    Star-Crossed can only choose units on the board — a trashed unit is an illegal target. To stop it you must
 *    answer the KILL itself while the unit is still on the board: Star-Crossed resolves first (LIFO), the unit
 *    goes to hand, the kill finds nothing, the unit never reaches the trash and the Deathknell never triggers.
 * Rules: 355.8/355.15 (targets must be legal objects — a trashed unit is not on the board),
 *        383.4 ([Deathknell] triggers on the death, after it has happened), 337.1 (LIFO chain resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAR_CROSSED = "unl-128-219";
const LOYAL_PORO = "unl-156-219";
const FOX_FIRE = "ogn-256-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

/** P1's turn. P2 holds bf1 with Loyal Poro + a Buddy (so the Poro would not "die alone"); P1 aims Fox-Fire at the Poro. */
async function foxFireAtThePoro(): Promise<Game> {
  const game = await scenario()
    .resources(P1, { energy: 9 })
    .resources(P2, { energy: 9, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", LOYAL_PORO, "poro")
    .unit(P2, "bf1", unit(2, "Buddy"), "buddy")
    .unit(P1, "base", unit(2, "Mine"), "mine")
    .hand(P1, FOX_FIRE, "fox")
    .hand(P2, STAR_CROSSED, "sc")
    .build();
  await game.p1.cast("fox", { targets: ["poro"] });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 42bfb230388bb333 — Star-Crossed saves a Deathknell unit only BEFORE it dies", () => {
  test("answering the kill: Star-Crossed resolves first, the Poro goes to hand, Fox-Fire fizzles and no Deathknell fires", async () => {
    const game = await foxFireAtThePoro();
    const deck0 = game.p2.deck().length;

    await game.p2.cast("sc", { targets: ["poro", "mine"] });
    await game.settle();

    expect(game.zoneOf("poro")).toBe("hand"); // never reached the trash
    expect(game.zoneOf("mine")).toBe("hand");
    expect(game.zoneOf("fox")).toBe("trash"); // resolved with an illegal target — nothing killed
    expect(game.p2.deck()).toHaveLength(deck0); // Deathknell "draw 1" never happened
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("answering the Deathknell instead: the Poro is already in the trash and is not an offered target", async () => {
    const game = await foxFireAtThePoro();
    const deck0 = game.p2.deck().length;

    await game.p2.passPriority(); // let Fox-Fire resolve

    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.chain()).toMatchObject([{ cardId: "poro", triggered: true }]); // the Deathknell is on the chain
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });

    // Star-Crossed is still castable — but only over units that are still on the board.
    const targets = game.p2.option("cast", "sc")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual([["buddy", "mine"]]);

    await game.settle();
    expect(game.p2.deck()).toHaveLength(deck0 - 1); // the Deathknell drew, as the ruling says it must
    expect(game.zoneOf("poro")).toBe("trash");
  });

  test("a Star-Crossed cast at the surviving pair does not rescue the dead Poro either", async () => {
    const game = await foxFireAtThePoro();
    await game.p2.passPriority();

    await game.p2.cast("sc", { targets: ["buddy", "mine"] });
    await game.settle();

    expect(game.zoneOf("buddy")).toBe("hand");
    expect(game.zoneOf("mine")).toBe("hand");
    expect(game.zoneOf("poro")).toBe("trash");
  });
});
