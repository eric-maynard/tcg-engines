/**
 * Draven, Vanquisher — sfd-020-221 · Champion Unit (Draven) · Fury · 4 energy · 4 might
 *
 *   When I win a combat, play a Gold gear token exhausted.
 *   When I attack or defend, you may pay [fury]. If you do, give me +2 [Might] this turn.
 *
 * Rules: 466.3.a (a player — and their units, 466.3.c — win a combat when they are the only
 * side with units left at the battlefield); 383.4.e/f (attack / defend triggers);
 * 187.5 (Gold token: domainless gear token with "[Reaction] Kill this, [E]: Add [A]").
 *
 * Engine status: `win-combat` is never emitted, and the parsed "you may pay [fury]. If you do" rider is a
 * `paid-additional-cost` condition instead of an opt-in cost — neither trigger does anything yet (BUG tests).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-020-221";

const goldOf = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, seat: "p1" | "p2") =>
  game[seat].base().filter((id) => game.state(id).name === "Gold");

function attacking(fury: number, defenderMight: number) {
  return scenario()
    .resources(P1, { power: { fury } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: defenderMight, name: "Foe" }, "foe")
    .unit(P1, "base", CARD, "draven");
}

describe("Draven, Vanquisher (sfd-020-221)", () => {
  test("cost: 4 energy, no power; 4-Might unit; unaffordable with 3 energy", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "draven").build();
    await game.p1.play("draven", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("draven")).toBe("base");
    expect(game.state("draven").might).toBe(4);
    const poor = await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "draven").build();
    expect(poor.p1.can("play", "draven")).toBe(false);
  });

  test("When I attack: you may pay [fury] → +2 Might this turn (4 → 6 kills a 5-Might defender)", async () => {
    const game = await attacking(1, 5).build();
    await game.p1.move("draven", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("draven")).toBe("bf1");
    // "this turn", not "this combat": still 6 after combat, back to 4 next turn.
    expect(game.state("draven").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("draven").might).toBe(4);
  });

  test("When I attack: declining pays nothing and gives no Might (4 vs 5 → Draven dies)", async () => {
    const game = await attacking(1, 5).build();
    await game.p1.move("draven", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.no();
    await game.settle();
    expect(game.p1.power("fury")).toBe(1);
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf1");
  });

  test("When I attack: without a [fury] to pay, the +2 cannot be had", async () => {
    const game = await attacking(0, 5).build();
    await game.p1.move("draven", "bf1");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      const t = await game.p1.try((p) => p.yes());
      if (t.ok) {
        await game.settle();
      } else {
        await game.p1.no();
        await game.settle();
      }
    }
    expect(game.zoneOf("draven")).toBe("trash");
    expect(game.locationOf("foe")).toBe("bf1");
  });

  test("When I defend: the same optional [fury] payment gives +2 Might (4 → 6 survives a 5-Might attacker)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "draven")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.p1.power("fury")).toBe(0);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("draven")).toBe("bf1");
    expect(game.state("draven").might).toBe(6);
  });

  test("When I win a combat (attacking, sole survivor): a Gold gear token is played to base, exhausted", async () => {
    const game = await attacking(0, 2).build();
    expect(goldOf(game, "p1")).toHaveLength(0);
    await game.p1.move("draven", "bf1");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0]!)).toMatchObject({ cardType: "gear", isExhausted: true, isToken: true, name: "Gold" });
  });

  test("losing the combat (Draven dies) plays no Gold token", async () => {
    const game = await attacking(0, 6).build();
    await game.p1.move("draven", "bf1");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.zoneOf("draven")).toBe("trash");
    expect(goldOf(game, "p1")).toHaveLength(0);
  });

  test("No Result is not a win (466.3.d): both survive → attacker recalled, no Gold token", async () => {
    // 4-Might Draven into a 5-Might Tankless wall that cannot kill him either: use a 3-Might defender
    // with 5 effective toughness is not expressible, so use mutual survival: Draven 4 vs defender 5 —
    // Draven dies. Instead model mutual survival with a stunned defender (deals no damage) of Might 5.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall", { stunned: true })
      .unit(P1, "base", CARD, "draven")
      .build();
    await game.p1.move("draven", "bf1");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.locationOf("wall")).toBe("bf1");
    expect(game.locationOf("draven")).toBe("base");
    expect(goldOf(game, "p1")).toHaveLength(0);
  });
});
