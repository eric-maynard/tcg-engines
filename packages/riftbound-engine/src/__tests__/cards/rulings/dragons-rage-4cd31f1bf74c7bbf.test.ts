/**
 * Ruling 4cd31f1bf74c7bbf — Dragon's Rage (OGN-258 → ogn-258-298) · Spell · Calm/Body · [4] + 1 · Action
 *     "Move an enemy unit. Then do this: Choose another enemy unit at its destination. They deal damage equal to their
 *      Mights to each other."
 *
 * Q: Can Dragon's Rage target a unit already at a location and "move" it to that same location to get the fight?
 * A: No. A move must go to a DIFFERENT location; the unit's current location is never a legal destination (true for
 *    every "move" effect).
 * Rules: 445–447 (a Move changes the unit's location; 447.2 invalid destinations), 355.4 (destination chosen with the target).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DRAGONS_RAGE = "ogn-258-298";

type PickD = Extract<Decision, { kind: "pick" }>;

/** P1's turn with [4] + calm. P2: Victim (3) and Bystander (4) together at P2's bf1; Loner (5) at open-ish bf2 (P2's); bf3 empty. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P2 })
    .battlefield("bf3", { controller: null })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .unit(P2, "bf1", { might: 4, name: "Bystander" }, "bystander")
    .unit(P2, "bf2", { might: 5, name: "Loner" }, "loner")
    .hand(P1, DRAGONS_RAGE, "rage");
}

/** Cast Rage on `target` and return the destination keys offered (the prompt follows the target choice). */
async function destinationsFor(game: Game, target: string): Promise<string[]> {
  await game.p1.cast("rage", { targets: target });
  let d = game.decision();
  if (d?.kind !== "pick") {
    const r = await game.settle();
    expect(r.reason).toBe("unanswered");
    d = game.decision();
  }
  expect(d).toMatchObject({ kind: "pick", seat: P1 });
  expect((d as PickD).prompt).toMatch(/destination/i);
  return (d as PickD).options.map((o) => o.zone ?? o.key).sort();
}

describe("Ruling 4cd31f1bf74c7bbf — Dragon's Rage must move the unit somewhere ELSE", () => {
  test("targeting the Victim at bf1: the destination menu offers the other locations (P2's base, bf2, bf3) but NOT bf1 itself", async () => {
    const game = await board().build();
    const offered = await destinationsFor(game, "victim");
    expect(offered).not.toContain("battlefield-bf1");
    expect(offered).toEqual(expect.arrayContaining(["battlefield-bf2", "battlefield-bf3"]));
    expect((await game.p1.try((p) => p.pick("battlefield-bf1"))).ok).toBe(false);
    expect(game.locationOf("victim")).toBe("bf1"); // nothing moved yet
  });

  test("so the 'stay at bf1 and fight the Bystander' line is impossible; the legal play moves Victim to bf2 where it fights the Loner (3 ↔ 5): Victim dies, Loner takes 3, Bystander untouched", async () => {
    const game = await board().build();
    await destinationsFor(game, "victim");
    await game.p1.pick("battlefield-bf2");
    await game.settle();
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1) {
      await game.p1.pick("loner"); // "another enemy unit at its destination" (single candidate may be auto-bound)
      await game.settle();
    }
    expect(game.zoneOf("rage")).toBe("trash");
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.state("loner")).toMatchObject({ damage: 3, zone: "battlefield-bf2" });
    expect(game.state("bystander")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.violations()).toEqual([]);
  });

  test("same rule for a unit at any location: the Loner at bf2 is offered bf1 / bf3 / base but never bf2", async () => {
    const game = await board().build();
    const offered = await destinationsFor(game, "loner");
    expect(offered).not.toContain("battlefield-bf2");
    expect(offered).toEqual(expect.arrayContaining(["battlefield-bf1", "battlefield-bf3"]));
  });
});
