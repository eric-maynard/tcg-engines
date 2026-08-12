/**
 * Ruling 1d235e86dc3ddf03 — En Garde (OGN-046 → ogn-046-298) · [Reaction] · Calm · [1][calm]
 *     "Give a friendly unit +1 [Might] this turn, then an additional +1 [Might] this turn if it is the only
 *      unit you control there."
 *   × Stellacorn Herder (SFD-048 → sfd-048-221) · 3 Might · "When I move, draw 1."
 *   × Wages of Pain (SFD-070 → sfd-070-221) · [Action] · "Deal 3 to a unit at a battlefield. …"
 *
 * Q: My unit walks onto a battlefield with no enemy presence (a NON-combat showdown), the opponent damages
 *    it, En Garde keeps it alive. When the showdown ends, does the damage heal?
 * A: No. Healing is part of the Combat Special Cleanup that runs in a combat showdown's Resolution Step; a
 *    non-combat showdown simply closes, with no heal step, so the marked damage stays.
 * Rules: 459.2 (non-combat showdown), 348.2 (non-combat close), 461.1.a (Combat Special Cleanup heals).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const EN_GARDE = "ogn-046-298";
const STELLACORN_HERDER = "sfd-048-221";
const WAGES_OF_PAIN = "sfd-070-221";

/** P1's turn. bf1 is open and empty; P1's Stellacorn is at home; P2 holds Wages of Pain. */
function base() {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .resources(P2, { energy: 3 })
    .unit(P1, "base", STELLACORN_HERDER, "corn")
    .hand(P1, EN_GARDE, "engarde")
    .hand(P2, WAGES_OF_PAIN, "wages");
}

/**
 * Walk the Stellacorn into the showdown, let its "When I move, draw 1" resolve, then have P2 shoot it for 3
 * while P1 answers with En Garde (+2 while it is alone there → 5 Might, survives).
 */
async function damagedInShowdown(game: Game): Promise<void> {
  await game.p1.move("corn", "bf1");
  await game.p1.passPriority();
  await game.p2.passPriority(); // the move trigger resolves; the staged showdown opens
  expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
  await game.p1.passFocus();
  await game.p2.cast("wages", { targets: "corn" });
  await game.p2.passPriority();
  await game.p1.cast("engarde", { targets: "corn" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // En Garde resolves first (LIFO)
  expect(game.state("corn").might).toBe(5);
  await game.p2.passPriority();
  await game.p1.passPriority(); // Wages of Pain resolves
  expect(game.state("corn").damage).toBe(3);
}

describe("Ruling 1d235e86dc3ddf03 — a NON-combat showdown has no heal step, so the damage stays marked", () => {
  test("ruling: after the non-combat showdown closes the Stellacorn keeps its 3 damage", async () => {
    const game = await base().battlefield("bf1", { controller: null }).build();
    await damagedInShowdown(game);
    await game.settle();
    expect(game.zoneOf("corn")).toBe("battlefield-bf1");
    expect(game.state("corn").damage).toBe(3); // NOT healed
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1); // sole occupant conquers on the close
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast: the same 3 damage in a COMBAT showdown IS wiped by the Combat Special Cleanup", async () => {
    const game = await base()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Guard" }, "guard")
      .build();
    await damagedInShowdown(game);
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("corn")).toBe("battlefield-bf1");
    expect(game.state("corn").damage).toBe(0); // healed at combat resolution
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("epilogue (non-combat): the damage sticks all the way to the Ending Phase, whose heal step (317.2.a) clears it before the +2 lapses", async () => {
    const game = await base().battlefield("bf1", { controller: null }).build();
    await damagedInShowdown(game);
    await game.settle();
    expect(game.state("corn")).toMatchObject({ might: 5, damage: 3 });
    await game.advanceTurn();
    const firstPass = game.trace().expiration[0];
    expect(firstPass?.steps).toEqual(["heal", "expire", "empty-pools"]);
    expect(firstPass?.healed).toContain("corn");
    expect(game.state("corn")).toMatchObject({ might: 3, damage: 0 });
    expect(game.zoneOf("corn")).toBe("battlefield-bf1");
  });
});
