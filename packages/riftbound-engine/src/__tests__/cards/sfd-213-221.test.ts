/**
 * Ornn's Forge — sfd-213-221 · Battlefield
 *
 *   While you control this battlefield, the first friendly non-token gear played each turn costs [1] less.
 *
 * Rules: 190.6.d ("you" = the battlefield's controller; uncontrolled → nobody), 363 (passive ability,
 * live only while its condition holds), 356.6 (cost reductions lower the Energy cost, never below 0),
 * 137 (Equipment is a kind of gear), 185.2.a (tokens are played but are not "non-token"), 469.1 (control
 * gained by conquering mid-turn turns the passive on from that point).
 *
 * Head-judge notes — the tricky spots for this card:
 *   1. Once per turn and only the FIRST friendly non-token gear: gear #2 and #3 the same turn pay full;
 *      a free (0-cost) gear played first still uses the slot up; the slot refreshes next turn.
 *   2. A Gold TOKEN gear entering first (Treasure Hunter moving) must NOT consume the discount.
 *   3. Equipment is gear: a 1-cost Serrated Dirk becomes free (reduction to exactly 0, playable at 0 energy).
 *   4. Control gates everything: enemy-controlled or uncontrolled Forge → full price; the opponent's gear
 *      is never "friendly" to a P1-held Forge; conquering the Forge mid-turn switches it on, but a gear
 *      already played that turn means the next one is no longer "the first gear played this turn".
 *   5. Units and spells are not gear.
 *   Partners: The Syren ogn-184-298 (gear, 2), Orb of Regret ogn-090-298 (gear, 1), Serrated Dirk
 *   sfd-009-221 (equipment, 1), Treasure Hunter sfd-130-221, plus an inline 0-cost vanilla gear.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-213-221";
const THE_SYREN = "ogn-184-298"; // gear · 2
const ORB_OF_REGRET = "ogn-090-298"; // gear · 1
/** Inline vanilla 0-cost gear (the printed 0-cost Seals all carry a power pip). */
const TRINKET = { abilities: [], cardType: "gear", energyCost: 0, name: "Trinket" };
const SERRATED_DIRK = "sfd-009-221"; // equipment · 1
const TREASURE_HUNTER = "sfd-130-221"; // unit · "When I move, play a Gold gear token exhausted."

/** P1's turn, 5 energy; P1 controls the Forge (live text) via Holder; Syren, Orb and Dirk in hand. */
function board(controller: typeof P1 | typeof P2 | null = P1) {
  const s = scenario().resources(P1, { energy: 5 }).battlefield("forge", { controller, def: CARD, inert: false });
  if (controller !== null) {
    s.unit(controller, "forge", { might: 2, name: "Holder" }, "holder");
  }
  return s.hand(P1, THE_SYREN, "syren").hand(P1, ORB_OF_REGRET, "orb").hand(P1, SERRATED_DIRK, "dirk");
}

