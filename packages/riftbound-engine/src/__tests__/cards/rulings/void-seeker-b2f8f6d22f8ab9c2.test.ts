/**
 * Ruling b2f8f6d22f8ab9c2 — Void Seeker (OGN-024 → ogn-024-298) × Singularity (OGN-105 → ogn-105-298)
 *   Void Seeker: "[Action] Deal 4 to a unit at a battlefield. Draw 1."
 *   Singularity: "Deal 6 to each of up to two units."
 *   (mover used here: Flash, ogs-011-024 — "[Reaction] Move up to 2 friendly units to base.")
 *
 * Q: Does moving a targeted unit make it an invalid target when the targeting card names no zone?
 * A: Target legality is re-checked on resolution, including location. If the effect names a zone (Void Seeker: "at a
 *    battlefield"), moving the unit out of it makes the target illegal — no damage. If it names none (Singularity),
 *    the moved unit is still a legal target as long as it is on the board — it takes the damage.
 * Rules: 355.12 / 359.3.f (targets re-validated on resolution; illegal-target instruction is skipped).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298"; // 3 + [fury]
const SINGULARITY = "ogn-105-298"; // 6 + [mind][mind]
const FLASH = "ogs-011-024"; // 2, Reaction

function board(spell: string, p1: { energy: number; power: Record<string, number> }) {
  return scenario()
    .resources(P1, p1)
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 7, name: "Big Target" }, "big")
    .hand(P1, spell, "spell")
    .hand(P2, FLASH, "flash");
}

describe("Ruling b2f8f6d22f8ab9c2 — moving a target only breaks zone-restricted targeting", () => {
  test("Void Seeker ('a unit AT A BATTLEFIELD'): P2 Flashes the target to base in response → on resolution the target is illegal and takes NO damage", async () => {
    const game = await board(VOID_SEEKER, { energy: 3, power: { fury: 1 } }).build();
    await game.p1.cast("spell", { targets: "big" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell"]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["big"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell", "flash"]);
    await game.settle(); // Flash resolves first (LIFO), then Void Seeker
    expect(game.locationOf("big")).toBe("base");
    expect(game.state("big").damage).toBe(0);
    expect(game.zoneOf("big")).toBe("base");
    expect(game.zoneOf("spell")).toBe("trash"); // the spell still resolved and left the chain
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("control — Void Seeker with no response: the unit at the battlefield takes 4", async () => {
    const game = await board(VOID_SEEKER, { energy: 3, power: { fury: 1 } }).build();
    await game.p1.cast("spell", { targets: "big" });
    await game.settle();
    expect(game.locationOf("big")).toBe("bf1");
    expect(game.state("big").damage).toBe(4);
  });

  test("Singularity ('up to two UNITS', no zone): P2 Flashes the target to base in response → it is still a legal target and takes 6", async () => {
    const game = await board(SINGULARITY, { energy: 6, power: { mind: 2 } }).build();
    await game.p1.cast("spell", { targets: ["big"] });
    // "up to two": decline any offer to add a second target
    for (let i = 0; i < 2 && game.decision()?.kind === "pick"; i++) {
      await game.p1.decline();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell"]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("flash", { targets: ["big"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["spell", "flash"]);
    await game.settle();
    expect(game.locationOf("big")).toBe("base"); // it did move …
    expect(game.state("big").damage).toBe(6); // … and was still hit
    expect(game.zoneOf("spell")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
