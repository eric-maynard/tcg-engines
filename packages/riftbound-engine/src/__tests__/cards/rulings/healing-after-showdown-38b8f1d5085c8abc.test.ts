/**
 * Ruling 38b8f1d5085c8abc — (no specific card) healing after a showdown in which no combat damage was dealt
 *   Exercised with Flash (OGS-011 → ogs-011-024) "[Reaction] Move up to 2 friendly units to base." as the
 *   "rebuked / Flashed away" removal.
 *
 * Q: Do all units heal after a NON-combat showdown (a unit gets Rebuked or Flashed away and no combat damage
 *    is assigned)?
 * A: No — a non-combat showdown never heals. But once a COMBAT showdown has begun, the units heal even if the
 *    damage step ends up assigning nothing, because the Combat Cleanup runs regardless.
 * Rules: 466.1 / 466.1.a.1 (the Combat Cleanup of the Combat Resolution Step inserts "3c. Heal all Units"),
 *        348.2 (a non-combat showdown closes with control only), 465.3 / 466.2 (the damage step is part of the
 *        combat even when there is nothing left to damage).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";

function showdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

describe("Ruling 38b8f1d5085c8abc — no heal after a non-combat showdown; a begun combat heals even with an empty damage step", () => {
  test("NON-combat showdown (nobody to fight): the damaged attacker keeps its damage after the showdown closes", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 5, name: "Scout" }, "scout", { damage: 2 })
      .build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ isCombatShowdown: false });
    await game.settle();
    expect(game.state("scout")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("COMBAT showdown whose defender is Flashed away before damage: no combat damage is assigned, yet everyone heals", async () => {
    const game = await scenario()
      .resources(P2, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard", { damage: 1 })
      .unit(P1, "base", { might: 5, name: "Scout" }, "scout", { damage: 2 })
      .unit(P1, "base", { might: 5, name: "Watchman" }, "watchman", { damage: 3 })
      .hand(P2, FLASH, "flash")
      .build();
    await game.p1.move("scout", "bf1");
    expect(showdown(game)).toMatchObject({ isCombatShowdown: true }); // a COMBAT showdown has begun
    await game.p1.passFocus();
    await game.p2.cast("flash", { targets: ["guard"] }); // the defender leaves before the damage step
    await game.settle();
    expect(game.locationOf("guard")).toBe("base");
    // Nothing was assigned (no defenders left), but the Combat Cleanup still healed the board.
    expect(game.state("scout")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("guard").damage).toBe(0);
    expect(game.state("watchman").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("the difference is whether a COMBAT began, not whether damage happened: same board, but P1 never moves in ⇒ nothing heals", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard", { damage: 1 })
      .unit(P1, "base", { might: 5, name: "Scout" }, "scout", { damage: 2 })
      .build();
    expect(game.state("scout").damage).toBe(2);
    expect(game.state("guard").damage).toBe(1);
    expect(showdown(game)).toBeUndefined();
  });
});
