/**
 * Ruling 472ae2413931b2de — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: What marks the end of combat, and when does healing happen if a unit moves into a combat and then rides
 *    away, leaving the battlefield empty?
 * A: Combat ends after the showdown closes (both players pass FOCUS), the combat damage step runs, and every
 *    end-of-combat step is done. Healing is one of those steps, so it happens at the end of combat. With no
 *    opposing units left, the damage step is skipped — but the remaining steps, healing included, still run.
 * Rules: 465.2 (combat damage step), 466.1.a.1 (the Combat Cleanup inserts "3c. Heal all Units"),
 *        466.3/466.5 (result and control), 460/463 (Focus, not priority, closes a showdown).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";
const unit = (might: number, name: string) => ({ cardType: "unit", energyCost: 1, might, name }) as const;

describe("Ruling 472ae2413931b2de — combat ends after its own cleanup, and that cleanup heals", () => {
  test("an ordinary combat: the surviving attacker's damage is gone as soon as the combat is over, still in the main phase", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", unit(3, "Defender"), "def")
      .unit(P1, "base", unit(5, "Attacker"), "atk")
      .build();

    await game.p1.move("atk", "bf1");
    await game.settle();

    expect(game.zoneOf("def")).toBe("trash");
    expect(game.state("atk").damage).toBe(0); // took 3, healed by the Combat Cleanup
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main"); // the turn has not ended — this is end of COMBAT, not end of turn
    expect(game.violations()).toEqual([]);
  });

  test("Ride the Wind empties the battlefield: the damage step is skipped, but the cleanup still heals and control still settles", async () => {
    const game = await scenario()
      .resources(P2, { energy: 4, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", unit(3, "Defender"), "def")
      .unit(P1, "base", unit(5, "Attacker"), "atk", { damage: 2 })
      .unit(P1, "base", unit(4, "Bystander"), "bystander", { damage: 1 })
      .hand(P2, RIDE_THE_WIND, "rtw")
      .build();
    expect(game.state("atk").damage).toBe(2);

    await game.p1.move("atk", "bf1");
    await game.p1.passFocus();
    await game.p2.cast("rtw", { targets: "def" });
    await game.p2.pick("base");
    await game.p2.passPriority();
    await game.p1.passPriority();
    await game.settle();

    // No opposing unit remained, so nothing was dealt — yet the pre-existing damage is healed all the same.
    expect(game.state("atk").damage).toBe(0);
    expect(game.state("def").damage).toBe(0);
    expect(game.state("bystander").damage).toBe(0); // "Heal all Units", not just the combatants
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.p1.points()).toBe(1);
  });

  test("it really is FOCUS that closes the showdown — priority is what passes while a chain item is up", async () => {
    const game = await scenario()
      .resources(P2, { energy: 4, power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", unit(3, "Defender"), "def")
      .unit(P1, "base", unit(5, "Attacker"), "atk")
      .hand(P2, RIDE_THE_WIND, "rtw")
      .build();

    await game.p1.move("atk", "bf1");
    // empty chain inside the showdown ⇒ the pass on offer is a FOCUS pass
    expect(game.p1.legal().map((o) => o.key)).toContain("passShowdownFocus:-");
    await game.p1.passFocus();

    await game.p2.cast("rtw", { targets: "def" });
    await game.p2.pick("base");
    // an item on the chain ⇒ the pass on offer is a PRIORITY pass
    expect(game.p2.legal().map((o) => o.key)).toContain("passChainPriority:-");
  });
});
