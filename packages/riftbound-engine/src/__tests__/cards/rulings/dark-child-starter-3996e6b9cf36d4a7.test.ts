/**
 * Ruling 3996e6b9cf36d4a7 — Dark Child - Starter (OGS-017 → ogs-017-024) · Legend (Annie)
 *   "At the end of your turn, ready up to 2 runes."
 *   × Cleave (OGN-004 → ogn-004-298) · [Action] · × Discipline (OGN-058 → ogn-058-298) · [Reaction]
 *
 * Q: Can the Annie player play an action card after her end-of-turn legend ability readies her runes?
 * A: No. Actions may only be played with an empty chain during your Action phase or in a showdown, and this
 *    trigger happens in the ending step. Reactions CAN be played in response to the ability while it is on the
 *    chain; once it resolves there is no priority window at all — the turn simply proceeds.
 * Rules: 419.2 ([Action] timing), 419.3 ([Reaction] timing), 317 (Ending Phase steps), 340 (chain / priority).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ANNIE = "ogs-017-024";
const CLEAVE = "ogn-004-298";
const DISCIPLINE = "ogn-058-298";

/** P1's turn. Annie is P1's legend, three exhausted Fury runes, an Action and a Reaction in hand, [3] banked. */
function board() {
  return scenario()
    .legend(P1, ANNIE, "annie")
    .rune(P1, "fury", { alias: "r1", exhausted: true })
    .rune(P1, "fury", { alias: "r2", exhausted: true })
    .rune(P1, "fury", { alias: "r3", exhausted: true })
    .resources(P1, { energy: 3 })
    .unit(P1, "base", { might: 2, name: "Squire" }, "squire")
    .hand(P1, CLEAVE, "cleave")
    .hand(P1, DISCIPLINE, "disc");
}

/** End P1's turn; Annie's trigger is queued and asks which up-to-2 runes to ready, then sits on the chain. */
async function annieOnChain(): Promise<Game> {
  const game = await board().build();
  await game.p1.endTurn();
  expect(game.phase()).toBe("ending");
  expect(game.chain().map((c) => c.cardId)).toEqual(["annie"]);
  expect(game.decision()).toMatchObject({ kind: "pick", max: 2, min: 0, seat: P1 });
  await game.p1.pick("r1", "r2");
  return game;
}

describe("Ruling 3996e6b9cf36d4a7 — Annie's end-of-turn ability leaves no window for an Action", () => {
  test("the ability triggers in the ending step and the runes to ready are chosen by P1", async () => {
    const game = await annieOnChain();
    expect(game.chain().map((c) => c.cardId)).toEqual(["annie"]);
    expect(game.state("r1").isReady).toBe(false); // nothing has resolved yet
  });

  test("ruling nuance: a [Reaction] MAY be played in response to the ability — an [Action] may not", async () => {
    const game = await annieOnChain();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("cast", "disc")).toBe(true); // Discipline is a [Reaction]
    expect(game.p1.can("cast", "cleave")).toBe(false); // Cleave is an [Action] — wrong phase
    expect((await game.p1.try((p) => p.cast("cleave", { targets: "squire" }))).ok).toBe(false);
  });

  test("ruling: once the ability resolves there is NO priority window — the chosen runes are ready and the turn passes to P2", async () => {
    const game = await annieOnChain();
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.chain()).toEqual([]);
    expect(game.state("r1").isReady).toBe(true);
    expect(game.state("r2").isReady).toBe(true);
    expect(game.state("r3").isReady).toBe(false); // only up to 2
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.legal()).toEqual([]); // P1 never gets another window in their own ending phase
    expect(game.zoneOf("cleave")).toBe("hand");
    expect(game.violations()).toEqual([]);
  });

  test("… and P1's own Action is still stuck in hand on P2's turn", async () => {
    const game = await annieOnChain();
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("cast", "cleave")).toBe(false);
    expect(game.violations()).toEqual([]);
  });
});
