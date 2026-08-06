/**
 * Bilgewater Bully — ogn-125-298 · Unit · Body · 6 energy · 6 might
 *
 *   While I'm buffed, I have [Ganking]. (I can move from battlefield to battlefield.)
 *
 * Rule 810 (Ganking adds battlefield→battlefield to the Standard Move); rule 476.3 (conditional
 * keyword statics re-evaluate as the buff comes and goes). A buff is a +1 Might marker.
 */

import { describe, expect, test } from "bun:test";
import { P1, scenario } from "../../harness";

const CARD = "ogn-125-298";
// Inline 0-cost "Buff a unit." spell so the buff is applied through the real effect pipeline.
const BUFF = {
  abilities: [{ effect: { target: { type: "unit" }, type: "buff" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "body",
  energyCost: 0,
  name: "Test Buff",
  timing: "action",
};

function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: null })
    .unit(P1, "bf1", CARD, "bully")
    .hand(P1, BUFF, "buff");
}

describe("Bilgewater Bully (ogn-125-298)", () => {
  test("cost: 6 energy for a 6-might unit; not playable with 5", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "bully").build();
    await game.p1.play("bully");
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("bully")).toBe("base");
    expect(game.state("bully").might).toBe(6);
    const poor = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "bully").build();
    expect(poor.p1.can("play", "bully")).toBe(false);
  });

  test("while NOT buffed it has no Ganking: no battlefield→battlefield move is offered", async () => {
    const game = await board().build();
    expect(game.state("bully").isBuffed).toBe(false);
    expect(game.state("bully").keywords).not.toContain("Ganking");
    expect(game.p1.can("gank", "bully")).toBe(false);
    const r = await game.p1.try((p) => p.gank("bully", "bf2"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("bully")).toBe("bf1");
    // The ordinary Standard Move back to base is still available (rule 810.1.c.1).
    expect(game.p1.can("move", undefined)).toBe(true);
  });

  test("while buffed it has Ganking (and the buff's +1 Might): it may move bf1 → bf2, exhausting", async () => {
    const game = await board().build();
    await game.p1.cast("buff", { targets: "bully" });
    await game.settle();
    expect(game.state("bully").isBuffed).toBe(true);
    expect(game.state("bully").might).toBe(7);
    expect(game.state("bully").keywords).toContain("Ganking");
    expect(game.p1.can("gank", "bully")).toBe(true);
    await game.p1.gank("bully", "bf2");
    expect(game.locationOf("bully")).toBe("bf2");
    expect(game.state("bully").isExhausted).toBe(true);
  });

  test("the granted Ganking is a static (condition-bound) grant, not a timed one", async () => {
    const game = await board().build();
    await game.p1.cast("buff", { targets: "bully" });
    await game.settle();
    expect(game.state("bully").grantedKeywords).toEqual([expect.objectContaining({ duration: "static", keyword: "Ganking" })]);
    // Buffs persist across turns, so Ganking is still there on P1's next turn.
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.turnNumber()).toBeGreaterThan(2);
    expect(game.state("bully").isBuffed).toBe(true);
    expect(game.state("bully").keywords).toContain("Ganking");
  });
});
