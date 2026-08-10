/**
 * Ruling 9df252733c644227 — Imperial Decree (OGN-221 → ogn-221-298) · Action [5][order][order]
 *   "When any unit takes damage this turn, kill it."
 *   × Frozen Fortress (UNL-212 → unl-212-219) · Battlefield · "At the start of each player's Beginning Phase, deal 1 to each
 *     unit here. (This happens before scoring.)"
 *
 * Q: If I play Imperial Decree on my turn while enemy units sit at Frozen Fortress, do they die?
 * A: No. The Fortress dealt its 1 at the start of the Beginning Phase, before the Main Phase; Decree only triggers on damage
 *    taken AFTER it resolves and does not look back. (Only if Decree were still active at a later Beginning Phase would the
 *    Fortress ping make it trigger.)
 * Rules: 315.2.a.1 (start-of-Beginning-Phase triggers), 383 (triggered abilities watch events from when they exist),
 *        Decree's "this turn" duration (317.2 expiration).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const FROZEN_FORTRESS = "unl-212-219";
const HEXTECH_RAY = "ogn-009-298";

/**
 * P2's turn is about to end. The Fortress is P2's with two 3-Might P2 units on it. P1 holds Imperial Decree + Hextech Ray
 * and a unit on bf2; P1's [6] + 2 order + 1 fury are added once P1's turn has started (pools empty at end of turn).
 */
function board() {
  return scenario()
    .active(P2)
    .battlefield("fortress", { controller: P2, def: FROZEN_FORTRESS, inert: false })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "fortress", { might: 3, name: "Guard A" }, "guardA")
    .unit(P2, "fortress", { might: 3, name: "Guard B" }, "guardB")
    .unit(P1, "bf2", { might: 2, name: "Holder" }, "holder")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .hand(P1, HEXTECH_RAY, "ray");
}

/** P2 ends → P1's Beginning Phase (Fortress pings both Guards) → P1's open Main Phase. */
async function intoP1Main(): Promise<Game> {
  const game = await board().build();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.phase()).toBe("main");
  await game.p1.do("addResources", { energy: 6, power: { fury: 1, order: 2 } });
  return game;
}

describe("Ruling 9df252733c644227 — Imperial Decree does not look back at Frozen Fortress's Beginning-Phase damage", () => {
  test("at the start of P1's Beginning Phase the Fortress deals 1 to each Guard — they enter P1's Main Phase alive with 1 damage", async () => {
    const game = await intoP1Main();
    expect(game.state("guardA")).toMatchObject({ damage: 1, zone: "battlefield-fortress" });
    expect(game.state("guardB")).toMatchObject({ damage: 1, zone: "battlefield-fortress" });
  });

  test("ruling: P1 then plays Imperial Decree; it resolves and the already-damaged Guards do NOT die (no retroactive trigger, nothing on the chain)", async () => {
    const game = await intoP1Main();
    await game.p1.cast("decree");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 1, order: 0 } });
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("guardA")).toMatchObject({ damage: 1, zone: "battlefield-fortress" });
    expect(game.state("guardB")).toMatchObject({ damage: 1, zone: "battlefield-fortress" });
    expect(game.p2.trash()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast: damage taken AFTER Decree resolved does trigger it — Hextech Ray into Guard B kills it; Guard A (only the old Fortress damage) stays", async () => {
    const game = await intoP1Main();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.cast("ray", { targets: "guardB" });
    await game.settle();
    expect(game.zoneOf("guardB")).toBe("trash");
    expect(game.state("guardA")).toMatchObject({ damage: 1, zone: "battlefield-fortress" });
  });

  test("contrast with a survivor: after Decree, 3 fresh damage to a 5-Might unit is not lethal by itself but Decree kills it", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 1, order: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Big Guard" }, "big", { damage: 1 })
      .hand(P1, IMPERIAL_DECREE, "decree")
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.state("big")).toMatchObject({ damage: 1, zone: "battlefield-bf1" }); // pre-existing damage: ignored
    await game.p1.cast("ray", { targets: "big" });
    await game.settle();
    expect(game.zoneOf("big")).toBe("trash"); // 1 + 3 = 4 < 5, yet dead: Decree's trigger
  });

  test("Decree lasts 'this turn' only: at P2's next Beginning Phase it is no longer active, so the Fortress ping (1 more damage each) kills nobody", async () => {
    const game = await intoP1Main();
    await game.p1.cast("decree");
    await game.settle();
    await game.advanceTurn(); // → P2's turn; Fortress pings again at the start of P2's Beginning Phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("guardA")).toBe("battlefield-fortress");
    expect(game.zoneOf("guardB")).toBe("battlefield-fortress");
    expect(game.state("guardA").damage).toBe(1); // healed at end of P1's turn, then 1 fresh from the Fortress
  });
});
