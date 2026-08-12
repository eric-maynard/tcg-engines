/**
 * Ruling 3c7d9fe0971ed9d6 — (no specific card) when a Showdown happens.
 *
 * Q: When does a showdown occur in Riftbound?
 * A: When control of a battlefield becomes contested (units of different players present) — that
 *    showdown is part of a Combat — or when units move to an EMPTY battlefield, which is a stand-alone
 *    non-combat showdown. Reinforcing a battlefield you already control starts no showdown at all.
 * Rules: 344.2 / 429.1 (Contested ⇒ Showdown staged at the next Cleanup), 437 / 440 (Combat needs
 *        opposing units), 445 (Contested), 348.2.a (a lone player closing a showdown takes control).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

describe("Ruling 3c7d9fe0971ed9d6 — a showdown opens on contest or on a move to an empty battlefield, never on reinforcing your own", () => {
  test("contested: moving into an enemy-held battlefield opens a showdown that IS a combat (attacker/defender designations)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p1.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.contested).toBeTruthy();
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("guard").combatRole).toBe("defender");
  });

  test("empty battlefield: the showdown opens but there is NO combat — no designations, and both seats still get to act", async () => {
    const game = await scenario().battlefield("bf1").unit(P1, "base", { might: 3, name: "Raider" }, "raider").build();
    await game.p1.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("raider").combatRole).toBeNull();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 }); // the other player may respond
    await game.p2.passFocus();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // 348.2.a — lone player takes control on close
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("reinforcing a battlefield you ALREADY control opens no showdown: the turn player stays in their open main phase", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P1, "base", { might: 2, name: "Reinforcement" }, "extra")
      .build();
    await game.p1.move("extra", "bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.bf1?.contested).toBeFalsy();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("extra").combatRole).toBeNull();
    expect(game.violations()).toEqual([]);
  });
});
