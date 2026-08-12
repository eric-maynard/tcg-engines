/**
 * Ruling 7821602a0c82aa25 — Ride the Wind (OGN-173 → ogn-173-298) · Spell · Chaos · [2][chaos] · Action
 *   "Move a friendly unit and ready it."
 *
 * Q: Can Ride the Wind move a unit from battlefield A directly to battlefield B?
 * A: Yes. The "no battlefield-to-battlefield" rule is a restriction on the STANDARD MOVE action only.
 *    A spell or ability moves under its own terms, so Ride the Wind may go straight from A to B.
 * Rules: 144.3 (Standard Move: base↔battlefield only — battlefield to battlefield needs [Ganking]),
 *        449 (an effect's move obeys the effect's own wording), 355.4 (the destination is chosen as the spell is played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** P1's turn. P1 durably controls bfA (Rider) and bfB (Holder); bfC is uncontrolled. P1 holds Ride the Wind + [2][chaos]. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { chaos: 1 } })
    .battlefield("bfA", { controller: P1 })
    .battlefield("bfB", { controller: P1 })
    .battlefield("bfC", { controller: P2 })
    .unit(P1, "bfA", { might: 3, name: "Rider" }, "rider")
    .unit(P1, "bfB", { might: 2, name: "Holder" }, "holder")
    .unit(P2, "bfC", { might: 2, name: "Theirs" }, "theirs")
    .hand(P1, RIDE_THE_WIND, "rtw");
}

describe("Ruling 7821602a0c82aa25 — Ride the Wind moves battlefield → battlefield; only the Standard Move is restricted", () => {
  test("premise: the STANDARD move of the Rider (at bfA, ready, no [Ganking]) offers only the base — no battlefield destination", async () => {
    const game = await board().build();
    expect(game.state("rider").isReady).toBe(true);
    const dests = game.p1
      .legal()
      .filter((o) => o.verb === "move" || o.moveId === "standardMove")
      .flatMap((o) => o.variants.map((v) => String((v.params as Record<string, unknown>).toLocation ?? (v.params as Record<string, unknown>).to ?? "")));
    expect(dests.some((d) => /bfB|bfC/.test(d))).toBe(false);
    expect((await game.p1.try((p) => p.move("rider", "bfB"))).ok).toBe(false);
  });

  test("ruling: Ride the Wind offers bfB (and bfC) as destinations for the Rider and moves it straight from bfA to bfB", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "rider" });
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
    expect((d?.options ?? []).map((o) => o.key)).toEqual(expect.arrayContaining(["battlefield-bfB"]));
    await game.p1.pick("battlefield-bfB");
    await game.settle();
    expect(game.locationOf("rider")).toBe("bfB");
    expect(game.state("rider").isReady).toBe(true); // "and ready it"
    expect(game.zoneOf("rtw")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("bfA is emptied by the departure, so P1 loses it at the next Open Cleanup — the move really left one battlefield for another", async () => {
    const game = await board().build();
    await game.p1.cast("rtw", { targets: "rider" });
    await game.p1.pick("battlefield-bfB");
    await game.settle();
    expect(game.p1.units("bfA")).toEqual([]);
    expect(game.gameState.battlefields.bfA?.controller).toBeNull();
    expect(game.p1.units("bfB").sort()).toEqual(["holder", "rider"]);
  });
});
