/**
 * Ruling 9397d3836aa1c5ce — Defy (OGN-045 → ogn-045-298) × Battering Ram (SFD-012 → sfd-012-221)
 *
 *   Defy — Reaction [1]+[calm]: "Counter a spell that costs no more than [4] and no more than [rainbow]."
 *   Battering Ram — Unit · Fury · 5 · 5 Might: "I cost [1] less for each card you've played this turn, to a minimum of [1]."
 *
 * Q: Does a spell that got Defied count towards Battering Ram's cost reduction?
 * A (riftjudge): No — a countered card is not considered played (425.1.b), so no discount.
 *   NOTE — RULING-CONFLICT: CR 419.4.b states the opposite using Battering Ram as its own example (a Defied spell was
 *   Finalized, so Ram costs [4]); 425.1.b / 419.4.a.1 only concern abilities that TRIGGER on playing. The engine and the
 *   rest of this suite follow the CR; see the comment on the last tests.
 * Rules: 419.4.a.1, 419.4.b, 425.1.b, 350.1.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const DEFY = "ogn-045-298";
const BATTERING_RAM = "sfd-012-221";
/** A cheap Defy-able [Action] spell. */
const CANTRIP = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Cantrip",
  timing: "action",
} as const;

/** P1's turn: Cantrip + Battering Ram in hand, exactly 1 + 5 energy. P2: Defy with [1][calm]. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .resources(P2, { energy: 1, power: { calm: 1 } })
    .hand(P1, CANTRIP, "cantrip")
    .hand(P1, BATTERING_RAM, "ram")
    .hand(P2, DEFY, "defy");
}

describe("Ruling 9397d3836aa1c5ce — does a Defied spell count for Battering Ram? (riftjudge: no · CR 419.4.b: yes)", () => {
  test("control: Cantrip resolves → 1 card played this turn → Battering Ram costs 4 (5 − 1)", async () => {
    const game = await board().build();
    await game.p1.cast("cantrip");
    await game.settle();
    expect(game.zoneOf("cantrip")).toBe("trash");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.p1.energy()).toBe(5);
    await game.p1.play("ram");
    await game.settle();
    expect(game.zoneOf("ram")).toBe("base");
    expect(game.p1.energy()).toBe(1); // paid 4
  });

  test("Cantrip is Defied: it goes to the trash countered, P1 drew nothing, its [1] is not refunded", async () => {
    const game = await board().build();
    const hand = game.p1.hand().length;
    await game.p1.cast("cantrip");
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cantrip" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("cantrip")).toBe("trash");
    expect(game.zoneOf("defy")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand - 1); // cast, no draw
    expect(game.p1.energy()).toBe(5);
  });

  // RULING-CONFLICT: riftjudge 9397d3836aa1c5ce says the Defied spell gives Battering Ram NO discount (425.1.b: not
  // "played"). But CR 419.4.b is explicit and even names this card: "Non-triggered abilities that check cards being
  // played do so by means of referencing whether said cards have been Finalized. … Example: A player plays a spell,
  // which is countered by Defy. If that player plays Battering Ram and has played no other cards that turn, it will
  // cost [4] Energy." 425.1.b governs abilities that TRIGGER on playing (419.4.a.1). The engine follows the CR (also
  // asserted by interactions/legion-active-after-countered-spell and darius-trifarian-5807cc9df8627167), so the CR
  // outcome is asserted here and the riftjudge answer is recorded as superseded.
  test("CR 419.4.b (supersedes the riftjudge answer): the Defied Cantrip was FINALIZED, so it still counts — Battering Ram costs [4] (5 → 1 energy)", async () => {
    const game = await board().build();
    await game.p1.cast("cantrip");
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cantrip" });
    await game.settle();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(1); // finalized-count, not resolved-count
    expect(game.p1.energy()).toBe(5);
    expect(game.p1.can("play", "ram")).toBe(true);
    await game.p1.play("ram");
    await game.settle();
    expect(game.zoneOf("ram")).toBe("base");
    expect(game.p1.energy()).toBe(1); // paid 4

    const short = await board().resources(P1, { energy: 5 }).build(); // 1 for Cantrip leaves exactly 4
    await short.p1.cast("cantrip");
    await short.p1.passPriority();
    await short.p2.cast("defy", { targets: "cantrip" });
    await short.settle();
    expect(short.p1.energy()).toBe(4);
    expect(short.p1.can("play", "ram")).toBe(true);
  });

  test("…whereas abilities that TRIGGER on playing (419.4.a.1 / 425.1.b) do not see the countered spell: a 'when you play a spell' unit stays untriggered", async () => {
    const game = await board().unit(P1, "base", "ogn-103-298", "student").build(); // Ravenbloom Student: When you play a spell, +1 Might this turn
    await game.p1.cast("cantrip");
    await game.p1.passPriority();
    await game.p2.cast("defy", { targets: "cantrip" });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.state("student")).toMatchObject({ might: 2, mightModifier: 0 });
  });
});
