/**
 * Ruling 98574c78c592edc0 — Glorious Executioner (SFD-185 → sfd-185-221) · Legend · Draven
 *     "When you win a combat, draw 1. (You win if only your units remain after combat.)"
 *   × Fight or Flight (OGN-168 → ogn-168-298) · [2] · [Hidden] [Action] "Move a unit from a battlefield to its base."
 *
 * Q: I start a combat against the Draven player; they Fight-or-Flight my attacker away — do they still get the draw
 *    (and must anything be exhausted)?
 * A: Yes, they draw. A combat is won by whoever has the only units left after cleanup, no matter how the other side's
 *    units left (moved by a spell counts). It is a TRIGGERED ability — no exhaust. Contrast: if the Draven player's own
 *    unit is the one moved away, they are no longer in the combat and don't win it.
 * Rules: 466.7 (combat ends; winner = only your units remain), 383 (triggered, on the chain), 463 (unit leaving combat).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GLORIOUS_EXECUTIONER = "sfd-185-221";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/** P1's turn. P2 (Draven legend, exactly [2] + a spare chaos) holds bf1 with Defender (3) and has Fight or Flight in hand. P1's Raider (4) in base. */
function board() {
  return scenario()
    .legend(P2, GLORIOUS_EXECUTIONER, "draven")
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Defender" }, "def")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P2, FIGHT_OR_FLIGHT, "fof");
}

/** Raider attacks bf1; P1 passes Focus; P2 (Focus) casts Fight or Flight on `target`; both pass → it resolves. */
async function combatThenFightOrFlight(target: "raider" | "def"): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.state("raider").combatRole).toBe("attacker");
  expect(game.state("def").combatRole).toBe("defender");
  await game.p1.passFocus();
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  expect(game.p2.can("cast", "fof")).toBe(true);
  await game.p2.cast("fof", { targets: target });
  expect(game.p2.energy()).toBe(0);
  await game.p2.passPriority();
  await game.p1.passPriority();
  expect(game.zoneOf("fof")).toBe("trash");
  return game;
}

describe("Ruling 98574c78c592edc0 — Fight-or-Flighting the attacker away still counts as winning the combat for Glorious Executioner", () => {
  test("Fight or Flight sends the Raider home; the combat isn't over until both pass — then only P2's Defender remains: P2 WINS, and the legend's 'draw 1' goes on the chain WITHOUT exhausting the legend", async () => {
    const game = await combatThenFightOrFlight("raider");
    expect(game.locationOf("raider")).toBe("base");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // combat still open
    for (let i = 0; i < 2; i++) {
      await game.seat(game.decision()!.seat).passFocus();
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "draven", controller: P2, triggered: true })]);
    expect(game.state("draven").isExhausted).toBe(false);
  });

  test("the trigger resolves: P2 draws exactly 1; Defender untouched, bf1 still P2's, Raider alive at home; the legend is still ready", async () => {
    const game = await combatThenFightOrFlight("raider");
    const deck0 = game.p2.deck().length;
    const hand0 = game.p2.hand().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.p2.deck()).toHaveLength(deck0 - 1);
    expect(game.p2.hand()).toHaveLength(hand0 + 1);
    expect(game.state("def")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("raider")).toMatchObject({ damage: 0, zone: "base" });
    expect(game.state("draven").isExhausted).toBe(false);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("contrast — P2 moves its OWN Defender away instead: it leaves the combat, the Raider is the only unit left and conquers; P2 did not win and draws nothing", async () => {
    const game = await combatThenFightOrFlight("def");
    expect(game.locationOf("def")).toBe("base");
    expect(game.state("def").combatRole).toBeFalsy();
    const deck0 = game.p2.deck().length;
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p2.deck()).toHaveLength(deck0);
    expect(game.chain()).toEqual([]);
  });

  test("contrast — no Fight or Flight at all: Raider (4) kills Defender (3) and conquers; P2 loses the combat, no draw", async () => {
    const game = await board().build();
    const deck0 = game.p2.deck().length;
    await game.p1.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.deck()).toHaveLength(deck0);
  });
});
