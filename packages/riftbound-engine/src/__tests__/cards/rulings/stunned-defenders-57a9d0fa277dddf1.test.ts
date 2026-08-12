/**
 * Ruling 57a9d0fa277dddf1 — (no specific card) attacking into stunned defenders
 *
 * Q: What happens when I attack with less Might than a stunned defender, and how does target selection work
 *    when only one of several defenders is stunned?
 * A: A stunned unit deals no combat damage but still has its Might, so you still need enough Might to get
 *    over it. With several defenders you choose which ones your damage kills. If neither side wipes the
 *    other out, the fight ends without a conquer. (The ruling adds "both players' units are recalled" — see
 *    the RULING-CONFLICT note: the Core Rules recall the ATTACKERS only.)
 * Rules: 423.1 [Stun] (a stunned unit deals no combat damage; its Might is untouched), 465.2.a–c (Might
 *        sums and per-unit lethal assignment), 466.1.a.2 ("Recall Attackers present at the Battlefield if
 *        Defenders are still present"), 466.3.d (No Result when units were recalled in step 3d).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

/** Drain the combat, answering any damage-assignment prompt with `plan`. */
async function fight(game: Game, plan: Record<string, number>): Promise<void> {
  for (let i = 0; i < 6; i++) {
    const d = game.decision();
    if (d?.kind === "distribute") {
      const keys = d.buckets.map((b) => b.card ?? b.key);
      await game.seat(d.seat).distribute(Object.fromEntries(keys.map((k) => [k, plan[k] ?? 0])));
      continue;
    }
    const r = await game.settle();
    if (r.reason !== "unanswered") {
      return;
    }
  }
}

describe("Ruling 57a9d0fa277dddf1 — a stunned defender deals nothing but still has to be out-Mighted", () => {
  test("2-Might attacker vs a stunned 4-Might defender: the stun saves the attacker from damage but 2 < 4 kills nobody", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Sleeper" }, "sleeper", { stunned: true })
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .build();
    expect(game.state("sleeper")).toMatchObject({ isStunned: true, might: 4 }); // Might is not reduced by the stun
    await game.p1.move("scout", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await fight(game, { sleeper: 2 });
    expect(game.zoneOf("sleeper")).toBe("battlefield-bf1"); // 2 damage on a 4-Might unit
    expect(game.state("sleeper").damage).toBe(0); // healed in the Combat Cleanup
    expect(game.state("scout").damage).toBe(0); // the stunned defender dealt nothing
    // RULING-CONFLICT: riftjudge 57a9d0fa277dddf1 says "both units are recalled"; CR 466.1.a.2 recalls the
    // ATTACKERS only ("Recall Attackers present at the Battlefield if Defenders are still present") — engine
    // follows CR: the Sleeper stays put, the Scout goes home.
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("5-Might attacker vs a stunned 9 + an unstunned 4: the attacker CHOOSES and can kill the 4, then survives the 4 damage it dealt back", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Colossus" }, "colossus", { stunned: true })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    // The assignment IS a choice (5 among lethal-4 and lethal-9): 4 on the Guard, the spare 1 on the Colossus.
    const d = game.decision();
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 5 });
    const lethal = d?.kind === "distribute" ? Object.fromEntries(d.buckets.map((b) => [b.card ?? b.key, b.lethal])) : {};
    expect(lethal).toMatchObject({ colossus: 9, guard: 4 });
    await fight(game, { colossus: 1, guard: 4 });
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("colossus")).toBe("battlefield-bf1");
    // Only the unstunned Guard dealt damage (4 < the Raider's 5), so the Raider lives — and, a defender
    // still being present, it is recalled. (Same RULING-CONFLICT as above: the Colossus is NOT recalled.)
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.state("raider").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
  });

  test("the Might threshold is real: with 10 Might the attacker does get over the stunned 9 and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Colossus" }, "colossus", { stunned: true })
      .unit(P1, "base", { might: 10, name: "Behemoth" }, "behemoth")
      .build();
    await game.p1.move("behemoth", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();
    await fight(game, { colossus: 10 });
    expect(game.zoneOf("colossus")).toBe("trash");
    expect(game.zoneOf("behemoth")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
