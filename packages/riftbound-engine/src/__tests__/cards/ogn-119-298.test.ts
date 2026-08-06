/**
 * Ahri, Inquisitive — ogn-119-298 · Champion Unit · Mind · 3 energy + [mind] · 3 Might
 *
 *   When I attack or defend, give an enemy unit here -2 [Might] this turn,
 *   to a minimum of 1 [Might].
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-119-298";

/** Ahri in P1's base; two enemies at bf1, one at bf2, one in P2's base. */
function attackBoard() {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", CARD, "ahri")
    .unit(P2, "bf1", { might: 4, name: "Big" }, "big")
    .unit(P2, "bf1", { might: 2, name: "Small" }, "small")
    .unit(P2, "bf2", { might: 4, name: "Far" }, "far")
    .unit(P2, "base", { might: 4, name: "Home" }, "home");
}

async function attackAndResolveTrigger() {
  const game = await attackBoard().build();
  await game.p1.move("ahri", "bf1");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", triggered: true })]);
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ahri, Inquisitive (ogn-119-298)", () => {
  test("When I attack: the trigger targets only enemy units HERE (not other battlefields or bases)", async () => {
    const game = await attackAndResolveTrigger();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "ahri" } });
    const keys = d?.kind === "pick" ? d.options.map((o) => o.key).sort() : [];
    expect(keys).toEqual(["big", "small"]);
  });

  test("gives the chosen enemy -2 Might this turn (4 → 2), other units untouched", async () => {
    const game = await attackAndResolveTrigger();
    await game.p1.pick("big");
    expect(game.state("big").might).toBe(2);
    expect(game.state("big").baseMight).toBe(4);
    expect(game.state("small").might).toBe(2);
    expect(game.state("far").might).toBe(4);
  });

  test("'this turn': a surviving enemy is back to full Might on the next turn", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ahri")
      .unit(P2, "bf1", { might: 6, name: "Brute" }, "brute")
      .build();
    await game.p1.move("ahri", "bf1");
    await game.settle(); // lone target auto-picked (6 → 4); combat: Ahri (3) dies, Brute survives
    expect(game.zoneOf("ahri")).toBe("trash");
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute").might).toBe(4);
    await game.advanceTurn();
    expect(game.state("brute").might).toBe(6);
  });

  test("'to a minimum of 1 Might': a 2-Might enemy drops only to 1", async () => {
    const game = await attackAndResolveTrigger();
    await game.p1.pick("small");
    expect(game.state("small").might).toBe(1);
    expect(game.state("big").might).toBe(4);
  });

  test("When I defend: an attacker coming to Ahri's battlefield gets -2 Might, so a 4-Might attacker (→2) dies to her 3 and she survives", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ahri")
      .unit(P2, "base", { might: 4, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ahri", controller: P1, triggered: true })]);
    await game.settle(); // single legal target → auto-picked; then combat resolves
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("ahri")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("costs 3 energy + 1 mind (3 Might); unaffordable without the mind power", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "ahri").build();
    await game.p1.play("ahri");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.zoneOf("ahri")).toBe("base");
    expect(game.state("ahri").might).toBe(3);
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "ahri").build();
    expect(noPower.p1.can("play", "ahri")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 2, power: { mind: 1 } }).hand(P1, CARD, "ahri").build();
    expect(noEnergy.p1.can("play", "ahri")).toBe(false);
  });
});