describe("Ornn's Forge (sfd-213-221)", () => {
  test("registry payload: a control-gated static cost reduction of 1 energy on friendly gear, restricted to first-of-turn + non-token", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Ornn's Forge" });
    const abilities = (def?.abilities ?? []) as { type: string; condition?: { type: string }; effect?: Record<string, unknown> }[];
    expect(abilities).toHaveLength(1);
    const [a] = abilities;
    expect(a?.type).toBe("static");
    expect(a?.condition?.type).toMatch(/control-battlefield/);
    expect(a?.effect).toMatchObject({ target: { controller: "friendly", type: "gear" }, type: "cost-reduction" });
    expect(a?.effect?.restrictions).toEqual(expect.arrayContaining([{ type: "first-of-turn" }, { type: "non-token" }]));
    expect(JSON.stringify(a?.effect?.reduction ?? a?.effect?.by ?? a?.effect?.amount)).toMatch(/^1$|energy_1|"energy":1/);
  });

  test.failing("BUG: while P1 controls the Forge, P1's first gear this turn (The Syren, 2) costs 1", async () => {
    // Expected: 5 → 4 energy and the Syren is in P1's base. Actual: full price, 5 → 3.
    const game = await board().build();
    await game.p1.play("syren");
    await game.settle();
    expect(game.p1.gear()).toContain("syren");
    expect(game.p1.energy()).toBe(4);
  });

  test.failing("BUG: only the FIRST gear each turn — Syren 2→1, then Orb pays its full 1, then Dirk its full 1 (5 → 4 → 3 → 2)", async () => {
    // Expected energy trail 4, 3, 2. Actual: 3, 2, 1 (no discount at all).
    const game = await board().build();
    await game.p1.play("syren");
    await game.settle();
    expect(game.p1.energy()).toBe(4);
    await game.p1.play("orb");
    await game.settle();
    expect(game.p1.energy()).toBe(3);
    await game.p1.play("dirk");
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.p1.gear().sort()).toEqual(["dirk", "orb", "syren"]);
  });

  test.failing("BUG: Equipment is gear and the reduction reaches exactly 0 — a 1-cost Serrated Dirk is playable with 0 energy (356.6)", async () => {
    // Expected: `play dirk` is legal at 0 energy and leaves the pool at 0. Actual: not legal.
    const game = await board().resources(P1, { energy: 0 }).build();
    expect(game.p1.can("play", "dirk")).toBe(true);
    await game.p1.play("dirk");
    await game.settle();
    expect(game.zoneOf("dirk")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
  });

  test.failing("BUG: 'each turn' — the slot refreshes: Syren discounted this turn, Orb (1) is free on P1's next turn", async () => {
    // Expected: turn 2 Syren costs 1 (5→4); on turn 4 with a fresh pool of 0 + nothing tapped, Orb is playable for 0.
    // Actual: no discount on either turn.
    const game = await board().build();
    await game.p1.play("syren");
    await game.settle();
    expect(game.p1.energy()).toBe(4);
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    expect(game.p1.energy()).toBe(0); // pools emptied at end of turn
    expect(game.p1.can("play", "orb")).toBe(true);
    await game.p1.play("orb");
    await game.settle();
    expect(game.p1.gear().sort()).toEqual(["orb", "syren"]);
    expect(game.p1.energy()).toBe(0);
  });

  test.failing("BUG: a Gold gear TOKEN entering first does not use the slot — after Treasure Hunter's token, the Syren still costs 1 (185.2.a)", async () => {
    // Expected: Gold token in base, then Syren for 1 (5 → 4). Actual: Syren full price (3 left).
    const game = await board().battlefield("bf2", { controller: null }).unit(P1, "base", TREASURE_HUNTER, "hunter").build();
    await game.p1.move("hunter", "bf2");
    await game.settle();
    expect(game.p1.gear().map((g) => game.state(g).name)).toEqual(["Gold"]);
    await game.p1.play("syren");
    await game.settle();
    expect(game.p1.gear()).toContain("syren");
    expect(game.p1.energy()).toBe(4);
  });

  test("a free gear still occupies the slot: a 0-cost trinket first, then the Syren pays its full 2", async () => {
    const game = await board().hand(P1, TRINKET, "trinket").build();
    await game.p1.play("trinket");
    await game.settle();
    expect(game.p1.energy()).toBe(5); // 0 − 1 floors at 0, never refunds
    await game.p1.play("syren");
    await game.settle();
    expect(game.p1.energy()).toBe(3);
  });

  test("negative: P2 controls the Forge → P1's gear is not 'friendly' to it and pays full (5 → 3)", async () => {
    const game = await board(P2).build();
    await game.p1.play("syren");
    await game.settle();
    expect(game.p1.gear()).toContain("syren");
    expect(game.p1.energy()).toBe(3);
  });

  test("negative: an uncontrolled Forge has no 'you' (190.6.d) — full price", async () => {
    const game = await board(null).build();
    expect(game.gameState.battlefields.forge?.controller ?? null).toBeNull();
    await game.p1.play("syren");
    await game.settle();
    expect(game.p1.energy()).toBe(3);
  });

  test("negative: the opponent's gear on their own turn gets nothing from a P1-held Forge", async () => {
    const game = await board().active(P2).resources(P2, { energy: 2 }).hand(P2, THE_SYREN, "theirSyren").build();
    await game.p2.play("theirSyren");
    await game.settle();
    expect(game.p2.gear()).toContain("theirSyren");
    expect(game.p2.energy()).toBe(0);
  });

  test("negative: units and spells are not gear — a 2-cost unit pays 2 while P1 controls the Forge", async () => {
    const game = await board().hand(P1, { cardType: "unit", energyCost: 2, might: 2, name: "Apprentice" }, "apprentice").build();
    await game.p1.play("apprentice", { to: "base" });
    await game.settle();
    expect(game.zoneOf("apprentice")).toBe("base");
    expect(game.p1.energy()).toBe(3);
  });

  test.failing("BUG: conquering the empty Forge mid-turn turns the passive on — the first gear afterwards costs 1 less", async () => {
    // Expected: Walker takes the Forge (P1 scores 1), then Syren costs 1 (5 → 4). Actual: full price.
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("forge", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .hand(P1, THE_SYREN, "syren")
      .build();
    await game.p1.move("walker", "forge");
    await game.settle();
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    await game.p1.play("syren");
    await game.settle();
    expect(game.p1.energy()).toBe(4);
  });

  test("a gear played BEFORE taking the Forge was already 'the first gear played this turn' — the next one after conquering pays full", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("forge", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Walker" }, "walker")
      .hand(P1, ORB_OF_REGRET, "orb")
      .hand(P1, THE_SYREN, "syren")
      .build();
    await game.p1.play("orb"); // uncontrolled: full 1 → 4
    await game.settle();
    expect(game.p1.energy()).toBe(4);
    await game.p1.move("walker", "forge");
    await game.settle();
    expect(game.gameState.battlefields.forge?.controller).toBe(P1);
    await game.p1.play("syren"); // second gear of the turn: full 2 → 2
    await game.settle();
    expect(game.p1.energy()).toBe(2);
    expect(game.violations()).toEqual([]);
  });
});
