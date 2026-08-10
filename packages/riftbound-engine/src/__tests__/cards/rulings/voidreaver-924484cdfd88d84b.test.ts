/**
 * Ruling 924484cdfd88d84b — Voidreaver (UNL-201 → unl-201-219) · Legend · Kha'Zix
 *   "When you win a combat, gain 1 XP. …"
 *
 * Q: Does Voidreaver gain XP when you conquer a battlefield with no enemy units present?
 * A: No. Taking an empty battlefield is a (non-combat) showdown / establishing control, not a combat — no combat was
 *    won, so no XP. (Contrast: winning an actual combat gives exactly 1 XP.)
 * Rules: 466.3.a (winning a combat), 469.1 (conquer), 344.1 (non-combat showdown), 730 (XP).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOIDREAVER = "unl-201-219";

describe("Ruling 924484cdfd88d84b — conquering an empty battlefield is not winning a combat: no XP", () => {
  test("Scout walks onto the OPEN bf1 (no enemy units): non-combat showdown, P1 conquers and scores 1 point — XP stays 0", async () => {
    const game = await scenario().legend(P1, VOIDREAVER, "vr").battlefield("bf1", { controller: null }).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.state("scout").combatRole ?? null).toBeNull(); // no Attacker designation — no combat
    await game.settle();
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("an enemy-CONTROLLED but EMPTY battlefield (P2 controls bf1 on paper, no unit there) is likewise taken without combat → point yes, XP no", async () => {
    const game = await scenario().legend(P1, VOIDREAVER, "vr").battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 1, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);
  });

  test("contrast — a real combat win (3-Might Hunter kills P2's 2-Might Guard at bf1) conquers AND gains exactly 1 XP", async () => {
    const game = await scenario()
      .legend(P1, VOIDREAVER, "vr")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P1, "base", { might: 3, name: "Hunter" }, "hunter")
      .build();
    await game.p1.move("hunter", "bf1");
    expect(game.state("hunter").combatRole).toBe("attacker");
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
  });
});
