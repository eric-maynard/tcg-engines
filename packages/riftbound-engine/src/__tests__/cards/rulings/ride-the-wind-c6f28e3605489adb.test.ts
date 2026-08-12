/**
 * Ruling c6f28e3605489adb — Ride the Wind (OGN-173 → ogn-173-298) · Spell · [2][chaos] · [Action]
 *   "Move a friendly unit and ready it."
 *
 * Q: Multiplayer — Player A holds a battlefield, Player B moves in and starts a showdown. Can Player C use a movement
 *    spell like Ride the Wind to send a unit into that showdown?
 * A: C can cast it — priority does go round the table during a showdown — but the unit cannot arrive: a battlefield
 *    can never hold units belonging to more than two players. The spell resolves and the move simply does not happen.
 * Rules: 320.2 (at most two players' units at a battlefield), 347/340 (priority passes to every player),
 *        355.4 / 359.3.e.11 (an impossible move is skipped; the rest of the spell still happens).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, P3, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** Three-player game, P2's turn. P1 holds the only battlefield; P3 waits at home with Ride the Wind and the Power. */
function board() {
  return scenario({ players: 3 })
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "base", { might: 3, name: "Invader" }, "invader")
    .unit(P3, "base", { might: 3, name: "Third" }, "third", { exhausted: true })
    .hand(P3, RIDE_THE_WIND, "rtw")
    .resources(P3, { energy: 2, power: { chaos: 1 } });
}

/** Open the two-player showdown at bf1 and pass Focus round until it is P3's turn to act. */
async function toThirdPlayersWindow() {
  const game = await board().build();
  await game.p2.move("invader", "bf1");
  expect(game.p1.units("bf1")).toEqual(["holder"]);
  expect(game.p2.units("bf1")).toEqual(["invader"]);
  while (game.actingSeat() !== P3) {
    await game.acting().pass();
  }
  return game;
}

describe("Ruling c6f28e3605489adb — the third player may cast into the showdown, but nobody can be a third occupant", () => {
  test("priority does reach P3 during the showdown and Ride the Wind is castable there", async () => {
    const game = await toThirdPlayersWindow();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P3 });
    expect(game.seat(P3).can("cast", "rtw")).toBe(true);
    expect(game.seat(P3).option("cast", "rtw")?.fields.find((f) => f.arg === "targets")?.options).toEqual([["third"]]);
  });

  test("bf1 is not among the destinations it can reach — it already holds two players' units", async () => {
    const game = await toThirdPlayersWindow();
    await game.seat(P3).cast("rtw", { targets: "third" });
    await game.settle();
    expect(game.zoneOf("rtw")).toBe("trash"); // the spell resolved
    expect(game.locationOf("third")).toBe("base"); // …but the move had nowhere legal to go
    expect(game.seat(P3).units("bf1")).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the rest of the spell still happens — the unit is readied where it stands", async () => {
    const game = await toThirdPlayersWindow();
    expect(game.state("third").isExhausted).toBe(true);
    await game.seat(P3).cast("rtw", { targets: "third" });
    await game.settle();
    expect(game.state("third").isReady).toBe(true);
  });

  test("the two-player showdown itself is unaffected and closes normally", async () => {
    const game = await toThirdPlayersWindow();
    await game.seat(P3).cast("rtw", { targets: "third" });
    await game.settle();
    expect(game.gameState.battlefields.bf1?.contested ?? false).toBe(false);
    expect(game.zoneOf("holder")).toBe("trash"); // 3 vs 3 traded
    expect(game.zoneOf("invader")).toBe("trash");
  });
});
