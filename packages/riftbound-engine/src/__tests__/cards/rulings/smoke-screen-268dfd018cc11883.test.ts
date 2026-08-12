/**
 * Ruling 268dfd018cc11883 — Smoke Screen (OGN-093 → ogn-093-298) · Mind · [2][mind] · [Reaction]
 *   "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × a 4-Might attacker with [Assault 2] (Jinx) — +2 Might while it is an Attacker.
 *
 * Q: Smoke Screen hits Jinx in combat; Jinx takes 1 damage that is cleared in the cleanup, then loses Attacker
 *    (and the Assault bonus). Does Jinx die?
 * A: No. 6 (4 + Assault 2) − 4 = 2 during the combat; the 1 damage is healed by the Combat Cleanup; losing the
 *    Attacker designation takes the +2 away, leaving 0 Might — but killing needs NON-ZERO marked damage that
 *    equals or exceeds Might, and Jinx has none. It survives at 0 Might.
 * Rules: 142.4 (lethal damage is non-zero damage ≥ Might), 466.1.a.1 (Combat Cleanup heals all units),
 *        808 (Assault applies only while attacking).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";

/** 4-Might unit with [Assault 2]. */
const JINX = {
  abilities: [{ keyword: "Assault", type: "keyword", value: 2 }],
  cardType: "unit",
  keywords: ["Assault"],
  might: 4,
  name: "Jinx (test)",
  rulesText: "[Assault 2]",
} as const;

/** P1's turn. P2 holds bf1 with a 1-Might Runt and holds Smoke Screen with its full cost. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { mind: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 1, name: "Runt" }, "runt")
    .unit(P1, "base", JINX, "jinx")
    .hand(P2, SMOKE_SCREEN, "smoke");
}

/** Jinx attacks (6 Might with Assault); P2 answers with Smoke Screen and it resolves. */
async function attackAndSmoke(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("jinx", "bf1");
  expect(game.state("jinx")).toMatchObject({ combatRole: "attacker", might: 6 }); // 4 + Assault 2
  await game.p1.passFocus();
  await game.p2.cast("smoke", { targets: "jinx" });
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("smoke")).toBe("trash");
  return game;
}

describe("Ruling 268dfd018cc11883 — Smoke Screen'd Jinx ends the combat at 0 Might with 0 damage, and lives", () => {
  test("Smoke Screen takes the attacking Jinx from 6 to 2 (the -4 lands in full; the minimum of 1 does not bite)", async () => {
    const game = await attackAndSmoke();
    expect(game.state("jinx").might).toBe(2);
    expect(game.state("jinx").mightModifier).toBe(-4);
  });

  test("ruling: Jinx takes the Runt's 1 damage, the Combat Cleanup clears it, the Assault bonus falls away — 0 Might, 0 damage, still alive", async () => {
    const game = await attackAndSmoke();
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("battlefield-bf1"); // survived
    expect(game.state("jinx").damage).toBe(0); // healed in the Combat Cleanup
    expect(game.state("jinx").combatRole).toBeNull(); // no longer an Attacker …
    expect(game.state("jinx").might).toBe(0); // … so 4 − 4 = 0, with no Assault to add
    expect(game.zoneOf("runt")).toBe("trash"); // Jinx's 2 ≥ the Runt's 1
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("a 0-Might unit with no marked damage is not killed by the state check — Jinx is still there at the start of the next turn, back to 4", async () => {
    const game = await attackAndSmoke();
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("battlefield-bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("jinx")).toBe("battlefield-bf1");
    expect(game.state("jinx").might).toBe(4); // "this turn" wore off
  });

  test("control: without Smoke Screen the attacking Jinx stays at 6 and the combat plays out the same way for the Runt", async () => {
    const game = await board().build();
    await game.p1.move("jinx", "bf1");
    await game.settle();
    expect(game.zoneOf("runt")).toBe("trash");
    expect(game.state("jinx")).toMatchObject({ damage: 0, might: 4, zone: "battlefield-bf1" });
  });
});
