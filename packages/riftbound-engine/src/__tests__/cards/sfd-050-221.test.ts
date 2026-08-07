/**
 * Azir, Ascendant — sfd-050-221 · Champion Unit (Azir) · Calm · 6 energy + [calm] · 6 might
 *
 *   [calm]: [Action] — Choose a unit you control. Move me to its location and it to my original
 *   location. If it's equipped, you may attach one of its Equipment to me. Use only once per turn.
 *
 * Rules: 145.2 (unit activated abilities: your Main Phase, Open state) + 806 ([Action] also allows
 * showdowns on any turn); 377.2.b ("use only…" is a condition on activating); 716 attachment.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "sfd-050-221";
const DIRK = "sfd-009-221"; // Serrated Dirk — Equipment, Equip [fury]

function board(calm = 1) {
  return scenario()
    .resources(P1, { energy: 0, power: { calm } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", CARD, "azir")
    .unit(P1, "bf1", { might: 2, name: "Pawn" }, "pawn");
}

describe("Azir, Ascendant (sfd-050-221)", () => {
  test("cost: 6 energy + 1 calm for a 6-might champion unit; unaffordable without the calm power", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { calm: 1 } }).hand(P1, CARD, "azir").build();
    await game.p1.play("azir");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.zoneOf("azir")).toBe("base");
    expect(game.state("azir").might).toBe(6);
    const noCalm = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "azir").build();
    expect(noCalm.p1.can("play", "azir")).toBe(false);
  });

  test("activation cost: pays [calm] and puts the ability on the chain; not available with no calm power", async () => {
    const game = await board(1).build();
    await game.p1.activate("azir");
    expect(game.p1.power("calm")).toBe(0);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "azir", triggered: false })]);
    expect(game.state("azir").isExhausted).toBe(false); // no exhaust in the cost
    const broke = await board(0).build();
    expect(broke.p1.can("activate", "azir")).toBe(false);
  });

  test("swaps places — Azir moves to the chosen unit's battlefield and that unit moves to Azir's original location (base)", async () => {
    const game = await board(1).script(P1, ["pawn"]).build();
    await game.p1.activate("azir");
    await game.settle();
    expect(game.locationOf("azir")).toBe("bf1");
    expect(game.locationOf("pawn")).toBe("base");
  });

  test("if the chosen unit is equipped, you may attach one of its Equipment to Azir", async () => {
    const game = await board(1).resources(P1, { energy: 0, power: { calm: 1, fury: 1 } }).gear(P1, DIRK, "dirk").script(P1, ["pawn", "yes", "dirk"]).build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "pawn" });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("pawn");
    await game.p1.activate("azir");
    await game.settle({ policy: "first" });
    expect(game.locationOf("azir")).toBe("bf1");
    expect(game.state("dirk").attachedTo).toBe("azir");
  });

  test("rule 719.3.a — Azir's attached Equipment changes locations with him when the swap moves him", async () => {
    const game = await scenario()
      .resources(P1, { energy: 0, power: { calm: 1, fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "azir")
      .unit(P1, "base", { might: 2, name: "Pawn" }, "pawn")
      .gear(P1, DIRK, "dirk")
      .script(P1, ["pawn"])
      .build();
    await game.p1.do("equipCard", { equipmentId: "dirk", unitId: "azir" });
    await game.settle();
    expect(game.state("dirk").attachedTo).toBe("azir");
    expect(game.zoneOf("dirk")).toBe("battlefield-bf1");
    await game.p1.activate("azir");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("azir")).toBe("base");
    expect(game.state("dirk").attachedTo).toBe("azir");
    expect(game.zoneOf("dirk")).toBe("base");
  });

  test("'Use only once per turn' — after one activation resolves it is not offered again this turn (rule 377.2.b)", async () => {
    // Expected: second activation illegal in the same turn even with calm power to spare.
    // Actual: the ability is offered again.
    const game = await board(2).script(P1, ["pawn"]).build();
    await game.p1.activate("azir");
    await game.settle();
    expect(game.p1.can("activate", "azir")).toBe(false);
  });

  test("[Action]: may be activated during a showdown on the opponent's turn while Azir's controller has Focus (806.1.c.2)", async () => {
    const game = await board(1).active(P2).unit(P2, "base", { might: 2, name: "Raider" }, "raider").build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "azir")).toBe(true);
  });

  test("[Action] does not allow activation in the opponent's Open state outside a showdown (145.2, 806.1.b)", async () => {
    // Expected: on P2's turn with no showdown/chain, P1 has no legal activate for Azir.
    // Actual: the engine offers it.
    const game = await board(1).active(P2).build();
    expect(game.p1.can("activate", "azir")).toBe(false);
  });
});
