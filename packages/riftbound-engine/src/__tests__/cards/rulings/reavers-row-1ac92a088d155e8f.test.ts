/**
 * Ruling 1ac92a088d155e8f — Reaver's Row (OGN-285 → ogn-285-298, Battlefield)
 *   "When you defend here, you may move a friendly unit here to base."
 *   × Hextech Ray (ogn-009-298, [Action] [1][fury]) "Deal 3 to a unit at a battlefield." — the pre-combat spell damage
 *
 * Q: A unit carrying spell damage defends at Reaver's Row and uses the Row to move to base. Does its damage clear
 *    after the combat showdown?
 * A: Yes. The combat was already started; when it concludes, the Combat Cleanup heals ALL units — including the one
 *    that retreated to base — so the spell damage is gone.
 * Rules: 383.4.f (defend trigger), 466.1.a.1 (Combat Cleanup: "Heal all Units"), 465/466 (combat still resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";
const HEXTECH_RAY = "ogn-009-298";

/** P2's turn. P1's Veteran (5) alone holds Reaver's Row (live text). P2: Raider (1) in base, Hextech Ray + [1][fury]. */
function board() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "row", { might: 5, name: "Veteran" }, "vet")
    .unit(P2, "bf2", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
    .hand(P2, HEXTECH_RAY, "ray");
}

/** P2 Rays the Veteran (3 damage), then attacks the Row; P1 opts into the Row trigger (the lone Veteran is auto-bound). */
async function damagedThenAttacked(): Promise<Game> {
  const game = await board().build();
  await game.p2.cast("ray", { targets: "vet" });
  await game.settle();
  expect(game.state("vet")).toMatchObject({ damage: 3, might: 5, zone: "battlefield-row" });
  await game.p2.move("raider", "row");
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
  await game.p1.yes();
  if (game.decision()?.kind === "pick") {
    await game.p1.pick("vet");
  }
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, triggered: true })]);
  return game;
}

describe("Ruling 1ac92a088d155e8f — a defender that retreats via Reaver's Row is still healed by the combat's cleanup", () => {
  test("setup: the spell damage (3) sits on the Veteran while the Row trigger is pending; a combat showdown HAS started at the Row", async () => {
    const game = await damagedThenAttacked();
    expect(game.state("vet").damage).toBe(3);
    expect(game.state("vet").combatRole).toBe("defender");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "row", isCombatShowdown: true });
  });

  test("the trigger resolves: the Veteran moves to P1's base still carrying its 3 damage (moving is not healing); the showdown goes on", async () => {
    const game = await damagedThenAttacked();
    while (game.chain().length > 0 && game.decision()?.kind === "action") {
      await game.acting().passPriority();
    }
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("vet")).toBe("base");
    expect(game.state("vet").damage).toBe(3);
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "row" });
  });

  test("after the showdown concludes and combat resolves, ALL units are healed (466.1.a.1): the Veteran in base is back to 0 damage; the unopposed Raider takes the Row", async () => {
    const game = await damagedThenAttacked();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.state("vet")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.zoneOf("raider")).toBe("battlefield-row");
    expect(game.gameState.battlefields.row?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control — declining the Row: the damaged Veteran (5, 3 damage) fights at full Might, kills the Raider (1) and survives (3 + 1 < 5); it too ends the combat healed", async () => {
    const game = await board().build();
    await game.p2.cast("ray", { targets: "vet" });
    await game.settle();
    await game.p2.move("raider", "row");
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.state("vet")).toMatchObject({ damage: 0, zone: "battlefield-row" });
    expect(game.gameState.battlefields.row?.controller).toBe(P1);
  });
});
