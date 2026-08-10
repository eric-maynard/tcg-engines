/**
 * Ruling ccd0ab875c1ef251 — Stupefy (OGN-095 → ogn-095-298) · Reaction · [1] — "Give a unit -1 [Might] this turn, to a
 *   minimum of 1 [Might]. Draw 1."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · Action · [1][fury] — "Deal 3 to a unit at a battlefield."
 *
 * Q: Right after I Hextech Ray in a showdown, can I always Stupefy without the opponent responding?
 * A: Not by default. Stupefy is a Reaction so it CAN go on the same chain, but after putting Ray on the chain you are
 *    assumed to pass priority unless you retain it — then the opponent gets the first window. If you retain priority
 *    you may Stupefy immediately; Stupefy resolves first (LIFO), and the opponent still gets to respond before Ray
 *    resolves.
 * Rules: 503.9.b (priority shortcut), Reaction timing, LIFO chain resolution.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const HEXTECH_RAY = "ogn-009-298";
const DISCIPLINE = "ogn-058-298"; // an ordinary Reaction for P2 so "P2 gets a window" is observable

/**
 * P1's turn. P2's Guard (4) holds bf1; P1's Raider (3) attacks from base. P1: Ray + Stupefy with exactly [2][fury].
 * P2: Discipline with [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .resources(P2, { energy: 2 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .unit(P1, "base", { might: 3, name: "Raider" }, "raider")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, STUPEFY, "stupefy")
    .hand(P2, DISCIPLINE, "disc");
}

/** Raider attacks → combat showdown, P1 has Focus; P1 casts Hextech Ray at the Guard. */
async function rayInShowdown(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("raider", "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  await game.p1.cast("ray", { targets: "guard" });
  expect(game.p1.resources()).toEqual({ energy: 1, power: { fury: 0 } });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
  return game;
}

describe("Ruling ccd0ab875c1ef251 — Stupefy right after Hextech Ray only beats the opponent's window if you RETAIN priority", () => {
  test("retaining priority: P1 still holds priority after Ray and Stupefy (a Reaction) is legal on the same chain → chain [Ray, Stupefy]", async () => {
    const game = await rayInShowdown();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 }); // P1 may retain and act
    expect(game.p1.can("cast", "stupefy")).toBe(true);
    await game.p1.cast("stupefy", { targets: "guard" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "stupefy"]);
  });

  test("…Stupefy resolves first (Guard 4 → 3, P1 draws 1) with Ray still on the chain, and P2 THEN gets a window to respond before Ray resolves; finally Ray's 3 kills the 3-Might Guard", async () => {
    const game = await rayInShowdown();
    await game.p1.cast("stupefy", { targets: "guard" });
    const p1Hand = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Stupefy resolves
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("guard").might).toBe(3);
    expect(game.p1.hand()).toHaveLength(p1Hand + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    // The opponent can still respond to Ray now.
    for (let i = 0; i < 2 && game.decision()?.seat !== P2; i++) {
      await game.p1.passPriority();
    }
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true);
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("trash"); // 3 damage ≥ 3 Might
  });

  test("default (P1 passes after Ray): P2 gets the FIRST window — P2 may respond before any Stupefy; if P2 also passes, Ray resolves at once and P1 never got to Stupefy under it (Guard takes 3 at 4 Might and survives)", async () => {
    const game = await rayInShowdown();
    await game.p1.passPriority(); // the tournament shortcut: priority goes to the opponent
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "disc")).toBe(true); // P2's window comes before P1 can Stupefy
    await game.p2.passPriority(); // both passed in succession → Ray resolves
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bf1" });
    expect(game.zoneOf("stupefy")).toBe("hand");
  });
});
