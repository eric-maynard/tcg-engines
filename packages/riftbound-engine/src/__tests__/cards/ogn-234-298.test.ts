/**
 * Harnessed Dragon — ogn-234-298 · Unit · Order · 8 energy + [order][order] · 6 Might
 *
 *   When you play me, kill an enemy unit.
 *
 * "When you play me" is a triggered ability that goes on the chain after the Dragon enters the
 * board. "an enemy unit" — any location (base or battlefield); friendly units are never eligible.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-234-298";

function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9 }, "bigFoe")
    .unit(P2, "base", { might: 2 }, "homeFoe")
    .unit(P1, "base", { might: 1 }, "ally")
    .hand(P1, CARD, "dragon");
}

type Built = Awaited<ReturnType<ReturnType<typeof board>["build"]>>;

/** Play the Dragon and steer its kill onto `target`, whether asked at play time or on resolution. */
async function playKilling(game: Built, target: string) {
  const upFront = game.p1.option("play", "dragon")?.fields.some((f) => f.arg === "targets");
  await game.p1.play("dragon", upFront ? { targets: target } : {});
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      await game.p1.pick(target);
    } else if (d?.kind === "action" && (d.context === "chain" || d.context === "showdown")) {
      await game.acting().pass();
    } else {
      break;
    }
  }
  await game.settle();
}

describe("Harnessed Dragon (ogn-234-298)", () => {
  test("costs 8 energy + 2 order; enters the base as a 6-Might unit", async () => {
    const game = await board().build();
    await playKilling(game, "homeFoe");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.state("dragon").might).toBe(6);
  });

  test("unaffordable with 7 energy or with only one order power", async () => {
    const lowEnergy = await scenario().resources(P1, { energy: 7, power: { order: 2 } }).hand(P1, CARD, "dragon").build();
    expect(lowEnergy.p1.can("play", "dragon")).toBe(false);
    const lowPower = await scenario().resources(P1, { energy: 8, power: { order: 1 } }).hand(P1, CARD, "dragon").build();
    expect(lowPower.p1.can("play", "dragon")).toBe(false);
  });

  test("when played: kills the chosen enemy unit — even a 9-Might one at a battlefield", async () => {
    const game = await board().build();
    await playKilling(game, "bigFoe");
    expect(game.zoneOf("bigFoe")).toBe("trash");
    expect(game.zoneOf("homeFoe")).toBe("base");
    expect(game.zoneOf("ally")).toBe("base");
  });

  test("when played: can kill an enemy unit sitting in its base", async () => {
    const game = await board().build();
    await playKilling(game, "homeFoe");
    expect(game.zoneOf("homeFoe")).toBe("trash");
    expect(game.zoneOf("bigFoe")).toBe("battlefield-bf1");
  });

  test("only ENEMY units are eligible — friendly units (and the Dragon itself) are never offered", async () => {
    const game = await board().build();
    const upFront = game.p1.option("play", "dragon")?.fields.find((f) => f.arg === "targets");
    if (upFront) {
      expect((upFront.options ?? []).map((o) => (o as string[])[0]).sort()).toEqual(["bigFoe", "homeFoe"]);
      return;
    }
    await game.p1.play("dragon");
    let d = game.decision();
    for (let i = 0; i < 8 && d?.kind !== "pick"; i++) {
      await game.acting().pass();
      d = game.decision();
    }
    expect(d?.kind).toBe("pick");
    expect(d?.kind === "pick" ? d.options.map((o) => o.key).sort() : []).toEqual(["bigFoe", "homeFoe"]);
  });

  test("with no enemy units on the board the Dragon simply enters and nothing dies", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { order: 2 } })
      .unit(P1, "base", { might: 1 }, "ally")
      .hand(P1, CARD, "dragon")
      .build();
    await game.p1.play("dragon");
    await game.settle();
    expect(game.zoneOf("dragon")).toBe("base");
    expect(game.zoneOf("ally")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});
