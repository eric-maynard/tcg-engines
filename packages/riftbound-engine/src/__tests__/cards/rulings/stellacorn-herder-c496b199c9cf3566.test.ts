/**
 * Ruling c496b199c9cf3566 — Stellacorn Herder (SFD-048 → sfd-048-221) · Unit · [4] · 3 Might
 *   "When I move, draw 1."
 *   × Possession (OGN-203 → ogn-203-298) · "…Take control of it and recall it. (Send it to your base.
 *     This isn't a move.)" — the recall used to send the Herder home.
 *
 * Q: If the Herder is bounced back to base rather than moving, do I draw?
 * A: No. A recall is not a move. "When I move" only fires on the move game action, so a recall to base — the
 *    parenthetical says so outright — triggers nothing.
 * Rules: 420 (Move is its own game action), 450 (Recall, "this isn't a move"), 411.4 (trigger conditions).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const HERDER = "sfd-048-221";
const POSSESSION = "ogn-203-298";

describe("Ruling c496b199c9cf3566 — a recall is not a move, so the Herder does not draw", () => {
  test("an ordinary move to a battlefield DOES draw 1", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", HERDER, "herder")
      .build();
    const before = game.p1.hand().length;
    await game.p1.move("herder", "bf1");
    await game.settle();
    expect(game.locationOf("herder")).toBe("bf1");
    expect(game.p1.hand().length).toBe(before + 1);
  });

  test("being recalled to base draws nothing — for either player", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", HERDER, "herder")
      .hand(P1, POSSESSION, "possession")
      .build();
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    await game.p1.cast("possession", { targets: "herder" });
    await game.settle();
    expect(game.locationOf("herder")).toBe("base");
    expect(game.state("herder").controller).toBe(P1); // it did change location and controller…
    expect(game.p1.hand().length).toBe(p1Hand - 1); // …only Possession left P1's hand
    expect(game.p2.hand().length).toBe(p2Hand); // and the owner drew nothing either
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the trigger is not spent — the same Herder moving after the recall still draws", async () => {
    const game = await scenario()
      .resources(P1, { energy: 8, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: null })
      .unit(P2, "bf1", HERDER, "herder")
      .unit(P2, "bf1", { might: 2, name: "Keeper" }, "keeper")
      .hand(P1, POSSESSION, "possession")
      .build();
    await game.p1.cast("possession", { targets: "herder" });
    await game.settle();
    const afterRecall = game.p1.hand().length;
    await game.p1.move("herder", "bf2");
    await game.settle();
    expect(game.locationOf("herder")).toBe("bf2");
    expect(game.p1.hand().length).toBe(afterRecall + 1);
  });
});
