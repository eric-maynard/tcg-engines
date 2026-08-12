/**
 * Ruling 47e4f15bfd9780eb — Brynhir Thundersong (OGN-026 → ogn-026-298)
 *   "When you play me, opponents can't play cards this turn."
 *   × Teemo, Strategist (OGN-121 → ogn-121-298) hidden at the opponent's battlefield.
 *
 * Q: Does Brynhir's ability go on the chain, and can Reactions be played in response before it resolves?
 * A: Yes — the "when you play me" trigger is a chain item like any other and opponents may answer it,
 *    including by playing a hidden card. Once it RESOLVES they are shut off: nothing can be played
 *    for the rest of the turn, hidden cards included (flipping one is playing it).
 * Rules: 383 (triggered ability → chain item), 336/358.3 (priority windows), 811.1.c.3 (playing from
 *        hidden IS playing a card), 419.2 (a play restriction is checked when the play is attempted).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BRYNHIR = "ogn-026-298"; // 6 Energy
const TEEMO = "ogn-121-298";

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

/** P1 holds Brynhir; P2 holds bf1 with a Guard, a hidden Teemo and a Reaction in hand. */
function board() {
  return scenario()
    .resources(P1, { energy: 6 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 4, name: "Guard" }, "guard")
    .facedown(P2, "bf1", TEEMO, "hidden")
    .hand(P1, BRYNHIR, "bryn")
    .hand(P1, STING, "p1sting")
    .hand(P2, STING, "sting");
}

/** Play Brynhir and stop with its trigger unresolved, P2 holding priority. */
async function triggerOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("bryn");
  expect(game.chain()).toEqual([
    expect.objectContaining({ cardId: "bryn", controller: P1, triggered: true }),
  ]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  return game;
}

describe("Ruling 47e4f15bfd9780eb — Brynhir's trigger is answerable; once it resolves opponents are locked out", () => {
  test("the trigger sits on the chain and P2 may answer it with a Reaction", async () => {
    const game = await triggerOnChain();
    expect(game.p2.can("cast", "sting")).toBe(true);
    await game.p2.cast("sting", { targets: "guard" });
    expect(game.chain().map((i) => i.cardId)).toEqual(["bryn", "sting"]);
    await game.settle();
    expect(game.state("guard").damage).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("a hidden card may still be played in response to the trigger, before it resolves", async () => {
    const game = await triggerOnChain();
    expect(game.p2.can("revealHidden", "hidden")).toBe(true);
    await game.p2.reveal("hidden");
    expect(game.locationOf("hidden")).toBe("bf1");
    await game.settle();
    expect(game.violations()).toEqual([]);
  });

  test("after the trigger RESOLVES, P2 can play nothing for the rest of the turn — not even with priority on a fresh chain", async () => {
    const game = await triggerOnChain();
    await game.p2.passPriority(); // let the trigger resolve
    expect(game.chain()).toEqual([]);
    // Give P2 a real priority window: P1 starts a new chain and passes.
    await game.p1.cast("p1sting", { targets: "guard" });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.can("cast", "sting")).toBe(false);
    const denied = await game.p2.try((p) => p.cast("sting", { targets: "guard" }));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("sting")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("the lock-out covers hidden cards too: flipping one is playing it", async () => {
    const game = await triggerOnChain();
    await game.p2.passPriority();
    await game.p1.cast("p1sting", { targets: "guard" });
    await game.p1.passPriority();
    expect(game.p2.can("revealHidden", "hidden")).toBe(false);
    const denied = await game.p2.try((p) => p.reveal("hidden"));
    expect(denied.ok).toBe(false);
    expect(game.zoneOf("hidden")).toBe("facedown-bf1");
  });

  test("the restriction is only for THIS turn — P2 may play again on the next turn", async () => {
    const game = await triggerOnChain();
    await game.p2.passPriority();
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p2.can("cast", "sting")).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
