/**
 * Ruling 390464ad12284755 — Guardian Angel (SFD-051 → sfd-051-221) · equipment
 *   "[Equip] [calm]. If I would die, kill Guardian Angel instead. Heal me, exhaust me, and recall me."
 *   × Fox-Fire (ogn-256-298), used only to kill the equipped unit.
 *
 * Q: A unit wears TWO Guardian Angels and would die. Are both destroyed, or only one?
 * A: Only one. The first replacement replaces the death event, so there is no longer a death for the
 *    second to replace — it stays attached, unused (like Zhonya's Hourglass).
 * Rules: 370.2 (a replaced event is gone; later replacements have nothing to apply to),
 *        372 (the affected card's controller orders several applicable replacements).
 */
import { describe, expect, test } from "bun:test";
import type { Decision } from "../../../harness";
import { P1, scenario } from "../../../harness";

const GUARDIAN_ANGEL = "sfd-051-221";
const FOX_FIRE = "ogn-256-298";

/** P1's damaged 3-Might Squire at bf1, wearing two Guardian Angels; Fox-Fire in hand to kill it. */
function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 3, name: "Squire" }, "squire", { damage: 1 })
    .gear(P1, GUARDIAN_ANGEL, "ga1", { attachedTo: "squire" })
    .gear(P1, GUARDIAN_ANGEL, "ga2", { attachedTo: "squire" })
    .hand(P1, FOX_FIRE, "fox");
}

describe("Ruling 390464ad12284755 — only ONE of two Guardian Angels is destroyed", () => {
  test("the controller orders the two replacements, the first applies, and the second survives attached", async () => {
    const game = await board().build();
    expect(game.state("squire").attachments.sort()).toEqual(["ga1", "ga2"]);

    await game.p1.cast("fox", { targets: ["squire"] });
    await game.p1.passPriority();
    await game.p2.passPriority();

    // rule 372 — two die-replacements apply to one death; the dying card's controller orders them.
    const d = game.decision() as Extract<Decision, { kind: "pick" }>;
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "replacement-order", timing: "RPL" });
    expect(d.options.map((o) => o.card).sort()).toEqual(["ga1", "ga2"]);
    expect(game.zoneOf("ga1")).toBe("base");
    expect(game.zoneOf("ga2")).toBe("base");

    await game.p1.pick("ga1");
    await game.settle();

    // Exactly one Guardian Angel paid; the other is untouched and still on the unit.
    expect(game.zoneOf("ga1")).toBe("trash");
    expect(game.zoneOf("ga2")).toBe("base");
    expect(game.state("squire").attachments).toEqual(["ga2"]);
    // The saved unit: alive, healed, exhausted, recalled to base.
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.locationOf("squire")).toBe("base");
    expect(game.state("squire").damage).toBe(0);
    expect(game.state("squire").isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("ordering the other one first destroys THAT one instead — still exactly one", async () => {
    const game = await board().build();
    await game.p1.cast("fox", { targets: ["squire"] });
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.pick("ga2");
    await game.settle();

    expect(game.zoneOf("ga2")).toBe("trash");
    expect(game.zoneOf("ga1")).toBe("base");
    expect(game.state("squire").attachments).toEqual(["ga1"]);
    expect(game.zoneOf("squire")).toBe("base");
  });

  test("control — with a single Guardian Angel nothing is asked and that one is destroyed", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Squire" }, "squire")
      .gear(P1, GUARDIAN_ANGEL, "ga1", { attachedTo: "squire" })
      .hand(P1, FOX_FIRE, "fox")
      .build();

    await game.p1.cast("fox", { targets: ["squire"] });
    await game.settle();
    expect(game.zoneOf("ga1")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.state("squire").isExhausted).toBe(true);
  });
});
