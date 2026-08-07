/**
 * Ruling 484f90cc042976bc — Lilting Lullaby (UNL-190 → unl-190-219) · Spell · Calm/Mind · 2+[R][R] · Reaction
 *   "Counter a spell. Its controller can't play spells this turn."
 *   × Hextech Ray (ogn-009-298, 1+[fury], Action) "Deal 3 to a unit at a battlefield."
 *   × Wind Wall (ogn-064-298, 3+[calm][calm], Reaction) "Counter a spell."
 *
 * Q: Opponent Lullabies my spell; in response I counter my OWN spell. Can I still play spells?
 * A: Yes. My counter clears my spell from the chain (425.1.a); Lullaby's target is gone when it
 *    resolves — a mistarget (355.9.a.2, 359.3.e.2/e.9) — so "Counter a spell" does not execute
 *    (359.3.e.7), and the linked "its controller can't play spells" is ignored too (359.3.e.14.a).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const LILTING_LULLABY = "unl-190-219";
const HEXTECH_RAY = "ogn-009-298";
const WIND_WALL = "ogn-064-298";

/**
 * P1's turn: 5 energy, 2 fury, 2 calm — Ray (1+fury) + Wind Wall (3+calm+calm) leaves exactly 1+fury for a
 * second Ray. P2 holds Lullaby with exactly 2 + 2 rainbow. P2's 5-Might foe at bf1 is the Ray target.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 2, fury: 2 } })
    .resources(P2, { energy: 2, power: { rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Ray Target" }, "foe")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, HEXTECH_RAY, "ray2")
    .hand(P1, WIND_WALL, "windwall")
    .hand(P2, LILTING_LULLABY, "lullaby");
}

/** P1 Ray → foe; P2 responds with Lullaby on Ray. Returns with priority back on P1. */
async function rayThenLullaby(game: Game): Promise<void> {
  await game.p1.cast("ray", { targets: "foe" });
  await game.p1.passPriority();
  expect(game.p2.can("cast", "lullaby")).toBe(true);
  await game.p2.cast("lullaby", { targets: "ray" });
  expect(game.chain().map((c) => c.cardId)).toEqual(["ray", "lullaby"]);
  expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
  if (game.actingSeat() === P2) {
    await game.p2.passPriority();
  }
  expect(game.actingSeat()).toBe(P1);
}

/** Pass priority until the chain shrinks by one. */
async function resolveTop(game: Game): Promise<void> {
  const before = game.chain().length;
  for (let i = 0; i < 4 && game.chain().length >= before; i++) {
    const d = game.decision();
    expect(d?.kind).toBe("action");
    await game.seat(d!.seat).pass();
  }
}

describe("Ruling 484f90cc042976bc — countering your own spell out from under Lilting Lullaby", () => {
  test("P1 may target their OWN Ray with Wind Wall in response; chain = [Ray, Lullaby, Wind Wall]", async () => {
    const game = await board().build();
    await rayThenLullaby(game);
    const targets = game.p1.option("cast", "windwall")?.fields.find((f) => f.arg === "targets")?.options ?? [];
    expect(targets).toEqual(expect.arrayContaining([["ray"], ["lullaby"]])); // "a spell" — either one on the chain
    await game.p1.cast("windwall", { targets: "ray" });
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "ray", controller: P1 }),
      expect.objectContaining({ cardId: "lullaby", controller: P2 }),
      expect.objectContaining({ cardId: "windwall", controller: P1 }),
    ]);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { calm: 0, fury: 1 } });
  });

  test("Wind Wall resolves first and clears Ray from the chain (425.1.a) — Ray goes to the trash having dealt nothing; only Lullaby remains", async () => {
    const game = await board().build();
    await rayThenLullaby(game);
    await game.p1.cast("windwall", { targets: "ray" });
    await resolveTop(game);
    expect(game.zoneOf("windwall")).toBe("trash");
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.state("foe").damage).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["lullaby"]);
  });

  test("Lullaby then resolves with no legal target: nothing is countered, and P1 CAN still play spells this turn (casts a second Ray for 3 damage)", async () => {
    const game = await board().build();
    await rayThenLullaby(game);
    await game.p1.cast("windwall", { targets: "ray" });
    await game.settle();
    expect(game.zoneOf("lullaby")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // The linked restriction was ignored → a spell is a legal play for P1.
    expect(game.p1.can("cast", "ray2")).toBe(true);
    await game.p1.cast("ray2", { targets: "foe" });
    await game.settle();
    expect(game.zoneOf("ray2")).toBe("trash");
    expect(game.state("foe").damage).toBe(3);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0, fury: 0 } });
  });

  test("contrast: if P1 does NOT respond, Lullaby counters Ray — no damage, Ray in trash, costs not refunded (425.1.c)", async () => {
    const game = await board().build();
    await rayThenLullaby(game);
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.zoneOf("lullaby")).toBe("trash");
    expect(game.state("foe").damage).toBe(0);
    expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 2, fury: 1 } });
  });

  // Expected: with Ray actually countered, the linked "Its controller can't play spells this turn" applies
  // to P1 — a second Ray is not a legal play for the rest of the turn (but is again next turn).
  // Actual: Lullaby is parsed as a bare "counter"; the play restriction is never imposed, so P1 can cast.
  test("ruling 484f90cc042976bc (contrast) — after Lullaby counters Ray, P1 can't play spells this turn; engine still allows it", async () => {
    const game = await board().build();
    await rayThenLullaby(game);
    await game.settle();
    expect(game.zoneOf("ray")).toBe("trash");
    expect(game.p1.energy()).toBe(4); // plenty for a 1+[fury] Ray
    expect(game.p1.can("cast", "ray2")).toBe(false);
    const r = await game.p1.try((p) => p.cast("ray2", { targets: "foe" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("ray2")).toBe("hand");
  });
});
