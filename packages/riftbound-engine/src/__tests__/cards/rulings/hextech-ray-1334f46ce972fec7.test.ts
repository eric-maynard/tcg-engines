/**
 * Ruling 1334f46ce972fec7 — Hextech Ray (OGN-009 → ogn-009-298) · Spell · Fury · 1+[fury] · Action
 *   "Deal 3 to a unit at a battlefield."
 *   × Stupefy (OGN-095 → ogn-095-298) · Spell · Mind · 1 · Reaction · "Give a unit -1 [Might] this turn, to a minimum
 *     of 1 [Might]. Draw 1."
 *
 * Q: A 4-Might unit takes 3 from Hextech Ray, then Stupefy gives it -1 [Might]. Does it die?
 * A: Yes. Damage stays marked; only the Might changes. 3 damage on a 4-Might unit survives; after Stupefy it is a
 *    3-Might unit with 3 damage (damage ≥ Might), so it dies in the cleanup that follows Stupefy resolving.
 * Rules: 142 (marked damage persists for the turn), 140.3 / 323.1 (a unit with damage ≥ its Might is killed as a
 *        state-based check during Cleanup), 318 (Cleanup after a chain item resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HEXTECH_RAY = "ogn-009-298";
const STUPEFY = "ogn-095-298";

/** P1's turn. P2's 4-Might Bruiser holds bf1. P1 has Ray (1+fury) and Stupefy (1): exactly 2 energy + 1 fury. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Bruiser" }, "bruiser")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, STUPEFY, "stupefy");
}

async function rayTheBruiser(game: Game): Promise<void> {
  await game.p1.cast("ray", { targets: "bruiser" });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
  await game.settle();
  expect(game.zoneOf("ray")).toBe("trash");
}

describe("Ruling 1334f46ce972fec7 — 3 damage from Hextech Ray, then -1 Might from Stupefy: the 4-Might unit dies", () => {
  test("step 1: Hextech Ray marks 3 damage on the 4-Might Bruiser — it survives (3 < 4)", async () => {
    const game = await board().build();
    await rayTheBruiser(game);
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("bruiser")).toMatchObject({ damage: 3, might: 4 });
    expect(game.decision()).toMatchObject({ kind: "action", context: "main", seat: P1 });
  });

  test("step 2: Stupefy then gives it -1 Might → 3 Might with 3 damage marked (damage unchanged, ≥ Might): it dies in the cleanup after Stupefy resolves; P1 still draws 1", async () => {
    const game = await board().build();
    await rayTheBruiser(game);
    const hand0 = game.p1.hand().length;
    expect(game.p1.can("cast", "stupefy")).toBe(true);
    await game.p1.cast("stupefy", { targets: "bruiser" });
    expect(game.p1.energy()).toBe(0);
    expect(game.state("bruiser").damage).toBe(3); // still marked while Stupefy waits on the chain
    await game.settle();
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash"); // dead: 3 damage ≥ 3 Might
    expect(game.p2.trash()).toContain("bruiser");
    expect(game.cardsAt("bf1")).toEqual([]);
    expect(game.p1.hand()).toHaveLength(hand0 - 1 + 1); // Stupefy left, "Draw 1" happened
    expect(game.violations()).toEqual([]);
  });

  test("control: Stupefy alone on the undamaged 4-Might Bruiser just makes it a 3-Might unit for the turn — no death without the marked damage", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "bruiser" });
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("bruiser")).toMatchObject({ damage: 0, might: 3, mightModifier: -1 });
    await game.advanceTurn();
    expect(game.state("bruiser").might).toBe(4); // "this turn"
  });
});
