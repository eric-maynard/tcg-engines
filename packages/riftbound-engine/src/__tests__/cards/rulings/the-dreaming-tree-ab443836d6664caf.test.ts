/**
 * Ruling ab443836d6664caf — The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield · "When a player chooses a friendly unit
 *     here with a spell for the first time each turn, they draw 1."
 *   × En Garde (OGN-046 → ogn-046-298) · [1] Reaction · "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might]
 *     this turn if it is the only unit you control there."
 *   × ("Force of Flow" in the question =) Fight or Flight (OGN-168 → ogn-168-298) · [2] Action · [Hidden] · "Move a unit from a
 *     battlefield to its base." — played here from face down as a Reaction.
 *
 * Q: A controls the Dreaming Tree. B (with Focus) plays En Garde on B's unit at that battlefield; A responds by moving that unit
 *    to base. Does B still draw from the Tree?
 * A: Yes. The Tree triggers when the unit is CHOSEN (as En Garde is finalized onto the chain); its instruction is just "draw 1"
 *    and does not re-check where the unit is when it resolves. So: En Garde → Tree trigger → A's response moves the unit home →
 *    Tree resolves → B draws.
 * Rules: 383.4 (trigger condition = the choosing event), 355.6 (choices made at finalization), 359 (resolve the instruction as
 *        written — no location condition), 383 (LIFO), 811.1.c (hidden card played as a Reaction).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const EN_GARDE = "ogn-046-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * P2's (Player B's) turn 3. P1 (Player A) controls the live Dreaming Tree with a Dreamer (4) and hid Fight or Flight there on an
 * earlier turn. P2: Striker (3) in base, En Garde in hand with exactly [1]; P2's deck top is known (d1, d2 …).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1 })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "tree", { might: 4, name: "Dreamer" }, "dreamer")
    .facedown(P1, "tree", FIGHT_OR_FLIGHT, "fof")
    .unit(P2, "base", { might: 3, name: "Striker" }, "striker")
    .hand(P2, EN_GARDE, "engarde")
    .deck(P2, ["ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3"]);
}

/** B attacks the Tree and, holding Focus, casts En Garde on the Striker. */
async function enGardeAtTheTree(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("striker", "tree");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.hand()).toEqual(["engarde"]);
  await game.p2.cast("engarde", { targets: "striker" });
  expect(game.p2.energy()).toBe(0);
  return game;
}

describe("Ruling ab443836d6664caf — the Dreaming Tree draw survives the chosen unit being moved away in response", () => {
  test("En Garde finalizes choosing B's Striker at the Tree → the Tree's trigger is added above it, controlled by B (the chooser); nothing drawn yet", async () => {
    const game = await enGardeAtTheTree();
    expect(game.chain().map((c) => [c.cardId, c.controller])).toEqual([
      ["engarde", P2],
      ["tree", P2],
    ]);
    expect(game.chain()[0]?.targets).toEqual(["striker"]);
    expect(game.chain()[1]?.triggered).toBe(true);
    expect(game.p2.hand()).toEqual([]);
  });

  test("A responds in the reaction window: flips the hidden Fight or Flight at the Tree (for [0]) onto the Striker — chain: En Garde, Tree, Fight or Flight", async () => {
    const game = await enGardeAtTheTree();
    await game.p2.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "fof")).toBe(true);
    await game.p1.reveal("fof", { answers: ["striker"] });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "tree", "fof"]);
    expect(game.chain()[2]).toMatchObject({ controller: P1, targets: ["striker"] });
  });

  test("LIFO: Fight or Flight moves the Striker to B's base FIRST; the Tree then resolves and B STILL draws 1 (d1) — its 'draw 1' does not care where the unit is now", async () => {
    const game = await enGardeAtTheTree();
    await game.p2.passPriority();
    await game.p1.reveal("fof", { answers: ["striker"] });
    // Resolve Fight or Flight only.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "fof"); i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.locationOf("striker")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde", "tree"]);
    expect(game.p2.hand()).toEqual([]);
    // Resolve the Tree item.
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "tree"); i++) {
      await game.acting().passPriority();
    }
    expect(game.p2.hand()).toEqual(["d1"]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["engarde"]);
    // Let the rest play out: En Garde resolves (or not) on a unit now in base; the empty combat closes; A keeps the Tree.
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("engarde")).toBe("trash");
    expect(game.p2.hand()).toEqual(["d1"]); // exactly one Tree draw
    expect(game.p1.hand()).toEqual([]); // A (the Tree's controller) draws nothing — "they" = the chooser
    expect(game.locationOf("striker")).toBe("base");
    expect(game.gameState.battlefields.tree?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("control — no response from A: Tree resolves (B draws d1), En Garde resolves (+1, and +1 more for being B's only unit there → Striker 5)", async () => {
    const game = await enGardeAtTheTree();
    for (let i = 0; i < 8 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.p2.hand()).toEqual(["d1"]);
    expect(game.state("striker")).toMatchObject({ location: "tree", might: 5 });
  });
});
