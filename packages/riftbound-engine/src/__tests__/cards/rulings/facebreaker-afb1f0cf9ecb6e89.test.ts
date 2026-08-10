/**
 * Ruling afb1f0cf9ecb6e89 — Facebreaker (OGN-220 → ogn-220-298) · Action [2] · "[Hidden] Stun a friendly unit and an enemy unit at the
 *   same battlefield."   × The Dreaming Tree (OGN-292 → ogn-292-298) · Battlefield · "When a player chooses a friendly unit here with a
 *   spell for the first time each turn, they draw 1."
 *
 * Q: Does Facebreaker trigger The Dreaming Tree?
 * A: Yes — Facebreaker chooses (targets) a friendly unit at the Tree, which is exactly the Tree's condition; the caster draws 1.
 * Rules: 355.6 (choosing = targeting), 383.4.b (targeting triggers go on the chain when the spell is finalized), the Tree's
 *        "first time each turn".
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FACEBREAKER = "ogn-220-298";
const THE_DREAMING_TREE = "ogn-292-298";

/** P1's turn with [2] and Facebreaker. The Dreaming Tree is P2's with a 3-Might Defender; P1's 3-Might Attacker in base. Known decks. */
function board() {
  return scenario()
    .resources(P1, { energy: 2 })
    .battlefield("tree", { controller: P2, def: THE_DREAMING_TREE, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "tree", { might: 3, name: "Defender" }, "def")
    .unit(P1, "base", { might: 3, name: "Attacker" }, "att")
    .hand(P1, FACEBREAKER, "fb")
    .deck(P1, ["ogn-175-298", "ogn-175-298"], ["d1", "d2"])
    .deck(P2, ["ogn-175-298", "ogn-175-298"], ["e1", "e2"]);
}

/** Attacker moves onto the Tree (combat showdown, P1 has Focus) and P1 Facebreakers [Attacker, Defender]. */
async function facebreakAtTheTree(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("att", "tree");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("fb", { targets: ["att", "def"] });
  expect(game.p1.energy()).toBe(0);
  return game;
}

describe("Ruling afb1f0cf9ecb6e89 — Facebreaker's friendly target at The Dreaming Tree triggers the Tree", () => {
  test("finalizing Facebreaker (friendly Attacker 'here' chosen) puts The Dreaming Tree's trigger on the chain above it; nothing drawn yet", async () => {
    const game = await facebreakAtTheTree();
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb", "tree"]);
    expect(game.chain()[0]).toMatchObject({ cardId: "fb", targets: ["att", "def"] });
    expect(game.chain()[1]).toMatchObject({ cardId: "tree", triggered: true });
    expect(game.p1.hand()).toEqual([]);
  });

  test("ruling: the Tree resolves first — the CASTER (P1) draws 1 (d1); P2, whose unit was chosen as the ENEMY target, draws nothing", async () => {
    const game = await facebreakAtTheTree();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fb"]);
  });

  test("then Facebreaker resolves: both units stunned; the stunned 3-vs-3 combat deals no damage, both survive, the Tree stays P2's", async () => {
    const game = await facebreakAtTheTree();
    await game.settle();
    expect(game.zoneOf("fb")).toBe("trash");
    expect(game.state("att")).toMatchObject({ damage: 0, isStunned: true });
    expect(game.state("def")).toMatchObject({ damage: 0, isStunned: true, zone: "battlefield-tree" });
    expect(game.p1.hand()).toEqual(["d1"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
