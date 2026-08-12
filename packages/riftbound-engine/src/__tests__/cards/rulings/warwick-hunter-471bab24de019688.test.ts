/**
 * Ruling 471bab24de019688 — Warwick, Hunter (OGN-159 → ogn-159-298) · [6][body] · 5 Might
 *   "I enter ready. When I attack, kill all damaged enemy units here."
 *
 * Q: One attacker against several defenders — may combat damage be split freely, or must one unit be given
 *    lethal damage before the next receives any?
 * A: Lethal first, one unit at a time: choose a defender, assign until it has lethal damage, only then move
 *    on; any leftover after everyone is lethal goes to the last one. A [Tank] must be chosen first.
 *    Nuance: units HEAL at the end of combat, so no damage markers survive it — which is exactly why
 *    Warwick's "kill all damaged enemy units here" finds nothing from an earlier combat.
 * Rules: 465.2.c.4 (assign lethal before moving to the next unit), 741.1.b ([Tank] must be assigned lethal
 *        first), 466.1.a (combat cleanup heals all damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK_HUNTER = "ogn-159-298";

/** P1's turn. Two 3-Might defenders hold bf1; P1 attacks with a single unit of `might`. */
function duel(might: number, tank = false) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", tank ? { keywords: ["Tank"], might: 3, name: "Bodyguard" } : { might: 3, name: "Guard A" }, "d1")
    .unit(P2, "bf1", { might: 3, name: "Guard B" }, "d2")
    .unit(P1, "base", { might, name: "Raider" }, "atk");
}

/** Reach the manual combat-damage assignment prompt (autoProcedures off so it is surfaced). */
async function toAssignment(might: number): Promise<Game> {
  const game = await duel(might).autoProcedures(false).build();
  await game.p1.move("atk", "bf1");
  await game.p1.passFocus();
  await game.p2.passFocus();
  await game.p1.choose("resolveFullCombat:bf1");
  return game;
}

describe("Ruling 471bab24de019688 — combat damage is assigned lethal-first, one defender at a time", () => {
  test("the assignment prompt names each defender's lethal threshold and offers the lethal-first default", async () => {
    const game = await toAssignment(4);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 4 });
    expect(d?.kind === "distribute" ? d.buckets.map((b) => ({ key: b.key, lethal: b.lethal })) : []).toEqual([
      { key: "d1", lethal: 3 },
      { key: "d2", lethal: 3 },
    ]);
    expect(d?.kind === "distribute" ? d.defaultAllocation : undefined).toEqual({ d1: 3, d2: 1 });
  });

  test("ruling: a free 2/2 split is ILLEGAL — neither defender would have lethal damage", async () => {
    const game = await toAssignment(4);
    expect((await game.p1.try((p) => p.distribute({ d1: 2, d2: 2 }))).ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "distribute", seat: P1 }); // still waiting
  });

  test("…while 3 (lethal) to the first and the leftover 1 to the second IS legal", async () => {
    const game = await toAssignment(4);
    expect((await game.p1.try((p) => p.distribute({ d1: 3, d2: 1 }))).ok).toBe(true);
  });

  test("played out normally, 4 damage kills exactly ONE of the two 3-Might defenders", async () => {
    const game = await duel(4).build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    const dead = ["d1", "d2"].filter((id) => game.zoneOf(id) === "trash");
    expect(dead).toHaveLength(1);
    expect(game.zoneOf("atk")).toBe("trash"); // 3 + 3 back is lethal on the 4-Might Raider
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("[Tank] must be assigned first: 3 damage against a Tank + a plain guard all lands on the Tank", async () => {
    const game = await duel(3, true).build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("d1")).toBe("trash"); // the Tank
    expect(game.zoneOf("d2")).toBe("battlefield-bf1"); // the plain guard, untouched
  });

  test("nuance — units heal at the end of combat: the survivor carries no damage marker afterwards", async () => {
    const game = await duel(4).build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    const survivor = ["d1", "d2"].find((id) => game.zoneOf(id) === "battlefield-bf1") as string;
    expect(game.state(survivor).damage).toBe(0);
  });

  test("…which is why Warwick, Hunter's 'kill all damaged enemy units here' finds nothing after an earlier combat", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Guard A" }, "d1")
      .unit(P2, "bf1", { might: 3, name: "Guard B" }, "d2")
      .unit(P1, "base", { might: 4, name: "Raider" }, "atk")
      .unit(P1, "base", WARWICK_HUNTER, "warwick")
      .build();
    await game.p1.move("atk", "bf1"); // first combat: one guard dies, the other is assigned 1 then healed
    await game.settle();
    const survivor = ["d1", "d2"].find((id) => game.zoneOf(id) === "battlefield-bf1") as string;
    expect(game.state(survivor).damage).toBe(0);
    await game.advanceTurn();
    await game.advanceToTurnOf(P1);
    await game.p1.move("warwick", "bf1"); // Warwick's trigger looks for DAMAGED enemy units here
    for (let i = 0; i < 6 && game.chain().length > 0 && game.decision()?.kind === "action"; i++) {
      await game.acting().passPriority();
    }
    expect(game.zoneOf(survivor)).toBe("battlefield-bf1"); // nothing was damaged, so nothing was killed
    expect(game.violations()).toEqual([]);
  });
});
