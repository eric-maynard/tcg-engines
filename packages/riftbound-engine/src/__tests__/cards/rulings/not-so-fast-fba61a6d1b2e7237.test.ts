/**
 * Ruling fba61a6d1b2e7237 — Not So Fast (SFD-045 → sfd-045-221) · Calm Reaction · [2][calm]
 *   "Counter an enemy spell or ability that chooses a friendly unit or gear."
 *   × Blitzcrank, Impassive (OGN-067 → ogn-067-298) · Calm Champion Unit · [5][calm] · 5 Might
 *     "[Tank] When you play me to a battlefield, you may move an enemy unit to here. When I hold, return me to my owner's hand."
 *
 * Q: Can I use Not So Fast to counter Blitzcrank's ability?
 * A: Yes. His "When you play me" trigger chooses a unit you control — a "friendly unit" from your side — so it is an
 *    enemy ability choosing a friendly unit: a legal object for Not So Fast once it is on the chain (Closed state).
 *    Countered, the pull never happens.
 * Rules: 355.9.b / 355.10 (an object the ability chooses is a target; friendly/enemy read from the caster's side),
 *        355.10.c (the move is the effect, not a cost/condition), 425.1 (Counter), 383.3.a/b (trigger finalized → chain).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const NOT_SO_FAST = "sfd-045-221";
const BLITZCRANK = "ogn-067-298";

/**
 * P1's turn: Blitzcrank in hand + [5][calm]; P1 holds bf1 with a 1-Might Holder. P2 holds bf2 with Raider (4), has a
 * Homebody (1) in base, Not So Fast in hand and exactly [2][calm].
 */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 1 } })
    .resources(P2, { energy: 2, power: { calm: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 4, name: "Raider" }, "raider")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "homebody")
    .hand(P1, BLITZCRANK, "blitz")
    .hand(P2, NOT_SO_FAST, "nsf");
}

/** P1 plays Blitzcrank to bf1, accepts the pull choosing the Raider, and passes priority to P2. */
async function pullPendingP2Priority(): Promise<Game> {
  const game = await board().build();
  await game.p1.play("blitz", { to: "bf1" });
  expect(game.zoneOf("blitz")).toBe("battlefield-bf1"); // 1. Blitzcrank is on the battlefield
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", controller: P1, triggered: true, type: "ability" })]); // 2.
  if (game.decision()?.kind !== "yes-no") {
    await game.settle();
  }
  expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1 });
  await game.p1.yes();
  const pick = game.decision();
  expect(pick).toMatchObject({ kind: "pick", seat: P1 });
  expect(pick?.kind === "pick" ? pick.options.map((o) => o.card ?? o.key).sort() : []).toEqual(["homebody", "raider"]);
  await game.p1.pick("raider");
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "blitz", targets: ["raider"], triggered: true })]);
  if (game.actingSeat() === P1) {
    await game.p1.passPriority();
  }
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // 3. Closed state, P2 may react
  return game;
}

describe("Ruling fba61a6d1b2e7237 — Not So Fast can counter Blitzcrank's 'move an enemy unit to here' trigger", () => {
  test("the trigger chose P2's Raider (a friendly unit from P2's side) → Not So Fast offers exactly that enemy ability as its object and is castable", async () => {
    const game = await pullPendingP2Priority();
    const offered = (game.p2.option("cast", "nsf")?.fields.find((f) => f.name === "targets")?.options ?? []).flat();
    expect(offered).toEqual(["blitz"]);
    expect(game.p2.can("cast", "nsf")).toBe(true);
  });

  test("Not So Fast resolves first and COUNTERS the ability: the Raider is never moved, no showdown at bf1, Blitzcrank himself stays (only the ability was countered); P2 paid [2][calm]", async () => {
    const game = await pullPendingP2Priority();
    await game.p2.cast("nsf");
    expect(game.chain().map((c) => [c.cardId, c.targets])).toEqual([
      ["blitz", ["raider"]],
      ["nsf", ["blitz"]],
    ]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    await game.settle();
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("nsf")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.state("raider").combatRole).toBeNull();
    expect(game.zoneOf("blitz")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P1 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("control: unanswered, the trigger resolves and drags the Raider to bf1 as the attacker into Blitzcrank", async () => {
    const game = await pullPendingP2Priority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.locationOf("raider")).toBe("bf1");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("blitz").combatRole).toBe("defender");
  });

  test("contrast: if P1 DECLINES the optional pull there is no ability choosing anything — Not So Fast has no object", async () => {
    const game = await board().build();
    await game.p1.play("blitz", { to: "bf1" });
    if (game.decision()?.kind !== "yes-no") {
      await game.settle();
    }
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    expect(game.p2.can("cast", "nsf")).toBe(false);
  });
});
