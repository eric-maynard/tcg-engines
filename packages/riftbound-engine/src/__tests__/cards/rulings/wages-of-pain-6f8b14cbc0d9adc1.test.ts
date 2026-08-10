/**
 * Ruling 6f8b14cbc0d9adc1 — Wages of Pain (SFD-070 → sfd-070-221) · Action · [3] "[Hidden] Deal 3 to a unit at a battlefield.
 *   Play a Gold gear token exhausted." × Gold token (SFD-T03).
 *
 * Q: What happens if I Wages of Pain a unit with Assault 2?
 * A: Assault is passive "+X Might while I am an attacker". Not an attacker ⇒ Assault is off: the unit just takes 3
 *    (a 3-Might Assault-2 unit dies). IS an attacker ⇒ its Might is base+2; Wages deals damage, it does not lower
 *    Might, so a 3-Might Assault-2 attacker (5) survives with 3 damage. The Gold token is played either way.
 * Rules: 807.1.c (Assault), 142.2.a (lethal = damage ≥ Might), 359.3.e.5 (token instruction independent of target).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAGES_OF_PAIN = "sfd-070-221";
const LAURENT_DUELIST = "sfd-156-221"; // 3 Might · "[Assault 2]" (vanilla otherwise)
const INFERNA = "unl-002-219"; // 1 Might · "[Ambush] [Assault 2]"

const goldOf = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((g) => game.state(g).isToken && game.state(g).name === "Gold");

describe("Ruling 6f8b14cbc0d9adc1 — Wages of Pain on an Assault 2 unit", () => {
  test("case 1 (NOT an attacker): Laurent Duelist (3, [Assault 2]) idling at a battlefield reads 3 Might, takes 3 and dies; Gold token is played exhausted", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", LAURENT_DUELIST, "raider")
      .hand(P1, WAGES_OF_PAIN, "wages")
      .build();
    expect(game.state("raider").combatRole).not.toBe("attacker");
    expect(game.state("raider").might).toBe(3); // Assault inactive outside an attack (807.1.c)
    await game.p1.cast("wages", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string).isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("case 1b (a DEFENDER is not an attacker either): defending 3-Might [Assault 2] unit reads 3 and dies to Wages of Pain cast in the showdown", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", LAURENT_DUELIST, "raider")
      .unit(P1, "base", { might: 2, name: "Scout" }, "scout")
      .hand(P1, WAGES_OF_PAIN, "wages")
      .build();
    await game.p1.move("scout", "bf1");
    expect(game.state("raider").combatRole).toBe("defender");
    expect(game.state("raider").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("wages", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("wages")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(goldOf(game, "p1")).toHaveLength(1);
  });

  test("case 2 (IS an attacker): the attacking 3-Might [Assault 2] unit reads 5; Wages marks 3 damage but does not lower Might — it survives (5 Might, 3 damage); Gold token still played", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P2, "base", LAURENT_DUELIST, "raider")
      .hand(P1, WAGES_OF_PAIN, "wages")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("raider").might).toBe(5); // 3 + Assault 2 while attacking
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("wages", { targets: "raider" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("wages")).toBe("trash");
    // Damage is marked; Might is unchanged; 3 < 5 ⇒ not lethal (142.2.a).
    expect(game.zoneOf("raider")).toBe("battlefield-bf1");
    expect(game.state("raider")).toMatchObject({ damage: 3, might: 5 });
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string).isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("case 2b: whether the attacker dies depends on total damage vs current Might — Inferna (1, [Assault 2]; reads 3 while attacking) DOES die to the 3 damage", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 6, name: "Wall" }, "wall")
      .unit(P2, "base", INFERNA, "weak")
      .hand(P1, WAGES_OF_PAIN, "wages")
      .build();
    await game.p2.move("weak", "bf1");
    expect(game.state("weak").might).toBe(3);
    await game.p2.passFocus();
    await game.p1.cast("wages", { targets: "weak" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("weak")).toBe("trash");
    expect(goldOf(game, "p1")).toHaveLength(1);
  });
});
