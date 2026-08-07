/**
 * Ambessa, The Wolf — ven-084-166 · Unit (Champion) · Body · 4 energy · 4 might
 *
 *   [Empower] [3][body] ([3][body]: Empower me. Use only if not Empowered.)
 *   [Empowered][>] I have +3 [Might] and can't be dealt damage unless I'm in combat.
 *
 * rule 827 — an `[Empowered]` clause is a static that functions only while the
 * host is Empowered. rule 465.2.c.10 — "can't be dealt damage" is a continuous
 * restriction, so the "unless I'm in combat" carve-out has to be re-evaluated
 * every time damage would be dealt: in base she ignores it, in a combat she
 * takes it like anyone else.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ven-084-166";
const FALLING_STAR = "ogn-029-298"; // spell, 2 energy + [fury][fury]: "Deal 3 to a unit." ×2

describe("Ambessa, The Wolf (ven-084-166)", () => {
  test("NOT Empowered: she is an ordinary unit and takes the spell damage", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .unit(P2, "base", CARD, "ambessa")
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.cast("fs", { targets: ["ambessa", "ambessa"] });
    await game.settle();
    expect(game.state("ambessa")?.damage).toBe(6);
  });

  test("Empowered and in base (not in combat): spell damage does nothing", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .unit(P2, "base", CARD, "ambessa", { empowered: true })
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.cast("fs", { targets: ["ambessa", "ambessa"] });
    await game.settle();
    expect(game.state("ambessa")?.damage).toBe(0);
    expect(game.zoneOf("ambessa")).toBe("base");
  });

  test("Empowered but in combat: the carve-out applies and she takes the damage", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", CARD, "ambessa", { combatRole: "defender", empowered: true })
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.cast("fs", { targets: ["ambessa", "ambessa"] });
    await game.settle();
    expect(game.state("ambessa")?.damage).toBe(6);
  });

  test("Empowered grants +3 Might (4 → 7)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 2 } })
      .unit(P2, "base", CARD, "ambessa", { empowered: true })
      .unit(P2, "base", { might: 1 }, "chaff")
      .hand(P1, FALLING_STAR, "fs")
      .build();
    await game.p1.cast("fs", { targets: ["chaff", "chaff"] });
    await game.settle();
    expect(game.state("ambessa")?.might).toBe(7);
  });
});
