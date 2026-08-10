/**
 * Ruling e80b0f0b6ad3157a — Hidden Blade (OGN-213 → ogn-213-298) · [Action] · [2][order] "Kill a unit at a battlefield. Its
 *     controller draws 2."
 *   × Defy (OGN-045 → ogn-045-298) · [Reaction] · [1][calm] "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Darius, Trifarian (OGN-027 → ogn-027-298) · 5 Might "When you play your second card in a turn, give me +2 [Might] this
 *     turn and ready me."
 *   × The Dreaming Tree (OGN-292 → ogn-292-298) "When a player chooses a friendly unit here with a spell for the first time
 *     each turn, they draw 1." (nuance)
 *
 * Q: Opponent plays Hidden Blade, I Defy it, then they play Darius. Does Darius get his "second card" effect?
 * A: No. A countered card never resolved and is not "played" for when-you-play triggers, so Darius is effectively the
 *    first card. Nuance: "when you choose/target" triggers (Dreaming Tree) still fire for the countered spell, because
 *    targeting happened at finalization, before the counter.
 * Rules: 425.1.b (a countered card is not considered played for play-triggers), 419.4.a (play triggers fire on
 *        resolution), 383.4.b.2 (targeting triggers fire on finalization).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const DEFY = "ogn-045-298";
const DARIUS_TRIFARIAN = "ogn-027-298";
const DREAMING_TREE = "ogn-292-298";

/**
 * P1's turn. P1 controls The Dreaming Tree (live) with a 2-Might Pawn on it (Hidden Blade's target — a friendly unit at
 * the Tree, so the nuance is observable). P1: Hidden Blade + Darius in hand, [7][order][fury]. P2: Defy + [1][calm].
 * P1's deck top is known.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { fury: 1, order: 1 } })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("tree", { controller: P1, def: DREAMING_TREE, inert: false, owner: P1 })
    .unit(P1, "tree", { might: 2, name: "Pawn" }, "pawn")
    .unit(P2, "base", { might: 3, name: "Foe" }, "foe")
    .hand(P1, HIDDEN_BLADE, "blade")
    .hand(P1, DARIUS_TRIFARIAN, "darius")
    .hand(P2, DEFY, "defy")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4"]);
}

/** Hidden Blade at the Pawn (Tree trigger lands above it); P1 passes; P2 Defies the Blade; the chain resolves. */
async function bladeDefied(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "pawn" });
  expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1, order: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "tree"]); // targeting trigger fired at finalization
  await game.p1.passPriority();
  await game.p2.passPriority(); // Tree item resolves (draw 1)
  expect(game.p1.hand()).toEqual(["darius", "d1"]);
  await game.p1.passPriority();
  expect(game.p2.can("cast", "defy")).toBe(true);
  await game.p2.cast("defy", { targets: "blade" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "defy"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  return game;
}

describe("Ruling e80b0f0b6ad3157a — a Defied Hidden Blade doesn't count toward Darius's 'second card'", () => {
  test("the countered Hidden Blade did nothing (Pawn alive, no 'draws 2') — yet the Dreaming Tree's TARGETING trigger had already fired and drawn P1 a card", async () => {
    const game = await bladeDefied();
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("pawn")).toBe("battlefield-tree");
    expect(game.p1.hand()).toEqual(["darius", "d1"]); // exactly the Tree draw, not Blade's 2
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  test("Darius played next enters as a plain 5-Might exhausted unit: his 'second card' trigger does NOT fire (no Darius item, no +2, not readied)", async () => {
    const game = await bladeDefied();
    await game.p1.play("darius", { to: "base" });
    expect(game.zoneOf("darius")).toBe("base");
    expect(game.chain().some((c) => c.cardId === "darius")).toBe(false);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5, mightModifier: 0 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control — Hidden Blade NOT countered: it resolves (Pawn dies, P1 draws 2), and Darius played afterwards IS the second card: his trigger goes on the chain and gives +2 (→ 7) and readies him", async () => {
    const game = await board().build();
    await game.p1.cast("blade", { targets: "pawn" });
    await game.settle();
    expect(game.zoneOf("pawn")).toBe("trash");
    expect(game.p1.hand()).toEqual(["darius", "d1", "d2", "d3"]); // Tree 1 + Blade 2
    await game.p1.play("darius", { to: "base" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "darius", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7, mightModifier: 2 });
  });
});
