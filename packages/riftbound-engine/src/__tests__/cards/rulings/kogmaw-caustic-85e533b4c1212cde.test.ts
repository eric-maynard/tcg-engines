/**
 * Ruling 85e533b4c1212cde — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · Champion Unit · Chaos · [3][chaos] · 1 Might
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *
 * Q: Kog'Maw dies in combat against a 5-health unit — does the Deathknell's 4 land before healing, killing that unit
 *    (1 combat + 4)?
 * A (riftjudge, self-flagged "rules as written are unclear … will be clarified"): yes — Deathknell resolves before the
 *    heal, 5 total, the unit dies.
 *
 * RULING-CONFLICT: riftjudge 85e533b4c1212cde says the Deathknell resolves BEFORE the combat heal (5-Might unit dies);
 * CR 466.1.a.1 / 466.2 (Combat Cleanup "Heal all Units" happens inside the cleanup, chain items produced by combat damage
 * and that cleanup resolve AFTER it) and the later rulings 45e07ac91f57d49b / 0dc3bb32ef6d0dba say the unit is healed
 * first and survives with 4 damage — engine follows CR. This file pins the engine/CR behaviour for the asked scenario.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";

/** P2's turn. P1's Kog'Maw (1) alone holds bf1; P2 attacks with a 5-Might Juggernaut. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", KOGMAW, "kog")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 5, name: "Juggernaut" }, "jug");
}

async function juggernautKillsKog(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("jug", "bf1");
  await game.p2.passFocus();
  await game.p1.passFocus(); // combat: 5 into Kog'Maw (dies), 1 back onto the Juggernaut
  return game;
}

describe("Ruling 85e533b4c1212cde (RULING-CONFLICT, engine follows CR 466) — Kog'Maw's 1 + Deathknell 4 do not stack on a 5-Might unit", () => {
  test("combat damage is marked and Kog'Maw dies; its Deathknell is put on the chain (P1's item) — this much both readings share", async () => {
    const game = await juggernautKillsKog();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P1, triggered: true })]);
  });

  test("CR order: the Combat Cleanup's heal has already cleared the Juggernaut's 1 combat damage while the Deathknell is pending (the ruling would have it still at 1)", async () => {
    // RULING-CONFLICT: riftjudge 85e533b4c1212cde says damage 1 is still marked here; CR 466.1.a.1 says healed — engine follows CR.
    const game = await juggernautKillsKog();
    expect(game.state("jug")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
  });

  test("the Deathknell then deals 4 to the Juggernaut: 4 < 5, it SURVIVES and conquers bf1 (the ruling would have it die to 1 + 4 = 5)", async () => {
    // RULING-CONFLICT: riftjudge 85e533b4c1212cde says the 5-Might unit dies; CR 466.1–466.2 (+ rulings 45e07ac91f57d49b,
    // 0dc3bb32ef6d0dba) say it lives with 4 damage — engine follows CR.
    const game = await juggernautKillsKog();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("jug")).toMatchObject({ damage: 4, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("shared ground — 'nothing progresses until the chain is empty': the combat result (conquer/point) is only determined after the Deathknell item has left the chain", async () => {
    const game = await juggernautKillsKog();
    expect(game.chain()).toHaveLength(1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // not conquered yet while the item is pending
    expect(game.p2.points()).toBe(0);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });
});
