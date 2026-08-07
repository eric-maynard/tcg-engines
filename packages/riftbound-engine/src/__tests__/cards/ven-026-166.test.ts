/**
 * Field Musicians — ven-026-166 · Unit · Calm · 4 energy · 3 Might
 *
 *   When you play me, give a unit +3 [Might] this turn.
 *
 * Head-judge checklist for this card:
 *   1. "a unit" is unrestricted: friendly, enemy, at any location, or the Musicians themselves; if
 *      they are the ONLY unit on the board the trigger must still resolve (onto themselves), not stall.
 *   2. It is a play trigger (rule 383 "When you play me"): it goes on the chain as a triggered item
 *      after the unit is finalized; other units being played never re-trigger it.
 *   3. The +3 is a turn-scoped Might modification (not a buff counter) and expires in the Expiration
 *      Step (317.2.c) — across game.advanceTurn() it is gone.
 *   4. Practical line: Musicians enter exhausted, so the +3 usually goes on a READY ally that then
 *      attacks — 2+3 = 5 beats a 4-Might defender it would otherwise lose to.
 *   5. Played directly to a controlled battlefield the trigger works the same and may still pick a
 *      unit anywhere (no Hidden-style "here" restriction applies to a normal play).
 *   6. Cost: exactly 4 energy, no power.
 */

import { describe, expect, test } from "bun:test";
import type { Game, PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-026-166";

function board() {
  return scenario()
    .resources(P1, { energy: 4 })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Drummer" }, "ally")
    .unit(P2, "bf1", { might: 4, name: "Sentinel" }, "foe")
    .hand(P1, CARD, "fm");
}

/** Play the Musicians, drive the trigger to its prompt, pick `target`, resolve. */
async function playAndBoost(game: Game, target: string, to = "base"): Promise<void> {
  await game.p1.play("fm", { to });
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "fm", controller: P1, triggered: true })]);
  const r = await game.settle();
  expect(r.reason).toBe("unanswered");
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1, source: { cardId: "fm" } });
  await game.p1.pick(target);
  await game.settle();
}

describe("Field Musicians (ven-026-166)", () => {
  test("registry payload: a single play-self trigger giving a unit +3 Might for the turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 4, might: 3 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: { amount: 3, duration: "turn", target: { type: "unit" }, type: "modify-might" },
      trigger: { event: "play-self" },
      type: "triggered",
    });
  });

  test("cost: 4 energy deducted, enters the base exhausted as a 3-Might unit; 3 energy is not enough", async () => {
    const game = await board().build();
    await game.p1.play("fm");
    expect(game.p1.energy()).toBe(0);
    expect(game.zoneOf("fm")).toBe("base");
    expect(game.state("fm")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3 });
    const poor = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "fm").build();
    expect(poor.p1.can("play", "fm")).toBe(false);
  });

  test("the trigger offers every unit on the board — ally in base, enemy at a battlefield, and the Musicians themselves", async () => {
    const game = await board().build();
    await game.p1.play("fm");
    await game.settle();
    const d = game.decision() as PickDecision;
    expect(d.kind).toBe("pick");
    expect(d.options.map((o) => o.key).sort()).toEqual(["ally", "fm", "foe"]);
    expect(d.max).toBe(1);
  });

  test("gives the chosen friendly unit +3 Might (2 → 5) and nothing to anyone else; it is a modifier, not a buff", async () => {
    const game = await board().build();
    await playAndBoost(game, "ally");
    expect(game.state("ally").might).toBe(5);
    expect(game.state("ally").isBuffed).toBe(false);
    expect(game.state("foe").might).toBe(4);
    expect(game.state("fm").might).toBe(3);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("may target an enemy unit (4 → 7) or the Musicians themselves (3 → 6)", async () => {
    const enemy = await board().build();
    await playAndBoost(enemy, "foe");
    expect(enemy.state("foe").might).toBe(7);
    const self = await board().build();
    await playAndBoost(self, "fm");
    expect(self.state("fm").might).toBe(6);
    expect(self.state("ally").might).toBe(2);
  });

  test("only unit on the board: the mandatory target is the Musicians themselves — resolves to 6 Might without stalling", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "fm").build();
    await game.p1.play("fm");
    await game.settle(); // forced single option is taken by settle
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("fm").might).toBe(6);
    expect(game.chain()).toEqual([]);
  });

  test("'this turn': the +3 is gone once the turn ends (317.2.c)", async () => {
    const game = await board().build();
    await playAndBoost(game, "ally");
    expect(game.state("ally").might).toBe(5);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ally").might).toBe(2);
    expect(game.state("ally").mightModifier).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("multi-step: boost a ready 2-Might ally, which then attacks the 4-Might defender as 5 and conquers", async () => {
    const game = await board().build();
    await playAndBoost(game, "ally");
    await game.p1.move("ally", "bf1");
    expect(game.state("ally").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    // The exhausted Musicians could not have made that attack themselves.
    expect(game.state("fm").isExhausted).toBe(true);
  });

  test("negative space: without the boost the same 2-Might ally dies to the 4-Might defender", async () => {
    const game = await board().build();
    await game.p1.move("ally", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("'When you play ME': Musicians already on the board do not trigger when another unit is played", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", CARD, "fm")
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, { energyCost: 2, might: 2, name: "Two Drop" }, "drop")
      .build();
    await game.p1.play("drop");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action" });
    expect(game.state("ally").might).toBe(2);
    expect(game.state("drop").might).toBe(2);
    expect(game.state("fm").might).toBe(3);
  });

  test("played straight to a battlefield you control: still triggers and may pick a unit at another location", async () => {
    const game = await board().battlefield("bf2", { controller: P1 }).build();
    await playAndBoost(game, "foe", "bf2");
    expect(game.locationOf("fm")).toBe("bf2");
    expect(game.state("foe").might).toBe(7);
  });

  test("the opponent gets priority while the trigger is on the chain (it is a chain item, not an instantaneous effect)", async () => {
    const game = await board().build();
    await game.p1.play("fm");
    await game.p1.pick("ally"); // rule 402 (finalization): the target is chosen before anyone gets priority
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.state("ally").might).toBe(2); // nothing applied before resolution
    await game.p2.passPriority();
    expect(game.state("ally").might).toBe(5);
  });
});
