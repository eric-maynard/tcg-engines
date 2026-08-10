/**
 * Ruling b9133d86eb3ac081 — Ornn's Forge (SFD-213 → sfd-213-221) · Battlefield
 *   "While you control this battlefield, the first friendly non-token gear played each turn costs [1] less."
 *   × Zhonya's Hourglass (ogn-077-298, [Hidden] gear) as the "needs control" probe: a facedown card stays hidden
 *     only for as long as you control that battlefield (811.1.b).
 *
 * Q: If I'm defending my battlefield and the opponent moves a unit there, am I still "in control" of it?
 * A: Yes. A battlefield can be controlled AND contested at once: the attack makes it Contested but you keep control
 *    throughout the combat (so control-dependent abilities keep working). Control is only re-evaluated when the
 *    combat ends: defender still has units → keeps it; attacker alone remains → they conquer and you lose it.
 * Rules: 187.3.d (controlled + contested), 187.4 / 187.4.b (control can't change until the combat concludes),
 *        466.5 (combat resolution establishes control), 811.1.b (hidden "for as long as you control that battlefield").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ORNNS_FORGE = "sfd-213-221";
const ZHONYAS = "ogn-077-298";

/** P2's turn. P1 controls the (live) Forge with a 3-Might Smith and a Zhonya's hidden there; P2 attacks from base. */
function board(attackerMight: number) {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("forge", { controller: P1, def: ORNNS_FORGE, inert: false, owner: P1 })
    .unit(P1, "forge", { might: 3, name: "Smith" }, "smith")
    .facedown(P1, "forge", ZHONYAS, "zh")
    .unit(P2, "base", { might: attackerMight, name: "Raider" }, "raider");
}

async function raid(attackerMight: number): Promise<Game> {
  const game = await board(attackerMight).build();
  expect(game.gameState.battlefields.forge).toMatchObject({ contested: false, controller: P1 });
  await game.p2.move("raider", "forge");
  return game;
}

describe("Ruling b9133d86eb3ac081 — the defender keeps control of a contested battlefield until the combat is decided", () => {
  test("P2 moves in: the Forge is now CONTESTED (by P2) yet its controller is still P1; a combat showdown is open with the attacker holding Focus", async () => {
    const game = await raid(5);
    expect(game.gameState.battlefields.forge).toMatchObject({ contested: true, controller: P1 });
    expect(game.gameState.battlefields.forge?.contestedBy ?? P2).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(game.p1.units("forge")).toEqual(["smith"]);
    expect(game.p2.units("forge")).toEqual(["raider"]);
  });

  test("control-dependent things keep working mid-combat: P1's card hidden at the Forge is still facedown there and P1 may play it when Focus comes round", async () => {
    const game = await raid(5);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    expect(game.zoneOf("zh")).toBe("facedown-forge");
    expect(game.p1.can("reveal", "zh")).toBe(true);
    await game.p1.reveal("zh");
    expect(game.zoneOf("zh")).toBe("base"); // gear from hidden goes to base
    expect(game.gameState.battlefields.forge).toMatchObject({ contested: true, controller: P1 }); // still P1's during the showdown
  });

  test("outcome A — the defender survives (2-Might Raider dies to the 3-Might Smith): control never changed hands; the Forge is P1's and no longer contested, the hidden card is untouched", async () => {
    const game = await raid(2);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("smith")).toBe("battlefield-forge");
    expect(game.gameState.battlefields.forge).toMatchObject({ contested: false, controller: P1 });
    expect(game.zoneOf("zh")).toBe("facedown-forge");
    expect(game.p2.points()).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("outcome B — the attacker clears the battlefield (5 vs 3; the flipped Zhonya's whisks the Smith to base): only NOW, at combat resolution, does P2 establish control (conquer, 1 point) and P1 lose it", async () => {
    const game = await raid(5);
    await game.p2.passFocus();
    await game.p1.reveal("zh");
    // Right up to resolution P1 is still the controller.
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    await game.settle();
    expect(game.zoneOf("zh")).toBe("trash");
    expect(game.state("smith")).toMatchObject({ damage: 0, isExhausted: true, zone: "base" });
    expect(game.zoneOf("raider")).toBe("battlefield-forge");
    expect(game.gameState.battlefields.forge).toMatchObject({ contested: false, controller: P2 });
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });
});
