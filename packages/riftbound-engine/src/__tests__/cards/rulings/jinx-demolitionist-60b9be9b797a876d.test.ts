/**
 * Ruling 60b9be9b797a876d — Jinx, Demolitionist (OGN-030 → ogn-030-298) · Champion · Fury · [3][fury] · 4 Might
 *     "[Accelerate] (You may pay [1][fury] as an additional cost to have me enter ready.) [Assault 2] When you play me, discard 2."
 *   × Fury Rune (OGN-007 → ogn-007-298) — the runes exhausted / recycled to pay.
 *
 * Q: To Accelerate Jinx, do you need to recycle (pay Power) or not?
 * A: Yes. Accelerate is an optional ADDITIONAL cost of [1] + 1 Power matching her domain, paid on top of the base cost while playing
 *    her: in total exhaust 4 runes (3 + 1 Energy) and recycle 2 FURY runes (1 + 1 Power). Paid that way she enters ready (a
 *    replacement of how she enters — she never enters exhausted first).
 * Rules: 805.1.a / 805.1.a.1 (Accelerate cost; the Power must match the unit's domain), 805.2 (optional additional cost),
 *        805.6 (enters ready as a replacement), 357 (costs paid during the play), 159–160 (exhaust → Energy, recycle → Power).
 */
import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../../harness";

const JINX = "ogn-030-298";
const FURY_RUNE = "ogn-007-298";

/** P1's turn, empty pool, four Fury runes channeled, Jinx the only card in hand (so "discard 2" has nothing to bite on). */
function board() {
  return scenario()
    .rune(P1, FURY_RUNE, { alias: "f1" })
    .rune(P1, FURY_RUNE, { alias: "f2" })
    .rune(P1, FURY_RUNE, { alias: "f3" })
    .rune(P1, FURY_RUNE, { alias: "f4" })
    .hand(P1, JINX, "jinx");
}

describe("Ruling 60b9be9b797a876d — Accelerating Jinx costs the base [3][fury] PLUS [1][fury]: exhaust 4 runes, recycle 2 Fury runes", () => {
  test("premise: Jinx's printed cost is [3] + one [fury]; with an empty pool she is unplayable", async () => {
    const game = await board().build();
    expect(game.state("jinx")).toMatchObject({ energyCost: 3, powerCost: ["fury"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.can("play", "jinx")).toBe(false);
  });

  test("base cost only — exhaust 3 runes (3 Energy) + recycle 1 Fury rune (1 Power): playable WITHOUT Accelerate, she enters EXHAUSTED; the accelerated line is not affordable", async () => {
    const game = await board().build();
    await game.p1.tapRune("f1");
    await game.p1.tapRune("f2");
    await game.p1.tapRune("f3");
    await game.p1.recycleRune("f4");
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.p1.can("play", "jinx")).toBe(true);
    const accel = await game.p1.try((p) => p.play("jinx", { accelerate: true }));
    expect(accel.ok).toBe(false); // [1][fury] more is required
    expect(game.zoneOf("jinx")).toBe("hand");
    await game.p1.play("jinx");
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.state("jinx").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  });

  test("Accelerate — exhaust all 4 runes (4 Energy) and recycle 2 of those Fury runes (2 Fury Power): total [4] + [fury][fury] is paid and Jinx enters READY", async () => {
    const game = await board().build();
    await game.p1.tapRunes(4);
    expect(game.p1.energy()).toBe(4);
    await game.p1.recycleRune("f1");
    await game.p1.recycleRune("f2");
    expect(game.p1.resources()).toEqual({ energy: 4, power: { fury: 2 } });
    expect(game.p1.runes().sort()).toEqual(["f3", "f4"]); // two runes recycled to the rune deck
    expect(game.zoneOf("f1")).toBe("runeDeck");
    await game.p1.play("jinx", { accelerate: true });
    await game.settle();
    expect(game.zoneOf("jinx")).toBe("base");
    expect(game.state("jinx").isReady).toBe(true); // 805.6 — enters ready
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // everything was consumed: 3+1 energy, 1+1 fury
    expect(game.violations()).toEqual([]);
  });

  test("the Accelerate Power must MATCH her domain (805.1.a.1): 4 Energy + 1 fury + 1 calm cannot accelerate (the calm can't pay it) — only the plain, exhausted play is legal", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { calm: 1, fury: 1 } }).hand(P1, JINX, "jinx").build();
    expect(game.p1.can("play", "jinx")).toBe(true);
    const accel = await game.p1.try((p) => p.play("jinx", { accelerate: true }));
    expect(accel.ok).toBe(false);
    await game.p1.play("jinx");
    await game.settle();
    expect(game.state("jinx").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 1, fury: 0 } });
  });
});
