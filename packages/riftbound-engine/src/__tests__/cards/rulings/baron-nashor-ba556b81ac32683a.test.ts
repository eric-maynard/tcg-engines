/**
 * Ruling ba556b81ac32683a — Baron Nashor (UNL-147 → unl-147-219) × Baron Pit (UNL-T01 → unl-t01, battlefield token)
 *   Baron: "As you play me, add the Baron Pit battlefield token to the board if it's not there already. If you do, I enter
 *   there. I can't be chosen by enemy spells and abilities. Other friendly units have +2 [Might]."
 *   Baron Pit: "Units can move here from anywhere."
 *
 * Q: When Baron Nashor dies, what happens to the Baron Pit?
 * A: Nothing — it stays. Once created the Pit is an independent game object; no rule removes a battlefield token when the
 *    unit whose play created it dies or leaves. It remains a battlefield that units can move to from anywhere.
 * Rules: 135.2.b.3 / 186 (tokens are real game objects once created), Baron Pit's own text.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BARON_NASHOR = "unl-147-219";
const VENGEANCE = "ogn-229-298"; // "Kill a unit." — a FRIENDLY spell may choose Baron

/** P1's turn: 10+[chaos]×3 for Baron and 4+[order]×2 for Vengeance. bf1 is P2's (Guard), bf2 is P1's (Holder 2). */
function board() {
  return scenario()
    .resources(P1, { energy: 14, power: { chaos: 3, order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "Guard" }, "guard")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .hand(P1, BARON_NASHOR, "baron")
    .hand(P1, VENGEANCE, "vengeance");
}

const pitOf = (game: Game) => game.battlefields().find((b) => b !== "bf1" && b !== "bf2");

/** Play Baron (Pit appears, he enters there and conquers it), then kill him with P1's own Vengeance. */
async function baronLivesAndDies(): Promise<{ game: Game; pit: string }> {
  const game = await board().build();
  expect(game.battlefields().sort()).toEqual(["bf1", "bf2"]);
  await game.p1.play("baron", { to: "base" }); // "I enter there" overrides the announced destination
  await game.settle();
  const pit = pitOf(game);
  expect(pit).toBeDefined();
  expect(game.locationOf("baron")).toBe(pit);
  expect(game.gameState.battlefields[pit as string]).toMatchObject({ controller: P1 });
  await game.p1.cast("vengeance", { targets: "baron" });
  await game.settle();
  expect(game.zoneOf("baron")).toBe("trash");
  return { game, pit: pit as string };
}

describe("Ruling ba556b81ac32683a — the Baron Pit outlives Baron Nashor", () => {
  test("after Baron dies the Baron Pit battlefield token is still on the board (now empty and uncontrolled), alongside bf1/bf2", async () => {
    const { game, pit } = await baronLivesAndDies();
    expect(game.battlefields()).toContain(pit);
    expect(game.gameState.battlefields[pit]).toBeDefined();
    expect(game.gameState.battlefields[pit]).toMatchObject({ contested: false, controller: null });
    expect(game.cardsAt(pit)).toEqual([]);
    expect(game.battlefields().sort()).toEqual(["bf1", "bf2", pit].sort());
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("…and it still works as a battlefield with 'units can move here from anywhere': Holder moves battlefield→Pit (bf2 → Pit, no Ganking) and takes control of it", async () => {
    const { game, pit } = await baronLivesAndDies();
    const moveTargets = game.p1
      .legal()
      .filter((o) => o.verb === "move")
      .map((o) => o.key);
    expect(moveTargets).toContain(`standardMove:to:${pit}`);
    await game.p1.move("holder", pit);
    await game.settle();
    expect(game.locationOf("holder")).toBe(pit);
    expect(game.gameState.battlefields[pit]).toMatchObject({ controller: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("the Pit also survives into later turns (P2's turn, then P1's again)", async () => {
    const { game, pit } = await baronLivesAndDies();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.battlefields()).toContain(pit);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.battlefields()).toContain(pit);
    expect(game.gameState.battlefields[pit]).toBeDefined();
  });
});
