/**
 * Ruling da16d72b9e2d2d4d — Void Seeker (OGN-024 → ogn-024-298) · Action [3][fury] "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Acceptable Losses (OGN-179 → ogn-179-298) · Action [1] "Each player kills one of their gear."
 *
 * Q: Can you cast spells without a valid target (Void Seeker; Acceptable Losses)?
 * A: A spell that TARGETS needs a legal target to be put on the chain — no unit at a battlefield, no Void Seeker (not even for the
 *    draw). A spell that targets nothing (Acceptable Losses) can be played with no gear anywhere; it just does nothing.
 * Rules: 355.5 / 355.8 (a targeting spell needs legal choices to be played), 359.3.e.6 (impossible instruction ignored).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const ACCEPTABLE_LOSSES = "ogn-179-298";

describe("Ruling da16d72b9e2d2d4d — targeting spells need a target to be cast; non-targeting spells don't", () => {
  test("Void Seeker with NO unit at any battlefield (units only in bases): not castable at all — it stays in hand, nothing is paid, no card drawn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 2, name: "Homebody" }, "homebody")
      .unit(P2, "base", { might: 2, name: "Recluse" }, "recluse")
      .hand(P1, VOID_SEEKER, "seeker")
      .build();
    expect(game.p1.can("cast", "seeker")).toBe(false);
    const hand = game.p1.hand().length;
    const r = await game.p1.try((p) => p.cast("seeker", { targets: "recluse" })); // a unit in a BASE is not "at a battlefield"
    expect(r.ok).toBe(false);
    expect(game.zoneOf("seeker")).toBe("hand");
    expect(game.chain()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.p1.hand()).toHaveLength(hand); // no "Draw 1" without casting
  });

  test("control: with a unit at a battlefield Void Seeker is castable, deals 4 and draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Sentry" }, "sentry")
      .hand(P1, VOID_SEEKER, "seeker")
      .build();
    expect(game.p1.can("cast", "seeker")).toBe(true);
    const hand = game.p1.hand().length;
    await game.p1.cast("seeker", { targets: "sentry" });
    await game.settle();
    expect(game.state("sentry").damage).toBe(4);
    expect(game.p1.hand()).toHaveLength(hand - 1 + 1);
  });

  test("Acceptable Losses with NO gear in play for either player: castable (it targets nothing), goes on the chain, resolves doing nothing and goes to the trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: null })
      .unit(P2, "base", { might: 2, name: "Recluse" }, "recluse")
      .hand(P1, ACCEPTABLE_LOSSES, "losses")
      .build();
    expect(game.p1.gear()).toEqual([]);
    expect(game.p2.gear()).toEqual([]);
    expect(game.p1.can("cast", "losses")).toBe(true);
    await game.p1.cast("losses", { targets: [] });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "losses", controller: P1 })]);
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("losses")).toBe("trash");
    expect(game.zoneOf("recluse")).toBe("base");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
