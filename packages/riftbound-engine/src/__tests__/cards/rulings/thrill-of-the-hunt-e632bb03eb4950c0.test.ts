/**
 * Ruling e632bb03eb4950c0 — Thrill of the Hunt (UNL-184 → unl-184-219)
 *   "[Reaction] Banish a friendly unit, then its owner plays it to any battlefield, ignoring its cost."
 *   × Smoke Screen (ogn-093-298) "[Reaction] Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: If I Thrill of the Hunt my own unit and it is banished, does it keep the minus Might a spell gave it?
 * A: No. Leaving the board ends the object; what comes back is a NEW object, so every modifier,
 *    marked damage and buff from before is gone — it returns at its printed Might.
 * Rules: 705 (modifiers end when a card leaves play), 186 / 359.3.e (a card in a new zone is a new object).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const THRILL = "unl-184-219";
const SMOKE_SCREEN = "ogn-093-298";

/** P1 owns a 6-Might Stalker (already carrying 1 damage) plus both spells; bf1 is P1's, held by a Sentry. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { mind: 1, rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "base", { might: 6, name: "Stalker" }, "stalker", { damage: 1 })
    .unit(P1, "bf1", { might: 2, name: "Sentry" }, "sentry")
    .hand(P1, SMOKE_SCREEN, "smoke")
    .hand(P1, THRILL, "thrill");
}

describe("Ruling e632bb03eb4950c0 — a unit banished and replayed by Thrill of the Hunt comes back as a new object with no leftover modifiers", () => {
  test("setup fact: Smoke Screen really does drop the 6-Might Stalker to 2 (a -4 modifier) before Thrill of the Hunt is cast", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "stalker" });
    await game.settle();
    expect(game.state("stalker").might).toBe(2);
    expect(game.state("stalker").mightModifier).toBe(-4);
    expect(game.state("stalker").damage).toBe(1);
  });

  test("after the banish-and-replay the Stalker is back at its printed 6 Might with the -4 and the marked damage gone", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "stalker" });
    await game.settle();
    expect(game.state("stalker").might).toBe(2);

    await game.p1.cast("thrill", { targets: "stalker" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf1"); // "plays it to any battlefield"
    }
    await game.settle();

    expect(game.locationOf("stalker")).toBe("bf1");
    expect(game.state("stalker").might).toBe(6); // printed Might — the spell's -4 did not follow it
    expect(game.state("stalker").mightModifier).toBe(0);
    expect(game.state("stalker").damage).toBe(0);
    expect(game.zoneOf("thrill")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the -4 does not come back later in the turn either: it lapsed with the old object, not with the Ending Phase", async () => {
    const game = await board().build();
    await game.p1.cast("smoke", { targets: "stalker" });
    await game.settle();
    await game.p1.cast("thrill", { targets: "stalker" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("bf1");
    }
    await game.settle();
    expect(game.state("stalker").might).toBe(6);
    await game.advanceTurn();
    expect(game.state("stalker").might).toBe(6);
    expect(game.state("stalker").mightModifier).toBe(0);
  });
});
