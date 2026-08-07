/**
 * Hungry Wolf — ven-125-166 · Unit · Order · 4 energy · 4 Might
 *
 *   [order]: Ready me and give me +1 [Might] this turn. Use only if you've chosen an enemy unit this
 *   turn and only once each turn.
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Two PLAY RESTRICTIONS on one activated ability (402/377.2.b): (a) "you've chosen an enemy unit
 *     this turn" — a turn-scoped history flag set by ANY of your spells/abilities choosing (targeting)
 *     an enemy unit; choosing a FRIENDLY unit does not set it; it resets when the turn ends — and
 *     (b) "only once each turn". Failing either → the ability is simply not offered.
 *  2. The cost is exactly one [order] power (no energy); it is an ability → goes on the chain; the
 *     ready + pump happen on resolution, and the +1 is "this turn" only.
 *  3. The point of the card: attack (exhausts), then choose an enemy with a spell, ready the Wolf and
 *     move again the same turn at 5 Might.
 *  4. Readying an already-ready Wolf is harmless — it still gets +1 and still burns the once-per-turn.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-125-166";
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.

/** P1: exhausted Wolf in base, an enemy unit to choose, Discipline in hand, 4 energy + 2 order power. */
function board(wolfMeta: Record<string, unknown> | undefined = { exhausted: true }) {
  return scenario()
    .resources(P1, { energy: 4, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Prey" }, "prey")
    .unit(P1, "base", { might: 1, name: "Pup" }, "pup")
    .unit(P1, "base", CARD, "wolf", wolfMeta)
    .hand(P1, DISCIPLINE, "disc");
}

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

async function chooseEnemyWithDiscipline(game: Game) {
  await game.p1.cast("disc", { targets: "prey" });
  await game.settle();
  expect(game.state("prey").might).toBe(4);
}

describe("Hungry Wolf (ven-125-166)", () => {
  test("costs 4 energy (no power): a 4-Might order unit; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "wolf").build();
    await game.p1.play("wolf");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("wolf")).toBe("base");
    expect(game.state("wolf")).toMatchObject({ baseMight: 4, might: 4 });
    const poor = await scenario().resources(P1, { energy: 3, power: { order: 3 } }).hand(P1, CARD, "wolf").build();
    expect(poor.p1.can("play", "wolf")).toBe(false);
  });

  // BUG — expected (402 play restriction): nothing has chosen an enemy unit yet this turn, so the
  // ability must not be offered even with [order] available. Actual: the restriction text was parsed
  // into a raw effect, so the ability is always activatable.
  test("not usable before you've chosen an enemy unit this turn (power available, restriction unmet)", async () => {
    const game = await board().build();
    expect(game.p1.can("activate", "wolf")).toBe(false);
  });

  test("after choosing an enemy unit (Discipline on Prey) the ability is offered and costs exactly one [order] power — it goes on the chain", async () => {
    const game = await board().build();
    await chooseEnemyWithDiscipline(game);
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 2 } });
    expect(game.p1.can("activate", "wolf")).toBe(true);
    await game.p1.activate("wolf");
    expect(game.p1.resources()).toEqual({ energy: 2, power: { order: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wolf", controller: P1, triggered: false })]);
    expect(game.state("wolf").isExhausted).toBe(true); // nothing happens before resolution
  });

  test("cost negative space: with no [order] power (only energy / other domains) the ability is not offered even after choosing an enemy", async () => {
    const game = await board().resources(P1, { energy: 6, power: { fury: 2, order: 0 } }).build();
    await chooseEnemyWithDiscipline(game);
    expect(game.p1.can("activate", "wolf")).toBe(false);
  });

  // BUG — expected: on resolution the exhausted Wolf is READIED and is 5 Might for the rest of the
  // turn (back to 4 next turn). Actual: the effect is raw text — stays exhausted at 4.
  test("resolves → Wolf is readied and gets +1 Might this turn (4 → 5), which expires at end of turn", async () => {
    const game = await board().build();
    await chooseEnemyWithDiscipline(game);
    await game.p1.activate("wolf");
    await game.settle();
    expect(game.state("wolf")).toMatchObject({ isExhausted: false, isReady: true, might: 5 });
    await game.advanceTurn();
    expect(game.state("wolf").might).toBe(4);
  });

  // BUG — expected (377.2.b "only once each turn"): after one use, a second [order] cannot activate it
  // again this turn. Actual: no once-per-turn restriction parsed → offered again.
  test("only once each turn — after the first use it is not offered again despite a second [order] power", async () => {
    const game = await board().build();
    await chooseEnemyWithDiscipline(game);
    await game.p1.activate("wolf");
    await game.settle();
    expect(game.p1.power("order")).toBe(1);
    expect(game.p1.can("activate", "wolf")).toBe(false);
  });

  // BUG — expected: choosing a FRIENDLY unit (Discipline on Pup) is not "an enemy unit" → still locked.
  // Actual: always offered.
  test("choosing a friendly unit does not satisfy the restriction", async () => {
    const game = await board().build();
    await game.p1.cast("disc", { targets: "pup" });
    await game.settle();
    expect(game.state("pup").might).toBe(3);
    expect(game.p1.can("activate", "wolf")).toBe(false);
  });

  // BUG — expected: the "chosen an enemy unit THIS TURN" flag resets with the turn: choose on turn N,
  // don't activate, come back on P1's next turn with power still floating → not offered.
  // Actual: always offered.
  test("the enemy-chosen condition is per turn — on your NEXT turn (nothing chosen yet) it is locked again", async () => {
    const game = await board().build();
    await chooseEnemyWithDiscipline(game);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    await game.p1.do("addResources", { power: { order: 1 } });
    expect(game.p1.power("order")).toBeGreaterThanOrEqual(1);
    expect(game.p1.can("activate", "wolf")).toBe(false);
  });

  // BUG — expected: the signature line — Wolf conquers an enemy battlefield (exhausting itself), P1 then
  // Disciplines the enemy unit at the other battlefield, activates → Wolf readies at 5 Might and can make
  // a second Standard Move the same turn into bf2, killing the 4-Might guard. Actual: never readies.
  test("attack → choose an enemy → ready → attack again in the same turn at 5 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { order: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 4, name: "Guard" }, "guard")
      .unit(P1, "base", CARD, "wolf")
      .hand(P1, DISCIPLINE, "disc")
      .build();
    await game.p1.move("wolf", "bf1"); // empty enemy battlefield → conquer, Wolf exhausted
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("wolf").isExhausted).toBe(true);
    await game.p1.cast("disc", { targets: "guard" }); // choose an enemy unit (now 6 Might this turn)
    await game.settle();
    await game.p1.activate("wolf");
    await game.settle();
    expect(game.state("wolf")).toMatchObject({ isReady: true, might: 5 });
    expect(game.p1.can("move")).toBe(true);
  });

  test("an opponent choosing YOUR unit is not 'you' choosing an enemy: on P2's turn P1's Wolf ability is not something P2 can use, and P1 has no priority to use it", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { power: { order: 1 } })
      .resources(P2, { energy: 2 })
      .unit(P1, "base", CARD, "wolf", { exhausted: true })
      .hand(P2, DISCIPLINE, "disc")
      .build();
    await game.p2.cast("disc", { targets: "wolf" });
    await game.settle();
    expect(game.state("wolf").might).toBe(6); // 4 + 2 from P2's Discipline
    expect(game.p2.can("activate", "wolf")).toBe(false);
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:wolf"))).toBe(false);
    expect(game.state("wolf").isExhausted).toBe(true);
  });

  test("parsed abilities: a single activated ability whose cost is exactly one [order] power and no energy", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 4, might: 4, name: "Hungry Wolf" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; cost: { energy?: number; power?: string[] } };
    expect(ab.type).toBe("activated");
    expect(ab.cost.power).toEqual(["order"]);
    expect(ab.cost.energy ?? 0).toBe(0);
  });

  // BUG — expected: effect = sequence(ready self, +1 Might self this turn) and restrictions carrying a
  // once-per-turn entry plus the "chosen an enemy unit this turn" condition. Actual: `{type:"raw"}` and
  // no restrictions at all.
  test("the effect is structured (ready + modify-might) with once-per-turn and chosen-enemy restrictions, not raw text", async () => {
    const ab = (await loadDefaultCardPool()).get(CARD)?.abilities?.[0] as { effect: { type: string }; restrictions?: { type: string }[] };
    expect(ab.effect.type).not.toBe("raw");
    expect(JSON.stringify(ab.effect)).toContain("ready");
    expect(JSON.stringify(ab.effect)).toContain("modify-might");
    expect(ab.restrictions ?? []).toEqual(expect.arrayContaining([expect.objectContaining({ type: "once-per-turn" })]));
  });
});
