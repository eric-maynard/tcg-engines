/**
 * Ruling 3d80bc8b69eb0a03 — Wages of Pain (SFD-070 → sfd-070-221) · [Hidden] [Action] · Mind · [3]
 *     "Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."   × Gold token (sfd-t03)
 *   × Flash (ogs-011-024) · Reaction · [2] "Move up to 2 friendly units to base." (the "flash it back" in the Q)
 *
 * Q: Does Wages of Pain still make the Gold if the opponent flashes the target unit back?
 * A: Yes. The target is locked on play; the reaction resolves first (LIFO) and moves the unit to base, so "Deal 3 to a
 *    unit at a battlefield" has an illegal target and is ignored — but "Play a Gold gear token exhausted" is a separate
 *    instruction that doesn't reference the target, so it still executes.
 * Rules: 359.3.e.2 / .5 / .6 / .9 (a "unit at a battlefield" now in base mistargets; unrelated instructions still run),
 *        340 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const FLASH = "ogs-011-024";

const golds = (game: Game) => game.p1.gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

/** P1's turn with exactly [3]. P2's Victim (4 Might — survives 3) at P2's bf1; P2 holds Flash with exactly [2]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Victim" }, "victim")
    .hand(P1, WAGES_OF_PAIN, "wop")
    .hand(P2, FLASH, "flash");
}

async function wagesThenFlash(game: Game): Promise<void> {
  await game.p1.cast("wop", { targets: "victim" });
  expect(game.p1.energy()).toBe(0);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wop", targets: ["victim"] })]); // target locked on play
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "flash")).toBe(true);
  await game.p2.cast("flash", { targets: ["victim"] });
  expect(game.p2.energy()).toBe(0);
  expect(game.chain().map((c) => c.cardId)).toEqual(["wop", "flash"]);
}

describe("Ruling 3d80bc8b69eb0a03 — Wages of Pain still makes Gold when the target is Flashed to base", () => {
  test("control (no response): Victim takes 3 at bf1 and P1 gets exactly one EXHAUSTED Gold token", async () => {
    const game = await board().build();
    await game.p1.cast("wop", { targets: "victim" });
    await game.settle();
    expect(game.state("victim")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(golds(game)).toHaveLength(1);
    expect(game.state(golds(game)[0]!).isExhausted).toBe(true);
    expect(game.zoneOf("wop")).toBe("trash");
  });

  test("Flash resolves first (LIFO): Victim is in P2's base, undamaged, while Wages of Pain still waits on the chain", async () => {
    const game = await board().build();
    await wagesThenFlash(game);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Flash resolves
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["wop"]);
    expect(golds(game)).toEqual([]); // nothing yet
  });

  test("Wages of Pain then resolves: 'Deal 3 to a unit at a battlefield' mistargets (Victim in base takes NOTHING) but the Gold token is still played, exhausted, for P1", async () => {
    const game = await board().build();
    await wagesThenFlash(game);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wop")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim").damage).toBe(0);
    expect(golds(game)).toHaveLength(1);
    expect(game.state(golds(game)[0]!)).toMatchObject({ controller: P1, isExhausted: true });
    expect(game.p2.gear()).toEqual([]); // the caster gets it, not the target's controller
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
