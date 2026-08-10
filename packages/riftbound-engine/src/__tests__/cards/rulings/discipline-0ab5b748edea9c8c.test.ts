/**
 * Ruling 0ab5b748edea9c8c — Discipline (OGN-058 → ogn-058-298, Reaction, 2) "Give a unit +2 [Might] this turn. Draw 1."
 *   × Fiora, Peerless (sfd-110-221, 3 Might) "When I attack or defend one on one, double my Might this combat."
 *   (+ Rebuke ogn-172-298 as an ACTION-only spell for the contrast)
 *
 * Q: Can I play Discipline as a reaction to Fiora, Peerless's ability?
 * A: Yes. Her attack/defend trigger sits on the initial chain (closed state); Discipline is a Reaction so it can be
 *    played on top of it and resolves FIRST (LIFO): +2, then the doubling → (3+2)×2 = 10. An Action-only card could
 *    not be played there — you would have to wait until the trigger resolves and you have Focus.
 * Rules: 383.4.e (attack trigger on the initial chain), 336/343 (closed state → Reactions only), 340.1 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const FIORA = "sfd-110-221";
const REBUKE = "ogn-172-298";

/** P1's turn. P2's lone Wall (7) holds bf1. P1: Fiora (3) in base, Discipline + Rebuke in hand, 4 energy + 2 chaos. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { chaos: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Wall" }, "wall")
    .unit(P1, "base", FIORA, "fiora")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, REBUKE, "rebuke");
}

/** Fiora attacks bf1 one on one → her trigger is on the initial chain and P1 holds priority. */
async function fioraAttacks(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("fiora", "bf1");
  expect(game.state("fiora").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true, type: "ability" })]);
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
  return game;
}

describe("Ruling 0ab5b748edea9c8c — Discipline as a Reaction on top of Fiora, Peerless's doubling trigger", () => {
  test("with Fiora's trigger on the chain the state is CLOSED: Discipline (Reaction) is legal, Rebuke (Action) is not", async () => {
    const game = await fioraAttacks();
    expect(game.p1.can("cast", "disc")).toBe(true);
    expect(game.p1.can("cast", "rebuke")).toBe(false);
    const r = await game.p1.try((p) => p.cast("rebuke", { targets: "wall" }));
    expect(r.ok).toBe(false);
  });

  test("Discipline goes ON TOP of the trigger and resolves first: Fiora 3 → 5 while her trigger is still pending; P1 drew 1", async () => {
    const game = await fioraAttacks();
    const hand = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "fiora" });
    expect(game.p1.energy()).toBe(2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fiora", "disc"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Discipline resolves (LIFO)
    expect(game.state("fiora").might).toBe(5);
    expect(game.chain().map((c) => c.cardId)).toEqual(["fiora"]);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
    expect(game.zoneOf("disc")).toBe("trash");
  });

  test("then the doubling resolves on the boosted value: (3 + 2) × 2 = 10 — not 3 × 2 + 2 = 8", async () => {
    const game = await fioraAttacks();
    await game.p1.cast("disc", { targets: "fiora" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.state("fiora").might).toBe(10);
  });

  test("only once the chain is empty does P1 (attacker) hold Focus in an open showdown — NOW the Action (Rebuke) is playable; and 10-Might Fiora beats the 7-Might Wall", async () => {
    const game = await fioraAttacks();
    await game.p1.cast("disc", { targets: "fiora" });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.decision()).toMatchObject({ kind: "action", context: "showdown", seat: P1 });
    expect(game.p1.can("cast", "rebuke")).toBe(true);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.locationOf("fiora")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: without Discipline Fiora doubles to only 6 and loses to the 7-Might Wall", async () => {
    const game = await fioraAttacks();
    await game.settle();
    expect(game.zoneOf("fiora")).toBe("trash");
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
