/**
 * Ferrous Forerunner — sfd-021-221 · Unit · Fury · 6 energy + [fury] · 6 might
 *
 *   [Deathknell] — Play two 3 [Might] Mech unit tokens to your base. (When I die, get the effect.)
 *
 * Rules: 808 Deathknell (triggered on its own death; 428.1.a.1.b — added to the chain before it
 * reaches the trash; 323.4 — combat deaths count), 180–185 tokens (182: controlled by the ability's
 * controller; 185.2.d: a unit token follows unit rules, so it enters exhausted per 143.4).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-021-221";
const FINAL_SPARK = "ogs-022-024"; // 8 energy: Deal 8 to a unit.

const tokensIn = (ids: readonly string[]) => ids.filter((id) => id.startsWith("token-"));

function killedBySpell() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 8 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", CARD, "ff")
    .hand(P2, FINAL_SPARK, "spark");
}

describe("Ferrous Forerunner (sfd-021-221)", () => {
  test("cost: 6 energy + 1 fury; a 6-might unit with Deathknell; unaffordable without the fury or with 5 energy", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { fury: 1 } }).hand(P1, CARD, "ff").build();
    await game.p1.play("ff");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.zoneOf("ff")).toBe("base");
    expect(game.state("ff").might).toBe(6);
    expect(game.state("ff").keywords).toContain("Deathknell");
    const noFury = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "ff").build();
    expect(noFury.p1.can("play", "ff")).toBe(false);
    const low = await scenario().resources(P1, { energy: 5, power: { fury: 1 } }).hand(P1, CARD, "ff").build();
    expect(low.p1.can("play", "ff")).toBe(false);
  });

  test("dies to spell damage at a battlefield → Deathknell goes on the chain, then two 3-might Mech unit tokens appear in ITS CONTROLLER's base", async () => {
    const game = await killedBySpell().build();
    await game.p2.cast("spark", { targets: "ff" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // Final Spark resolves
    expect(game.zoneOf("ff")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ff", controller: P1, triggered: true })]);
    await game.settle();
    const tokens = tokensIn(game.p1.base());
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t)).toMatchObject({ cardType: "unit", controller: P1, isToken: true, might: 3, name: "Mech", owner: P1 });
    }
    expect(tokensIn(game.cardsAt("bf1"))).toHaveLength(0); // "to your base", not where it died
    expect(tokensIn(game.p2.base())).toHaveLength(0);
  });

  test("the Mech tokens are units, so they enter exhausted (185.2.d, 143.4)", async () => {
    const game = await killedBySpell().build();
    await game.p2.cast("spark", { targets: "ff" });
    await game.settle();
    const tokens = tokensIn(game.p1.base());
    expect(tokens).toHaveLength(2);
    for (const t of tokens) {
      expect(game.state(t).isExhausted).toBe(true);
    }
  });

  test("dying in combat also triggers Deathknell (323.4): a 6-might attacker trades and P1 gets two Mechs", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ff")
      .unit(P2, "base", { might: 6, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("ff")).toBe("trash");
    expect(tokensIn(game.p1.base())).toHaveLength(2);
  });

  test("no trigger while it lives: surviving 3 damage creates no tokens", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ff")
      .unit(P2, "base", { might: 3, name: "Attacker" }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.locationOf("ff")).toBe("bf1");
    expect(tokensIn(game.p1.base())).toHaveLength(0);
  });
});
