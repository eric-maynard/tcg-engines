/**
 * Ruling 8d7e40c7ec58c8ca — The Boss (OGN-269 → ogn-269-298) · Legend (Sett) ·
 *   "If a buffed unit you control would die, you may pay [rainbow], exhaust me, and spend its buff to heal it,
 *   exhaust it, and recall it instead. (Send it to base. This isn't a move.)"
 *
 * Q: Can the Sett legend protect a unit that is already at my base from a spell that would kill it?
 * A: Yes. The requirement is only "a buffed unit you control" — nothing about where it stands. You pay the whole
 *    cost anyway, and the recall part simply does nothing for a unit that is already in base ("do as much as
 *    possible"); the protection still applies.
 * Rules: 371.2 (an optional, costed death replacement), 702.2.b (spend a buff), 359.3 (do as much as possible —
 *        an instruction that can do nothing is ignored, the rest still happens).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BOSS = "ogn-269-298";

/** [Action] "Kill a unit." — P2's removal. */
const CULL = {
  abilities: [{ effect: { target: { type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "chaos",
  energyCost: 1,
  name: "Test Cull",
  powerCost: [],
  rulesText: "[Action] Kill a unit.",
  timing: "action",
} as const;

/** P2's turn: P1 has The Boss ready plus one buffed unit at BASE and one buffed unit at a battlefield. */
function board() {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 4 })
    .resources(P1, { power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .legend(P1, BOSS, "boss")
    .unit(P1, "base", { might: 3, name: "Homebody" }, "home", { buffed: true })
    .unit(P1, "bf1", { might: 3, name: "Outrider" }, "out", { buffed: true })
    .unit(P2, "bf2", { might: 2, name: "Wall" }, "wall")
    .hand(P2, CULL, "cull")
    .hand(P2, CULL, "cull2");
}

/** P2 tries to kill the unit standing in P1's base; the replacement is offered to P1. */
async function killingTheHomebody(): Promise<Game> {
  const game = await board().build();
  expect(game.state("home")).toMatchObject({ isBuffed: true, location: "base" });
  await game.p2.cast("cull", { targets: "home" });
  await game.settle();
  return game;
}

describe("Ruling 8d7e40c7ec58c8ca — The Boss protects a buffed unit wherever it stands, base included", () => {
  test("the offer is made for a unit already in base — location is no part of the requirement", async () => {
    const game = await killingTheHomebody();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    expect(game.zoneOf("home")).toBe("base"); // not dead while the choice is open
  });

  test("accepting pays the whole cost — [rainbow], exhaust the legend, spend the buff — and the unit survives at base", async () => {
    const game = await killingTheHomebody();
    const powerBefore = game.p1.power("rainbow");
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("home")).toBe("base"); // saved
    expect(game.p1.power("rainbow")).toBe(powerBefore - 1);
    expect(game.state("boss").isExhausted).toBe(true);
    expect(game.state("home").isBuffed).toBe(false); // its buff was spent
    expect(game.state("home").isExhausted).toBe(true); // it is exhausted by the replacement
    expect(game.violations()).toEqual([]);
  });

  test("the recall half is simply a no-op there: it was in base before and it is in base after", async () => {
    const game = await killingTheHomebody();
    await game.p1.yes();
    await game.settle();
    expect(game.locationOf("home")).toBe("base");
  });

  test("declining lets it die as normal", async () => {
    const game = await killingTheHomebody();
    await game.p1.no();
    await game.settle();
    expect(game.zoneOf("home")).toBe("trash");
    expect(game.state("boss").isExhausted).toBe(false); // nothing was paid
  });

  test("for a unit at a battlefield the same save DOES recall it — that is the half that does something there", async () => {
    const game = await board().build();
    await game.p2.cast("cull", { targets: "out" });
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "boss" } });
    await game.p1.yes();
    await game.settle();
    expect(game.zoneOf("out")).toBe("base"); // recalled out of bf1
    expect(game.state("out").isBuffed).toBe(false);
  });

  test("the legend can only do it once while exhausted: a second kill goes through", async () => {
    const game = await board().build();
    await game.p2.cast("cull", { targets: "home" });
    await game.settle();
    await game.p1.yes();
    await game.settle();
    expect(game.state("boss").isExhausted).toBe(true);
    await game.p2.cast("cull2", { targets: "out" });
    await game.settle();
    expect(game.zoneOf("out")).toBe("trash"); // no second save — the cost cannot be paid
  });
});
