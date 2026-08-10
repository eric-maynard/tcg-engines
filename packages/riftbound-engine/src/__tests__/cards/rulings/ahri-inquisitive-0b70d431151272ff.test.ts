/**
 * Ruling 0b70d431151272ff — Ahri, Inquisitive (OGN-119 → ogn-119-298) · 3-Might Mind champion
 *   "When I attack or defend, give an enemy unit here -2 [Might] this turn, to a minimum of 1 [Might]."
 *   × Hidden Blade (OGN-213 → ogn-213-298) "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: If Ahri is killed by Hidden Blade before her attack/defend trigger resolves, does the trigger still resolve?
 * A: Yes — the trigger is already on the chain and resolves even though its source died, but it does nothing:
 *    it looks for an enemy unit "here" (where Ahri is) and cannot locate Ahri, who is no longer in play.
 *
 * Reaching Ahri's trigger at Reaction speed needs the Blade to be facedown at that battlefield (Hidden ⇒
 * gains Reaction), so the scenario has Ahri ATTACK into P1's bf1 where P1's Hidden Blade lies facedown —
 * the very same "When I attack or defend … here" trigger.
 * Rules: 340.1 (finalized items resolve), 383 (a trigger is independent of its source once on the chain),
 *        811.6 (facedown Hidden card has Reaction), 359.3.e (an effect that cannot locate its referent does nothing).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AHRI = "ogn-119-298";
const HIDDEN_BLADE = "ogn-213-298";

/** P2's turn. P1 controls bf1 with a 4-Might Defender and Hidden Blade facedown there. P2: Ahri (3) in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 4, name: "Defender" }, "def")
    .facedown(P1, "bf1", HIDDEN_BLADE, "blade")
    .unit(P2, "base", AHRI, "ahri");
}

/** Ahri attacks bf1; her trigger (choosing the Defender) goes on the chain and P2, the attacker, passes priority. */
async function ahriAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("ahri", "bf1");
  expect(game.state("ahri").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P2, targets: ["def"], triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  await game.p2.passPriority();
  return game;
}

describe("Ruling 0b70d431151272ff — Ahri's trigger still resolves after Hidden Blade kills her, but does nothing", () => {
  test("control: with no response Ahri's trigger resolves and the Defender is -2 [Might] this turn (4 → 2)", async () => {
    const game = await ahriAttacks();
    await game.p1.passPriority(); // trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("def").might).toBe(2);
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
  });

  test("P1 may respond at Reaction speed with the facedown Hidden Blade at bf1, choosing Ahri (now 'at a battlefield'); it goes on top of her trigger", async () => {
    const game = await ahriAttacks();
    expect(game.p1.can("reveal", "blade")).toBe(true);
    await game.p1.reveal("blade", { answers: ["ahri"] });
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
      ["ahri", ["def"]],
      ["blade", ["ahri"]],
    ]);
    expect(game.p1.energy()).toBe(0); // played from facedown for [0]
  });

  test("Hidden Blade resolves first (LIFO): Ahri is killed, P2 (her controller) draws 2 — and Ahri's trigger is STILL on the chain", async () => {
    const game = await ahriAttacks();
    const p2Hand = game.p2.hand().length;
    await game.p1.reveal("blade", { answers: ["ahri"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blade resolves
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("blade")).toBe("trash");
    // The trigger was not removed with its source.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P2, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action" });
  });

  test("ruling: Ahri's trigger then RESOLVES (leaves the chain normally, not countered) but does nothing — the Defender keeps its full 4 [Might]", async () => {
    const game = await ahriAttacks();
    await game.p1.reveal("blade", { answers: ["ahri"] });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Blade
    const item = game.chain()[0];
    expect(item?.countered).toBe(false);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Ahri's trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("def").might).toBe(4);
    expect(game.state("def").mightModifier).toBe(0);
    // With no attacker left the showdown winds down; bf1 stays P1's, Defender untouched.
    await game.settle();
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });
});
