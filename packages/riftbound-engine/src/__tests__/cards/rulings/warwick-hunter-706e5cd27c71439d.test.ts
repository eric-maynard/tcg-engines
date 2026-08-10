/**
 * Ruling 706e5cd27c71439d — Warwick, Hunter (OGN-159 → ogn-159-298) · 6+[body] · 5 Might "I enter ready. When I attack,
 *   kill all damaged enemy units here." × Flurry of Blades (OGN-133 → ogn-133-298) · Reaction · 1 "Deal 1 to all units at battlefields."
 *
 * Q: When does damage heal? If Warwick is played to base, then Flurry of Blades is cast, then Warwick attacks a
 *    battlefield — do all enemy units there die?
 * A: Yes. Damage is only healed after combat / at end of turn, so Flurry's 1 damage is still marked when Warwick's
 *    "when I attack" trigger resolves — every damaged enemy unit there is killed. Flurry can also be cast in
 *    reaction to the attack trigger for the same result.
 * Rules: 142 (damage stays marked), 443.4 / 317.2 (heal after combat / in Expiration), 807-style attack trigger timing.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK = "ogn-159-298";
const FLURRY_OF_BLADES = "ogn-133-298";

/** P1's turn: 7 energy + [body]. P2 holds bf1 with two undamaged units (3 and 4 Might). */
function board() {
  return scenario()
    .resources(P1, { energy: 7, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Enemy One" }, "e1")
    .unit(P2, "bf1", { might: 4, name: "Enemy Two" }, "e2")
    .hand(P1, WARWICK, "ww")
    .hand(P1, FLURRY_OF_BLADES, "flurry");
}

const ids = (game: Game) => game.chain().map((c) => `${c.cardId}${c.triggered ? "*" : ""}`);

async function playWarwickToBase(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("ww", { to: "base" });
  await game.settle();
  expect(game.zoneOf("ww")).toBe("base");
  expect(game.state("ww").isReady).toBe(true); // "I enter ready."
  expect(game.p1.energy()).toBe(1);
  return game;
}

describe("Ruling 706e5cd27c71439d — Flurry damage persists until Warwick's attack trigger kills the damaged units", () => {
  test("play Warwick → cast Flurry (1 to all units at battlefields) → the damage STAYS marked in the open main phase (no heal between)", async () => {
    const game = await playWarwickToBase();
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.zoneOf("flurry")).toBe("trash");
    expect(game.state("e1").damage).toBe(1);
    expect(game.state("e2").damage).toBe(1);
    expect(game.state("ww").damage).toBe(0); // Warwick is in base, not at a battlefield
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // Still marked — damage heals only after combat / at end of turn.
    expect(game.state("e1").damage).toBe(1);
    expect(game.state("e2").damage).toBe(1);
  });

  test("… then Warwick attacks bf1: 'When I attack' resolves and kills ALL (both) damaged enemy units there; Warwick conquers", async () => {
    const game = await playWarwickToBase();
    await game.p1.cast("flurry");
    await game.settle();
    await game.p1.move("ww", "bf1");
    expect(ids(game)).toEqual(["ww*"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger resolves
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");
    await game.settle();
    expect(game.zoneOf("ww")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });

  test("variant: Flurry cast IN REACTION to Warwick's attack trigger resolves first (LIFO), so the trigger then finds both enemies damaged and kills them", async () => {
    const game = await playWarwickToBase();
    await game.p1.move("ww", "bf1");
    expect(ids(game)).toEqual(["ww*"]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.cast("flurry");
    expect(ids(game)).toEqual(["ww*", "flurry"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flurry
    expect(game.state("e1").damage).toBe(1);
    expect(game.state("e2").damage).toBe(1);
    expect(ids(game)).toEqual(["ww*"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Warwick's trigger
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.zoneOf("e2")).toBe("trash");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("contrast (heal timing): if the turn ends instead, the Flurry damage is healed — the units are undamaged on P2's turn", async () => {
    const game = await playWarwickToBase();
    await game.p1.cast("flurry");
    await game.settle();
    expect(game.state("e1").damage).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("e1").damage).toBe(0);
    expect(game.state("e2").damage).toBe(0);
  });
});
