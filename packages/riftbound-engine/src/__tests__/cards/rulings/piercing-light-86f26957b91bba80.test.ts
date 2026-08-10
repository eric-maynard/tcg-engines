/**
 * Ruling 86f26957b91bba80 — Piercing Light (SFD-023 → sfd-023-221) · Fury · 2 + [fury] · [Repeat]
 *     "Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit."
 *   × Hidden Blade (OGN-213 → ogn-213-298) · [Hidden][Action] "Kill a unit at a battlefield. Its controller draws 2."
 *
 * Q: Opponent Piercing Lights my unit at a battlefield and my unit in base; I flip my hidden Hidden Blade and kill
 *    my own battlefield unit. Does the base unit still take the 2?
 * A: Yes. "then" is timing, not a condition. Hidden Blade resolves first and kills the first target; Piercing
 *    Light then does as much as it can — the second, still-legal target (locked at play time) takes 2.
 * Rules: 359.3.e.5/.6 (only the instruction on the illegal target is skipped), 355.15 (targets locked), 337 (LIFO).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const PIERCING_LIGHT = "sfd-023-221";
const HIDDEN_BLADE = "ogn-213-298";

/** Turn 3, P1 active with 2 + [fury]. P2: Front (3) at P2's bf1 (with a facedown Hidden Blade), Back (5) in base. */
function board() {
  return scenario()
    .turn(3)
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Front" }, "front")
    .unit(P2, "base", { might: 5, name: "Back" }, "back")
    .facedown(P2, "bf1", HIDDEN_BLADE, "blade")
    .hand(P1, PIERCING_LIGHT, "pl");
}

/** P1 casts Piercing Light [front, back]; P2 flips Hidden Blade on its own Front. */
async function lightThenBlade(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("pl", { targets: ["front", "back"] });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "pl", controller: P1 })]);
  expect([...(game.chain()[0]?.targets ?? [])].sort()).toEqual(["back", "front"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  expect(game.p2.can("reveal", "blade")).toBe(true);
  await game.p2.reveal("blade");
  // Front is the only unit at bf1 (811.1.d.2) → the target is locked without a prompt.
  if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
    await game.p2.pick("front");
  }
  expect(game.chain().map((c) => c.cardId)).toEqual(["pl", "blade"]);
  expect(game.chain()[1]?.targets).toEqual(["front"]);
  return game;
}

describe("Ruling 86f26957b91bba80 — Piercing Light's second target still takes 2 after Hidden Blade kills the first", () => {
  test("control: unopposed, both locked targets take 2 (Front at bf1, Back in base)", async () => {
    const game = await board().build();
    await game.p1.cast("pl", { targets: ["front", "back"] });
    await game.settle();
    expect(game.state("front").damage).toBe(2);
    expect(game.state("back").damage).toBe(2);
    expect(game.zoneOf("pl")).toBe("trash");
  });

  test("Hidden Blade (a Reaction from facedown, for 0) resolves first: Front dies and P2 draws 2; Piercing Light still on the chain", async () => {
    const game = await lightThenBlade();
    const p2Hand = game.p2.hand().length;
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.zoneOf("front")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.chain().map((c) => c.cardId)).toEqual(["pl"]);
    expect(game.state("back").damage).toBe(0);
  });

  test("ruling 86f26957b91bba80 — Piercing Light then resolves: the first instruction is skipped (Front gone) but Back in base STILL takes 2", async () => {
    const game = await lightThenBlade();
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("front")).toBe("trash");
    expect(game.state("back")).toMatchObject({ damage: 2, zone: "base" });
    expect(game.zoneOf("pl")).toBe("trash");
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("Piercing Light needs two DIFFERENT units: the same unit is never offered for both slots", async () => {
    const game = await board().build();
    const tuples = (game.p1.option("cast", "pl")?.fields.find((f) => f.name === "targets")?.options ?? []) as unknown[];
    const pairs = tuples.filter((t) => Array.isArray(t) && t.length === 2) as string[][];
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs.some(([a, b]) => a === b)).toBe(false);
    expect(pairs.map((p) => p.join(">"))).toContain("front>back");
  });
});
