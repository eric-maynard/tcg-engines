/**
 * Ruling e8c2f6c4d2ad5735 — Fox-Fire (OGN-256 → ogn-256-298) · [Hidden] [Action] · Calm/Mind · [3]
 *     "Kill any number of units at a battlefield with total Might 4 or less."
 *   × Flash (OGS-011 → ogs-011-024) · [Reaction] · Chaos · [2][chaos] "Move up to 2 friendly units to base."
 *
 * Q: Fox-Fire targets a unit at a battlefield; in response the opponent moves that unit back to base. Does the
 *    damage/kill still resolve, does the spell fizzle, or does the caster choose a new target?
 * A: The spell still resolves, but nothing happens to that unit: Fox-Fire only kills units AT A BATTLEFIELD and
 *    the unit is no longer one. It is not a full fizzle, and no new target is chosen.
 * Rules: 359.3.e.5 / 355.15 (a chosen object that no longer matches the descriptor is dropped at resolution;
 *        never re-aimed), 426.2 (the spell still resolves and is trashed), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FOX_FIRE = "ogn-256-298";
const FLASH = "ogs-011-024";

/** P1's turn with [3] for Fox-Fire. P2 holds bf1 with two 2-Might grunts (total 4) and has Flash + [2][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2, power: { chaos: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Grunt A" }, "a")
    .unit(P2, "bf1", { might: 2, name: "Grunt B" }, "b")
    .hand(P1, FOX_FIRE, "foxfire")
    .hand(P2, FLASH, "flash");
}

/** P2 answers the Fox-Fire on the chain by Flashing Grunt A home; Flash resolves first. */
async function flashAwayA(game: Game): Promise<void> {
  await game.p1.passPriority();
  await game.p2.cast("flash", { targets: ["a"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["foxfire", "flash"]);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Flash resolves (LIFO)
  expect(game.locationOf("a")).toBe("base");
  expect(game.chain().map((c) => c.cardId)).toEqual(["foxfire"]);
}

describe("Ruling e8c2f6c4d2ad5735 — a Fox-Fire target that leaves the battlefield is skipped, not re-chosen", () => {
  test("control: unopposed, Fox-Fire kills both 2-Might grunts (total Might 4)", async () => {
    const game = await board().build();
    await game.p1.cast("foxfire", { targets: ["a", "b"] });
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("foxfire")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("ruling: the Flashed-away Grunt A is untouched while Grunt B still dies — the spell resolves, it does not fizzle", async () => {
    const game = await board().build();
    await game.p1.cast("foxfire", { targets: ["a", "b"] });
    await flashAwayA(game);
    await game.settle();
    expect(game.locationOf("a")).toBe("base");
    expect(game.zoneOf("a")).not.toBe("trash"); // no longer "at a battlefield" ⇒ nothing happens to it
    expect(game.zoneOf("b")).toBe("trash");
    expect(game.zoneOf("foxfire")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("no new target is chosen: P1 is never asked to re-aim Fox-Fire when its only target leaves", async () => {
    const game = await board().build();
    let reAimed = false;
    game.script(P1, [
      (d) => {
        if (d.kind === "pick") {
          reAimed = true;
        }
        return undefined;
      },
    ]);
    await game.p1.cast("foxfire", { targets: ["a"] });
    await flashAwayA(game);
    await game.settle();
    expect(reAimed).toBe(false);
    expect(game.zoneOf("a")).toBe("base");
    expect(game.zoneOf("b")).toBe("battlefield-bf1"); // an untargeted unit is never substituted in
    expect(game.zoneOf("foxfire")).toBe("trash");
  });

  test("the sole-target case is a resolution with no effect, not a countered spell: Fox-Fire is trashed and P1's [3] is spent either way", async () => {
    const game = await board().build();
    await game.p1.cast("foxfire", { targets: ["a"] });
    expect(game.p1.energy()).toBe(0);
    await flashAwayA(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("foxfire")).toBe("trash");
    expect(game.p1.energy()).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
