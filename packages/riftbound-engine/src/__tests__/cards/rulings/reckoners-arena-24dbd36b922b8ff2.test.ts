/**
 * Ruling 24dbd36b922b8ff2 — Reckoner's Arena (OGN-286 → ogn-286-298, battlefield) "When you hold here, activate the
 *     conquer effects of units here."
 *   × Blighted Battleaxe (UNL-019 → unl-019-219, Equipment +4) "At the end of your turn, if I didn't conquer this turn,
 *     unattach this and deal 4 to me."
 *
 * Q: Does holding Reckoner's Arena satisfy the Battleaxe's "conquered this turn" requirement for the equipped unit?
 * A: No. The Arena merely activates conquer EFFECTS on a hold; no conquer actually occurs, so the equipped unit did not
 *    conquer. At the end of that turn the axe unattaches and deals 4 to it.
 * Rules: 383.4.g.1 (activate = as if triggered; nothing else about the event is true), 464.2 (hold), 383.2.a.1, FAQ 9662,
 *        Rules FAQ Clarification 2026-04-29.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RECKONERS_ARENA = "ogn-286-298";
const BLIGHTED_BATTLEAXE = "unl-019-219";
const VANGUARD_SERGEANT = "ogn-219-298"; // vanilla 4 Might — 4 + 4 = 8 wearing the axe; exactly lethal to the axe's 4 once it unattaches

/** End of P2's turn 2. P1 controls the (live) Arena with the axe-wearing Sergeant on it; P2 has a bystander at bf2. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("arena", { controller: P1, def: RECKONERS_ARENA, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "arena", VANGUARD_SERGEANT, "sarge", { equippedWith: ["axe"] })
    .card("axe", { def: BLIGHTED_BATTLEAXE, meta: { attachedTo: "sarge" }, owner: P1, zone: "arena" })
    .unit(P2, "bf2", { might: 2, name: "Bystander" }, "bystander");
}

describe("Ruling 24dbd36b922b8ff2 — a Reckoner's Arena hold is not a conquer for Blighted Battleaxe", () => {
  test("P1's turn starts: P1 HOLDS the Arena (1 point) and the Arena's trigger activates conquer effects — yet no conquer is recorded for P1 this turn", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "arena", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.gameState.battlefields.arena?.controller).toBe(P1);
    expect(game.gameState.conqueredThisTurn[P1]).toEqual([]); // "no actual conquer occurs"
    expect(game.state("sarge")).toMatchObject({ attachments: ["axe"], might: 8 });
  });

  test("so at the end of P1's turn the axe's 'if I didn't conquer this turn' trigger fires: it unattaches (8 → 4) and deals 4 — the Sergeant dies, the loose axe is recalled to P1's base", async () => {
    const game = await board().build();
    await game.p2.endTurn();
    await game.settle(); // P1's main phase
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "sarge", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("sarge")).toBe("trash");
    expect(game.state("axe")).toMatchObject({ attachedTo: undefined, zone: "base" });
    expect(game.p1.units("arena")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: an ACTUAL conquer by the equipped unit satisfies the axe — no end-of-turn trigger, the Sergeant keeps the axe (8 Might) into P2's turn", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", VANGUARD_SERGEANT, "sarge", { equippedWith: ["axe"] })
      .card("axe", { def: BLIGHTED_BATTLEAXE, meta: { attachedTo: "sarge" }, owner: P1, zone: "base" })
      .unit(P2, "bf1", { might: 2, name: "Bystander" }, "bystander")
      .build();
    await game.p1.move("sarge", "bf1");
    await game.settle();
    expect(game.gameState.conqueredThisTurn[P1]).toEqual(["bf1"]);
    expect(game.p1.points()).toBe(1);
    await game.p1.endTurn();
    expect(game.chain()).toEqual([]); // intervening-if false: never goes on the chain
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("sarge")).toBe("battlefield-bf1");
    expect(game.state("sarge")).toMatchObject({ attachments: ["axe"], damage: 0, might: 8 });
  });
});
