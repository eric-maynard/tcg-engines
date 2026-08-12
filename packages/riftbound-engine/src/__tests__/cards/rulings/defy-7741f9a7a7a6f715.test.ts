/**
 * Ruling 7741f9a7a7a6f715 — Defy (OGN-045 → ogn-045-298) · Spell · Calm · [1][calm] · [Reaction]
 *     "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   × Blood Rush (SFD-003 → sfd-003-221) · [Action] · [1] · "[Repeat] [1] … Give a unit [Assault 2] this turn."
 *   × Marching Orders (SFD-114 → sfd-114-221) · [Action] · [3] · "[Repeat] [3] … Choose a friendly unit anywhere
 *     and an enemy unit at a battlefield. They deal damage equal to their Mights to each other."
 *
 * Q: With a [Repeat] spell, may I wait to see whether my opponent Defies before deciding to pay the Repeat?
 * A: No. Repeat is an additional cost declared and paid as the spell is put on the chain, before priority passes.
 *    A Repeat-paid spell is still ONE item on the chain, so a Defy counters the whole thing (both executions).
 *    Defy reads the spell's base cost, so paying Repeat never pushes a spell out of Defy's range.
 * Rules: 357 / 404.1 (additional costs are paid on finalization), 355.9 (all choices made as it goes on the chain),
 *        425.1 (a countered spell does nothing at all), 204 (a card's cost is its printed cost).
 */
import { describe, expect, test } from "bun:test";
import type { ActionDecision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const BLOOD_RUSH = "sfd-003-221";
const MARCHING_ORDERS = "sfd-114-221";

/** P1's turn. P1 has [6] and both Repeat spells; P2 holds Defy + [1][calm]. bf1 is P2's with a 5-Might Sentry. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 5, name: "Sentry" }, "sentry")
    .unit(P1, "base", { might: 3, name: "Bruiser" }, "bruiser")
    .hand(P1, BLOOD_RUSH, "rush")
    .hand(P1, MARCHING_ORDERS, "orders")
    .hand(P2, DEFY, "defy");
}

const defyTargets = (game: Game): unknown[] =>
  (game.p2.option("cast", "defy")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();

describe("Ruling 7741f9a7a7a6f715 — Repeat is declared and paid on the chain, before any Defy window", () => {
  test("paying Repeat is part of the play: [1] + [1] leaves the pool at once, and the chain holds ONE item", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { repeat: 1, targets: "bruiser" });
    expect(game.p1.energy()).toBe(4); // 6 − (1 base + 1 Repeat), immediately
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rush", controller: P1, triggered: false })]);
    expect(game.chain()).toHaveLength(1);
  });

  test("nothing about Repeat is asked later: the moment the spell is on the chain the only thing on offer is priority", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { targets: "bruiser" }); // declined Repeat
    expect(game.p1.energy()).toBe(5);
    const d = game.decision();
    expect(d).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect((d as ActionDecision).options.some((o) => /repeat/i.test(o.label))).toBe(false);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.p1.energy()).toBe(5); // no late Repeat payment ever happened
  });

  test("a Repeat-paid spell is ONE spell: Defy counters the whole thing — the unit gets no [Assault] at all", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { repeat: 1, targets: "bruiser" });
    await game.p1.passPriority();
    expect(defyTargets(game)).toContain("rush");
    await game.p2.cast("defy", { targets: "rush" });
    await game.settle();
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.chain()).toEqual([]);
    expect(game.state("bruiser").grantedKeywords).toEqual([]);
    expect(game.state("bruiser").might).toBe(3);
    expect(game.p1.energy()).toBe(4); // 425.1.c — the counter refunds nothing
  });

  test("control — the same Repeat-paid Blood Rush left alone does apply its effect (the [Assault] grant lands)", async () => {
    const game = await board().build();
    await game.p1.cast("rush", { repeat: 1, targets: "bruiser" });
    await game.settle();
    expect(game.zoneOf("rush")).toBe("trash");
    expect(game.state("bruiser").keywords).toContain("Assault");
    expect(game.state("bruiser").grantedKeywords.length).toBeGreaterThan(0);
  });

  test("Defy reads the BASE cost: Marching Orders paid at [6] (base [3] + Repeat [3]) is still a legal Defy target", async () => {
    const game = await board().build();
    await game.p1.cast("orders", { repeat: 1, targets: ["bruiser", "sentry"] });
    expect(game.p1.energy()).toBe(0); // 6 spent
    await game.p1.passPriority();
    expect(defyTargets(game)).toContain("orders"); // base [3] ≤ [4], no Power cost
    await game.p2.cast("defy", { targets: "orders" });
    await game.settle();
    expect(game.zoneOf("orders")).toBe("trash");
    expect(game.state("sentry").damage).toBe(0);
    expect(game.state("bruiser").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });
});
