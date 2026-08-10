/**
 * Ruling 55971b8dc4c61519 — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · Champion Unit · Chaos · [3][chaos] · 1 Might
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *
 * Q: Can Kog'Maw kill a 5-Might unit (1 combat damage + 4 Deathknell)?
 * A: No. Order: combat damage is dealt (Kog'Maw and the unit trade blows) → the Combat Cleanup heals damage off the
 *    survivors → only then does the Deathknell trigger resolve and deal 4. The 5-Might unit ends with just the 4
 *    marked and survives with 1 to spare.
 * Rules: 465.2 (combat damage), 466.1.a.1 (combat cleanup heals), 466.2 (triggers from the cleanup resolve after
 *        it), 808 (Deathknell).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";

/** P1's turn. P2's Kog'Maw alone holds bf1; P1 has a 5-Might attacker (and P1 holds bf2 so nothing else moves). */
function board(attackerMight: number) {
  return scenario()
    .turn(3)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P1, "base", { might: attackerMight, name: "Attacker" }, "atk");
}

/** Attack bf1 and pass Focus both ways → combat damage + Combat Cleanup; stops with the Deathknell on the chain. */
async function attackAndStrike(attackerMight: number): Promise<Game> {
  const game = await board(attackerMight).build();
  await game.p1.move("atk", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  return game;
}

describe("Ruling 55971b8dc4c61519 — Kog'Maw's 1 combat damage and its Deathknell 4 never stack: a 5-Might unit survives", () => {
  test("1. combat damage is dealt both ways: Kog'Maw (1 Might) takes 5 and dies; its Deathknell goes on the chain", async () => {
    const game = await attackAndStrike(5);
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
  });

  test("2. the Combat Cleanup has already HEALED the attacker (Kog'Maw's 1 is gone: damage 0) while the Deathknell is still pending", async () => {
    const game = await attackAndStrike(5);
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]);
    expect(game.state("atk")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("3. the Deathknell resolves: 4 damage on a clean 5-Might unit — it survives with 4 marked (1 to spare) and conquers bf1", async () => {
    const game = await attackAndStrike(5);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("atk")).toMatchObject({ damage: 4, might: 5, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: a 4-Might attacker is also healed first, but the Deathknell's 4 alone is lethal — it dies and bf1 is left uncontrolled", async () => {
    const game = await attackAndStrike(4);
    expect(game.state("atk").damage).toBe(0);
    await game.settle();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller ?? null).toBeNull();
    expect(game.p1.points()).toBe(0);
  });
});
