/**
 * Ruling 5f08f8197c8517ac — Challenge (OGN-128 → ogn-128-298) · Action spell · Body · [2][body]
 *   "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield — "When a player chooses a friendly unit here with a
 *     spell for the first time each turn, they draw 1."
 *
 * Q: Playing Challenge and choosing a unit at the Dreaming Tree — do you draw, and when?
 * A: Yes. The Tree's trigger goes on the chain right after Challenge finalizes (chain: Challenge > Tree trigger); it
 *    resolves first, so you draw BEFORE Challenge itself resolves. Either player may react to the draw trigger.
 * Rules: 355 (choices made at play), triggered abilities join the chain above the spell, 340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const DREAMING_TREE = "ogn-292-298";

/**
 * P1's turn. P1 controls the live Dreaming Tree with Dreamer (4) there; P2's Foe (3) is at P2's bf2. Challenge +
 * exactly [2][body]; known deck top d1, d2.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "tree", { might: 4, name: "Dreamer" }, "dreamer")
    .unit(P2, "bf2", { might: 3, name: "Foe" }, "foe")
    .hand(P1, CHALLENGE, "challenge")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

async function castChallenge(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("challenge", { targets: ["dreamer", "foe"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  return game;
}

describe("Ruling 5f08f8197c8517ac — Challenge choosing a unit at the Dreaming Tree: the draw trigger sits above the spell and resolves first", () => {
  test("right after Challenge finalizes the chain is [Challenge, Tree trigger] — the trigger (P1's) on top; nothing drawn or damaged yet", async () => {
    const game = await castChallenge();
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "challenge", controller: P1, triggered: false }),
      expect.objectContaining({ cardId: "tree", controller: P1, triggered: true }),
    ]);
    expect(game.p1.hand()).toEqual([]);
    expect(game.state("dreamer").damage).toBe(0);
    expect(game.state("foe").damage).toBe(0);
    // A reaction window is open on the trigger (either player may respond before it resolves).
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("the Tree trigger resolves first: P1 draws 1 while Challenge is STILL on the chain (no damage dealt yet)", async () => {
    const game = await castChallenge();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge" })]);
    expect(game.state("dreamer").damage).toBe(0);
    expect(game.state("foe").damage).toBe(0);
  });

  test("then Challenge resolves: Dreamer (4) and Foe (3) hit each other — Foe dies, Dreamer takes 3; P1 holds exactly the one drawn card", async () => {
    const game = await castChallenge();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("dreamer").damage).toBe(3);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.violations()).toEqual([]);
  });
});
