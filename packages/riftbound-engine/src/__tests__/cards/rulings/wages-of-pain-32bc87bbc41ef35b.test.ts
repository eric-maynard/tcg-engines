/**
 * Ruling 32bc87bbc41ef35b — Wages of Pain (SFD-070 → sfd-070-221) · Spell · Mind · 3 · [Hidden][Action]
 *   "Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction [2] "Move up to 2 friendly units to base."
 *
 * Q: I Wages of Pain an enemy unit at a battlefield, then attack there; the opponent Flashes the damaged unit back
 *    to base. Does that unit still heal at combat cleanup?
 * A: Yes. Combat was initiated the moment my unit moved in; all combat steps including cleanup happen, and the
 *    cleanup heals ALL units in play — including the one that left for base before damage was dealt.
 * Rules: 620 (combat begins when units become opposed at a battlefield), 627 / 465.5 (combat cleanup: clear damage
 *        from all units), 359 (Flash resolves during the showdown).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const FLASH = "ogs-011-024";

function board() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Brute" }, "brute")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, WAGES_OF_PAIN, "wages")
    .hand(P2, FLASH, "flash")
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2 });
}

/** P1 Wages the Brute (3 damage, survives at 5), then attacks bf1; in the showdown P2 Flashes the Brute home. */
async function wagesAttackFlash(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("wages", { targets: "brute" });
  await game.settle();
  expect(game.state("brute")).toMatchObject({ damage: 3, location: "bf1" });
  await game.p1.move("raider", "bf1");
  // Combat is initiated: roles are assigned.
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("brute").combatRole).toBe("defender");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.passFocus();
  expect(game.actingSeat()).toBe(P2);
  await game.p2.cast("flash", { targets: "brute" });
  // Resolve Flash only.
  for (let i = 0; i < 4 && game.chain().some((c) => c.cardId === "flash"); i++) {
    await game.acting().passPriority();
  }
  return game;
}

describe("Ruling 32bc87bbc41ef35b — a damaged defender Flashed to base still heals at the combat's cleanup", () => {
  test("mid-showdown, after Flash resolves: the Brute is in base STILL carrying its 3 damage (no heal yet)", async () => {
    const game = await wagesAttackFlash();
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("brute")).toBe("base");
    expect(game.state("brute").damage).toBe(3);
    expect(game.locationOf("raider")).toBe("bf1");
  });

  test("the combat then runs to completion (no defender left → Raider conquers) and cleanup heals EVERY unit — the Brute in base is back to 0 damage", async () => {
    const game = await wagesAttackFlash();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.zoneOf("brute")).toBe("base");
    expect(game.state("brute").damage).toBe(0);
    expect(game.state("brute").combatRole).toBeNull();
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
