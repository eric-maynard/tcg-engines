/**
 * Ruling 268d3b338d904967 — The Dreaming Tree (OGN-292 → ogn-292-298, Battlefield)
 *   "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Defy (OGN-045 → ogn-045-298, Reaction, 1 + 1 power) "Counter a spell that costs no more than [4] and no more than
 *     [rainbow]."   (spell used: Cleave ogn-004-298, Action 1: "Give a unit [Assault 3] this turn.")
 *
 * Q: I cast a spell targeting my unit at the Dreaming Tree; my opponent Defies it. Do I still draw?
 * A: Yes. The Tree triggers on the targeting (spell finalized), not on the spell resolving: spell = link 1, Tree
 *    trigger = link 2, Defy on top; the Tree's draw resolves regardless of the spell later being countered.
 * Rules: 383.4.b.2 (targeting triggers fire when the spell is finalized), 340 (LIFO), 425 (counter: the countered spell
 *        simply doesn't resolve; nothing already triggered is undone).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const DEFY = "ogn-045-298";
const CLEAVE = "ogn-004-298";

/**
 * P1's turn. P1 controls The Dreaming Tree (live) with a 3-Might Dreamer on it; Cleave in hand with exactly 1.
 * P2 holds Defy with exactly 1 + [calm]. P1's deck top is known (d1, d2).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 1 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, CLEAVE, "cleave")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"]);
}

/** Cleave at the Dreamer (Tree trigger stacks on it); P1 passes; P2 Defies the Cleave. */
async function cleaveThenDefy(game: Game): Promise<void> {
  await game.p1.cast("cleave", { targets: "dreamer" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree"]);
  expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
  expect(game.p1.hand()).toEqual([]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  expect(game.p2.can("cast", "defy")).toBe(true);
  const targets = (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
  expect(targets).toContain("cleave");
  await game.p2.cast("defy", { targets: "cleave" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree", "defy"]);
}

describe("Ruling 268d3b338d904967 — the Dreaming Tree draw survives the spell being Defied", () => {
  test("chain shape: Cleave (link 1) → Dreaming Tree trigger (link 2, P1's) → Defy on top targeting Cleave", async () => {
    const game = await board().build();
    await cleaveThenDefy(game);
  });

  test("resolution: Defy counters Cleave, the Tree item still resolves — P1 draws exactly 1; Cleave is countered to the trash and the Dreamer never gets Assault", async () => {
    const game = await board().build();
    await cleaveThenDefy(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    // The draw happened …
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    // … the countered Cleave did nothing.
    expect(game.state("dreamer").grantedKeywords).toEqual([]);
    expect(game.state("dreamer").keywords).not.toContain("Assault");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — no Defy: the Tree draw AND Cleave both resolve (1 card, Assault 3 this turn)", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.state("dreamer").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.p2.hand()).toEqual(["defy"]);
  });
});
