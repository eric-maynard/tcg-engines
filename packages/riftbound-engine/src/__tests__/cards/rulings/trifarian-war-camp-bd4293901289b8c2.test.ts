/**
 * Ruling bd4293901289b8c2 — Trifarian War Camp (OGN-294 → ogn-294-298) "Units here have +1 [Might]." × Smoke Screen (OGN-093 →
 *   ogn-093-298) Reaction [2][mind] "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]." × Charm (OGN-043 → ogn-043-298)
 *   [1][calm] "Move an enemy unit."
 *
 * Q: A 1-Might unit at the War Camp (2 there) is Smoke Screened to 1, then Charmed back to its base. Does it die or stay at 1?
 * A: Neither — it becomes a 0-Might unit and does NOT die. Only damage marked ≥ Might kills; a unit with 0 (or less) Might and no
 *    damage stays in play.
 * Rules: 143.2.a (killed only by nonzero damage ≥ Might), 143.2.b (Might ≤ 0 is legal), War Camp +1 ends on leaving.
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const SMOKE_SCREEN = "ogn-093-298";
const CHARM = "ogn-043-298";

/** P2's turn. P1 holds the LIVE War Camp with a printed-1 Scout (2 there). P2: Smoke Screen + Charm, [3] + [mind] + [calm]. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 3, power: { calm: 1, mind: 1 } })
    .battlefield("camp", { controller: P1, def: WAR_CAMP, inert: false })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "camp", { might: 1, name: "Scout" }, "scout")
    .unit(P2, "bf2", { might: 3, name: "Holder" }, "holder")
    .hand(P2, SMOKE_SCREEN, "smoke")
    .hand(P2, CHARM, "charm");
}

async function smokeThenCharmHome(): Promise<Game> {
  const game = await board().build();
  expect(game.state("scout")).toMatchObject({ baseMight: 1, might: 2 }); // 1 + Camp
  await game.p2.cast("smoke", { targets: "scout" });
  await game.settle();
  expect(game.zoneOf("smoke")).toBe("trash");
  expect(game.state("scout")).toMatchObject({ location: "camp", might: 1 }); // 2 − 4 → floor 1
  await game.p2.cast("charm", { targets: "scout" });
  const d = game.decision() as PickDecision;
  expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "destination" });
  expect(d.options.map((o) => o.key)).toContain("base");
  await game.p2.pick("base");
  await game.settle();
  expect(game.zoneOf("charm")).toBe("trash");
  return game;
}

describe("Ruling bd4293901289b8c2 — Smoke Screened to 1 at the War Camp, then Charmed home: a living 0-Might unit", () => {
  test("after Charm moves it to base it loses the Camp's +1: Might 0, no damage — and it is still on the board (not in the trash)", async () => {
    const game = await smokeThenCharmHome();
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout")).toMatchObject({ damage: 0, might: 0, zone: "base" });
    expect(game.p1.units("base")).toContain("scout");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.violations()).toEqual([]);
  });

  test("it survives every later cleanup too: still in base at the end of the turn, and back to its printed 1 on the next turn (the -4 was 'this turn')", async () => {
    const game = await smokeThenCharmHome();
    await game.advanceTurn(); // P2 ends → P1's turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("scout")).toBe("base");
    expect(game.state("scout").might).toBe(1);
  });
});
