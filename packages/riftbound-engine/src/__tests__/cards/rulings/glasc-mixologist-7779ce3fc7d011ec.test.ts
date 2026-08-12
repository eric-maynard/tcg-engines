/**
 * Ruling 7779ce3fc7d011ec — Glasc Mixologist (SFD-165 → sfd-165-221) · Unit · Order · [5][order] · 5 Might
 *   "[Deathknell] — You may play a unit with cost no more than [3] and no more than [rainbow] from your trash,
 *    ignoring its cost."
 *
 * Q: Glasc Mixologist dies at a battlefield. Can the unit it revives be played to that SAME battlefield?
 * A: Yes, when you were the defender. The Deathknell goes on the chain before the cleanup that would drop your
 *    control of an emptied battlefield, so you still control it while the effect resolves and may play there — and
 *    because the revived unit is now present, control survives the cleanup.
 * Rules: 187.4.c / 323.6 (control is not lost while items are on the chain), 734.1.d.2 (the Deathknell is queued
 *        before the body reaches the trash), 356.1.b ("ignoring its cost").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLASC_MIXOLOGIST = "sfd-165-221";
const RECRUIT = { cardType: "unit", energyCost: 2, might: 2, name: "Recruit" } as const;

/** P2's turn. P1 DEFENDS bf1 with Glasc (5) and has a cheap Recruit in the trash; P2 attacks with an equal body. */
function board() {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", GLASC_MIXOLOGIST, "glasc")
    .trash(P1, RECRUIT, "recruit")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

/** The combat that kills both bodies, leaving bf1 momentarily empty. */
async function mutualKill(): Promise<Game> {
  const game = await board().build();
  await game.p2.move("raider", "bf1");
  expect(game.state("glasc").combatRole).toBe("defender");
  return game;
}

describe("Ruling 7779ce3fc7d011ec — Glasc's Deathknell may replay a unit to the very battlefield it died at", () => {
  test("both 5-Might bodies die in the combat, and the Deathknell is offered to P1", async () => {
    const game = await mutualKill();
    game.script(P1, ["decline"]);
    await game.settle();
    expect(game.zoneOf("glasc")).toBe("trash");
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("recruit")).toBe("trash"); // declined, so nothing came back
  });

  test("accepting it plays the Recruit from the trash — bf1 is an offered destination for the defender", async () => {
    const game = await mutualKill();
    game.script(P1, ["yes", "recruit", "bf1"]);
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("battlefield-bf1");
    expect(game.locationOf("recruit")).toBe("bf1");
  });

  test("…and because the Recruit is there when cleanup finally runs, P1 keeps control of bf1", async () => {
    const game = await mutualKill();
    game.script(P1, ["yes", "recruit", "bf1"]);
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.units("bf1")).toEqual(["recruit"]);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — declining leaves bf1 empty, so P1's control lapses at the cleanup", async () => {
    const game = await mutualKill();
    game.script(P1, ["decline"]);
    await game.settle();
    expect(game.p1.units("bf1")).toEqual([]);
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
  });
});
