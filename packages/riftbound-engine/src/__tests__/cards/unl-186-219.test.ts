/**
 * Death from Below — unl-186-219 · Spell · Fury/Chaos · 4 energy + [rainbow]
 *
 *   Kill a unit at a battlefield. Then, if it had 3 [Might] or less, you may
 *   play this from your trash for [rainbow].
 *
 * Engine note: a [rainbow] pip is paid from `power.rainbow` today (no payment plan).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const DEATH_FROM_BELOW = "unl-186-219";

function board() {
  return scenario()
    .resources(P1, { energy: 8, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Small" }, "small")
    .unit(P2, "bf1", { might: 5, name: "Big" }, "big")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "bf1", { might: 2, name: "Mine" }, "mine")
    .hand(P1, DEATH_FROM_BELOW, "dfb");
}

describe("Death from Below (unl-186-219)", () => {
  test("clause 1: kills the chosen unit at a battlefield; costs 4 energy + 1 rainbow; spell goes to trash", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "big" });
    expect(game.p1.resources()).toEqual({ energy: 4, power: { rainbow: 1 } });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash");
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.zoneOf("dfb")).toBe("trash");
  });

  test("targets: only units AT A BATTLEFIELD (either side's) — units in a base are not offered", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "dfb")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["mine"], ["small"], ["big"]]));
    const t = await game.p1.try((p) => p.cast("dfb", { targets: "home" }));
    expect(!t.ok && t.error.code).toBe("ILLEGAL_ARGS");
    // No battlefield units at all → not playable.
    const empty = await scenario().resources(P1, { energy: 8, power: { rainbow: 2 } }).unit(P2, "base", { might: 1 }, "home").hand(P1, DEATH_FROM_BELOW, "dfb").build();
    expect(empty.p1.can("cast", "dfb")).toBe(false);
  });

  test("not affordable without the rainbow power or with fewer than 4 energy", async () => {
    const noPower = await scenario().resources(P1, { energy: 8 }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, DEATH_FROM_BELOW, "dfb").build();
    expect(noPower.p1.can("cast", "dfb")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 3, power: { rainbow: 1 } }).battlefield("bf1").unit(P2, "bf1", { might: 1 }, "u").hand(P1, DEATH_FROM_BELOW, "dfb").build();
    expect(noEnergy.p1.can("cast", "dfb")).toBe(false);
  });

  test("clause 2 (negative branch): killing a unit with 4+ Might offers no replay from trash", async () => {
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "big" });
    await game.settle();
    expect(game.decision()?.kind).toBe("action");
    expect(game.p1.can("cast", "dfb")).toBe(false);
    expect(game.zoneOf("dfb")).toBe("trash");
  });

  test("clause 2 — after killing a unit with 3 or less Might, the caster may play this from trash for [rainbow]", async () => {
    // Expected: once the kill resolves, P1 (4 energy, 1 rainbow left) is asked yes/no (or offered a
    // trash play of dfb costing only [rainbow]); accepting puts Death from Below back on the chain.
    // The parsed ability only carries the `kill` clause, so nothing is offered.
    const game = await board().build();
    await game.p1.cast("dfb", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    const d = game.decision();
    const offeredAsPrompt = d?.kind === "yes-no" && d.seat === P1;
    const offeredAsPlay = game.p1.legal().some((o) => o.card === "dfb" && (o.verb === "cast" || o.verb === "play"));
    expect(offeredAsPrompt || offeredAsPlay).toBe(true);
    if (offeredAsPrompt) {
      await game.p1.yes();
    } else {
      await game.p1.cast("dfb", { answers: ["mine"], targets: "mine" });
    }
    // Paid only [rainbow]: energy untouched.
    expect(game.p1.resources()).toEqual({ energy: 4, power: { rainbow: 0 } });
    expect(game.zoneOf("dfb")).toBe("chain");
  });
});
