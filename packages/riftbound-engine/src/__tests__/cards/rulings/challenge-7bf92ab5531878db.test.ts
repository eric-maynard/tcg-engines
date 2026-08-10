/**
 * Ruling 7bf92ab5531878db — Challenge (OGN-128 → ogn-128-298) · Action · [2]+[body]
 *     "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · Hidden · Action · "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: I attack with a unit, then cast Challenge; the opponent reacts with Hidden Blade (from face down) and
 *    kills my unit. What happens to Challenge?
 * A: Challenge resolves to no effect — its chosen friendly unit is gone, it cannot pick a new one; targets
 *    are locked when the spell is finalized. The enemy unit takes no damage.
 * Rules: 355.5 (targets chosen at finalize), 359.3.e (missing target ⇒ instruction not performed), 811 (Hidden).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CHALLENGE = "ogn-128-298";
const HIDDEN_BLADE = "ogn-213-298";

/**
 * P1's turn 3. P2 holds bf1 with a 6-Might Defender and hid Hidden Blade there on an earlier turn.
 * P1's 4-Might Attacker is in base; P1 holds Challenge with exactly [2]+[body].
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Defender" }, "def")
    .unit(P1, "base", { might: 4, name: "Attacker" }, "atk")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, CHALLENGE, "challenge");
}

/** P1 attacks bf1 and, holding Focus, casts Challenge [atk → def]; priority passes to P2. */
async function attackAndChallenge(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "challenge")).toBe(true);
  await game.p1.cast("challenge", { targets: ["atk", "def"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", controller: P1 })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 7bf92ab5531878db — Challenge whose friendly unit is killed in response does nothing", () => {
  test("control: unanswered, Challenge resolves — Attacker (4) and Defender (6) deal their Might to each other: Attacker dies, Defender carries 4", async () => {
    const game = await attackAndChallenge();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.state("def").damage).toBe(4);
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("P2 reacts with Hidden Blade from face down on the Attacker: it goes on top of Challenge and resolves first — Attacker killed, P1 draws 2", async () => {
    const game = await attackAndChallenge();
    expect(game.p2.can("reveal", "blade")).toBe(true);
    await game.p2.reveal("blade", { answers: ["atk"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge", "blade"]);
    const p1Hand = game.p1.hand().length;
    await game.p2.passPriority();
    if (game.chain().length === 2) {
      await game.p1.passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["challenge"]);
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(p1Hand + 2);
  });

  test("Challenge then resolves to no effect: its friendly unit is missing, no new unit is chosen (no prompt), the Defender takes NO damage", async () => {
    const game = await attackAndChallenge();
    await game.p2.reveal("blade", { answers: ["atk"] });
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no retarget prompt surfaced on the way
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0);
    // With no attackers left the combat simply ends; P2 keeps bf1.
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });
});
