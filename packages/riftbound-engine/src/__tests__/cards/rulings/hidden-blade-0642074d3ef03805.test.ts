/**
 * Ruling 0642074d3ef03805 — Hidden Blade (OGN-213 → ogn-213-298)
 *   "[Hidden] [Action] Kill a unit at a battlefield. Its controller draws 2."
 *   × Fight or Flight (OGN-168 → ogn-168-298) "[Hidden] [Action] Move a unit from a battlefield to its base."
 *
 * Q: How do Hidden Blade and Fight or Flight interact?
 * A: If the opponent answers Hidden Blade with Fight or Flight (played from face down, so at Reaction
 *    speed) moving the targeted unit to base, Fight or Flight resolves first; when Hidden Blade resolves its
 *    target is no longer "at a battlefield" → illegal → no kill, and since the target is invalid its
 *    controller cannot be referenced → nobody draws.
 * Rules: 811 (a hidden card is played later as a Reaction for 0), 336–337 (LIFO), 359.3.e.2 / 359.3.e.5 /
 *        359.3.e.14.a (illegal target ⇒ the kill and the linked draw are both ignored).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const HIDDEN_BLADE = "ogn-213-298";
const FIGHT_OR_FLIGHT = "ogn-168-298";

/**
 * P1's turn 3. P2 holds bf1 with Victim (3) and hid Fight or Flight there on an earlier turn. P1 has Hidden
 * Blade in hand with exactly [2][order]. P2 has no resources at all (the hidden play costs 0).
 */
function board() {
  return scenario()
    .turn(3)
    .active(P1)
    .resources(P1, { energy: 2, power: { order: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Victim" }, "victim")
    .facedown(P2, "bf1", FIGHT_OR_FLIGHT, "fof")
    .hand(P1, HIDDEN_BLADE, "blade");
}

async function bladeCast(): Promise<Game> {
  const game = await board().build();
  await game.p1.cast("blade", { targets: "victim" });
  expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 0 } });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blade", controller: P1 })]);
  await game.p1.passPriority();
  expect(game.actingSeat()).toBe(P2);
  return game;
}

describe("Ruling 0642074d3ef03805 — Fight or Flight (from hidden) blanks Hidden Blade: no kill, no draw", () => {
  test("control (no response): the Victim is killed and its controller P2 draws 2", async () => {
    const game = await bladeCast();
    const p2Hand = game.p2.hand().length;
    await game.settle();
    expect(game.zoneOf("victim")).toBe("trash");
    expect(game.p2.hand()).toHaveLength(p2Hand + 2);
    expect(game.zoneOf("blade")).toBe("trash");
  });

  test("step 2–3: with Hidden Blade on the chain P2 may play the hidden Fight or Flight for 0 in response; it sits on top and resolves first, moving the Victim to P2's base while the Blade is still pending", async () => {
    const game = await bladeCast();
    expect(game.p2.can("reveal", "fof")).toBe(true);
    await game.p2.reveal("fof", { answers: ["victim"] });
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade", "fof"]);
    await game.p2.passPriority();
    await game.p1.passPriority(); // Fight or Flight resolves (LIFO)
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.state("victim")).toMatchObject({ controller: P2, location: "base" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["blade"]);
  });

  test("ruling 0642074d3ef03805 — step 4–5: Hidden Blade then finds its target no longer at a battlefield: the Victim is NOT killed and NOBODY draws", async () => {
    const game = await bladeCast();
    await game.p2.reveal("fof", { answers: ["victim"] });
    const p1Hand = game.p1.hand().length;
    const p2Hand = game.p2.hand().length;
    const p1Deck = game.p1.deck().length;
    const p2Deck = game.p2.deck().length;
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("victim")).toBe("base");
    expect(game.p2.trash()).not.toContain("victim");
    expect(game.p2.units("base")).toEqual(["victim"]);
    expect(game.p1.hand()).toHaveLength(p1Hand);
    expect(game.p2.hand()).toHaveLength(p2Hand);
    expect(game.p1.deck()).toHaveLength(p1Deck);
    expect(game.p2.deck()).toHaveLength(p2Deck);
    expect(game.zoneOf("blade")).toBe("trash");
    expect(game.zoneOf("fof")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });
});
