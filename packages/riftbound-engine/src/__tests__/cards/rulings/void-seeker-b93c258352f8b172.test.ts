/**
 * Ruling b93c258352f8b172 — Void Seeker (OGN-024 → ogn-024-298) · Action [3][fury]
 *   "Deal 4 to a unit at a battlefield. Draw 1."
 *   × Yasuo, Remorseful (OGN-076 → ogn-076-298) · 6 Might · "When I attack, deal damage equal to my Might
 *     to an enemy unit here." (an "initial chain" of attack triggers)
 *
 * Q: In a showdown, after the attacker plays an Action spell and that chain resolves, does the attacker keep
 *    Focus to play another Action spell, or does Focus pass automatically?
 * A: Focus passes automatically to the next player when a chain resolves during a showdown. The one
 *    exception is the INITIAL chain (the "when I attack"/"when I defend" triggers): after that resolves, the
 *    player with Focus simply carries on.
 * Rules: 345/346 (Focus in a showdown), 347 (Focus passes when the chain empties), the initial-chain
 *        exception for attack/defend triggers.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const VOID_SEEKER = "ogn-024-298";
const YASUO_REMORSEFUL = "ogn-076-298";

/** P1's turn: a plain 4-Might Raider attacks P2's 9-Might Wall at bf1; two Void Seekers and [6][fury][fury] in hand. */
function plainBoard() {
  return scenario()
    .resources(P1, { energy: 6, power: { fury: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", { might: 4, name: "Raider" }, "raider")
    .hand(P1, VOID_SEEKER, "vs1")
    .hand(P1, VOID_SEEKER, "vs2");
}

async function attackAndCast(): Promise<Game> {
  const game = await plainBoard().build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("vs1", { targets: "wall" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // the chain resolves
  return game;
}

describe("Ruling b93c258352f8b172 — after a showdown chain resolves, Focus passes automatically", () => {
  test("setup: the attacker holds Focus at the start of the showdown and may cast an Action spell", async () => {
    const game = await plainBoard().build();
    await game.p1.move("raider", "bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.p1.can("cast", "vs1")).toBe(true);
  });

  test("ruling: once Void Seeker has resolved, Focus is with the DEFENDER — the attacker does not keep it", async () => {
    const game = await attackAndCast();
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(4);
    expect(game.actingSeat()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
  });

  test("ruling: the attacker cannot chain a second Action spell — it must wait for Focus to come back", async () => {
    const game = await attackAndCast();
    expect(game.p1.can("cast", "vs2")).toBe(false);
    expect((await game.p1.try((p) => p.cast("vs2", { targets: "wall" }))).ok).toBe(false);
    expect(game.zoneOf("vs2")).toBe("hand");
  });

  test("ruling: Focus does come back — after P2 passes Focus, P1 may cast the second Void Seeker", async () => {
    const game = await attackAndCast();
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "vs2")).toBe(true);
    await game.p1.cast("vs2", { targets: "wall" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash"); // 4 + 4 … and then combat
    expect(game.violations()).toEqual([]);
  });

  test("ruling (the exception): after the INITIAL chain of attack triggers resolves, the attacker keeps Focus", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
      .unit(P1, "base", YASUO_REMORSEFUL, "yasuo")
      .hand(P1, VOID_SEEKER, "vs1")
      .build();
    await game.p1.move("yasuo", "bf1");
    expect(game.chain()).toContainEqual(expect.objectContaining({ cardId: "yasuo", triggered: true }));
    await game.p1.passPriority();
    await game.p2.passPriority(); // the initial chain resolves
    expect(game.chain()).toEqual([]);
    expect(game.state("wall").damage).toBe(6);
    expect(game.actingSeat()).toBe(P1); // Focus did NOT pass — this was the initial chain
    expect(game.p1.can("cast", "vs1")).toBe(true);
  });
});
