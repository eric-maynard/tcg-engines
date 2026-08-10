/**
 * Ruling 5db3a4ddd8c65c5b — Wraith of Echoes (OGN-118 → ogn-118-298) · Unit · Mind · 6+[mind] · 5 Might
 *   "The first time a friendly unit dies each turn, draw 1."
 *   (+ Void Seeker ogn-024-298 "Deal 4 to a unit at a battlefield. Draw 1." and a big attacker for simultaneous combat deaths.)
 *
 * Q: Does Wraith of Echoes trigger on its own death, or when it dies simultaneously with other friendly units?
 * A: No. Units do not see themselves die: the Wraith never triggers off its own death, even when other friendly units die
 *    at the same time in combat. Only a surviving Wraith draws off other units dying.
 * Rules: 383.4 / 386 (a permanent's non-Deathknell trigger needs it on the board when the event happens), 465.2.d
 *        (combat damage is simultaneous), 808 (contrast: Deathknell is the "when I die" exception).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const WRAITH = "ogn-118-298";
const VOID_SEEKER = "ogn-024-298";

/** P2's turn with two Void Seekers paid. P1: Wraith (5) at `wraithAt`, Pal (1) at bf1. */
function base(wraithAt: "base" | "bf1") {
  return scenario()
    .active(P2)
    .resources(P2, { energy: 6, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, wraithAt, WRAITH, "wraith")
    .unit(P1, "bf1", { might: 1, name: "Pal" }, "pal")
    .hand(P2, VOID_SEEKER, "vs1")
    .hand(P2, VOID_SEEKER, "vs2");
}

describe("Ruling 5db3a4ddd8c65c5b — Wraith of Echoes never sees its own death", () => {
  test("a surviving Wraith DOES trigger: another friendly unit (Pal) dies → P1 draws 1 (first friendly death this turn)", async () => {
    const game = await base("base").build();
    const hand = game.p1.hand().length;
    await game.p2.cast("vs1", { targets: "pal" });
    await game.settle();
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
    expect(game.violations()).toEqual([]);
  });

  test("'first time each turn': a second friendly death the same turn draws nothing more", async () => {
    const game = await base("base").unit(P1, "bf1", { might: 2, name: "Pal 2" }, "pal2").build();
    const hand = game.p1.hand().length;
    await game.p2.cast("vs1", { targets: "pal" });
    await game.settle();
    await game.p2.cast("vs2", { targets: "pal2" });
    await game.settle();
    expect(game.zoneOf("pal2")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand + 1);
  });

  // Expected: a unit does not see itself die — the Wraith's own death triggers nothing. Actual: the trigger scan includes
  // the dying card itself, so the Wraith's "a friendly unit dies" matches its own death: a Wraith item goes on the chain
  // and P1 draws 1.
  test("ruling 5db3a4ddd8c65c5b — Wraith of Echoes triggers off its OWN death (draws 1); it should not", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", WRAITH, "wraith")
      .unit(P2, "base", { might: 8, name: "Brute" }, "brute")
      .build();
    const hand = game.p1.hand().length;
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("wraith")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.chain()).toEqual([]);
  });

  // Same defect in a simultaneous batch: the Wraith (processed first here) sees its own death and P1 draws 1. (When the
  // other unit's death happens to be processed first the engine coincidentally draws nothing — order-dependent.)
  test("ruling 5db3a4ddd8c65c5b — Wraith (5) and Pal (1) die simultaneously to a 12-Might attacker; the dying Wraith should see neither death (no draw), engine draws 1", async () => {
    const game = await base("bf1").unit(P2, "base", { might: 12, name: "Colossus" }, "colossus").build();
    const hand = game.p1.hand().length;
    await game.p2.move("colossus", "bf1");
    await game.settle();
    expect(game.zoneOf("wraith")).toBe("trash");
    expect(game.zoneOf("pal")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
