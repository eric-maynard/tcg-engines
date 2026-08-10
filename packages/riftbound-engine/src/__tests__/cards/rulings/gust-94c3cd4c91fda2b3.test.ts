/**
 * Ruling 94c3cd4c91fda2b3 — Gust (OGN-169 → ogn-169-298) · [Reaction] · 1 · "Return a unit at a battlefield with 3
 *     [Might] or less to its owner's hand."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [Action] · 1 + [fury] · "Deal 3 to a unit at a battlefield."
 *   × Stupefy (OGN-095 → ogn-095-298) · [Reaction] · 1 · "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *
 * Q: Can Gust take a 4-Might unit that Hextech Ray has damaged, or must its Might stat itself drop below 4?
 * A: Damage doesn't reduce Might — a 4-Might unit with 3 damage is still a 4-Might unit and not a legal Gust target.
 *    A Might reduction (Stupefy → 3) does make it legal. (And a buff in response to Gust makes it illegal again.)
 * Rules: 140 (Might) vs 427 (damage is marked, not subtracted), 355.9 (needs a legal target), 359.3.e.2.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUST = "ogn-169-298";
const HEXTECH_RAY = "ogn-009-298";
const STUPEFY = "ogn-095-298";

/** P1's turn with all three spells and 3 + [fury]. P2's Golem (4) is the only unit at a battlefield. */
function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Golem" }, "golem")
    .hand(P1, GUST, "gust")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, STUPEFY, "stupefy");
}

const gustTargets = (game: Game) =>
  ((game.p1.option("cast", "gust")?.fields.find((f) => f.name === "targets")?.options ?? []) as string[][]).flat();

describe("Ruling 94c3cd4c91fda2b3 — damage doesn't lower Might for Gust; a Might reduction does", () => {
  test("baseline: the undamaged 4-Might Golem is not a Gust target (Gust isn't even castable — no legal target)", async () => {
    const game = await board().build();
    expect(gustTargets(game)).not.toContain("golem");
    expect(game.p1.can("cast", "gust")).toBe(false);
  });

  test("ruling 94c3cd4c91fda2b3 — after Hextech Ray the Golem has 3 damage but is STILL 4 Might → still not a legal Gust target", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "golem" });
    await game.settle();
    expect(game.state("golem")).toMatchObject({ damage: 3, might: 4, zone: "battlefield-bf1" });
    expect(gustTargets(game)).not.toContain("golem");
    expect(game.p1.can("cast", "gust")).toBe(false);
    const r = await game.p1.try((p) => p.cast("gust", { targets: "golem" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("golem")).toBe("battlefield-bf1");
  });

  test("Stupefy instead: Golem's Might becomes 3 → now Gust CAN target it and returns it to P2's hand", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy", { targets: "golem" });
    await game.settle();
    expect(game.state("golem")).toMatchObject({ damage: 0, might: 3 });
    expect(gustTargets(game)).toContain("golem");
    await game.p1.cast("gust", { targets: "golem" });
    await game.settle();
    expect(game.zoneOf("golem")).toBe("hand");
    expect(game.p2.hand()).toContain("golem");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: buffing in response works the other way — Gust on the Stupefied (3) Golem, P2 answers with +2 Might → 5 at resolution → Gust does nothing", async () => {
    const DISCIPLINE = "ogn-058-298";
    const game = await board().resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.cast("stupefy", { targets: "golem" });
    await game.settle();
    await game.p1.cast("gust", { targets: "golem" });
    await game.p1.passPriority();
    await game.p2.cast("disc", { targets: "golem" });
    await game.settle();
    expect(game.state("golem")).toMatchObject({ might: 5, zone: "battlefield-bf1" });
    expect(game.zoneOf("gust")).toBe("trash");
  });
});
