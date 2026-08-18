import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * [rule:ui-staged-movement] Staging assembles a rule-144.3 group before any
 * game action is taken, so a two-unit attack is possible at all: executing the
 * first drag immediately opens the showdown and locks the second unit out.
 */
const src = readFileSync("apps/riftbound-app/public/js/gameplay/group-move.js", "utf8");
const { MoveStaging } = new Function(`${src}; return { MoveStaging };`)() as {
  MoveStaging: {
    empty(): { destination: string | null; unitIds: string[] };
    add(m: unknown[], s: unknown, u: string, d: string): { staged: { destination: string | null; unitIds: string[] }; reason: string | null };
    remove(s: unknown, u: string): { destination: string | null; unitIds: string[] };
    commitMove(m: unknown[], s: unknown): unknown;
    label(s: unknown): string;
  };
};

// The engine enumerates every legal subset; these are the moves for u1/u2 → bf1.
const MOVES = [
  { moveId: "standardMove", params: { destination: "bf1", unitIds: ["u1"] } },
  { moveId: "standardMove", params: { destination: "bf1", unitIds: ["u2"] } },
  { moveId: "standardMove", params: { destination: "bf1", unitIds: ["u1", "u2"] } },
  { moveId: "standardMove", params: { destination: "base", unitIds: ["u3"] } },
];

describe("move staging", () => {
  test("stages one unit without touching the engine", () => {
    const { staged, reason } = MoveStaging.add(MOVES, MoveStaging.empty(), "u1", "bf1");
    expect(reason).toBeNull();
    expect(staged).toEqual({ destination: "bf1", unitIds: ["u1"] });
  });

  test("a second unit joins the same bundle", () => {
    const one = MoveStaging.add(MOVES, MoveStaging.empty(), "u1", "bf1").staged;
    const two = MoveStaging.add(MOVES, one, "u2", "bf1").staged;
    expect(two.unitIds).toEqual(["u1", "u2"]);
  });

  test("the committed move is the ONE group action, not two", () => {
    const one = MoveStaging.add(MOVES, MoveStaging.empty(), "u1", "bf1").staged;
    const two = MoveStaging.add(MOVES, one, "u2", "bf1").staged;
    expect(MoveStaging.commitMove(MOVES, two)).toEqual(MOVES[2]);
  });

  test("a unit the engine never groups with these is refused, with a reason", () => {
    const one = MoveStaging.add(MOVES, MoveStaging.empty(), "u1", "bf1").staged;
    const { staged, reason } = MoveStaging.add(MOVES, one, "u3", "bf1");
    expect(staged.unitIds).toEqual(["u1"]);
    expect(reason).toBeTruthy();
  });

  test("dragging to a different destination replaces the bundle (144.3.a)", () => {
    const one = MoveStaging.add(MOVES, MoveStaging.empty(), "u1", "bf1").staged;
    const moved = MoveStaging.add(MOVES, one, "u3", "base").staged;
    expect(moved).toEqual({ destination: "base", unitIds: ["u3"] });
  });

  test("player-base is normalised to the engine's 'base'", () => {
    const s = MoveStaging.add(MOVES, MoveStaging.empty(), "u3", "player-base").staged;
    expect(s.destination).toBe("base");
    expect(MoveStaging.commitMove(MOVES, s)).toEqual(MOVES[3]);
  });

  test("removing the last unit clears the stage", () => {
    const one = MoveStaging.add(MOVES, MoveStaging.empty(), "u1", "bf1").staged;
    expect(MoveStaging.remove(one, "u1")).toEqual({ destination: null, unitIds: [] });
  });

  test("labels an attack as an attack and a recall as a recall", () => {
    const bf = MoveStaging.add(MOVES, MoveStaging.empty(), "u1", "bf1").staged;
    const home = MoveStaging.add(MOVES, MoveStaging.empty(), "u3", "base").staged;
    expect(MoveStaging.label(bf)).toBe("Attack with 1 unit");
    expect(MoveStaging.label(home)).toBe("Move 1 unit to base");
  });

  test("an incomplete bundle has nothing to commit", () => {
    expect(MoveStaging.commitMove(MOVES, MoveStaging.empty())).toBeNull();
  });
});
