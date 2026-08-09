/**
 * Ruling 0ff7c3949cb10c20 — Flash (OGS-011 → ogs-011-024) · Reaction spell · Chaos · [2]
 *   "Move up to 2 friendly units to base."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield "When a player chooses a friendly unit here with a
 *     spell for the first time each turn, they draw 1."
 *   (+ Discipline ogn-058-298 as P2's unit-choosing spell for the per-player nuance.)
 *
 * Q: If I Flash two units at The Dreaming Tree, how many cards do I draw?
 * A: One. The Tree triggers only the first time you choose a friendly unit there with a spell each turn, no
 *    matter how many units that spell chooses. Nuances: two different Dreaming Trees, one unit flashed from
 *    each → 2 draws (one per location); the once-per-turn limit is per PLAYER; every unit chosen by Flash moves.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";
const DREAMING_TREE = "ogn-292-298";
const DISCIPLINE = "ogn-058-298";

describe("Ruling 0ff7c3949cb10c20 — Flash choosing two units at The Dreaming Tree draws ONE card", () => {
  test("two friendly units at one Dreaming Tree, both chosen by Flash: exactly one Tree trigger, P1 draws 1, both units move to base", async () => {
    const game = await scenario()
      .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
      .unit(P1, "tree", { might: 2, name: "Alpha" }, "alpha")
      .unit(P1, "tree", { might: 2, name: "Bravo" }, "bravo")
      .hand(P1, FLASH, "flash")
      .resources(P1, { energy: 2 })
      .build();
    const hand = game.p1.hand().length;
    const deck = game.p1.deck().length;
    await game.p1.cast("flash", { targets: ["alpha", "bravo"] });
    // The Tree's targeting trigger sits above Flash — once, not twice.
    expect(game.chain().filter((c) => c.triggered)).toHaveLength(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["flash", "tree"]);
    await game.settle();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("alpha")).toBe("base"); // every chosen unit must move
    expect(game.locationOf("bravo")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1); // Flash out, ONE card in
    expect(game.p1.deck()).toHaveLength(deck - 1);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  // Expected: each Dreaming Tree is its own "here" — one Flash choosing Alpha (tree1) and Bravo (tree2) fires
  // BOTH Trees' targeting triggers (P1's first choice at each location this turn) → P1 draws 2.
  // Actual: only tree1's trigger goes on the chain; tree2 never fires for the same spell, so P1 draws 1.
  test("BUG: ruling 0ff7c3949cb10c20 — one spell choosing units at two Dreaming Trees fires only ONE Tree (engine draws 1, ruling says 2: one trigger per location)", async () => {
    const game = await scenario()
      .battlefield("tree1", { controller: P1, def: DREAMING_TREE, inert: false })
      .battlefield("tree2", { controller: P1, def: DREAMING_TREE, inert: false })
      .unit(P1, "tree1", { might: 2, name: "Alpha" }, "alpha")
      .unit(P1, "tree2", { might: 2, name: "Bravo" }, "bravo")
      .hand(P1, FLASH, "flash")
      .resources(P1, { energy: 2 })
      .build();
    const hand = game.p1.hand().length;
    await game.p1.cast("flash", { targets: ["alpha", "bravo"] });
    expect(game.chain().filter((c) => c.triggered).map((c) => c.cardId).toSorted()).toEqual(["tree1", "tree2"]);
    await game.settle();
    expect(game.locationOf("alpha")).toBe("base");
    expect(game.locationOf("bravo")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
  });

  test("nuance: 'first time each turn' is per player — after P1's Flash drew, P2 choosing P2's own unit at a Dreaming Tree with a spell (same turn) draws for P2", async () => {
    const game = await scenario()
      .battlefield("tree1", { controller: P1, def: DREAMING_TREE, inert: false })
      .battlefield("tree2", { controller: P2, def: DREAMING_TREE, inert: false })
      .unit(P1, "tree1", { might: 2, name: "Alpha" }, "alpha")
      .unit(P2, "tree2", { might: 2, name: "Zulu" }, "zulu")
      .hand(P1, FLASH, "flash")
      .resources(P1, { energy: 2 })
      .hand(P2, DISCIPLINE, "disc")
      .resources(P2, { energy: 2 })
      .build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("flash", { targets: ["alpha"] });
    // Let the Tree trigger for P1 resolve (both pass once), keep Flash on the chain, hand priority to P2.
    expect(game.chain().map((c) => c.cardId)).toEqual(["flash", "tree1"]);
    for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "tree1"); i++) {
      await game.acting().passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["flash"]);
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    expect(game.p1.hand()).toHaveLength(p1Hand - 1 + 1); // P1 already drew its one
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.p2.cast("disc", { targets: "zulu" });
    expect(game.chain().some((c) => c.cardId === "tree2" && c.triggered && c.controller === P2)).toBe(true);
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1 + 1); // Discipline out, Tree draw + Discipline's own "Draw 1"
    expect(game.p1.hand()).toHaveLength(p1Hand); // P1 drew nothing more
    expect(game.locationOf("alpha")).toBe("base");
  });

  test("contrast: a second spell by the SAME player choosing a unit at the same Tree later that turn draws nothing", async () => {
    const game = await scenario()
      .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false })
      .unit(P1, "tree", { might: 2, name: "Alpha" }, "alpha")
      .unit(P1, "tree", { might: 2, name: "Bravo" }, "bravo")
      .hand(P1, FLASH, "flash")
      .hand(P1, DISCIPLINE, "disc")
      .resources(P1, { energy: 4 })
      .build();
    const hand = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "alpha" }); // first choice this turn → Tree draw + Discipline draw
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand - 1 + 2);
    await game.p1.cast("flash", { targets: ["bravo"] }); // second time this turn → no Tree trigger
    expect(game.chain().some((c) => c.triggered)).toBe(false);
    await game.settle();
    expect(game.locationOf("bravo")).toBe("base");
    expect(game.p1.hand()).toHaveLength(hand - 2 + 2);
  });
});
