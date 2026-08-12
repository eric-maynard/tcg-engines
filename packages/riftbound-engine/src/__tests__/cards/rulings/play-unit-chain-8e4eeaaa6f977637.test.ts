/**
 * Ruling 8e4eeaaa6f977637 — (no specific card) does playing a unit start a chain?
 *   Exercised with inline "Test Grunt" (vanilla 3 Might) and "Test Scryer"
 *   (3 Might, "When you play me, draw 1.") plus a [Reaction] "Deal 1 to a unit."
 *
 * Q: Does playing a unit start a chain?
 * A: Technically yes — the unit is put on the chain and Finalized — but it never LINGERS there:
 *    a permanent skips the pass/resolve steps and enters the board immediately at Finalization,
 *    so nobody ever gets priority to react to the unit being played. What IS reactable is a
 *    "when you play me" triggered ability, which is added to the chain after the unit has entered.
 * Rules: 332 / 359 (playing a card creates a chain item), 333.1.c / 376.4.a (permanents are
 *        removed from the chain at Finalization and resolve at once), 383 (play triggers become
 *        their own chain items, which players may answer).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const GRUNT = { cardType: "unit", domain: "fury", energyCost: 1, might: 3, name: "Test Grunt" } as const;

/** 3 Might · "When you play me, draw 1." */
const SCRYER = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" }],
  cardType: "unit",
  domain: "mind",
  energyCost: 1,
  might: 3,
  name: "Test Scryer",
  rulesText: "When you play me, draw 1.",
} as const;

/** [Reaction] "Deal 1 to a unit." */
const STING = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Sting",
  rulesText: "[Reaction] Deal 1 to a unit.",
  timing: "reaction",
} as const;

/** P1's turn, P1 can afford either unit; P2 sits on a reaction and a target of their own. */
const board = () =>
  scenario()
    .resources(P1, { energy: 4, power: { fury: 2, mind: 2 } })
    .unit(P2, "base", { might: 4, name: "Bystander" }, "bystander")
    .hand(P2, STING, "sting");

describe("Ruling 8e4eeaaa6f977637 — a unit's chain item is Finalized and gone in the same breath", () => {
  test("a vanilla unit played to base is on the board immediately and leaves NOTHING on the chain", async () => {
    const game = await board().hand(P1, GRUNT, "grunt").build();
    await game.p1.play("grunt");
    expect(game.zoneOf("grunt")).toBe("base");
    expect(game.chain()).toEqual([]); // Finalized and removed in one step
    expect(game.state("grunt").isExhausted).toBe(true); // it entered, it did not wait to resolve
  });

  test("no priority is handed over for the play itself — the turn player is still the one acting", async () => {
    const game = await board().hand(P1, GRUNT, "grunt").build();
    await game.p1.play("grunt");
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", seat: P1 });
    expect(game.p2.can("cast", "sting")).toBe(false); // P2 never gets a window on the unit play
  });

  test("a 'when you play me' trigger DOES linger: it is a separate, reactable chain item added after the unit entered", async () => {
    const game = await board().hand(P1, SCRYER, "scryer").build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("scryer");
    expect(game.zoneOf("scryer")).toBe("base"); // the unit is already on the board…
    expect(game.chain().map((i) => i.cardId)).toEqual(["scryer"]); // …and only its trigger is on the chain
    expect(game.chain()[0]).toMatchObject({ triggered: true });
    expect(game.p1.hand().length).toBe(handBefore - 1); // played, not yet drawn
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "sting")).toBe(true); // the trigger is answerable
  });

  test("answering that trigger is LIFO and does not undo the unit's arrival", async () => {
    const game = await board().hand(P1, SCRYER, "scryer").build();
    const handBefore = game.p1.hand().length;
    await game.p1.play("scryer");
    await game.p1.passPriority();
    await game.p2.cast("sting", { targets: "scryer" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["scryer", "sting"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("scryer").damage).toBe(1); // the reaction resolved first
    expect(game.p1.hand().length).toBe(handBefore - 1); // the play trigger still pending
    await game.settle();
    expect(game.p1.hand().length).toBe(handBefore); // -1 played, +1 drawn
    expect(game.zoneOf("scryer")).toBe("base");
    expect(game.violations()).toEqual([]);
  });
});
