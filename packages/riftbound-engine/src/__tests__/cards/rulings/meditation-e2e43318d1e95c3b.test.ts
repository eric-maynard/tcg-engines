/**
 * Ruling e2e43318d1e95c3b — Meditation (OGN-048 → ogn-048-298) · [Reaction] · Calm · 2
 *     "As an additional cost to play this, you may exhaust a friendly unit. If you do, draw 2. Otherwise, draw 1."
 *   × Temporal Portal (SFD-078 → sfd-078-221) · Gear · "[rainbow], [Exhaust]: Give the next spell you play this turn
 *     [Repeat] equal to its cost."
 *
 * Q: I exhaust a unit and play Meditation with Temporal Portal's Repeat paid — do I draw 4 or 3?
 * A: 3. Portal grants Meditation [Repeat] 2 (its cost). Exhausting the unit is an additional COST paid once as the spell
 *    is played, so the first execution draws 2; the repeated execution only repeats the EFFECT — the cost is not paid
 *    again — so it resolves as "otherwise, draw 1". 2 + 1 = 3. (The ruling self-flags as an interpretation; no FAQ.)
 * Rules: 820.1.d / 820.1.d.1 (Repeat = optional additional cost; instructions executed one more time), 356.2 (additional
 *        costs are paid while playing), 359 (resolution).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const MEDITATION = "ogn-048-298";
const TEMPORAL_PORTAL = "sfd-078-221";

/**
 * P1's turn: Temporal Portal ready in base, a ready Monk (the unit to exhaust), Meditation in hand, and exactly
 * [4] + 1 calm = Portal's [rainbow] (paid from calm) + Meditation [2] + its Repeat [2].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { calm: 1 } })
    .unit(P1, "base", { might: 2, name: "Monk" }, "monk")
    .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
    .gear(P1, TEMPORAL_PORTAL, "portal")
    .hand(P1, MEDITATION, "med")
    .deck(P1, ["ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298", "ogn-175-298"], ["d1", "d2", "d3", "d4", "d5"]);
}

async function portalUsed(): Promise<Game> {
  const game = await board().build();
  // Before the Portal, Meditation has no Repeat at all.
  expect(game.p1.option("cast", "med")?.fields.find((f) => f.arg === "repeat")).toBeUndefined();
  await game.p1.activate("portal");
  await game.settle();
  expect(game.state("portal").isExhausted).toBe(true);
  expect(game.p1.resources()).toEqual({ energy: 4, power: { calm: 0 } });
  return game;
}

describe("Ruling e2e43318d1e95c3b — Meditation with an exhausted unit + Temporal Portal's Repeat draws 3", () => {
  test("step 1: activating Temporal Portal ([rainbow], Exhaust) gives the next spell [Repeat] equal to its cost — Meditation's cast now offers one Repeat, priced at another [2]", async () => {
    const game = await portalUsed();
    const repeat = game.p1.option("cast", "med")?.fields.find((f) => f.arg === "repeat");
    expect(repeat?.options).toEqual([1]);
    // Paying only the Repeat (no unit exhausted): [2] + [2] = everything; two "otherwise, draw 1" executions.
    await game.p1.cast("med", { repeat: 1 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.state("monk").isExhausted).toBe(false);
    await game.settle();
    expect(game.zoneOf("med")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
  });

  // rule 820.1 / 356.2 — Repeat and "you may exhaust a friendly unit" are two independent optional additional
  // costs, each payable as the spell is played, so the cast menu offers a line that pays BOTH.
  test.failing("BUG: ruling e2e43318d1e95c3b — the playSpell enumerator offers exhaust-a-unit AND the Portal's Repeat together", async () => {
    const game = await portalUsed();
    const variants = game.p1.option("cast", "med")?.variants ?? [];
    expect(variants.some((v) => v.params.repeatCount === 1 && v.params.paidAdditionalCost === true)).toBe(true);
    await game.p1.cast("med", { payOptional: true, repeat: 1, targets: "monk" });
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
  });

  // Per the ruling: exhaust the Monk (cost, paid once) + Repeat ⇒ first execution "if you do, draw 2", repeated execution
  // "otherwise, draw 1" ⇒ 3 cards. (The ruling self-describes as interpretation; driven through the raw move params so the
  // exact cost bundle is explicit.)
  test.failing("BUG: ruling e2e43318d1e95c3b — exhaust cost + Portal Repeat both paid: Meditation draws 3 (2 + 1), not 4", async () => {
    const game = await portalUsed();
    await game.p1.do("playSpell", {
      cardId: "med",
      costs: { paid: { exhaust: { objects: ["monk"] } } },
      paidAdditionalCost: true,
      repeatCount: 1,
      targets: ["monk"],
    });
    expect(game.state("monk").isExhausted).toBe(true); // the additional cost, paid once while playing (356.2)
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } }); // [2] + Repeat [2]
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "med", controller: P1 })]); // one spell, played once (820.3.a)
    await game.settle();
    expect(game.zoneOf("med")).toBe("trash");
    expect(game.p1.hand()).toEqual(["d1", "d2", "d3"]); // 2 (paid) + 1 (repeat, cost not re-paid) = 3
    expect(game.p1.deck()[0]).toBe("d4");
  });

  test("reference — exhausting the Monk WITHOUT paying the Repeat: the cost is paid while playing and Meditation draws exactly 2", async () => {
    const game = await portalUsed();
    await game.p1.cast("med", { payOptional: true, targets: "monk" });
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { calm: 0 } });
    await game.settle();
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.violations()).toEqual([]);
  });
});
