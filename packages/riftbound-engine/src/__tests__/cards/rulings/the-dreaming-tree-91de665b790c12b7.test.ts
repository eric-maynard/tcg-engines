/**
 * Ruling 91de665b790c12b7 — The Dreaming Tree (OGN-292 → ogn-292-298, Battlefield)
 *     "When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1."
 *   × Cleave (OGN-004 → ogn-004-298, Action, 1) "Give a unit [Assault 3] this turn."
 *   × Defy (OGN-045 → ogn-045-298, Reaction, 1+[calm]) "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *
 * Q: I play a spell targeting my unit at the Dreaming Tree and it gets Defied — do I still draw?
 * A: Yes. The Tree's trigger is created when the spell is played (targets are declared then) and sits on the chain above the
 *    spell: Spell > Tree trigger > Defy. Defy resolves and counters the spell; the Tree trigger is still on the chain and
 *    resolves → draw 1.
 * Rules: 383.4.b (choose/target triggers fire at finalization), 336–340 (chain / LIFO), 425 (a countered spell goes to
 *        trash without resolving; other chain items are unaffected).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DREAMING_TREE = "ogn-292-298";
const CLEAVE = "ogn-004-298";
const DEFY = "ogn-045-298";

/** P1's turn. P1 controls the live Dreaming Tree with Dreamer (3) on it; Cleave + exactly [1]. P2: Defy + exactly 1+[calm]. Known P1 deck top. */
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

/** Cleave on the Dreamer → [cleave, tree]; P1 passes; P2 Defies the Cleave → [cleave, tree, defy]. */
async function cleaveTreeDefy(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("cleave", { targets: "dreamer" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree"]); // Spell > Dreaming Tree's trigger
  expect(game.chain()[1]).toMatchObject({ triggered: true });
  expect(game.p1.hand()).toEqual([]); // nothing drawn yet
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "cleave" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["cleave", "tree", "defy"]); // Spell > Tree trigger > Defy
  return game;
}

describe("Ruling 91de665b790c12b7 — a Defied spell still pays out the Dreaming Tree draw", () => {
  test("chain order after the response is exactly Cleave (bottom) → Dreaming Tree trigger → Defy (top)", async () => {
    const game = await cleaveTreeDefy();
    expect(game.chain()[2]).toMatchObject({ cardId: "defy", controller: P2, targets: ["cleave"] });
  });

  test("both pass: Defy resolves and counters Cleave (Cleave → trash, Dreamer gets NO Assault); the Tree trigger is still on the chain", async () => {
    const game = await cleaveTreeDefy();
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("dreamer").grantedKeywords).toEqual([]);
    expect(game.chain().filter((c) => !c.countered).map((c) => c.cardId)).toEqual(["tree"]);
    expect(game.p1.hand()).toEqual([]); // still not drawn — the trigger hasn't resolved yet
  });

  test("both pass again: the Dreaming Tree trigger resolves and P1 draws 1 (d1) even though the spell was countered; end state back in P1's main phase", async () => {
    const game = await cleaveTreeDefy();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p1.deck()[0]).toBe("d2");
    expect(game.zoneOf("cleave")).toBe("trash");
    expect(game.state("dreamer")).toMatchObject({ grantedKeywords: [], might: 3, zone: "battlefield-tree" });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: un-Defied, Cleave resolves too — Dreamer has Assault 3 this turn AND P1 drew 1", async () => {
    const game = await board().build();
    await game.p1.cast("cleave", { targets: "dreamer" });
    await game.settle();
    expect(game.state("dreamer").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.p1.hand()).toEqual(["d1"]);
  });
});
