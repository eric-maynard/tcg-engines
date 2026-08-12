/**
 * Ruling f641d3d84f119a74 — Orb of Regret (OGN-090 → ogn-090-298) · Gear · [1]
 *   "[Exhaust]: Give a unit -1 [Might] this turn, to a minimum of 1 [Might]."
 *
 * Q: Can I use Orb of Regret's activated ability on my opponent's turn?
 * A: No. The ability carries no [Reaction] (nor [Action]) tag, so it may only be activated on your own turn
 *    while you hold priority in an Open State — never in response to an opponent's play, and never during
 *    their turn.
 * Rules: 401.2 / 402 (an activated ability's timing is its printed tag), 347–348 (priority),
 *        346 (Open State), 320 (untagged abilities are turn-player, empty-chain only).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const ORB_OF_REGRET = "ogn-090-298";
const HEXTECH_RAY = "ogn-009-298"; // [1][fury] Action — Deal 3 to a unit at a battlefield

/** P2's turn. P1 owns a ready Orb of Regret; P2 has a target-worthy Brute at bf1 and a Hextech Ray. */
function opponentsTurn() {
  return scenario()
    .turn(3)
    .active(P2)
    .resources(P1, { energy: 4, power: { rainbow: 2 } })
    .resources(P2, { energy: 1, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
    .unit(P1, "bf2", { might: 3, name: "Squire" }, "squire")
    .gear(P1, ORB_OF_REGRET, "orb")
    .hand(P2, HEXTECH_RAY, "ray");
}

describe("Ruling f641d3d84f119a74 — Orb of Regret's untagged activated ability is usable only on your own turn", () => {
  test("premise: the Orb is ready and P1 could pay for it — it is simply P2's turn", async () => {
    const game = await opponentsTurn().build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("orb").isReady).toBe(true);
    expect(game.state("brute").might).toBe(4);
  });

  test("ruling: on P2's turn with an empty chain, P1 cannot activate it", async () => {
    const game = await opponentsTurn().build();
    expect(game.p1.can("activate", "orb")).toBe(false);
    const attempt = await game.p1.try((p) => p.activate("orb", 0, { targets: "brute" }));
    expect(attempt.ok).toBe(false);
    expect(game.state("orb").isReady).toBe(true);
    expect(game.state("brute").might).toBe(4);
  });

  test("…and not 'in response' either: with P2's Hextech Ray on the chain the Orb is still unavailable", async () => {
    const game = await opponentsTurn().build();
    await game.p2.cast("ray", { targets: "squire" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["ray"]);
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1); // P1 does hold priority here…
    expect(game.p1.can("activate", "orb")).toBe(false); // …but the untagged ability is not a legal option
    const attempt = await game.p1.try((p) => p.activate("orb", 0, { targets: "squire" }));
    expect(attempt.ok).toBe(false);
  });

  test("contrast: on P1's OWN turn in an Open State the very same activation is legal and works", async () => {
    const game = await scenario()
      .turn(4)
      .active(P1)
      .resources(P1, { energy: 4 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "Brute" }, "brute")
      .gear(P1, ORB_OF_REGRET, "orb")
      .build();
    expect(game.p1.can("activate", "orb")).toBe(true);
    await game.p1.activate("orb", 0, { targets: "brute" });
    await game.settle();
    expect(game.state("orb").isExhausted).toBe(true);
    expect(game.state("brute").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });
});
