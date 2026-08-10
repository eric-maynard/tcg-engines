/**
 * Ruling a982c0ca4ef6fec2 — filed under Kog'Maw, Caustic (OGN-190 → ogn-190-298, "[Deathknell] — Deal 4 to all units at my
 *   battlefield") as the analogy; the scenario is:
 *   × Lee Sin, Centered (OGN-151 → ogn-151-298) · 6 Might · "Other buffed friendly units at my battlefield have +2 [Might]."
 *   × a buffed 2-Might Pal beside him (2 + 1 buff + 2 Lee = 5).
 *
 * Q: Lee Sin dies to combat damage; the unit he was pumping now carries damage ≥ its (reduced) Might. Does it die
 *    before the combat heal, or does it heal and survive?
 * A (riftjudge): it dies — a (cascading) cleanup kills it before the healing step; "parallels Kog'Maw's Deathknell".
 *    The answer itself concedes that "under current rules as written" the outcome differs.
 *
 * RULING-CONFLICT: riftjudge a982c0ca4ef6fec2 says the Pal dies before healing; CR 466.1.a (Combat Cleanup = ONE
 * cleanup: 3b kill lethal units → 3c heal ALL units → …; rule 322's repeat cleanup only runs after that pass
 * completes, i.e. after the heal) and riftjudge 9df4ad2a1c30677c (same Lee Sin scenario: "all units are healed
 * immediately — before any further state checks", green in lee-sin-centered-9df4ad2a1c30677c.test.ts) say it
 * survives — engine follows CR. The Kog'Maw parallel the answer draws is kept below as the contrast: a Deathknell is
 * a chain item that resolves AFTER the heal and its fresh 4 damage does kill.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LEE_SIN_CENTERED = "ogn-151-298";
const KOGMAW_CAUSTIC = "ogn-190-298";

/** P1's turn. P2 holds bf1 with Lee Sin (6) and a BUFFED Pal (2+1+2 = 5). P1's 9-Might Giant attacks from base. */
function leeBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", LEE_SIN_CENTERED, "lee")
    .unit(P2, "bf1", { might: 2, name: "Pal" }, "pal", { buffed: true })
    .unit(P1, "base", { might: 9, name: "Giant" }, "giant");
}

/** Giant attacks; P1 assigns 6 to Lee (lethal) and the remaining 3 to Pal (3 < 5, not lethal as assigned). */
async function giantAttacks(): Promise<Game> {
  const game = await leeBoard().build();
  expect(game.state("lee").might).toBe(6);
  expect(game.state("pal")).toMatchObject({ isBuffed: true, might: 5 });
  await game.p1.move("giant", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  // 465.2.c — the attacker orders the assignment: lethal to one unit before moving to the next.
  expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 9 });
  const d = game.decision();
  expect(d?.kind === "distribute" ? d.buckets.map((b) => [b.key, b.lethal]) : []).toEqual([
    ["lee", 6],
    ["pal", 5],
  ]);
  await game.p1.distribute({ lee: 6, pal: 3 });
  return game;
}

describe("Ruling a982c0ca4ef6fec2 — Lee Sin dies in combat; does the unit that loses his +2 die to its marked damage?", () => {
  test("combat: Lee Sin (6 dmg ≥ 6) and the Giant (11 dmg ≥ 9) die; Lee's static is gone so the Pal drops to 2 + 1 = 3 Might", async () => {
    const game = await giantAttacks();
    expect(game.zoneOf("lee")).toBe("trash");
    expect(game.zoneOf("giant")).toBe("trash");
    expect(game.state("pal")).toMatchObject({ isBuffed: true, might: 3 });
  });

  // RULING-CONFLICT: riftjudge a982c0ca4ef6fec2 says the Pal (3 damage on a now-3-Might unit) dies in a cleanup before the
  // heal; CR 466.1.a.1 (heal is step 3c of the SAME Combat Cleanup that killed Lee at 3b; 322 re-cleanups follow it) and
  // riftjudge 9df4ad2a1c30677c say the damage is already cleared when its Might drops — engine follows CR.
  test("engine/CR: the Pal's 3 combat damage is healed in the same Combat Cleanup that killed Lee — it SURVIVES at bf1 with 0 damage and P2 keeps the battlefield", async () => {
    const game = await giantAttacks();
    await game.settle();
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.state("pal")).toMatchObject({ damage: 0, might: 3, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance kept from the answer: a 0-damage unit never dies just because its Might fell — the Pal at 3 Might / 0 damage is fine after the turn passes too", async () => {
    const game = await giantAttacks();
    await game.settle();
    await game.advanceTurn();
    expect(game.zoneOf("pal")).toBe("battlefield-bf1");
    expect(game.state("pal").damage).toBe(0);
  });

  test("the Kog'Maw parallel: a Deathknell is a CHAIN ITEM finalized after the combat heal — Kog'Maw (1) dies beside a 3-Might Buddy that took 2; Buddy is healed to 0 first, then the Deathknell's 4 lands on it (4 ≥ 3) and it dies", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", KOGMAW_CAUSTIC, "kog")
      .unit(P2, "bf1", { might: 3, name: "Buddy" }, "buddy")
      .unit(P1, "base", { might: 3, name: "Poker" }, "poker")
      .build();
    await game.p1.move("poker", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 3 });
    await game.p1.distribute({ buddy: 2, kog: 1 });
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("poker")).toBe("trash"); // took 4
    // Deathknell pending on the chain; Buddy already healed by the Combat Cleanup.
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
    expect(game.state("buddy")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    await game.settle(); // Deathknell resolves: 4 to all units at that battlefield
    expect(game.zoneOf("buddy")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
