/**
 * Ruling f9a4e11118096e1e — Shakedown (OGN-033 → ogn-033-298) · 2 + [fury]
 *   "[Reaction] Choose an enemy unit. Deal 6 to it unless its controller has you draw 2."
 *
 * Q: How does Shakedown work?
 * A: You choose the enemy unit as you cast it; then ITS CONTROLLER — not you — decides which half
 *    happens: the unit takes 6, or the Shakedown's caster draws 2. The opponent needs no card of
 *    their own for that; the choice is part of Shakedown's own effect.
 * Rules: 355.10.e (an effect may hand the choice to another player), 359.3 (the choice is made as the
 *        spell resolves).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SHAKEDOWN = "ogn-033-298";
const FILLER = "ogn-175-298";

function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 8, name: "Bruiser" }, "bruiser")
    .hand(P1, SHAKEDOWN, "shakedown")
    .deck(P1, [FILLER, FILLER, FILLER], ["d1", "d2", "d3"]);
}

/** Cast Shakedown at the Bruiser and stop on the opponent's decision. */
async function toChoice(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>) {
  await game.p1.cast("shakedown", { targets: "bruiser" });
  const stop = await game.settle();
  expect(stop.reason).toBe("unanswered");
  const d = game.decision() as Decision;
  expect(d.seat).toBe(P2); // the chosen unit's CONTROLLER decides
  return d;
}

describe("Ruling f9a4e11118096e1e — Shakedown: the caster picks the unit, its controller picks the outcome", () => {
  test("the caster only chooses the enemy unit; the two-way choice is then surfaced to the OPPONENT", async () => {
    const game = await board().build();
    const targets = game.p1.option("cast", "shakedown")?.fields.find((f) => f.arg === "targets")?.options;
    expect((targets as string[][]).flat()).toEqual(["bruiser"]); // only enemy units may be chosen
    const d = await toChoice(game);
    expect(d.kind).toBe("pick");
    const labels = (d as Extract<Decision, { kind: "pick" }>).options.map((o) => o.label).join(" | ");
    expect(labels).toMatch(/draw 2/i);
    expect(labels).toMatch(/6/);
    expect(game.state("bruiser").damage).toBe(0); // nothing has happened yet
    expect(game.p1.hand()).toEqual([]);
  });

  test("the opponent takes the damage: 6 is dealt to their unit and the caster draws nothing", async () => {
    const game = await board().build();
    const d = (await toChoice(game)) as Extract<Decision, { kind: "pick" }>;
    const damageOption = d.options.find((o) => /6/.test(o.label))!;
    await game.p2.pick(damageOption.key);
    await game.settle();
    expect(game.state("bruiser").damage).toBe(6);
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1"); // 8 Might survives 6
    expect(game.p1.hand()).toEqual([]);
    expect(game.zoneOf("shakedown")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("the opponent instead gives the caster the cards: no damage, Shakedown's controller draws 2", async () => {
    const game = await board().build();
    const d = (await toChoice(game)) as Extract<Decision, { kind: "pick" }>;
    const drawOption = d.options.find((o) => /draw 2/i.test(o.label))!;
    await game.p2.pick(drawOption.key);
    await game.settle();
    expect(game.state("bruiser").damage).toBe(0);
    expect(game.p1.hand()).toEqual(["d1", "d2"]);
    expect(game.p2.hand()).toEqual([]); // the opponent spends nothing of their own for this
    expect(game.violations()).toEqual([]);
  });
});
