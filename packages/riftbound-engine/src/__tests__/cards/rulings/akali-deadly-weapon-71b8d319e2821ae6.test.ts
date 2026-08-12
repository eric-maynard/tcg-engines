/**
 * Ruling 71b8d319e2821ae6 — Akali, Deadly Weapon (VEN-021 → ven-021-166) · Champion Unit · Fury · [3] · 3 Might
 *     "When I move, you may deal 1 to a unit at a battlefield I moved to or from. If I'm [Empowered], deal 2 instead."
 *   × Flash (OGS-011 → ogs-011-024) · [Reaction] [2] · "Move up to 2 friendly units to base." (the mover that ends
 *     the showdown, standing in for the Akali legend ability of the question)
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [Action] [1][fury] · "Deal 3 to a unit at a battlefield."
 *
 * Q: If Akali is moved home out of a showdown, do the defending units heal before her "When I move" trigger
 *    resolves?
 * A: No. Pulling the attacker out ends the staged combat before the Combat Damage Step, so no Combat Cleanup —
 *    and therefore no healing — ever happens. The Cleanup after the move only unstages the showdown; the damage
 *    already marked on the defenders is still there when Akali's trigger resolves, and they are legal targets.
 * Rules: 448 (Cleanup after a Move action), 323.9.a (combat unstaged when only one player has units there),
 *        461.1.a.1 (healing belongs to the Combat Cleanup, which needs the Damage Step), 143.3.b (end-of-turn heal).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const AKALI = "ven-021-166";
const FLASH = "ogs-011-024";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2 holds bf1 with a 4-Might Sentinel. P1's Akali (3) is in base with Hextech Ray + Flash and [3][fury]. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Sentinel" }, "sentinel")
    .unit(P1, "base", AKALI, "akali")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, FLASH, "flash");
}

/** Akali attacks bf1 (declining her inbound move trigger); P1 then Rays the Sentinel for 3 inside the showdown. */
async function akaliAttacksAndRays(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("akali", "bf1");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 }); // her inbound "When I move"
  await game.p1.no();
  expect(game.state("akali").combatRole).toBe("attacker");
  expect(game.state("sentinel").combatRole).toBe("defender");
  await game.p1.cast("ray", { targets: "sentinel" });
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.state("sentinel").damage).toBe(3);
  if (game.actingSeat() === P2) {
    await game.p2.passFocus(); // Focus comes back to P1 inside the showdown
  }
  return game;
}

describe("Ruling 71b8d319e2821ae6 — no heal between Akali leaving the showdown and her move trigger", () => {
  test("premise: the Sentinel is a defender carrying 3 marked damage while the showdown is live", async () => {
    const game = await akaliAttacksAndRays();
    expect(game.state("sentinel")).toMatchObject({ combatRole: "defender", damage: 3, might: 4 });
    expect(game.zoneOf("ray")).toBe("trash");
  });

  test("Flash pulls Akali home: the combat is unstaged with no Damage Step, and the Sentinel is STILL sitting on 3 damage", async () => {
    const game = await akaliAttacksAndRays();
    await game.p1.cast("flash", { targets: ["akali"] });
    await game.acting().passPriority();
    await game.acting().passPriority(); // Flash resolves
    expect(game.zoneOf("flash")).toBe("trash");
    expect(game.locationOf("akali")).toBe("base");
    expect(game.state("sentinel").damage).toBe(3); // no heal window
    expect(game.state("akali").damage).toBe(0); // combat damage was never dealt
  });

  test("her 'When I move' trigger is pending right after that move, and the damaged Sentinel at the battlefield she left is a legal target", async () => {
    const game = await akaliAttacksAndRays();
    await game.p1.cast("flash", { targets: ["akali"] });
    await game.acting().passPriority();
    await game.acting().passPriority();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    const d = game.decision();
    if (d?.kind === "pick") {
      expect(d.options.map((o) => o.card)).toContain("sentinel");
      await game.p1.pick("sentinel");
    }
    expect(game.chain().some((c) => c.cardId === "akali" && c.triggered)).toBe(true);
  });

  test("and the 1 damage lands on top of the 3 that never healed: 4 on a 4-Might Sentinel kills it", async () => {
    const game = await akaliAttacksAndRays();
    await game.p1.cast("flash", { targets: ["akali"] });
    await game.acting().passPriority();
    await game.acting().passPriority();
    await game.p1.yes();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("sentinel");
    }
    await game.settle();
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.locationOf("akali")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
