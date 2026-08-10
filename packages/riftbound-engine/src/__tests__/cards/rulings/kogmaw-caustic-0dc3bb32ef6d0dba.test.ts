/**
 * Ruling 0dc3bb32ef6d0dba — Kog'Maw, Caustic (OGN-190 → ogn-190-298) · 1-Might Chaos champion
 *   "[Deathknell] — Deal 4 to all units at my battlefield."
 *   × Cannon Barrage (OGN-127 → ogn-127-298) · Body Reaction spell · [2][body] — "Deal 2 to all enemy units in combat."
 *   (Taric OGN-074 / Lee Sin OGN-151 are only cited by the answer as design motivation.)
 *
 * Q: When Kog'Maw dies in combat, does its Deathknell damage land before or after units heal from combat?
 *    Can the trigger be responded to (e.g. with Cannon Barrage)?
 * A: After. Units that die to combat damage note their Deathknell during the combat cleanup, survivors are
 *    healed in that cleanup, and only then is Kog'Maw's trigger finalized onto the chain — players get
 *    priority and may respond with Reactions from hand — and its 4 damage is then marked on the freshly
 *    healed units ("my battlefield" is where it died). Outside combat, Deathknell goes on the chain right away.
 * Rules: 323.4 / 466.1 (cleanup: note death triggers, heal, then finalize), 466.2 (those items resolve
 *        before the combat result), 466.7.a, 808.1.d.2–3, 406.4.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KOGMAW = "ogn-190-298";
const CANNON_BARRAGE = "ogn-127-298";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] Deal 3 to a unit at a battlefield — the out-of-combat kill

/**
 * P1's turn. P2 controls bf1 with Kog'Maw (1) and a 5-Might Bruiser. P1 attacks with a 4-Might Attacker
 * and holds Cannon Barrage with exactly [2][body].
 * Combat: P1 assigns 4 = 1 to Kog'Maw (lethal) + 3 to the Bruiser; defenders deal 6 to the Attacker (dies).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", KOGMAW, "kog")
    .unit(P2, "bf1", { might: 5, name: "Bruiser" }, "bruiser")
    .unit(P1, "base", { might: 4, name: "Attacker" }, "atk")
    .hand(P1, CANNON_BARRAGE, "barrage");
}

/** Attack, both pass focus, P1 assigns 1 to Kog'Maw and 3 to the Bruiser. Stops right after combat damage/cleanup. */
async function combatKillsKog(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("atk", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
  await game.p1.distribute({ bruiser: 3, kog: 1 });
  return game;
}

describe("Ruling 0dc3bb32ef6d0dba — Kog'Maw's combat Deathknell lands AFTER the combat heal, and can be responded to", () => {
  test("combat damage: Kog'Maw (1) and the Attacker (4, took 6) die; the Bruiser took 3 and survived", async () => {
    const game = await combatKillsKog();
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
  });

  test("ruling: at the moment Kog'Maw's Deathknell sits on the chain, the combat cleanup has ALREADY healed the Bruiser (damage 0) — the trigger was finalized after the heal", async () => {
    const game = await combatKillsKog();
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", controller: P2, triggered: true })]);
    expect(game.state("bruiser").damage).toBe(0);
    // 466.2: this item resolves before the combat result / control steps — designations are only removed
    // at 466.7.a, so the Bruiser is still a defender while the Deathknell is pending.
    expect(game.state("bruiser").combatRole).toBe("defender");
  });

  test("ruling: players get priority on the Deathknell item — P1 may respond with Cannon Barrage (a Reaction) from hand before it resolves", async () => {
    const game = await combatKillsKog();
    // Priority goes round; find P1's window while the item is still pending.
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "barrage")).toBe(true);
    await game.p1.cast("barrage");
    expect(game.chain().map((c) => c.cardId)).toEqual(["kog", "barrage"]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("ruling: when the Deathknell resolves its 4 damage is marked on the now-healed Bruiser (0 → 4, survives at 5 Might) — 'my battlefield' is still found although Kog'Maw is in the trash", async () => {
    const game = await combatKillsKog();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
    expect(game.state("bruiser").damage).toBe(4);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("nuance: OUTSIDE combat (Kog'Maw killed by Hextech Ray) the Deathknell goes on the chain immediately and there is no heal — a Bruiser already carrying 1 damage goes to 5 and dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P2, "bf1", KOGMAW, "kog")
      .unit(P2, "bf1", { might: 5, name: "Bruiser" }, "bruiser", { damage: 1 })
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("ray", { targets: "kog" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Ray resolves: Kog'Maw dies
    expect(game.zoneOf("kog")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kog", triggered: true })]);
    expect(game.state("bruiser").damage).toBe(1); // nothing healed it
    await game.settle();
    expect(game.zoneOf("bruiser")).toBe("trash");
  });
});
