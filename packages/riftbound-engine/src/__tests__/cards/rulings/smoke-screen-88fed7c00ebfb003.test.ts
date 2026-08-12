/**
 * Ruling 88fed7c00ebfb003 — Smoke Screen (OGN-093 → ogn-093-298) · Spell · Mind · [2][mind] · Reaction
 *     "Give a unit -4 [Might] this turn, to a minimum of 1 [Might]."
 *   × Qiyana, Victorious (OGN-155 → ogn-155-298) · 4 Might · "[Deflect] (Opponents must pay [rainbow] to choose me…)"
 *   × Thousand-Tailed Watcher (OGN-116 → ogn-116-298) — the contrast: it CHOOSES nothing ("give enemy units -3").
 *
 * Q: Does Smoke Screen need the extra power when it hits a unit with [Deflect]?
 * A: Yes. Anything that makes a player pick an object is a choosing, and [Deflect] taxes every such choosing.
 *    An effect that names its objects programmatically ("enemy units", "all units") makes no choice, so it is free.
 * Rules: 809.1 ([Deflect]: opponents pay the surcharge for each time they choose the unit),
 *        355.10.d (a choice is a selection the player makes; "each/all X" is programmatic, not a choice).
 */
import { describe, expect, test } from "bun:test";
import type { ScenarioBuilder } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMOKE_SCREEN = "ogn-093-298";
const QIYANA = "ogn-155-298";
const THOUSAND_TAILED_WATCHER = "ogn-116-298";

/** P1's turn with the given pool. P2 holds bf1 with Qiyana ([Deflect], 4 Might) and a plain 4-Might unit. */
function board(resources: { energy: number; power: Record<string, number> }): ScenarioBuilder {
  return scenario()
    .resources(P1, resources)
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", QIYANA, "qiyana")
    .unit(P2, "bf1", { might: 4, name: "Plain" }, "plain")
    .hand(P1, SMOKE_SCREEN, "smoke");
}

describe("Ruling 88fed7c00ebfb003 — Smoke Screen owes [Deflect]'s surcharge for choosing Qiyana", () => {
  test("ruling: with only the printed [2][mind] in pool, Qiyana is not even an offered target — the plain unit is", async () => {
    const game = await board({ energy: 2, power: { mind: 1 } }).build();
    expect(game.p1.option("cast", "smoke")?.fields.find((f) => f.name === "targets")?.options).toEqual([["plain"]]);
    expect((await game.p1.try((p) => p.cast("smoke", { targets: "qiyana" }))).ok).toBe(false);
    expect(game.zoneOf("smoke")).toBe("hand");
    expect(game.p1.energy()).toBe(2);
  });

  test("ruling: add one [rainbow] and Qiyana becomes targetable — casting it spends the base cost AND the [Deflect] pip", async () => {
    const game = await board({ energy: 2, power: { mind: 1, rainbow: 1 } }).build();
    const sets = game.p1.option("cast", "smoke")?.fields.find((f) => f.name === "targets")?.options ?? [];
    expect(sets).toContainEqual(["qiyana"]);
    await game.p1.cast("smoke", { targets: "qiyana" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0, rainbow: 0 } });
    await game.settle();
    expect(game.state("qiyana").might).toBe(1); // 4 − 4, floored at the printed minimum 1
    expect(game.violations()).toEqual([]);
  });

  test("control — the non-[Deflect] unit costs only the printed [2][mind]; the [rainbow] is untouched", async () => {
    const game = await board({ energy: 2, power: { mind: 1, rainbow: 1 } }).build();
    await game.p1.cast("smoke", { targets: "plain" });
    expect(game.p1.power("rainbow")).toBe(1);
    await game.settle();
    expect(game.state("plain").might).toBe(1);
    expect(game.state("qiyana").might).toBe(4);
  });

  test("ruling nuance: an effect that CHOOSES nothing pays no [Deflect] — the Watcher's 'give enemy units -3' hits Qiyana with no surcharge in the pool at all", async () => {
    const game = await scenario()
      .resources(P1, { energy: 7, power: { mind: 1 } }) // exactly the Watcher's cost, no [rainbow]
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", QIYANA, "qiyana")
      .unit(P2, "bf1", { might: 4, name: "Plain" }, "plain")
      .hand(P1, THOUSAND_TAILED_WATCHER, "watcher")
      .build();
    await game.p1.play("watcher");
    await game.settle();
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(game.state("qiyana").might).toBe(1);
    expect(game.state("plain").might).toBe(1);
  });
});
