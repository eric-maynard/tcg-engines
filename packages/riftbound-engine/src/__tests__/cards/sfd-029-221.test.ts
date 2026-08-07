/**
 * Rek'Sai, Breacher — sfd-029-221 · Champion Unit (Rek'Sai) · Fury · 3 energy · 3 Might
 *
 *   [Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.)
 *   [Assault] (+1 [Might] while I'm an attacker.)
 *   Friendly units played from anywhere other than a player's hand have [Accelerate].
 *
 * Rules: 143.4 (units enter exhausted), 805 (Accelerate = optional additional cost [1][C] paid
 * as you play the unit → enters ready), 807 (Assault +X Might while attacker), 466.1.a.1
 * (units heal in the combat cleanup while designations still apply), 811 (Hidden → played from
 * facedown, i.e. not from hand).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-029-221";
const SNEAK = {
  abilities: [{ keyword: "Hidden", type: "keyword" }],
  cardType: "unit",
  domain: "fury",
  keywords: ["Hidden"],
  might: 2,
  name: "Sneak",
};

describe("Rek'Sai, Breacher (sfd-029-221)", () => {
  test("costs 3 energy (no power); enters exhausted without Accelerate; unaffordable at 2", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "reksai").build();
    await game.p1.play("reksai", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("reksai")).toBe("base");
    expect(game.state("reksai").might).toBe(3);
    expect(game.state("reksai").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).hand(P1, CARD, "reksai").build();
    expect(poor.p1.can("play", "reksai")).toBe(false);
  });

  test("Accelerate: 4 energy + 1 fury total and she enters ready; without the fury the accelerated play is refused", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { fury: 1 } }).hand(P1, CARD, "reksai").build();
    await game.p1.play("reksai", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.state("reksai").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    const noFury = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "reksai").build();
    const r = await noFury.p1.try((p) => p.play("reksai", { accelerate: true, to: "base" }));
    expect(r.ok).toBe(false);
  });

  test("Assault: as an attacker she deals 4 (3 + 1) — a 4-Might defender dies", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4 }, "def")
      .unit(P1, "base", CARD, "reksai")
      .build();
    expect(game.state("reksai").keywords).toContain("Assault");
    expect(game.state("reksai").might).toBe(3); // Assault is not active outside an attack
    await game.p1.move("reksai", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
  });

  test("Assault also raises her lethal threshold — attacking a 3-Might defender she survives (3 damage < 4 Might) and conquers (807.1.c, 142.4.b, 466.1.a.1)", async () => {
    // Expected: while attacking she has 4 Might, so 3 damage is not lethal; the combat cleanup heals
    // her and she conquers bf1. Actual: lethality is checked against her printed 3 Might → she dies.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "def")
      .unit(P1, "base", CARD, "reksai")
      .build();
    await game.p1.move("reksai", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("reksai")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("reksai").might).toBe(3);
  });

  test("Assault does nothing on defense: a 3-Might attacker trades with her", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "reksai")
      .unit(P2, "base", { might: 3 }, "atk")
      .build();
    await game.p2.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("reksai")).toBe("trash");
    expect(game.zoneOf("atk")).toBe("trash");
  });

  test("static: a friendly unit played from HAND does not gain Accelerate from Rek'Sai", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .unit(P1, "base", CARD, "reksai")
      .hand(P1, { cardType: "unit", domain: "fury", might: 2, name: "Grunt", energyCost: 2 }, "grunt")
      .build();
    const r = await game.p1.try((p) => p.play("grunt", { accelerate: true, to: "base" }));
    if (r.ok) {
      await game.settle();
    } else {
      await game.p1.play("grunt", { to: "base" });
      await game.settle();
    }
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.state("grunt").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
  });

  test("static — a friendly unit played from facedown (not from hand) has Accelerate and may pay [1][fury] to enter ready", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "reksai")
      .hand(P1, SNEAK, "sneak")
      .build();
    await game.p1.hide("sneak", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.do("addResources", { energy: 1, power: { fury: 1 } });
    const r = await game.p1.try((p) => p.choose(`revealHidden:sneak`, { accelerate: true, payOptional: true }));
    expect(r.ok).toBe(true);
    if (game.decision()?.kind === "yes-no") {
      await game.p1.yes();
    }
    await game.settle();
    expect(game.zoneOf("sneak")).toBe("battlefield-bf1");
    expect(game.state("sneak").isReady).toBe(true);
    // the [rainbow] spent on hiding is gone with the turn — emptied pools drop
    // their domain keys (rule 517.2.c), so only the fury pip paid here remains.
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });
});
