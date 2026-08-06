/**
 * Blast Corps Cadet — sfd-013-221 · Unit · Fury · 2 energy · 2 might
 *
 *   You may pay [1][fury] as an additional cost to play me.
 *   When you play me, if you paid the additional cost, deal 2 to a unit at a battlefield.
 *
 * Rules: 356.2.b (optional additional costs are chosen/paid as you play the card),
 * 143.4 (units enter exhausted), 383 (play trigger; "if you paid" is a condition on
 * the trigger), target = a unit AT A BATTLEFIELD (either side; not a base).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-013-221";

function board(res: { energy: number; power?: Record<string, number> }) {
  return scenario()
    .resources(P1, res)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "AtField" }, "field")
    .unit(P2, "base", { might: 3, name: "AtHome" }, "home")
    .hand(P1, CARD, "cadet");
}

describe("Blast Corps Cadet (sfd-013-221)", () => {
  test("base cost: 2 energy for a 2-might unit that enters the base exhausted; 1 energy is not enough", async () => {
    const game = await board({ energy: 2 }).build();
    expect(game.p1.can("play", "cadet")).toBe(true);
    await game.p1.play("cadet");
    await game.settle();
    expect(game.zoneOf("cadet")).toBe("base");
    expect(game.state("cadet").might).toBe(2);
    expect(game.state("cadet").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    const poor = await board({ energy: 1, power: { fury: 1 } }).build();
    expect(poor.p1.can("play", "cadet")).toBe(false);
  });

  test("without paying the additional cost the play trigger deals no damage", async () => {
    const game = await board({ energy: 3, power: { fury: 1 } }).build();
    await game.p1.play("cadet", { payOptional: false });
    await game.settle();
    expect(game.zoneOf("cadet")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1 } });
    expect(game.state("field").damage).toBe(0);
    expect(game.state("home").damage).toBe(0);
  });

  test("paying [1][fury] extra (3 energy + 1 fury total) deals 2 to a unit at a battlefield", async () => {
    const game = await board({ energy: 3, power: { fury: 1 } }).build();
    await game.p1.play("cadet", { payOptional: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "cadet", controller: P1, triggered: true })]);
    await game.settle(); // only one unit at a battlefield → it is the target
    expect(game.zoneOf("cadet")).toBe("base");
    expect(game.state("field").damage).toBe(2);
    expect(game.state("home").damage).toBe(0);
  });

  test("with two units at battlefields the controller picks which one takes the 2", async () => {
    const game = await board({ energy: 3, power: { fury: 1 } }).unit(P1, "bf1", { might: 4, name: "Mine" }, "mine").build();
    await game.p1.play("cadet", { payOptional: true });
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).sort() : []).toEqual(["field", "mine"]);
    await game.p1.pick("mine");
    await game.settle();
    expect(game.state("mine").damage).toBe(2);
    expect(game.state("field").damage).toBe(0);
  });

  test("the additional cost needs a [fury] power: with 3 energy and no fury only the plain play is offered", async () => {
    const game = await board({ energy: 3 }).build();
    expect(game.p1.can("play", "cadet")).toBe(true);
    expect(game.p1.option("play", "cadet")?.fields.some((f) => f.arg === "payOptional")).toBe(false);
    const r = await game.p1.try((p) => p.play("cadet", { payOptional: true }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("cadet")).toBe("hand");
  });

  test("target must be at a battlefield: a unit in a base is never damaged / offered", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "base", { might: 3 }, "home")
      .hand(P1, CARD, "cadet")
      .build();
    await game.p1.play("cadet", { payOptional: true });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      const d = game.decision();
      expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).not.toContain("home");
      await game.p1.decline();
      await game.settle();
    }
    expect(game.state("home").damage).toBe(0);
    expect(game.zoneOf("cadet")).toBe("base");
  });
});
