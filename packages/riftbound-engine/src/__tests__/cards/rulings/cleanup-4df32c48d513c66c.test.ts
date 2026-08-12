/**
 * Ruling 4df32c48d513c66c — (a Cleanup runs after EACH chain item, not after the whole chain; no specific card)
 *   Stand-ins: Feral Strength (SFD-034 → sfd-034-221) · [Reaction] [2] "Give a unit +2 [Might] this turn." and
 *   Frigid Touch (SFD-066 → sfd-066-221) · [Reaction] [2] "Give a unit -2 [Might] this turn."
 *
 * Q: In a showdown, is damage checked against might after each spell resolves, or only after the whole chain?
 * A: After each item. A Cleanup follows every resolution, so a unit whose Might drops to or below its marked
 *    damage dies right then — before the next item on the chain resolves, and a later "+2 Might" cannot save it.
 * Rules: 320 / 323 (a Cleanup happens after each chain item resolves), 323.5 / 140.3 (a unit with damage ≥ its
 *        Might is killed in that Cleanup), 340 (LIFO resolution order).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FERAL_STRENGTH = "sfd-034-221";
const FRIGID_TOUCH = "sfd-066-221";

/** P1's turn: a damaged Raider (3 Might, 2 damage) attacks bf1, which P2 holds with a Keeper (6). */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Keeper" }, "keeper")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider", { damage: 2 })
    .hand(P1, FERAL_STRENGTH, "feral")
    .hand(P2, FRIGID_TOUCH, "frigid");
}

/** In the showdown: P1 stacks +2 on the damaged Raider, P2 answers with -2 on top of it. */
async function stackedChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.state("raider")).toMatchObject({ damage: 2, might: 3 }); // alive: 2 < 3
  await game.p1.cast("feral", { targets: "raider" });
  await game.p1.passPriority();
  await game.p2.cast("frigid", { targets: "raider" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["feral", "frigid"]);
  return game;
}

describe("Ruling 4df32c48d513c66c — damage is measured against Might after every single chain item", () => {
  test("Frigid Touch resolves first (LIFO): the Raider drops to 1 Might with 2 damage on it and is killed in THAT Cleanup", async () => {
    const game = await stackedChain();
    await game.p2.passPriority();
    await game.p1.passPriority(); // top item resolves
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("frigid")).toBe("trash");
    expect(game.chain().map((c) => c.cardId)).toEqual(["feral"]); // the +2 has NOT resolved yet
  });

  test("so the '+2 Might' underneath it comes too late — it resolves against a unit that is already dead and saves nothing", async () => {
    const game = await stackedChain();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("feral")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control facet — with the order reversed (the +2 resolving last is what matters) the Raider survives when only the buff is played: 2 damage vs 5 Might", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.cast("feral", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("raider")).toMatchObject({ damage: 2, might: 5 });
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
  });
});
