/**
 * Lee Sin, Centered — ogn-151-298 · Champion Unit (Lee Sin) · Body · 6 energy · 6 Might
 *
 *   [Accelerate] (You may pay [1][body] as an additional cost to have me enter ready.)
 *   Other buffed friendly units at my battlefield have +2 [Might].
 *
 * Rules: 143.4 (units enter exhausted), 805 (Accelerate: optional [1][C] additional cost →
 * enters ready), "my battlefield" = the battlefield this unit is at (a base is not a
 * battlefield), 702 buffs (+1 Might marker), statics are evaluated continuously (layers).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-151-298";
/** Inline 0-cost spell: "Buff a unit." — used to apply a buff through the engine. */
const BUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Buff",
  timing: "action",
};

function board(leeAt: "bf1" | "bf2" | "base") {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, leeAt, CARD, "lee")
    .unit(P1, "bf1", { might: 2 }, "buffedHere", { buffed: true })
    .unit(P1, "bf1", { might: 2 }, "plainHere")
    .unit(P1, "bf2", { might: 2 }, "buffedThere", { buffed: true })
    .unit(P1, "base", { might: 2 }, "buffedBase", { buffed: true })
    .unit(P2, "bf1", { might: 2 }, "buffedFoe", { buffed: true })
    .hand(P1, BUFF, "buff");
}

async function castBuff(game: Game, target: string) {
  await game.p1.cast("buff", { targets: target });
  await game.settle();
  expect(game.state(target).isBuffed).toBe(true);
}

describe("Lee Sin, Centered (ogn-151-298)", () => {
  test("costs 6 energy (no power); 6 Might; enters exhausted without Accelerate; unaffordable at 5", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "lee").build();
    await game.p1.play("lee");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("lee")).toBe("base");
    expect(game.state("lee").might).toBe(6);
    expect(game.state("lee").isExhausted).toBe(true);
    const poor = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "lee").build();
    expect(poor.p1.can("play", "lee")).toBe(false);
  });

  test("Accelerate: paying 7 energy + 1 body in total has him enter ready", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { body: 1 } }).hand(P1, CARD, "lee").build();
    await game.p1.play("lee", { accelerate: true });
    await game.settle();
    expect(game.zoneOf("lee")).toBe("base");
    expect(game.state("lee").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("Accelerate needs the [body] power: with 7 energy and no power the accelerated play is refused", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "lee").build();
    const r = await game.p1.try((p) => p.play("lee", { accelerate: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("lee")).toBe("hand");
  });

  test("static: buffing another friendly unit at his battlefield makes it 2 +1 (buff) +2 = 5 Might", async () => {
    const game = await board("bf1").build();
    expect(game.state("plainHere").might).toBe(2);
    await castBuff(game, "plainHere");
    expect(game.state("plainHere").might).toBe(5);
    expect(game.state("plainHere").staticMightBonus).toBe(2);
  });

  test("static: 'Other' — a buffed Lee Sin does not pump himself (6 +1 = 7); unbuffed allies here stay put", async () => {
    const game = await board("bf1").build();
    await castBuff(game, "lee");
    expect(game.state("lee").might).toBe(7);
    expect(game.state("plainHere").might).toBe(2);
    expect(game.state("buffedHere").might).toBe(5);
  });

  test("static: buffed friendly units at ANOTHER battlefield or in base, and buffed ENEMY units here, get nothing", async () => {
    const game = await board("bf1").build();
    await castBuff(game, "lee");
    expect(game.state("buffedThere").might).toBe(3);
    expect(game.state("buffedBase").might).toBe(3);
    expect(game.state("buffedFoe").might).toBe(3);
  });

  test.failing("BUG: static — 'at my battlefield': while Lee Sin sits in base, buffed allies in base must NOT get +2 (a base is not a battlefield)", async () => {
    // Expected: with Lee Sin in base no unit anywhere gets the bonus.
    // Actual: the engine matches "same zone as the source", so buffed base-mates read 5.
    const game = await board("base").build();
    await castBuff(game, "lee");
    expect(game.state("buffedBase").might).toBe(3);
    expect(game.state("buffedHere").might).toBe(3);
  });

  test.failing("BUG: static is continuous — a pre-buffed ally at his battlefield is 5 Might without any chain resolving first", async () => {
    // Expected: statics are always-on, so the scenario position already shows 5.
    // Actual: staticMightBonus is only recomputed when a chain/trigger resolves, so it reads 3.
    const game = await board("bf1").build();
    expect(game.state("buffedHere").might).toBe(5);
  });

  test("static follows him — a Standard Move of Lee Sin off bf2 drops the bonus there immediately", async () => {
    const game = await board("bf2").build();
    await castBuff(game, "lee");
    expect(game.state("buffedThere").might).toBe(5);
    await game.p1.move("lee", "base");
    expect(game.state("buffedThere").might).toBe(3);
  });
});
