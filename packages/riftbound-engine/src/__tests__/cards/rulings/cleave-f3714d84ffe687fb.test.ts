/**
 * Ruling f3714d84ffe687fb — Cleave (OGN-004 → ogn-004-298) · Spell · Fury · [1] · [Action]
 *     "Give a unit [Assault 3] this turn."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Trifarian War Camp (OGN-294 → ogn-294-298) — cited as analogous (battlefield text works regardless of control).
 *
 * Q: Must you CONTROL the Dreaming Tree to get the draw, or can you attack into it, Cleave your attacker, and draw?
 * A: No control needed. Attack in, target your attacking unit there with a spell — if it is the first time this
 *    turn you chose a friendly unit there with a spell, you draw 1.
 * Rules: 190.6.c / 740.1.a ("a player … friendly" is judged from the chooser), 383.3.e (first time each turn).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CLEAVE = "ogn-004-298";
const DREAMING_TREE = "ogn-292-298";

/** P1's turn with [2]. P2 controls the live Dreaming Tree with a 6-Might Guard. P1: 3-Might Raider in base, two Cleaves. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("tree", { controller: P2, def: DREAMING_TREE, inert: false })
    .unit(P2, "tree", { might: 6, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, CLEAVE, "cleave1")
    .hand(P1, CLEAVE, "cleave2");
}

async function raiderAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "tree");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.gameState.battlefields.tree?.controller).toBe(P2); // P1 does NOT control the Tree
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Ruling f3714d84ffe687fb — the Dreaming Tree draws for the attacker who Cleaves their own unit there", () => {
  test("attacking into P2's Dreaming Tree and Cleaving the attacker: the Tree's trigger fires for P1 (a P1-controlled item above Cleave) and P1 draws 1", async () => {
    const game = await raiderAttacks();
    const hand0 = game.p1.hand().length; // cleave1 + cleave2
    const deck0 = game.p1.deck().length;
    await game.p1.cast("cleave1", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave1", "tree"]);
    expect(game.chain()[1]).toMatchObject({ cardId: "tree", controller: P1, triggered: true });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tree trigger resolves → draw
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Cleave resolves
    expect(game.zoneOf("cleave1")).toBe("trash");
    expect(game.state("raider").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("raider").might).toBe(6); // 3 + Assault 3 while attacking
    expect(game.gameState.battlefields.tree?.controller).toBe(P2); // still not P1's — control was never needed
    expect(game.violations()).toEqual([]);
  });

  test("'for the first time each turn': a second Cleave on the same unit there this turn draws nothing more", async () => {
    const game = await raiderAttacks();
    const deck0 = game.p1.deck().length;
    await game.p1.cast("cleave1", { targets: "raider" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
    // Focus passed to P2 after P1's spell resolved; P2 passes it back so P1 may act again.
    if (game.decision()?.seat === P2) {
      await game.p2.passFocus();
    }
    await game.p1.cast("cleave2", { targets: "raider" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["cleave2"]); // no Tree item this time
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf("cleave2")).toBe("trash");
    expect(game.p1.deck()).toHaveLength(deck0 - 1);
  });

  test("P2 (who DOES control the Tree) gets nothing from P1's choice — the draw goes to the choosing player only", async () => {
    const game = await raiderAttacks();
    const p2hand = game.p2.hand().length;
    const p2deck = game.p2.deck().length;
    await game.p1.cast("cleave1", { targets: "raider" });
    await game.settle();
    expect(game.p2.hand()).toHaveLength(p2hand);
    expect(game.p2.deck()).toHaveLength(p2deck);
  });
});
