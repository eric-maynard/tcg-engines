/**
 * Undercover Agent — ogn-178-298 · Unit · Chaos · 5 energy + [chaos] · 5 Might
 *
 *   [Deathknell] — Discard 2, then draw 2. (When I die, get the effect.)
 *
 * Rules: 808 (Deathknell = "When I die, …" trigger), 422.4 (discard as an effect:
 * discard as many as possible, then still draw 2 — this very card is the example),
 * 323.4 (combat deaths are deaths).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-178-298";
const FILLER = "ogn-175-298";
/** Inline vanilla 6-damage spell used to kill the Agent outside combat. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt 6",
  timing: "action",
};

function withHand(n: number) {
  const b = scenario().unit(P1, "base", CARD, "agent").hand(P1, BOLT, "bolt");
  for (let i = 0; i < n; i++) b.hand(P1, FILLER, `h${i}`);
  return b;
}

async function killAgent(game: Awaited<ReturnType<ReturnType<typeof withHand>["build"]>>) {
  await game.p1.cast("bolt", { targets: "agent" });
  await game.p1.passPriority();
  await game.p2.passPriority(); // Bolt resolves → Agent dies → Deathknell on the chain
}

describe("Undercover Agent (ogn-178-298)", () => {
  test("costs 5 energy + 1 chaos; 5-Might unit with Deathknell; unaffordable without the chaos", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { chaos: 1 } }).hand(P1, CARD, "agent").build();
    await game.p1.play("agent");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("agent")).toBe("base");
    expect(game.state("agent").might).toBe(5);
    expect(game.state("agent").keywords).toContain("Deathknell");
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "agent").build();
    expect(noPower.p1.can("play", "agent")).toBe(false);
    const low = await scenario().resources(P1, { energy: 4, power: { chaos: 1 } }).hand(P1, CARD, "agent").build();
    expect(low.p1.can("play", "agent")).toBe(false);
  });

  test("dies to a spell → Deathknell triggers for its controller: discard 2 (exactly 2 in hand), then draw 2", async () => {
    const game = await withHand(2).build();
    const deckBefore = game.p1.deck().length;
    await killAgent(game);
    expect(game.zoneOf("agent")).toBe("trash");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "agent", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.zoneOf("h0")).toBe("trash");
    expect(game.zoneOf("h1")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.deck().length).toBe(deckBefore - 2);
  });

  test("partial discard (422.4): with 1 card in hand, discard it and still draw 2", async () => {
    const game = await withHand(1).build();
    await killAgent(game);
    await game.settle();
    expect(game.zoneOf("h0")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("empty hand (359.3.e.11): the discard is ignored, you still draw 2", async () => {
    const game = await withHand(0).build();
    await killAgent(game);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
  });

  test.failing("BUG: with 3 cards in hand the controller chooses WHICH 2 to discard", async () => {
    // Expected: a pick prompt for P1 (choose 2 of h0/h1/h2); picking h1+h2 keeps h0.
    // Actual: the engine silently discards the first two cards in hand with no choice.
    const game = await withHand(3).build();
    await killAgent(game);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick("h1", "h2");
    await game.settle();
    expect(game.zoneOf("h0")).toBe("hand");
    expect(game.zoneOf("h1")).toBe("trash");
    expect(game.zoneOf("h2")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(3);
  });

  test.failing("BUG: dying in combat also triggers Deathknell (323.4) — discard 2, draw 2", async () => {
    // Expected: the 5-Might Agent attacks a 6-Might defender and dies → Deathknell → h0/h1 discarded, 2 drawn.
    // Actual: combat deaths do not fire the die trigger; the hand is untouched.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "agent")
      .unit(P2, "bf1", { might: 6 }, "wall")
      .hand(P1, FILLER, "h0")
      .hand(P1, FILLER, "h1")
      .build();
    await game.p1.move("agent", "bf1");
    await game.settle();
    expect(game.zoneOf("agent")).toBe("trash");
    expect(game.zoneOf("h0")).toBe("trash");
    expect(game.zoneOf("h1")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(2);
  });
});
