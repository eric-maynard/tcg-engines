/**
 * Ruling 7afbe8749c487be7 — Cannon Barrage (OGN-127 → ogn-127-298) · Reaction · [2][body] "Deal 2 to all enemy units in combat."
 *   × Grand Strategem (OGN-233 → ogn-233-298) · Action · [6][order]×3 "Give friendly units +5 [Might] this turn."
 *
 * Q: Does Cannon Barrage deal its 2 immediately on resolution or in combat's damage step? Can Viktor answer with Grand Strategem?
 * A: Immediately when it resolves — it is not combat damage and happens before the damage step; survivors then continue the
 *    showdown. Grand Strategem is an ACTION, so it cannot be played in response to Barrage (a Reaction could be).
 *    "In combat" = at the battlefield where a combat showdown is happening.
 * Rules: 309.1.a (closed state → Reactions only), 142 (non-combat damage kills at once), 465 (combat damage step comes later).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const CANNON_BARRAGE = "ogn-127-298";
const GRAND_STRATEGEM = "ogn-233-298";
const DISCIPLINE = "ogn-058-298"; // Reaction · [2] "Give a unit +2 [Might] this turn. Draw 1."

const showdown = (game: Game) => game.gameState.interaction?.showdownStack?.at(-1);

/**
 * P1's turn. P2 (Viktor) holds bf1 with Weak (2) and Tough (5) and has an Idler (2) at its own bf2; P2 has [8] + [order]×3 with
 * Grand Strategem AND Discipline in hand. P1's Bruiser (4) attacks from base; P1 has Cannon Barrage + [2][body].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .resources(P2, { energy: 8, power: { order: 3 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Weak" }, "weak")
    .unit(P2, "bf1", { might: 5, name: "Tough" }, "tough")
    .unit(P2, "bf2", { might: 2, name: "Idler" }, "idler")
    .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser")
    .hand(P1, CANNON_BARRAGE, "barrage")
    .hand(P2, GRAND_STRATEGEM, "gs")
    .hand(P2, DISCIPLINE, "disc");
}

/** Bruiser attacks bf1; with Focus P1 casts Cannon Barrage and passes → P2 has priority with Barrage on the chain. */
async function barrageOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("bruiser", "bf1");
  expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("barrage");
  expect(game.chain().map((c) => c.cardId)).toEqual(["barrage"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 7afbe8749c487be7 — Cannon Barrage hits immediately on resolution; Grand Strategem (Action) can't answer it", () => {
  test("with Barrage on the chain P2 canNOT play Grand Strategem (Action) even though it can afford it — but a Reaction (Discipline) IS legal", async () => {
    const game = await barrageOnChain();
    expect(game.p2.energy()).toBe(8);
    expect(game.p2.can("cast", "gs")).toBe(false);
    const r = await game.p2.try((p) => p.cast("gs"));
    expect(r.ok).toBe(false);
    expect(game.p2.can("cast", "disc")).toBe(true);
  });

  test("Barrage resolves → 2 to each enemy unit IN COMBAT right now: Weak (2) dies on the spot, Tough carries 2; the Idler at bf2 (not in combat) is untouched — and this is before any combat damage (Bruiser unmarked)", async () => {
    const game = await barrageOnChain();
    await game.p2.passPriority(); // resolves
    expect(game.zoneOf("barrage")).toBe("trash");
    expect(game.zoneOf("weak")).toBe("trash");
    expect(game.state("tough")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.state("idler")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.state("bruiser").damage).toBe(0);
    // Combat has not been resolved: the showdown is still open and Focus continues.
    expect(showdown(game)).toMatchObject({ active: true, battlefieldId: "bf1", isCombatShowdown: true });
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
  });

  test("survivors continue to the damage step: everyone passes → combat Bruiser 4 vs Tough 5 (carrying 2): Tough takes 4 more (6 ≥ 5) and dies, Bruiser takes 5 and dies", async () => {
    const game = await barrageOnChain();
    await game.settle();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("tough")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("trash");
    expect(game.zoneOf("idler")).toBe("battlefield-bf2");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Viktor CAN pump with a Reaction before Barrage resolves — Discipline (+2) on Weak first (LIFO) lets it survive the 2", async () => {
    const game = await barrageOnChain();
    await game.p2.cast("disc", { targets: "weak" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["barrage", "disc"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Discipline
    expect(game.state("weak").might).toBe(4);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Barrage
    expect(game.zoneOf("barrage")).toBe("trash");
    expect(game.state("weak")).toMatchObject({ damage: 2, might: 4, zone: "battlefield-bf1" });
    expect(game.state("tough").damage).toBe(2);
  });
});
