/**
 * Ruling 9c14dd1231ad95b4 — Stupefy (OGN-095 → ogn-095-298) · Reaction [1][mind] "Give a unit -1 Might this turn, to a
 *     minimum of 1. Draw 1."
 *   × Arena Bar (OGN-124 → ogn-124-298) · Gear "[Exhaust]: Buff an exhausted friendly unit."
 *   × Gust (OGN-169 → ogn-169-298) · Reaction [1][chaos] "Return a unit at a battlefield with 3 Might or less to hand."
 *
 * Q: P1 activates Arena Bar on a unit; P2 responds with Stupefy, lets it resolve — can P2 then Gust the now-≤3 unit
 *    before P1 gets to act?
 * A: No. After Stupefy resolves the chain still holds Arena Bar's ability and priority returns to P1 (controller of the
 *    newest item) — P2 does not get to slip Gust in first. Nuance: Gust cannot be cast at a >3-Might unit "planning" to
 *    Stupefy it afterwards — the target must be legal when Gust is played.
 * Rules: 340.4 (after a resolve, controller of the newest remaining item gains priority), 355.8 (legal target needed).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const ARENA_BAR = "ogn-124-298";
const GUST = "ogn-169-298";

/** P1's turn. P1: Arena Bar (ready) + an exhausted 4-Might Brute at bf1. P2: Stupefy + Gust, [2] + mind + chaos. */
function board() {
  return scenario()
    .resources(P2, { energy: 2, power: { mind: 1, chaos: 1 } })
    .battlefield("bf1", { controller: P1 })
    .gear(P1, ARENA_BAR, "bar")
    .unit(P1, "bf1", { might: 4, name: "Brute" }, "brute", { exhausted: true })
    .hand(P2, STUPEFY, "stupefy")
    .hand(P2, GUST, "gust");
}

function gustTargets(game: Game): string[] {
  const f = game.p2.option("cast", "gust")?.fields.find((x) => x.arg === "targets" || x.name === "targets");
  return [...new Set((f?.options ?? []).flatMap((v) => (Array.isArray(v) ? v : [v]) as string[]))];
}

async function barThenStupefy(): Promise<Game> {
  const game = await board().build();
  await game.p1.activate("bar", 0, { targets: ["brute"] });
  expect(game.chain().map((c) => c.cardId)).toEqual(["bar"]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 9c14dd1231ad95b4 — P2 can't resolve Stupefy and then Gust before P1 acts", () => {
  test("nuance: with the Brute at 4 Might, Gust has no legal target (can't cast it first and 'fix' the Might later); Stupefy is fine", async () => {
    const game = await barThenStupefy();
    expect(game.p2.can("cast", "stupefy")).toBe(true);
    expect(gustTargets(game)).not.toContain("brute");
    expect(game.p2.can("cast", "gust")).toBe(false);
  });

  test("P2 Stupefies the Brute in response; when Stupefy resolves (Brute 4→3, P2 draws 1) Arena Bar's ability is still on the chain and PRIORITY GOES TO P1 (340.4) — it is not P2's decision, so no Gust yet", async () => {
    const game = await barThenStupefy();
    const p2Hand = game.p2.hand().length;
    await game.p2.cast("stupefy", { targets: "brute" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["bar", "stupefy"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Stupefy resolves
    expect(game.zoneOf("stupefy")).toBe("trash");
    expect(game.state("brute").might).toBe(3);
    expect(game.p2.hand()).toHaveLength(p2Hand - 1 + 1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["bar"]);
    // The chain is NOT empty → P1 (controller of the newest remaining item) has priority, not P2.
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.actingSeat()).toBe(P1);
    const sneak = await game.p2.try((p) => p.cast("gust", { targets: "brute" }));
    expect(sneak.ok).toBe(false);
  });

  test("the chain then finishes: Arena Bar resolves and buffs the Brute (3 → 4 with the buff, Stupefy's -1 still applied this turn)", async () => {
    const game = await barThenStupefy();
    await game.p2.cast("stupefy", { targets: "brute" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("brute").isBuffed).toBe(true);
    expect(game.state("brute").might).toBe(4); // 4 base − 1 (Stupefy) + 1 (buff)
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.violations()).toEqual([]);
  });
});
