/**
 * Ruling 834450bd6852a54e — Flurry of Blades (OGN-133 → ogn-133-298) · Reaction · [1] · "Deal 1 to all units at battlefields."
 *   × Lilting Lullaby (UNL-190 → unl-190-219) · Reaction · [2]+[R][R] · "Counter a spell. Its controller can't play
 *     spells this turn."
 *
 * Q: I play Flurry of Blades, the opponent counters with Lilting Lullaby — can I react with ANOTHER Flurry of Blades?
 * A: Yes: Flurry is a Reaction, playable onto a closed chain. Chain = Flurry#1, Lullaby, Flurry#2. LIFO: Flurry#2
 *    resolves (1 to every unit at a battlefield); Lullaby counters Flurry#1 (no damage from it) and, having resolved,
 *    bars me from playing spells for the rest of the turn. Flurry does not target.
 * Rules: 813.1.c.1 (Reaction on a closed chain), 327/332 (LIFO), 425.1.a (countered spell does nothing → trash).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const FLURRY = "ogn-133-298";
const LULLABY = "unl-190-219";

/**
 * P1's turn. Units at battlefields: P1's Mine (3) at bf1, P2's Theirs (3) at bf2; P2's Homebody (3) in base.
 * P1: three Flurries and [3]. P2: Lullaby with exactly [2] + calm + mind.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .resources(P2, { energy: 2, power: { calm: 1, mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Mine" }, "mine")
    .unit(P2, "bf2", { might: 3, name: "Theirs" }, "theirs")
    .unit(P2, "base", { might: 3, name: "Homebody" }, "home")
    .hand(P1, FLURRY, "f1")
    .hand(P1, FLURRY, "f2")
    .hand(P1, FLURRY, "f3")
    .hand(P2, LULLABY, "lull");
}

const chainIds = (game: Game) => game.chain().map((c) => c.cardId);

/** Flurry#1 → P2 Lullaby on it → priority back with P1. */
async function flurryThenLullaby(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("f1"); // no targets: it hits "all units at battlefields"
  expect(game.p1.energy()).toBe(2);
  await game.p1.passPriority();
  await game.p2.cast("lull", { targets: "f1" });
  expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0, mind: 0 } });
  await game.p2.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
  expect(chainIds(game)).toEqual(["f1", "lull"]);
  return game;
}

describe("Ruling 834450bd6852a54e — a second Flurry of Blades may be played in reaction to Lilting Lullaby", () => {
  test("Flurry of Blades names no targets when cast (it does not target)", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "f1")?.fields ?? [];
    expect(fields.some((f) => f.name === "targets" && f.required)).toBe(false);
  });

  test("with Flurry#1 and Lullaby on the chain, Flurry#2 (Reaction) is legal for P1 and goes on top: chain = Flurry#1, Lullaby, Flurry#2", async () => {
    const game = await flurryThenLullaby();
    expect(game.p1.can("cast", "f2")).toBe(true);
    await game.p1.cast("f2");
    expect(game.p1.energy()).toBe(1);
    expect(chainIds(game)).toEqual(["f1", "lull", "f2"]);
    expect(game.chain().map((c) => c.controller)).toEqual([P1, P2, P1]);
  });

  test("LIFO resolution: Flurry#2 deals 1 to every unit at a battlefield (not to the base); Lullaby then counters Flurry#1 (trash, no second point of damage)", async () => {
    const game = await flurryThenLullaby();
    await game.p1.cast("f2");
    await game.p1.passPriority();
    await game.p2.passPriority(); // Flurry#2 resolves
    expect(game.zoneOf("f2")).toBe("trash");
    expect(game.state("mine").damage).toBe(1);
    expect(game.state("theirs").damage).toBe(1);
    expect(game.state("home").damage).toBe(0);
    expect(chainIds(game)).toEqual(["f1", "lull"]);
    await game.settle(); // Lullaby resolves, countering Flurry#1
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("lull")).toBe("trash");
    expect(game.zoneOf("f1")).toBe("trash");
    expect(game.state("mine").damage).toBe(1); // still 1 — the countered Flurry dealt nothing
    expect(game.state("theirs").damage).toBe(1);
    expect(game.p1.energy()).toBe(1); // nothing refunded for the countered spell
    expect(game.violations()).toEqual([]);
  });

  test("…and because Lullaby DID resolve, P1 can't play spells for the rest of the turn: Flurry#3 is not legal even with energy left", async () => {
    const game = await flurryThenLullaby();
    await game.p1.cast("f2");
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.energy()).toBe(1);
    expect(game.p1.can("cast", "f3")).toBe(false);
    const r = await game.p1.try((p) => p.cast("f3"));
    expect(r.ok).toBe(false);
  });
});
