/**
 * Ruling f292ce226894e9c4 — Stupefy (OGN-095 → ogn-095-298) · Spell · [Reaction] · [1]
 *   "Give a unit -1 [Might] this turn, to a minimum of 1 [Might]. Draw 1."
 *   × Hextech Ray (OGN-009 → ogn-009-298) · [Action] · "Deal 3 to a unit at a battlefield."
 *
 * Q: A unit is damaged by a spell and then Stupefied — does the already-marked damage kill it once its
 *    Might drops?
 * A: Yes, at the next cleanup. Damage never lowers Might; it is marked separately. The state check compares
 *    marked damage with CURRENT Might, so lowering Might can retroactively make old damage lethal. (It does
 *    not count as Stupefy having killed the unit — Stupefy dealt no damage.)
 * Rules: 417.1 (damage is marked, Might unchanged), 432 (state check: damage ≥ Might ⇒ die),
 *        360 (cleanup / state-based checks), 716 (Might modifiers).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const STUPEFY = "ogn-095-298";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P2's 4-Might Brute at bf1; P1 holds a Hextech Ray and two Stupefies. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1, rainbow: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .hand(P1, HEXTECH_RAY, "ray")
    .hand(P1, STUPEFY, "stupefy1")
    .hand(P1, STUPEFY, "stupefy2");
}

const damageFrom = (game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>, source: string) =>
  (game.gameState.damageLog ?? []).filter((r) => r.source.cardId === source);

describe("Ruling f292ce226894e9c4 — marked damage is re-checked against the NEW Might, so Stupefy finishes a damaged unit", () => {
  test("intermediate fact: 3 damage on the 4-Might Brute marks damage but leaves its Might at 4 — it survives", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    expect(game.state("brute")).toMatchObject({ damage: 3, might: 4, baseMight: 4 });
  });

  test("ruling: Stupefy then drops it to 3 Might and the marked 3 damage is now lethal — the Brute dies", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "brute" });
    await game.settle();
    await game.p1.cast("stupefy1", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("nuance: Stupefy itself dealt no damage — the kill is attributed to no damage source of its own", async () => {
    const game = await board().build();
    await game.p1.cast("ray", { targets: "brute" });
    await game.settle();
    await game.p1.cast("stupefy1", { targets: "brute" });
    await game.settle();
    expect(damageFrom(game, "stupefy1")).toEqual([]);
    expect(damageFrom(game, "ray").map((r) => r.amount)).toEqual([3]);
  });

  test("control: Stupefy alone (no prior damage) never kills — 4 → 3 Might with 0 damage marked is perfectly alive", async () => {
    const game = await board().build();
    await game.p1.cast("stupefy1", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 0, might: 3 });
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
  });

  test("control: 2 damage is not enough — two Stupefies are needed before the marked damage catches up", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { rainbow: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute", { damage: 2 })
      .hand(P1, STUPEFY, "stupefy1")
      .hand(P1, STUPEFY, "stupefy2")
      .build();
    await game.p1.cast("stupefy1", { targets: "brute" });
    await game.settle();
    expect(game.state("brute")).toMatchObject({ damage: 2, might: 3 });
    expect(game.zoneOf("brute")).toBe("battlefield-bf1");
    await game.p1.cast("stupefy2", { targets: "brute" });
    await game.settle();
    expect(game.zoneOf("brute")).toBe("trash"); // 2 damage vs 2 Might
    expect(game.violations()).toEqual([]);
  });
});
