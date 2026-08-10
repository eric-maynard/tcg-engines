/**
 * Ruling 1fc6c86a3848bc44 — Zed, Without a Sound (VEN-112a → ven-112a-166) · Champion Unit · Chaos · [5] · 5 Might
 *     "When I conquer, play a 0 [Might] Shadow Clone unit token to your base.
 *      [Action] [1][chaos]: Move me and a Shadow Clone you control to each other's locations."
 *   × Death Mark (VEN-144 → ven-144-166) · Spell · [2][rainbow] "[Burn 3]. Play a 0 [Might] Shadow Clone unit token. …"
 *   × Shadow (UNL-194 → unl-194-219) · Unit · 3 Might — a different card merely NAMED "Shadow".
 *
 * Q: Does Zed, Without a Sound swap locations with a Shadow Clone token?
 * A: Yes. The token (from his conquer trigger or Death Mark) is a unit named Shadow Clone that you control, so it is a
 *    legal partner. It even works mid-combat: Zed moves into the clone's location and the clone leaves the combat,
 *    dropping its Attacker designation. Neither relocation is a Standard Move.
 * Rules: 446 (move by effect ≠ standard move), 185 (tokens are units), FAQ #11820 (unit leaving combat loses its role).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ZED = "ven-112a-166";
const DEATH_MARK = "ven-144-166";
const SHADOW = "unl-194-219";

/**
 * P1's turn. Zed stands on P1's bf1; the unrelated 3-Might "Shadow" sits in P1's base; P2's 5-Might Wall holds bf2.
 * P1 holds Death Mark with [2][rainbow] for it, plus two chaos runes to fund Zed's [1][chaos] later.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { rainbow: 1 } })
    .runes(P1, "chaos", 2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", ZED, "zed")
    .unit(P1, "base", SHADOW, "shadow")
    .unit(P2, "bf2", { might: 5, name: "Wall" }, "wall")
    .hand(P1, DEATH_MARK, "dm");
}

/** Cast Death Mark, let it resolve, place the Shadow Clone token in base; return the token id. */
async function makeClone(game: Game): Promise<string> {
  await game.p1.cast("dm");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  const d = game.decision();
  if (d?.kind === "pick" && d.semantics === "destination") {
    expect(d.seat).toBe(P1);
    await game.p1.pick("base");
  }
  const clone = game.p1.units().find((u) => game.state(u).isToken);
  expect(clone).toBeDefined();
  expect(game.state(clone as string)).toMatchObject({ controller: P1, isToken: true, might: 0, name: "Shadow Clone" });
  expect(game.locationOf(clone as string)).toBe("base");
  return clone as string;
}

/** Pay [1][chaos] from the two chaos runes (tap one, recycle one). */
async function fundZed(game: Game): Promise<void> {
  await game.p1.tapRune();
  await game.p1.recycleRune(undefined, "chaos");
  expect(game.p1.resources()).toMatchObject({ energy: 1, power: { chaos: 1 } });
}

describe("Ruling 1fc6c86a3848bc44 — Zed, Without a Sound swaps places with a Shadow Clone token", () => {
  test("the Death Mark token is a P1-controlled unit named 'Shadow Clone', so Zed's ability is activatable and resolves swapping them: Zed bf1 → base, clone base → bf1 (the unit merely named 'Shadow' is untouched)", async () => {
    const game = await board().build();
    const clone = await makeClone(game);
    await fundZed(game);
    expect(game.p1.can("activate", "zed")).toBe(true);
    await game.p1.activate("zed");
    expect(game.p1.resources()).toMatchObject({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "zed", controller: P1 })]);
    // If the engine asks which Shadow Clone, it must be P1's pick and must offer the token.
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.seat).toBe(P1);
      expect(d.options.map((o) => o.card ?? o.key)).toContain(clone);
      await game.p1.pick(clone);
    }
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("zed")).toBe("base");
    expect(game.locationOf(clone)).toBe("bf1");
    expect(game.locationOf("shadow")).toBe("base");
    // Neither relocation was a Standard Move: nothing got exhausted by it and no move was counted.
    expect(game.state("zed").isExhausted).toBe(false);
    expect(game.gameState.unitsMovedThisTurn?.[P1] ?? 0).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("without any Shadow Clone (only the card named 'Shadow'), the ability has no legal partner — 'Shadow' is not a Shadow Clone", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", ZED, "zed")
      .unit(P1, "base", SHADOW, "shadow")
      .build();
    const could = game.p1.can("activate", "zed");
    if (could) {
      // Some engines let a no-partner activation through; it must then do nothing to "Shadow".
      await game.p1.activate("zed");
      await game.settle();
    }
    expect(game.locationOf("zed")).toBe("bf1");
    expect(game.locationOf("shadow")).toBe("base");
  });

  describe("mid-combat (the clone is attacking bf2; Zed is at bf1)", () => {
    /** Two turns later (token ready), the clone attacks P2's bf2; decline its own attack option; drain to P1's Focus. */
    async function cloneAttacks(): Promise<{ game: Game; clone: string }> {
      const game = await board().build();
      const clone = await makeClone(game);
      await game.advanceToTurnOf(P2);
      await game.advanceToTurnOf(P1);
      expect(game.state(clone).isReady).toBe(true);
      await fundZed(game);
      await game.p1.move(clone, "bf2");
      for (let i = 0; i < 8; i++) {
        const d = game.decision();
        if (d?.kind === "yes-no" && d.seat === P1) {
          await game.p1.no(); // the token's own "when I attack, you may banish…" — irrelevant here
        } else if (d?.kind === "action" && d.context === "chain") {
          await game.seat(d.seat).passPriority();
        } else {
          break;
        }
      }
      expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf2", isCombatShowdown: true });
      expect(game.state(clone).combatRole).toBe("attacker");
      expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
      return { clone, game };
    }

    test("Zed's [Action] ability is legal with Focus in the showdown; on resolution Zed is at bf2 (in the combat, as an attacker) and the clone is at bf1", async () => {
      const { game, clone } = await cloneAttacks();
      expect(game.p1.can("activate", "zed")).toBe(true);
      await game.p1.activate("zed");
      const d = game.decision();
      if (d?.kind === "pick") {
        expect(d.seat).toBe(P1);
        await game.p1.pick(clone);
      }
      await game.p1.passPriority();
      await game.p2.passPriority();
      expect(game.chain()).toEqual([]);
      expect(game.locationOf("zed")).toBe("bf2");
      expect(game.state("zed").combatRole).toBe("attacker");
      expect(game.locationOf(clone)).toBe("bf1");
      expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf2" });
      // The combat then plays out with Zed (5) as the attacker into Wall (5): they trade; the clone is safe at bf1.
      await game.settle();
      expect(game.zoneOf("wall")).toBe("trash");
      expect(game.zoneOf(clone)).toBe("battlefield-bf1");
      expect(game.state(clone).damage).toBe(0);
    });

    // Expected (FAQ #11820): the clone, moved out of the combat battlefield, immediately drops its Attacker
    // designation. Actual: after the swap the clone standing at bf1 still reads combatRole "attacker".
    test("ruling 1fc6c86a3848bc44 — the swapped-out clone loses its Attacker designation at once", async () => {
      const { game, clone } = await cloneAttacks();
      await game.p1.activate("zed");
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.p1.pick(clone);
      }
      await game.p1.passPriority();
      await game.p2.passPriority();
      expect(game.locationOf(clone)).toBe("bf1");
      expect(game.state(clone).combatRole).not.toBe("attacker");
    });
  });
});
