/**
 * Ruling 8300697d38649fa5 — Kayn, Unleashed (OGN-189 → ogn-189-298) · Unit · Chaos · [6][chaos] · 6 Might
 *   "[Ganking] / If I have moved twice this turn, I don't take damage."
 *   × Ride the Wind (OGN-173 → ogn-173-298) · [2][chaos] · "Move a friendly unit and ready it."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [1][fury] · "Deal 3 to a unit at a battlefield."
 *
 * Q: Once Kayn has moved twice this turn, how long does the damage immunity last?
 * A: "This turn" is both the condition and the duration — after two moves to two different locations he takes no
 *    damage from ANY source (combat, spells, abilities) for the rest of that turn.
 * Rules: 465.2.c.10 ("I don't take damage" is a continuous restriction re-evaluated as damage is dealt),
 *        446.1 (moves), 740 ([Ganking]), 466.1.a.1 (Combat Cleanup heals, which is why the spell case is the
 *        clean read of "took damage").
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KAYN_UNLEASHED = "ogn-189-298";
const RIDE_THE_WIND = "ogn-173-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. bfA and bfC are empty and uncontrolled; bfB is P2's with an equal 6-Might Warden. */
function board() {
  return scenario()
    .turn(2)
    .active(P1)
    .resources(P1, { energy: 3, power: { chaos: 1, fury: 1 } })
    .battlefield("bfA", { controller: null })
    .battlefield("bfC", { controller: null })
    .battlefield("bfB", { controller: P2 })
    .unit(P2, "bfB", { might: 6, name: "Warden" }, "warden")
    .unit(P1, "base", KAYN_UNLEASHED, "kayn")
    .hand(P1, RIDE_THE_WIND, "rtw")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** Pass Focus until nothing is waiting on a showdown pass. */
async function closeShowdowns(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    await game.settle();
    const d = game.decision();
    if (d?.kind !== "action" || d.context !== "showdown") {
      return;
    }
    await game.seat(d.seat).passFocus();
  }
}

/** Ride the Wind to bfA (move #1, and it readies him) then gank on to `to` (move #2). */
async function movedTwice(to: string): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("rtw", { answers: ["bfA"], targets: "kayn" });
  await closeShowdowns(game);
  expect(game.locationOf("kayn")).toBe("bfA");
  expect(game.state("kayn").isReady).toBe(true);
  await game.p1.gank("kayn", to);
  return game;
}

describe("Ruling 8300697d38649fa5 — two moves in a turn make Kayn damage-proof for the rest of it", () => {
  test("ONE move: 6 against 6 is a mutual kill — Kayn takes the Warden's damage like anyone else", async () => {
    const game = await board().build();
    await game.p1.move("kayn", "bfB");
    await closeShowdowns(game);
    expect(game.zoneOf("kayn")).toBe("trash");
    expect(game.zoneOf("warden")).toBe("trash");
  });

  test("TWO moves: the same combat kills only the Warden — Kayn takes nothing and conquers bfB", async () => {
    const game = await movedTwice("bfB");
    await closeShowdowns(game);
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.zoneOf("kayn")).toBe("battlefield-bfB");
    expect(game.state("kayn").damage).toBe(0);
    expect(game.gameState.battlefields.bfB?.controller).toBe(P1);
  });

  test("the immunity is not combat-only — after one move a spell marks him", async () => {
    const game = await board().build();
    await game.p1.move("kayn", "bfA");
    await closeShowdowns(game);
    await game.p1.cast("ray", { targets: "kayn" });
    await game.settle();
    expect(game.state("kayn").damage).toBe(3);
  });

  test("…and after two moves the same spell does nothing to him, out of combat, later in the turn", async () => {
    const game = await movedTwice("bfC");
    await closeShowdowns(game);
    await game.p1.cast("ray", { targets: "kayn" });
    await game.settle();
    expect(game.state("kayn").damage).toBe(0);
    expect(game.zoneOf("ray")).toBe("trash"); // the spell did resolve
    expect(game.violations()).toEqual([]);
  });
});
