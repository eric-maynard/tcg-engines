/**
 * Ruling 8f62024114a92b71 — Discipline (OGN-058 → ogn-058-298, Reaction [2]: "Give a unit +2 [Might] this turn. Draw 1.")
 *   × Guardian Angel (SFD-051 → sfd-051-221, Equipment +1: "If I would die, kill Guardian Angel instead. Heal me,
 *   exhaust me, and recall me.")
 *
 * Q: My unit got +2 from Discipline, then was killed but saved by Guardian Angel. Does it keep the +2?
 * A: Yes. Guardian Angel is a replacement effect: the unit never dies or leaves the board (battlefield → base only), so
 *    it keeps buffs / "this turn" modifiers; its damage is healed and it is exhausted as part of the save.
 * Rules: 369–373 (replacement of "would die"), 364 (turn-duration effects persist while on the board), 454 (recall).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DISCIPLINE = "ogn-058-298";
const GUARDIAN_ANGEL = "sfd-051-221";
const CHALLENGE = "ogn-128-298"; // "Choose a friendly unit and an enemy unit. They deal damage equal to their Mights to each other."

/** P1's turn. Squire (2) at P1's bf1 wearing Guardian Angel (+1 = 3); P2's Brute (6) in base; P1 holds Discipline + Challenge with [4][body]. */
function board() {
  return scenario()
    .resources(P1, { energy: 4, power: { body: 1 } })
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", { might: 2, name: "Squire" }, "squire", { equippedWith: ["ga"] })
    .card("ga", { def: GUARDIAN_ANGEL, meta: { attachedTo: "squire" }, owner: P1, zone: "bf1" })
    .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, CHALLENGE, "challenge");
}

describe("Ruling 8f62024114a92b71 — a unit saved by Guardian Angel keeps Discipline's +2", () => {
  test("premise: Squire wears Guardian Angel (2 + 1 = 3); Discipline makes it 5 this turn and draws 1", async () => {
    const game = await board().build();
    expect(game.state("ga").attachedTo).toBe("squire");
    expect(game.state("squire").might).toBe(3);
    const hand = game.p1.hand().length;
    await game.p1.cast("disc", { targets: "squire" });
    await game.settle();
    expect(game.state("squire")).toMatchObject({ might: 5, mightModifier: 2 });
    expect(game.p1.hand().length).toBe(hand - 1 + 1);
  });

  test("Squire (5) then takes 6 from Challenge and WOULD die: Guardian Angel is killed instead; Squire is healed, exhausted, recalled to base — and still has the +2 (2 + 2 = 4) for the rest of the turn", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "squire" });
    await game.settle();
    await game.p1.cast("challenge", { targets: ["squire", "brute"] });
    await game.settle();
    expect(game.zoneOf("challenge")).toBe("trash");
    expect(game.state("brute").damage).toBe(5); // Squire hit for its full 5
    // the save
    expect(game.zoneOf("ga")).toBe("trash");
    expect(game.zoneOf("squire")).toBe("base"); // never went to the trash
    expect(game.p1.trash()).not.toContain("squire");
    expect(game.state("squire")).toMatchObject({ damage: 0, isExhausted: true, location: "base" });
    // the point of the ruling: the turn-scoped +2 survived the zone change (GA's +1 is gone with the gear)
    expect(game.state("squire")).toMatchObject({ attachments: [], might: 4, mightModifier: 2 });
    // and it is still a "this turn" effect
    await game.advanceTurn();
    expect(game.state("squire")).toMatchObject({ might: 2, mightModifier: 0 });
    expect(game.violations()).toEqual([]);
  });
});
