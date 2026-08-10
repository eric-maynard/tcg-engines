/**
 * Ruling d113fdd62e95c1f1 — Warwick, Hunter (OGN-159 → ogn-159-298) · Unit · Body · 5 Might
 *     "I enter ready. When I attack, kill all damaged enemy units here."
 *   × Cannon Barrage (OGN-127 → ogn-127-298) · Reaction · [2][body] "Deal 2 to all enemy units in combat."
 *   × (opponent's removal: Fight or Flight OGN-168, hidden at the battlefield — "Move a unit from a battlefield to its base.")
 *
 * Q: Warwick attacks and his "When I attack" trigger goes on the chain; the attacker responds with Cannon Barrage; the
 *    opponent then removes Warwick from the battlefield. Does Warwick's effect still resolve?
 * A: It resolves but does nothing: LIFO the removal resolves first (Warwick gone), Cannon Barrage deals its 2 to the enemy
 *    units there, then Warwick's "kill all damaged enemy units HERE" resolves with Warwick no longer there — "here" cannot be
 *    determined, so the effect whiffs; the effect is not independent of the card.
 * Rules: 340.1 (LIFO), 359.3.e (legality/"here" evaluated on resolution; undeterminable ⇒ instruction ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const WARWICK_HUNTER = "ogn-159-298";
const CANNON_BARRAGE = "ogn-127-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * P1's turn: Warwick ready in base, Cannon Barrage in hand with [2][body]. P2 holds bf1 with Wounded (4 Might, 1 damage
 * already marked) and Fresh (3, undamaged), and has Fight or Flight hidden there.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { body: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 4, name: "Wounded" }, "wounded", { damage: 1 })
    .unit(P2, "bf1", { might: 3, name: "Fresh" }, "fresh")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .unit(P1, "base", WARWICK_HUNTER, "ww")
    .hand(P1, CANNON_BARRAGE, "barrage");
}

/** Warwick attacks bf1 (trigger on the chain); P1 responds with Cannon Barrage; P2 responds by flipping Fight or Flight on Warwick. */
async function fullChain(): Promise<Game> {
  const game = await board().build();
  expect(game.state("wounded").damage).toBe(1);
  await game.p1.move("ww", "bf1");
  expect(game.state("ww").combatRole).toBe("attacker");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", controller: P1, triggered: true })]);
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(game.p1.can("cast", "barrage")).toBe(true);
  await game.p1.cast("barrage");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "fof")).toBe(true);
  await game.p2.reveal("fof", { answers: ["ww"] });
  for (let i = 0; i < 3 && game.decision()?.kind === "pick"; i++) {
    await game.acting().pick("ww");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["ww", "barrage", "fof"]);
  return game;
}

/** Both players pass once each → the top item resolves. */
async function resolveTop(game: Game): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action" });
    await game.seat(d!.seat).passPriority();
  }
}

describe("Ruling d113fdd62e95c1f1 — Warwick pulled off the battlefield before his attack trigger resolves: it resolves to no effect", () => {
  test("control: with no responses Warwick's trigger kills the damaged Wounded (Fresh, undamaged, survives)", async () => {
    const game = await board().build();
    await game.p1.move("ww", "bf1");
    await resolveTop(game);
    expect(game.zoneOf("wounded")).toBe("trash");
    expect(game.zoneOf("fresh")).toBe("battlefield-bf1");
  });

  test("the chain builds Warwick trigger → Cannon Barrage → Fight or Flight; Fight or Flight resolves first and moves Warwick to base", async () => {
    const game = await fullChain();
    await resolveTop(game);
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.zoneOf("ww")).toBe("base");
    expect(game.chain().map((c) => c.cardId)).toEqual(["ww", "barrage"]);
  });

  test("Cannon Barrage resolves next: 2 to each enemy unit at that battlefield — Wounded 1 → 3 damage, Fresh 0 → 2 (both now damaged, both alive)", async () => {
    const game = await fullChain();
    await resolveTop(game); // fof
    await resolveTop(game); // barrage
    expect(game.zoneOf("barrage")).toBe("trash");
    expect(game.state("wounded")).toMatchObject({ damage: 3, zone: "battlefield-bf1" });
    expect(game.state("fresh")).toMatchObject({ damage: 2, zone: "battlefield-bf1" });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ww", triggered: true })]);
  });

  test("Warwick's trigger then RESOLVES (leaves the chain, not countered) but kills nothing: he is no longer 'here', so both damaged enemy units survive; P2 keeps bf1 and Warwick sits in base", async () => {
    const game = await fullChain();
    await resolveTop(game); // fof
    await resolveTop(game); // barrage
    await resolveTop(game); // Warwick's trigger
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("wounded")).toBe("battlefield-bf1");
    expect(game.zoneOf("fresh")).toBe("battlefield-bf1");
    expect(game.p2.trash()).toEqual(["fof"]);
    await game.settle();
    expect(game.zoneOf("wounded")).toBe("battlefield-bf1");
    expect(game.zoneOf("fresh")).toBe("battlefield-bf1");
    expect(game.zoneOf("ww")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });
});
