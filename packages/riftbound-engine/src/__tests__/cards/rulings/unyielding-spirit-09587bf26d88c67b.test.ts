/**
 * Ruling 09587bf26d88c67b — Unyielding Spirit (OGN-145 → ogn-145-298) · Spell · Body · 1+[body] · Reaction
 *   "Prevent all spell and ability damage this turn."
 *   × Challenge (OGN-128 → ogn-128-298) · Spell · Body · 2+[body] · Action · "Choose a friendly unit and an enemy
 *     unit. They deal damage equal to their Mights to each other."
 *
 * Q: Does Unyielding Spirit stop the damage from a Challenge?
 * A: No. Unyielding Spirit only prevents damage DEALT BY spells or abilities. Challenge deals no damage itself —
 *    it makes the two units deal damage to each other, so the units are the sources and the prevention does
 *    not apply.
 * Rules: 142 (damage and its source), 437 (a spell instructing objects to deal damage: those objects are the
 *        source), 813 (Reaction), 336–340 (LIFO: the Reaction resolves before Challenge).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const UNYIELDING_SPIRIT = "ogn-145-298";
const CHALLENGE = "ogn-128-298";
const HEXTECH_RAY = "ogn-009-298"; // "Deal 3 to a unit at a battlefield." — genuine SPELL damage (contrast)

/**
 * P2's turn. P2's 4-Might Brute sits in P2's base; P1's 2-Might Ally holds bf1. P2 has Challenge (2+body) and
 * Hextech Ray (1+fury); P1 has Unyielding Spirit with exactly 1 + body.
 */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { body: 1, fury: 1 } })
    .resources(P1, { energy: 1, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Ally" }, "ally")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .hand(P2, CHALLENGE, "challenge")
    .hand(P2, HEXTECH_RAY, "ray")
    .hand(P1, UNYIELDING_SPIRIT, "spirit");
}

/** P1 answers the spell on the chain with Unyielding Spirit; everyone passes; the chain empties. */
async function respondWithSpiritAndResolve(game: Game, under: string): Promise<void> {
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ kind: "action", context: "chain", seat: P1 });
  expect(game.p1.can("cast", "spirit")).toBe(true);
  await game.p1.cast("spirit");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual([under, "spirit"]);
  await game.settle();
  expect(game.chain()).toEqual([]);
  expect(game.zoneOf("spirit")).toBe("trash");
}

describe("Ruling 09587bf26d88c67b — Unyielding Spirit does not prevent Challenge damage (the units are the source)", () => {
  test("Challenge [Brute, Ally] answered by Unyielding Spirit: Spirit resolves first, yet the units still deal their Might to each other — Ally (2) takes 4 and dies, Brute takes 2", async () => {
    const game = await board().build();
    await game.p2.cast("challenge", { targets: ["brute", "ally"] });
    expect(game.p2.resources()).toEqual({ energy: 1, power: { body: 0, fury: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "challenge", controller: P2, targets: ["brute", "ally"] })]);
    await respondWithSpiritAndResolve(game, "challenge");
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("trash"); // 4 damage from the Brute ≥ 2 Might — not prevented
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.state("brute").damage).toBe(2); // 2 damage from the Ally — not prevented either
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same Unyielding Spirit DOES prevent genuine spell damage — Hextech Ray's 3 at the Ally is prevented (0 damage, Ally lives)", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "ally" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ray", controller: P2, targets: ["ally"] })]);
    await respondWithSpiritAndResolve(game, "ray");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.state("ally").damage).toBe(0);
  });

  test("control: without Unyielding Spirit the Challenge outcome is identical (Ally dies, Brute takes 2) — the Reaction changed nothing about it", async () => {
    const game = await board().build();
    await game.p2.cast("challenge", { targets: ["brute", "ally"] });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.state("brute").damage).toBe(2);
    expect(game.zoneOf("spirit")).toBe("hand");
  });
});
