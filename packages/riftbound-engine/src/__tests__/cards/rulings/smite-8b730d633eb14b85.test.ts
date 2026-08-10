/**
 * Ruling 8b730d633eb14b85 — Smite (UNL-007 → unl-007-219) · Action · Fury · 2+[fury]
 *     "Deal 3 to a unit at a battlefield. If it would die this turn, banish it instead."
 *   × Guardian Angel (SFD-051 → sfd-051-221) · Equipment · +1 "If I would die, kill Guardian Angel instead. Heal me,
 *     exhaust me, and recall me."
 *
 * Q: Does Smite's "banish it instead" override Guardian Angel?
 * A: Not automatically. Both are replacement effects on the same "would die" event, so the CONTROLLER of the unit chooses
 *    the order (372). GA first → GA is killed, the unit is healed/exhausted/recalled and never dies, so Smite's banish has
 *    nothing left to replace. Smite first → the unit is banished and GA's effect does not apply.
 * Rules: 372 (multiple replacement effects → affected object's controller orders them), 366–371 (replacement effects),
 *        719.5 (attachments detach when the bearer leaves the board).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const SMITE = "unl-007-219";
const GUARDIAN_ANGEL = "sfd-051-221";

/** P1's turn with exactly 2+[fury] and Smite. P2 holds bf1 with a 2-Might Squire wearing Guardian Angel (→ 3): Smite's 3 is lethal. */
function board() {
  return scenario()
    .resources(P1, { energy: 2, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Squire" }, "squire", { equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "squire" }, owner: P2, zone: "bf1" })
    .hand(P1, SMITE, "smite");
}

/** Smite the Squire and let it resolve up to the replacement-ordering choice. */
async function smiteUntilOrderChoice(): Promise<Game> {
  const game = await board().build();
  expect(game.state("squire")).toMatchObject({ attachments: ["ga"], might: 3 });
  await game.p1.cast("smite", { targets: "squire" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game;
}

describe("Ruling 8b730d633eb14b85 — Smite vs Guardian Angel: the unit's controller orders the two 'would die' replacements", () => {
  test("when Smite's 3 would kill the GA-wearing Squire, the engine asks the Squire's CONTROLLER (P2) to order the two replacement effects — both Smite and Guardian Angel are listed; nothing has happened to the Squire yet", async () => {
    const game = await smiteUntilOrderChoice();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P2, semantics: "replacement-order" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["ga", "smite"]);
    expect(game.zoneOf("squire")).toBe("battlefield-bf1");
    expect(game.p1.decision()?.kind === "pick").toBe(false); // not the Smite player's call
  });

  test("P2 applies Guardian Angel FIRST: GA is killed instead, the Squire is healed, exhausted and recalled to P2's base — it never died, so Smite's 'banish instead' never happens (Squire NOT in banishment)", async () => {
    const game = await smiteUntilOrderChoice();
    await game.p2.pick("ga");
    await game.settle();
    expect(game.zoneOf("smite")).toBe("trash");
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.p2.trash()).toContain("ga");
    expect(game.zoneOf("squire")).toBe("base");
    expect(game.state("squire")).toMatchObject({ attachments: [], controller: P2, damage: 0, isExhausted: true, might: 2 });
    expect(game.p2.banishment()).not.toContain("squire");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("P2 applies Smite FIRST: the Squire is banished instead of dying; Guardian Angel's save does not apply (GA is not 'killed instead' — it just detaches, and the Squire is not in any base)", async () => {
    const game = await smiteUntilOrderChoice();
    await game.p2.pick("smite");
    await game.settle();
    expect(game.zoneOf("smite")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("banishment");
    expect(game.p2.banishment()).toContain("squire");
    expect(game.p2.trash()).not.toContain("squire"); // banished, not dead
    expect(game.p2.base()).not.toContain("squire"); // not recalled
    expect(game.state("ga").attachedTo).toBeUndefined();
    expect(game.zoneOf("ga")).not.toBe("battlefield-bf1");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: Smite on a GA-less 3-Might unit simply banishes it (no ordering question is asked)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Bare" }, "bare")
      .hand(P1, SMITE, "smite")
      .build();
    await game.p1.cast("smite", { targets: "bare" });
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind === "pick").toBe(false);
    await game.settle();
    expect(game.zoneOf("bare")).toBe("banishment");
  });
});
