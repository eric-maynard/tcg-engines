/**
 * Ruling bc2cc87e580d9f2e — Reaver's Row (OGN-285 → ogn-285-298) · Battlefield
 *     "When you defend here, you may move a friendly unit here to base."
 *
 * Q: Can an EXHAUSTED unit retreat from Reaver's Row when an opponent moves there to start a showdown?
 * A: Yes. Effects/abilities that move a unit do not require it to be ready (only the Standard Move action exhausts as
 *    its cost), and being moved does not change the unit's orientation — it arrives in base still exhausted.
 * Rules: 141 / 449 (Standard Move exhausts; effect moves have no such cost), 383.4.f (defend trigger), 402 (target chosen
 *        when the trigger is finalized).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const REAVERS_ROW = "ogn-285-298";

/** P2's turn. P1 holds Reaver's Row (live) with an EXHAUSTED Tired (2) and a ready Fresh (3). P2's Raider (5) in base. */
function board() {
  return scenario()
    .active(P2)
    .battlefield("row", { controller: P1, def: REAVERS_ROW, inert: false })
    .unit(P1, "row", { might: 2, name: "Tired" }, "tired", { exhausted: true })
    .unit(P1, "row", { might: 3, name: "Fresh" }, "fresh")
    .unit(P2, "base", { might: 5, name: "Raider" }, "raider");
}

describe("Ruling bc2cc87e580d9f2e — an exhausted unit can be moved home by Reaver's Row, and stays exhausted", () => {
  test("Raider attacks the Row → P1's defend trigger: opt-in (yes/no, P1) then 'a friendly unit here' offers the EXHAUSTED unit as well as the ready one", async () => {
    const game = await board().build();
    expect(game.state("tired").isExhausted).toBe(true);
    await game.p2.move("raider", "row");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "row" }, timing: "FIN" });
    await game.p1.yes();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "target", timing: "FIN" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).toSorted() : []).toEqual(["fresh", "tired"]);
  });

  test("choosing the exhausted unit: the trigger resolves and moves it to P1's base — no readiness needed — and it is STILL exhausted there (orientation unchanged)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "row");
    await game.p1.yes();
    await game.p1.pick("tired");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "row", controller: P1, targets: ["tired"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("tired")).toBe("base");
    expect(game.state("tired").isExhausted).toBe(true);
    expect(game.state("tired").combatRole).not.toBe("defender");
    expect(game.locationOf("fresh")).toBe("row"); // Fresh stays to defend
  });

  test("the combat then plays out without the retreated unit: Raider (5) kills Fresh (3) and conquers; Tired survives in base, still exhausted", async () => {
    const game = await board().build();
    await game.p2.move("raider", "row");
    await game.p1.yes();
    await game.p1.pick("tired");
    await game.settle();
    expect(game.zoneOf("fresh")).toBe("trash");
    expect(game.zoneOf("tired")).toBe("base");
    expect(game.state("tired")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.gameState.battlefields.row?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("contrast — a ready unit moved the same way is not exhausted by it either (the effect move has no exhaust cost)", async () => {
    const game = await board().build();
    await game.p2.move("raider", "row");
    await game.p1.yes();
    await game.p1.pick("fresh");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.locationOf("fresh")).toBe("base");
    expect(game.state("fresh").isReady).toBe(true);
  });
});
