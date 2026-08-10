/**
 * Ruling e2ef179325cd54c7 — Fiora, Peerless (SFD-110 → sfd-110-221) · Unit · Body · 3 · 3 Might
 *     "When I attack or defend one on one, double my Might this combat."
 *   × Wuju Bladesman - Starter (OGS-019 → ogs-019-024, the Master Yi legend) "While a friendly unit defends alone, it gets +2 [Might]."
 *
 * Q: Fiora defends alone with the Yi legend active — what Might does she have?
 * A: 10. The legend's +2 is a passive that applies the moment she is designated the lone defender (3 → 5); her "When I
 *    defend" trigger then goes on the chain and, on resolution, doubles her CURRENT Might: 5 → 10.
 * Rules: 522 (statics apply continuously), 383/337 (triggered ability chains and resolves), layering: double the current value.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FIORA_PEERLESS = "sfd-110-221";
const WUJU_BLADESMAN = "ogs-019-024";

/** P2's turn. P1 (Wuju Bladesman legend) holds bf1 with Fiora alone; P2's Brute (8) attacks from base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .legend(P1, WUJU_BLADESMAN, "yi")
    .unit(P1, "bf1", FIORA_PEERLESS, "fiora")
    .unit(P2, "base", { might: 8, name: "Brute" }, "brute");
}

async function bruteAttacks(): Promise<Game> {
  const game = await board().build();
  expect(game.state("fiora").might).toBe(3); // not defending yet: no bonus
  await game.p2.move("brute", "bf1");
  return game;
}

describe("Ruling e2ef179325cd54c7 — lone-defending Fiora, Peerless under Wuju Bladesman: (3 + 2) × 2 = 10", () => {
  test("step 1 — designated the lone defender: the legend's passive +2 applies at once (3 → 5) while her 'When I defend' trigger waits on the chain", async () => {
    const game = await bruteAttacks();
    expect(game.state("fiora").combatRole).toBe("defender");
    expect(game.state("brute").combatRole).toBe("attacker");
    expect(game.p1.units("bf1")).toEqual(["fiora"]); // alone
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fiora", controller: P1, triggered: true })]);
    expect(game.state("fiora")).toMatchObject({ might: 5, mightModifier: 0, staticMightBonus: 2 });
  });

  test("step 2 — the trigger resolves and doubles her CURRENT Might: 5 → 10 (passive +2 still included, +5 combat modifier on top)", async () => {
    const game = await bruteAttacks();
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("fiora")).toMatchObject({ combatRole: "defender", might: 10, staticMightBonus: 2 });
    expect(game.state("fiora").mightModifier).toBe(5); // the doubling added +5 (= her Might when it resolved)
  });

  test("outcome confirms 10: she kills the 8-Might Brute and survives (8 < 10), holding bf1; after combat the doubling and the defend-only +2 are gone (back to 3)", async () => {
    const game = await bruteAttacks();
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("fiora")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("fiora").combatRole).toBeNull();
    expect(game.state("fiora").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
