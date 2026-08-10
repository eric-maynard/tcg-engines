/**
 * Ruling 3c28d83211a08e5a — Shuriken Flip (VEN-140 → ven-140-166) · Spell [1][rainbow] · Fury/Calm
 *   "Deal 2 to up to one enemy unit at a battlefield, then move a friendly unit. [Flow] [3][rainbow]"
 *   (× Charm ogn-043-298 cited for the same free-destination templating.)
 *
 * Q: After targeting an enemy unit at a battlefield with Shuriken Flip, must my friendly unit move to THAT battlefield?
 * A: No. The move has no "there"/"to that battlefield" link: the friendly unit may go to any legal location — base or
 *    a different battlefield. Choosing zero enemy targets still performs the move normally.
 * Rules: 355.4 (destination chosen by the player), templating (no linking word), "up to one" (355.2).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHURIKEN_FLIP = "ven-140-166";

type Pick = Extract<Decision, { kind: "pick" }>;

/** P1's turn. P2 holds bf1 with a 5-Might Target; bf2 is open; P1 holds bf3 with Holder and has Ally in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 1, power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: null })
    .battlefield("bf3", { controller: P1 })
    .unit(P2, "bf1", { might: 5, name: "Target" }, "target")
    .unit(P1, "base", { might: 2, name: "Ally" }, "ally")
    .unit(P1, "bf3", { might: 2, name: "Holder" }, "holder")
    .hand(P1, SHURIKEN_FLIP, "flip");
}

/** Cast (optionally on the enemy Target), resolve, and answer "which friendly unit moves" with `mover`; returns the destination prompt. */
async function castAndChooseMover(targets: string[], mover: "ally" | "holder"): Promise<{ game: Game; dest: Pick }> {
  const game = await board().build();
  await game.p1.cast("flip", { targets });
  await game.settle();
  const who = game.decision();
  expect(who).toMatchObject({ kind: "pick", seat: P1, semantics: "target" });
  expect((who as Pick).options.map((o) => o.card ?? o.key).sort()).toEqual(["ally", "holder"]);
  await game.p1.pick(mover);
  const dest = game.decision();
  expect(dest).toMatchObject({ kind: "pick", seat: P1, semantics: "destination" });
  return { dest: dest as Pick, game };
}

const keys = (d: Pick) => d.options.map((o) => o.zone ?? o.key).sort();

describe("Ruling 3c28d83211a08e5a — Shuriken Flip's move goes anywhere legal, not necessarily to the damaged unit's battlefield", () => {
  test("damage Target at bf1, move Holder (at bf3): P1 is offered base, bf1 AND bf2 — and may send it to BASE", async () => {
    const { game, dest } = await castAndChooseMover(["target"], "holder");
    expect(game.state("target").damage).toBe(2); // the damage step already happened ("then move")
    expect(keys(dest)).toEqual(["base", "battlefield-bf1", "battlefield-bf2"]);
    await game.p1.pick("base");
    await game.settle();
    expect(game.locationOf("holder")).toBe("base");
    expect(game.state("target").damage).toBe(2);
    expect(game.zoneOf("flip")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("damage Target at bf1, move Ally (in base) to a DIFFERENT battlefield (bf2) — legal; nothing forces bf1", async () => {
    const { game, dest } = await castAndChooseMover(["target"], "ally");
    expect(keys(dest)).not.toContain("base"); // Ally is already in base
    expect(keys(dest)).toContain("battlefield-bf2");
    expect(keys(dest)).toContain("battlefield-bf1"); // allowed too — just not mandatory
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    expect(game.locationOf("ally")).toBe("bf2");
    expect(game.locationOf("target")).toBe("bf1");
    expect(game.state("target").damage).toBe(2);
  });

  test("nuance — zero enemy targets chosen ('up to one'): no damage, but the move still executes with a player-chosen destination", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "flip")?.fields.find((f) => f.name === "targets");
    expect(field?.min).toBe(0);
    const { game: g2, dest } = await castAndChooseMover([], "holder");
    expect(g2.state("target").damage).toBe(0);
    expect(keys(dest)).toContain("base");
    await g2.p1.pick("base");
    await g2.settle();
    expect(g2.locationOf("holder")).toBe("base");
    expect(g2.zoneOf("flip")).toBe("trash");
  });
});
