/**
 * Ruling 0971ec6c17ac1897 — Arcane Shift (SFD-200 → sfd-200-221) · Spell · Mind/Chaos · 3 + [rainbow] · [Action]
 *   "Banish a friendly unit, then its owner plays it, ignoring its cost. Deal 3 to an enemy unit at a
 *    battlefield. Banish this."
 *   × Ruin Runner (sfd-105-221) · 5 Might · "I can't be chosen by enemy spells and abilities."
 *
 * Q: Can I play Arcane Shift when the opponent's only unit at a battlefield is Ruin Runner?
 * A: No. Arcane Shift must choose BOTH a friendly unit and an enemy unit at a battlefield to be played
 *    (355.8). Ruin Runner can't be chosen by enemy spells, so with no other enemy unit at a battlefield the
 *    targeting requirement can't be met and the spell can't be played at all.
 * Rules: 355.5 / 355.8 (all required targets must be chosen to play), "can't be chosen" statics.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ARCANE_SHIFT = "sfd-200-221";
const RUIN_RUNNER = "sfd-105-221";

const COST = { energy: 3, power: { rainbow: 1 } };

function board() {
  return scenario()
    .resources(P1, COST)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "base", { might: 2, name: "Apprentice" }, "mine")
    .unit(P2, "bf1", RUIN_RUNNER, "runner")
    .hand(P1, ARCANE_SHIFT, "shift");
}

function targetPairs(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>): string[][] {
  return ((game.p1.option("cast", "shift")?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][]).map((v) =>
    Array.isArray(v) ? v : [v as unknown as string],
  );
}

describe("Ruling 0971ec6c17ac1897 — Arcane Shift can't be played when the only enemy unit at a battlefield is Ruin Runner", () => {
  test("ruling 0971ec6c17ac1897 — Ruin Runner alone at bf1 (plus P1's own unit available): Arcane Shift is NOT castable; forcing it fails and nothing is spent", async () => {
    const game = await board().build();
    expect(game.p2.units("bf1")).toEqual(["runner"]);
    expect(game.p1.units()).toContain("mine"); // the friendly half IS satisfiable — the enemy half is not
    expect(game.p1.can("cast", "shift")).toBe(false);
    expect(targetPairs(game)).toEqual([]);
    const r = await game.p1.try((p) => p.cast("shift", { targets: ["mine", "runner"] }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("shift")).toBe("hand");
    expect(game.p1.resources()).toEqual(COST);
    expect(game.chain()).toEqual([]);
    expect(game.state("runner").damage).toBe(0);
  });

  test("an enemy unit in P2's BASE doesn't help either ('at a battlefield'): still not castable", async () => {
    const game = await board().unit(P2, "base", { might: 1, name: "Homebody" }, "home").build();
    expect(game.p1.can("cast", "shift")).toBe(false);
  });

  test("contrast — add a choosable enemy unit at a battlefield: now castable, and Ruin Runner is never among the offered enemy targets; the other unit takes the 3", async () => {
    const game = await board().unit(P2, "bf1", { might: 4, name: "Grunt" }, "grunt").build();
    expect(game.p1.can("cast", "shift")).toBe(true);
    const pairs = targetPairs(game);
    expect(pairs).toContainEqual(["mine", "grunt"]);
    expect(pairs.some((p) => p.includes("runner"))).toBe(false);
    expect((await game.p1.try((p) => p.cast("shift", { targets: ["mine", "runner"] }))).ok).toBe(false);
    await game.p1.cast("shift", { targets: ["mine", "grunt"] });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    await game.settle({ policy: "first" });
    expect(game.state("grunt").damage).toBe(3);
    expect(game.state("runner").damage).toBe(0);
    expect(game.zoneOf("shift")).toBe("banishment");
  });
});
