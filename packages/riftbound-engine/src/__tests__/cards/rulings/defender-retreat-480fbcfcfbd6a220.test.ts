/**
 * Ruling 480fbcfcfbd6a220 — (no specific card) the defender retreats mid-combat: who ends up holding it?
 *   Exercised with Flash (OGS-011 → ogs-011-024) "[Reaction] Move up to 2 friendly units to base."
 *
 * Q: If the defending player retreats their unit during a combat showdown, does the showdown just end (with
 *    healing), or does the attacker conquer the battlefield?
 * A: The combat showdown runs to completion and the attacker conquers. Combat damage is skipped, the units
 *    heal in the Combat Cleanup, Contested is cleared and control goes to the only player left there — the
 *    attacker. No second showdown is started.
 * Rules: 466.1.a.1 (heal, inside the Combat Cleanup that happens BEFORE the result is read), 466.3.a (the
 *        only player with units remaining wins), 466.5 / 466.5.d (Establish Control ⇒ Conquer if not yet
 *        scored this turn), 466.5.a (clear Contested).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLASH = "ogs-011-024";

/** P1's turn. P2 holds bf1 with a lone damaged Guard; P1's damaged Raider attacks; P2 holds Flash. */
function board() {
  return scenario()
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 6, name: "Guard" }, "guard", { damage: 1 })
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider", { damage: 2 })
    .hand(P2, FLASH, "flash");
}

function showdown(game: Game) {
  return game.gameState.interaction?.showdownStack?.at(-1);
}

describe("Ruling 480fbcfcfbd6a220 — retreating the defender hands the battlefield to the attacker", () => {
  test("the attacker (who would have LOST the fight 3 vs 6) conquers instead: Guard home, Raider standing at bf1, +1 point", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    expect(showdown(game)).toMatchObject({ isCombatShowdown: true });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: true, controller: P2 });
    await game.p1.passFocus();
    await game.p2.cast("flash", { targets: ["guard"] }); // the retreat
    await game.settle();

    expect(game.locationOf("guard")).toBe("base");
    expect(game.zoneOf("raider")).toBe("battlefield-bf1"); // never recalled — it won the combat
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1); // Conquer scored (466.5.d)
    expect(showdown(game)?.active).toBeFalsy(); // and no new showdown was opened
    expect(game.violations()).toEqual([]);
  });

  test("the heal happens on the way (Combat Cleanup, before control is determined) — both the retreating Guard and the surviving Raider come out undamaged", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("flash", { targets: ["guard"] });
    await game.settle();
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.state("guard").damage).toBe(0);
  });

  test("point of comparison: if the Guard STAYS, the same 3-Might Raider simply loses the fight and P2 keeps the battlefield", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash"); // 6 damage onto a 3-Might unit that was already at 2
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
  });
});
