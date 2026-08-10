/**
 * Ruling f29fb099b6d2e0ea — Trifarian War Camp (OGN-294 → ogn-294-298) · Battlefield "Units here have +1 [Might]."
 *   × Smoke Screen (OGN-093 → ogn-093-298) "[Reaction] Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: A printed-3 unit at the War Camp gets Smoke Screened — is it 1 or 2 Might?
 * A: 1. The Camp's passive applies first (3 + 1 = 4); Smoke Screen sees 4 and snapshots the reduction that takes it to
 *    the floor of 1. It keeps +1 while at the Camp and the reduction until end of turn; if it then leaves the Camp it
 *    drops to 0 (the snapshotted reduction stays, the +1 goes away).
 * Rules: 476–478 (Might arithmetic layer; increases before decreases; "to a minimum of 1" bounds the reduction when applied).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WAR_CAMP = "ogn-294-298";
const SMOKE_SCREEN = "ogn-093-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { mind: 1 } })
    .battlefield("camp", { controller: P1, def: WAR_CAMP, inert: false })
    .unit(P1, "camp", { might: 3, name: "Legionnaire" }, "legion")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, SMOKE_SCREEN, "smoke");
}

describe("Ruling f29fb099b6d2e0ea — printed 3 at the War Camp, Smoke Screened: 1 Might (not 2)", () => {
  test("before: the Camp's passive makes the printed-3 unit 4", async () => {
    const game = await board().build();
    expect(game.state("legion")).toMatchObject({ baseMight: 3, might: 4 });
  });

  test("Smoke Screen snapshots against 4 and takes it to exactly 1 while it stays at the Camp", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "legion" });
    await game.settle();
    expect(game.zoneOf("smoke")).toBe("trash");
    expect(game.locationOf("legion")).toBe("camp");
    expect(game.state("legion").might).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("nuance: moving off the Camp afterwards drops it to 0 (loses the +1, keeps the snapshotted −3)", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "legion" });
    await game.settle();
    await game.p1.move("legion", "base");
    await game.settle();
    expect(game.locationOf("legion")).toBe("base");
    expect(game.state("legion").might).toBe(0);
  });

  test("the reduction is 'this turn' only: next turn, back in base, it is its printed 3 again", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "legion" });
    await game.settle();
    await game.p1.move("legion", "base");
    await game.settle();
    await game.advanceTurn();
    expect(game.state("legion").might).toBe(3);
  });
});
