/**
 * Ruling f3e0bf33f2ae9c02 — Guardian Angel (SFD-051 → sfd-051-221) · Equipment · [2]
 *   "[Equip] [calm]. If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *   × Hextech Ray (OGN-009 → ogn-009-298) "Deal 3 to a unit at a battlefield." — the lethal source.
 *
 * Q: Two Guardian Angels are attached to one unit and it would die — do BOTH die, or only one?
 * A: Only one. The first Guardian Angel's replacement consumes the death event; the unit is healed,
 *    exhausted and recalled, so it never dies at all and the second Angel's condition is never met. It
 *    stays attached to the unit in base, unused.
 * Rules: 370.2 (a replaced event no longer happens — later replacements have nothing left to replace),
 *        372 (the affected card's controller orders several applicable replacements), 453 (recall).
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const GUARDIAN_ANGEL = "sfd-051-221";
const HEXTECH_RAY = "ogn-009-298";

/** P1's turn. P1's 3-Might Squire at bf1 wears `count` Guardian Angels; P1 holds a lethal Hextech Ray. */
function board(count: 1 | 2) {
  let s = scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Squire" }, "squire")
    .unit(P2, "base", { might: 2, name: "Bystander" }, "bystander")
    .hand(P1, HEXTECH_RAY, "ray");
  for (let i = 1; i <= count; i++) s = s.gear(P1, GUARDIAN_ANGEL, `ga${i}`, { attachedTo: "squire" });
  return s;
}

const orderPrompt = (game: Game) => game.decision() as Extract<Decision, { kind: "pick" }>;

describe("Ruling f3e0bf33f2ae9c02 — with two Guardian Angels only ONE is destroyed", () => {
  test("premise: both Angels are attached to the same 3-Might Squire, and 3 damage would be lethal", async () => {
    const game = await board(2).build();
    expect(game.state("squire").attachments.toSorted()).toEqual(["ga1", "ga2"]);
    expect(game.state("squire").might).toBe(3);
  });

  test("ruling: P1 orders the two applicable replacements (rule 372), the first applies, and the second Angel survives ATTACHED", async () => {
    const game = await board(2).build();
    await game.p1.cast("ray", { targets: "squire" });
    await game.settle();
    const d = orderPrompt(game);
    expect(d).toMatchObject({ kind: "pick", seat: P1, timing: "RPL" });
    expect(d.options.map((o) => o.card).toSorted()).toEqual(["ga1", "ga2"]);
    await game.p1.pick("ga1");
    await game.settle();

    expect(game.zoneOf("ga1")).toBe("trash"); // exactly one paid
    expect(game.zoneOf("ga2")).toBe("base");
    expect(game.state("squire").attachments).toEqual(["ga2"]);
    // The unit never died: healed, exhausted, recalled to base.
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.p1.trash()).not.toContain("squire");
    expect(game.state("squire")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.violations()).toEqual([]);
  });

  test("choosing the OTHER one first destroys that one instead — still exactly one Angel lost", async () => {
    const game = await board(2).build();
    await game.p1.cast("ray", { targets: "squire" });
    await game.settle();
    orderPrompt(game);
    await game.p1.pick("ga2");
    await game.settle();
    expect(game.zoneOf("ga2")).toBe("trash");
    expect(game.zoneOf("ga1")).toBe("base");
    expect(game.state("squire").attachments).toEqual(["ga1"]);
    expect(game.zoneOf("squire")).toBe("base");
  });

  test("…and the surviving Angel is still armed: a second lethal hit next turn consumes it too", async () => {
    const game = await board(2).build();
    await game.p1.cast("ray", { targets: "squire" });
    await game.settle();
    orderPrompt(game);
    await game.p1.pick("ga1");
    await game.settle();
    expect(game.state("squire").attachments).toEqual(["ga2"]);
    // Re-arm: move the Squire back out and kill it again with a fresh Ray.
    const game2 = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Squire" }, "squire")
      .gear(P1, GUARDIAN_ANGEL, "ga2", { attachedTo: "squire" })
      .hand(P1, HEXTECH_RAY, "ray")
      .build();
    await game2.p1.cast("ray", { targets: "squire" });
    await game2.settle();
    expect(game2.decision()?.kind).not.toBe("pick"); // a lone replacement is not ordered
    expect(game2.zoneOf("ga2")).toBe("trash");
    expect(game2.zoneOf("squire")).toBe("base");
  });

  test("control — a single Guardian Angel: nothing is ordered and that one Angel dies", async () => {
    const game = await board(1).build();
    await game.p1.cast("ray", { targets: "squire" });
    await game.settle();
    expect(game.zoneOf("ga1")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.state("squire").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
