/**
 * Ruling 4db96445eeeb5a72 — Carnivorous Snapvine (OGN-149 → ogn-149-298) · 6 Might ·
 *   "When you play me, choose an enemy unit at a battlefield. We deal damage equal to our Mights to each
 *   other."  × Volibear, Furious (OGN-041 → ogn-041-298, "[Deflect 2]").
 *
 * Q: What does "choose" a unit mean — is it the same as targeting?
 * A: Yes. "Choose" IS "target": the chooser is asked (it is a real selection, not a programmatic one),
 *    the chosen object is recorded as the item's target, and every targeting consequence applies — a
 *    [Deflect] unit costs its surcharge to choose and is not even offered when that cannot be paid.
 * Rules: 355.9 / 355.10 (choosing = targeting; only real selections are prompted), 809.1.c.1 ([Deflect]
 *        is a surcharge for choosing that object), 402.2 (an ability's targets are chosen at
 *        finalization and recorded on the chain item).
 */
import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SNAPVINE = "ogn-149-298"; // 5 energy + [body][body]
const VOLIBEAR = "ogn-041-298"; // [Deflect 2]

/** P2's turn: P1 holds bf1 with two vanilla allies and Volibear; P2 has the Snapvine in hand. */
const board = (power: Record<string, number>) =>
  scenario()
    .turn(3)
    .active(P2)
    .resources(P2, { energy: 5, power })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Ally One" }, "ally1")
    .unit(P1, "bf1", { might: 3, name: "Ally Two" }, "ally2")
    .unit(P1, "bf1", VOLIBEAR, "voli")
    .hand(P2, SNAPVINE, "snap");

describe("Ruling 4db96445eeeb5a72 — \"choose\" means \"target\"", () => {
  test("the \"choose an enemy unit\" trigger asks P2 a real target question (semantics: target), not a silent selection", async () => {
    const game = await board({ body: 2, rainbow: 2 }).build();
    await game.p2.play("snap");
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "target", source: { cardId: "snap" } });
    expect((d.options.map((o) => o.card ?? o.key) as string[]).sort()).toEqual(["ally1", "ally2", "voli"]);
  });

  test("the choice is recorded as the chain item's TARGET", async () => {
    const game = await board({ body: 2, rainbow: 2 }).build();
    await game.p2.play("snap");
    await game.p2.pick("ally2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snap", targets: ["ally2"] })]);
  });

  test("[Deflect 2] taxes the CHOOSE: with no spare Power, Volibear is not even an option", async () => {
    const game = await board({ body: 2 }).build();
    await game.p2.play("snap");
    const d = game.decision() as PickDecision | null;
    const options = d?.kind === "pick" ? (d.options.map((o) => o.card ?? o.key) as string[]) : [];
    expect(options.sort()).toEqual(["ally1", "ally2"]);
    expect(options).not.toContain("voli");
  });

  test("with [rainbow][rainbow] in the pool Volibear can be chosen — and choosing him charges the 2", async () => {
    const game = await board({ body: 2, rainbow: 2 }).build();
    await game.p2.play("snap");
    const before = Object.values(game.p2.resources().power).reduce((a, b) => a + b, 0);
    await game.p2.pick("voli");
    const after = Object.values(game.p2.resources().power).reduce((a, b) => a + b, 0);
    expect(before - after).toBe(2);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snap", targets: ["voli"] })]);
    expect(game.violations()).toEqual([]);
  });

  test("choosing a vanilla ally costs nothing extra — the tax belongs to the [Deflect] unit, not to choosing as such", async () => {
    const game = await board({ body: 2, rainbow: 2 }).build();
    await game.p2.play("snap");
    await game.p2.pick("ally1");
    expect(game.p2.resources().power).toMatchObject({ rainbow: 2 });
    await game.settle();
    expect(game.zoneOf("ally1")).toBe("trash"); // 6 vs 2 — the fight resolves on the chosen unit
  });
});
