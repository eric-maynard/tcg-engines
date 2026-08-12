/**
 * Ruling fcc68662a1d7abc8 — Stand United (OGN-053 → ogn-053-298) · [Hidden] [Action] spell · [3]
 *   "Buff a friendly unit. Buffs give an additional +1 [Might] to friendly units this turn."
 *
 * Q: Played from Hidden, does the +1 bonus apply at every battlefield or only where the card was hidden?
 * A: Both halves behave differently. The TARGETED half ("buff a friendly unit") is locked to the battlefield the card
 *    was hidden at. The second sentence targets nothing, so its "+1 per buff to friendly units this turn" applies
 *    everywhere — every buffed friendly unit on the board, at any battlefield or in base.
 * Rules: 811.1.d.2 (a card played from Hidden may only choose objects at that battlefield), 811.2 (untargeted effects are unrestricted).
 */
import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STAND_UNITED = "ogn-053-298";

/** P1's turn. Stand United is hidden at bf1. A plain unit stands at bf1; an ALREADY BUFFED unit stands at bf2. */
function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Near" }, "near")
    .unit(P1, "bf1", { might: 2, name: "Near Two" }, "near2")
    .unit(P1, "bf2", { might: 2, name: "Far" }, "far", { buffed: true })
    .unit(P1, "base", { might: 2, name: "Home" }, "home", { buffed: true })
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe", { buffed: true })
    .facedown(P1, "bf1", STAND_UNITED, "stand");
}

/** Reveal the hidden Stand United; it is asking for its buff target. */
async function revealed(): Promise<Game> {
  const game = await board().build();
  expect(game.state("far").might).toBe(3); // a buff is +1 on its own
  await game.p1.reveal("stand");
  return game;
}

/** …answer that pick and let the spell resolve. */
async function resolved(): Promise<Game> {
  const game = await revealed();
  await game.p1.pick("near");
  await game.acting().passPriority();
  await game.acting().passPriority();
  expect(game.zoneOf("stand")).toBe("trash");
  return game;
}

describe("Ruling fcc68662a1d7abc8 — from Hidden, the buff is local but the +1-per-buff is board-wide", () => {
  test("the targeted half is locked to the hiding battlefield: only the bf1 unit is offered", async () => {
    const game = await revealed();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.key).sort()).toEqual(["near", "near2"]); // not "far" (bf2) and not "home" (base)
  });

  test("the chosen unit is buffed and then also gets the global +1: 2 → 4", async () => {
    const game = await resolved();
    expect(game.state("near").isBuffed).toBe(true);
    expect(game.state("near").might).toBe(4);
    expect(game.state("near2").isBuffed).toBe(false);
    expect(game.state("near2").might).toBe(2); // unbuffed units get nothing
  });

  test("the already-buffed unit at the OTHER battlefield gets the +1 too — 3 → 4 — although it was never targeted", async () => {
    const game = await resolved();
    expect(game.state("far").isBuffed).toBe(true);
    expect(game.state("far").might).toBe(4);
  });

  test("a buffed friendly unit in BASE also gets it — 'friendly units' is not limited to battlefields", async () => {
    const game = await resolved();
    expect(game.state("home").might).toBe(4);
  });

  test("enemy buffed units get nothing, and the bonus is gone next turn", async () => {
    const game = await resolved();
    expect(game.state("foe").might).toBe(3); // its own buff only
    await game.advanceTurn();
    expect(game.state("far").might).toBe(3);
    expect(game.state("near").might).toBe(3); // keeps the buff itself, loses the this-turn bonus
    expect(game.violations()).toEqual([]);
  });
});
