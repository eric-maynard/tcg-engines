/**
 * Ruling 4c23871af3d48982 — Yone, Blademaster (SFD-116 → sfd-116-221) · 5 Might
 *     "When I conquer a battlefield that was uncontrolled, deal damage equal to my Might to an enemy unit in a base."
 *   × Flash (OGS-011 → ogs-011-024) · Reaction · [2] "Move up to 2 friendly units to base."
 *
 * Q: Yone attacks an occupied enemy battlefield; the defender Flashes its only unit home mid-showdown. Does Yone trigger?
 * A: No. The combat showdown keeps the battlefield contested and under its ORIGINAL controller until it ends, even with no
 *    defenders left; Yone then conquers a battlefield that was controlled, so his "was uncontrolled" trigger does not fire.
 * Rules: 190.4.b (control persists while contested), 464/465 (combat showdown does not convert), 467 (conquer).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const YONE = "sfd-116-221";
const FLASH = "ogs-011-024";

/** P1's turn. P2 holds bf1 with a lone 2-Might Guard and keeps a 6-Might Sleeper in base; Flash + [2]. P1: Yone in base. */
function board() {
  return scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 6, name: "Sleeper" }, "sleeper")
    .unit(P1, "base", YONE, "yone")
    .hand(P2, FLASH, "flash");
}

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/** Every non-action prompt seen while driving to the open main phase (Yone's damage pick would show up here). */
async function drain(game: Game): Promise<string[]> {
  const prompts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      break;
    }
    if (d.kind === "action" && d.passKey) {
      await game.seat(d.seat).pass();
    } else if (d.kind === "pick" && d.seat === P1) {
      prompts.push(`${d.source?.cardId ?? ""}:${d.prompt}`);
      await game.p1.pick(d.options[0]!.key);
    } else {
      prompts.push(`${d.seat}:${d.kind}:${d.prompt}`);
      break;
    }
  }
  return prompts;
}

describe("Ruling 4c23871af3d48982 — Flashing the lone defender away does not make the battlefield 'uncontrolled' for Yone", () => {
  test("Yone moves into the occupied bf1: a COMBAT showdown opens; bf1 is contested but still controlled by P2", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bf1");
    expect(showdown(game)).toMatchObject({ active: true, attackingPlayer: P1, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.chain()).toEqual([]); // the move itself opened no chain
  });

  test("P2 Flashes the Guard home during the showdown: no defenders remain, yet the showdown is still the combat showdown and P2 STILL controls the contested bf1", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bf1");
    await game.p1.passFocus();
    expect(game.p2.can("cast", "flash")).toBe(true);
    await game.p2.cast("flash", { targets: ["guard"] });
    for (let i = 0; i < 6 && game.chain().length > 0; i++) {
      await game.acting().passPriority();
    }
    expect(game.locationOf("guard")).toBe("base");
    expect(game.p2.units("bf1")).toEqual([]);
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
  });

  // Expected: bf1 was P2's (controlled) right up to the conquer, so "conquer a battlefield that was uncontrolled" is false —
  // no Yone trigger. Actual: once the Flash-emptied showdown ends the engine treats bf1 as having been uncontrolled and
  // asks P1 to "Choose a target for Yone, Blademaster" (then deals 5 to the Sleeper).
  test("ruling 4c23871af3d48982 — engine fires Yone's 'was uncontrolled' trigger after the defender Flashed away from a controlled battlefield", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("flash", { targets: ["guard"] });
    const prompts = await drain(game);
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(prompts.filter((p) => p.startsWith("yone"))).toEqual([]);
    expect(game.chain()).toEqual([]);
    expect(game.state("sleeper")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: Yone conquering the genuinely UNCONTROLLED bf2 does trigger — 5 damage to an enemy unit in a base", async () => {
    const game = await board().build();
    await game.p1.move("yone", "bf2");
    for (let i = 0; i < 16; i++) {
      const d = game.decision();
      if (!d || (d.kind === "action" && d.context === "main")) {
        break;
      }
      if (d.kind === "action" && d.passKey) {
        await game.seat(d.seat).pass();
      } else if (d.kind === "pick" && d.seat === P1) {
        await game.p1.pick("sleeper");
      } else {
        break;
      }
    }
    await game.settle();
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // 5 damage on the 6-Might Sleeper (it survives, so the damage is observable until end of turn).
    expect(game.state("sleeper")).toMatchObject({ damage: 5, zone: "base" });
  });
});
