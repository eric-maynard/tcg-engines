/**
 * Ruling 9d5ee877b360cff6 — (no specific card) starting a new chain after the opening combat chain.
 *   Exercised with Ride the Wind (OGN-173 → ogn-173-298, [Action]) and a [Reaction] sting.
 *
 * Q: After the chain created by the "when I attack" effects has resolved, can players start a NEW chain
 *    with Action cards?
 * A: Yes. Once the opening chain empties, the showdown is back in an Open State: the attacker (who has
 *    Focus) may play an Action to start a fresh chain, and the opponent may answer it. An Action card
 *    can only START a chain, never be added to a chain already up — that is what [Reaction] is for.
 * Rules: 806.1.c.1 ([Action] = playable during showdowns), 813.1.c.1 ([Reaction] = playable in Closed
 *        States), 342 (a chain closes when it empties; Focus resumes), 464.2.d (the attacker has Focus).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const RIDE_THE_WIND = "ogn-173-298";

/** "When I attack, draw 1." */
const HERALD = {
  abilities: [{ effect: { amount: 1, type: "draw" }, trigger: { event: "attack", on: "self" }, type: "triggered" }],
  cardType: "unit",
  might: 3,
  name: "Test Herald",
  rulesText: "When I attack, draw 1.",
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

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { chaos: 1 } })
    .resources(P2, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 9, name: "Wall" }, "wall")
    .unit(P1, "base", HERALD, "herald")
    .unit(P1, "base", { might: 2, name: "Spare" }, "spare")
    .hand(P1, RIDE_THE_WIND, "ride")
    .hand(P2, STING, "sting");
}

describe("Ruling 9d5ee877b360cff6 — after the opening chain empties, a fresh chain may be started with Actions", () => {
  test("while the opening attack chain is up, the [Action] is NOT playable — an Action can only start a chain", async () => {
    const game = await board().build();
    await game.p1.move("herald", "bf1");
    expect(game.chain().map((c) => c.cardId)).toEqual(["herald"]);
    expect(game.p1.can("cast", "ride")).toBe(false); // a Closed State needs [Reaction]
    expect(game.p2.can("cast", "sting")).toBe(false); // …and it is P1's priority first (337.4)
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sting")).toBe(true); // the [Reaction] CAN be added to the live chain
    expect(game.violations()).toEqual([]);
  });

  test("once the opening chain has fully resolved, the attacker holds Focus and may start a new chain with the [Action]", async () => {
    const game = await board().build();
    const before = game.p1.hand().length;
    await game.p1.move("herald", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority(); // the attack trigger resolves
    expect(game.chain()).toEqual([]);
    expect(game.p1.hand().length).toBe(before + 1);
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("cast", "ride")).toBe(true);
    await game.p1.cast("ride", { targets: "spare", answers: ["bf1"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
    expect(game.violations()).toEqual([]);
  });

  test("the opponent may then answer that new chain with a [Reaction], and it resolves first", async () => {
    const game = await board().build();
    await game.p1.move("herald", "bf1");
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.cast("ride", { targets: "spare", answers: ["bf1"] });
    await game.p1.passPriority();
    expect(game.p2.can("cast", "sting")).toBe(true);
    await game.p2.cast("sting", { targets: "herald" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ride", "sting"]);
    await game.p2.passPriority();
    await game.p1.passPriority();
    expect(game.state("herald").damage).toBe(1);
    expect(game.chain().map((c) => c.cardId)).toEqual(["ride"]);
    expect(game.violations()).toEqual([]);
  });
});
