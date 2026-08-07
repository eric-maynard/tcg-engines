/**
 * Yordle Explorer — sfd-100-221 · Unit · Body · 4 energy (no power) · 4 might
 *
 *   When you play a card with Power cost [rainbow][rainbow] or more, draw 1.
 *
 * Rules: 131.3 (Power cost = the printed power symbols), 206 (cost checks use the PRINTED cost —
 * additional costs such as Accelerate or "you may pay [C]" never count, discounts never subtract),
 * 383.4.a.2 (a permanent is "played" once it is finalized and enters the board → the trigger
 * follows it), 359.3.e.10 ("when you play a spell" abilities trigger as the spell RESOLVES → a
 * countered spell was never played), 383.4.a.4 (this is not a Play Effect of the Explorer itself),
 * "you" = the Explorer's controller only, and it only works from the board.
 *
 * Head-judge corner cases considered:
 *   - exactly two pips (Anivia [body][body]; Tibbers [rainbow][rainbow]) → draw 1; three pips → still
 *     exactly 1 card ("or more" is a threshold, not a multiplier); two Explorers → 2 cards;
 *   - one pip (Dauntless Vanguard), zero pips (Shipyard Skulker), and the Explorer's OWN play (no
 *     power) → no draw;
 *   - Accelerate on Nilah ([body] printed + [1][body] extra = 2 power SPENT, 1 printed) → no draw;
 *     Frostcoat Cub paying its optional [mind] (0 printed) → no draw (206);
 *   - a [rainbow][rainbow] spell (On the Hunt) draws when it resolves; countered by Wind Wall → no draw;
 *   - P2 playing a 2-pip card draws nobody anything; Explorer still in hand → nothing.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-100-221";
const ANIVIA = "ogn-148-298"; // unit, 7 energy + [body][body], 8 might ("When I attack…" only)
const TIBBERS = "ogs-018-024"; // unit, 8 energy + [rainbow][rainbow], 7 might (play: 3 to units AT BATTLEFIELDS)
const VANGUARD = "sfd-093-221"; // unit, 4 energy + [body], 4 might
const SKULKER = "ogn-175-298"; // vanilla unit, 3 energy, no power
const NILAH = "unl-115-219"; // unit, 3 energy + [body], Accelerate [1][body]
const CUB = "sfd-067-221"; // unit, 3 energy, optional extra [mind]
const ON_THE_HUNT = "sfd-204-221"; // spell, 1 energy + [rainbow][rainbow]: ready your units
const WIND_WALL = "ogn-064-298"; // [Reaction] 3 energy + [calm][calm]: counter a spell
const THREE_PIPS = { energyCost: 1, might: 2, name: "Triple Pip Test Unit", powerCost: ["body", "body", "body"], domain: "body" };

function withExplorer(res: { energy?: number; power?: Record<string, number> }) {
  return scenario().resources(P1, res).unit(P1, "base", CARD, "explorer");
}

describe("Yordle Explorer (sfd-100-221)", () => {
  test("costs 4 energy; a 4-Might unit that enters the base exhausted; 3 energy (+ any power) is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "explorer").build();
    await game.p1.play("explorer");
    await game.settle();
    expect(game.zoneOf("explorer")).toBe("base");
    expect(game.state("explorer")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4 });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect((await scenario().resources(P1, { energy: 3, power: { body: 2 } }).hand(P1, CARD, "explorer").build()).p1.can("play", "explorer")).toBe(false);
  });

  test("playing the Explorer ITSELF (printed Power cost 0) must not draw", async () => {
    // Expected: empty hand, untouched deck, empty chain after the Explorer lands. Actual: its own
    // arrival satisfies the unconditioned play-card trigger and P1 draws 1.
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "explorer").build();
    const deckBefore = game.p1.deck().length;
    await game.p1.play("explorer");
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p1.hand()).toEqual([]);
    expect(game.p1.deck()).toHaveLength(deckBefore);
  });

  test("playing Anivia ([body][body]) with the Explorer on board: after Anivia lands the trigger resolves and P1 draws exactly 1", async () => {
    const game = await withExplorer({ energy: 7, power: { body: 2 } }).hand(P1, ANIVIA, "anivia").build();
    const deckBefore = game.p1.deck().length;
    await game.p1.play("anivia");
    expect(game.zoneOf("anivia")).toBe("base");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("the draw is a triggered ability of the Explorer on the chain (P1-controlled) once the 2-pip unit has entered", async () => {
    const game = await withExplorer({ energy: 7, power: { body: 2 } }).hand(P1, ANIVIA, "anivia").build();
    await game.p1.play("anivia");
    expect(game.zoneOf("anivia")).toBe("base");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "explorer", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toHaveLength(0); // not drawn before resolution
  });

  test("[rainbow][rainbow] printed (Tibbers) counts as Power cost 2 → draw 1", async () => {
    const game = await withExplorer({ energy: 8, power: { rainbow: 2 } }).hand(P1, TIBBERS, "tibbers").build();
    await game.p1.play("tibbers");
    await game.settle();
    expect(game.zoneOf("tibbers")).toBe("base");
    expect(game.state("explorer").damage).toBe(0); // Tibbers only hits units at battlefields
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("'or more': a three-pip card still draws exactly ONE card", async () => {
    const game = await withExplorer({ energy: 1, power: { body: 3 } }).hand(P1, THREE_PIPS, "triple").build();
    const deckBefore = game.p1.deck().length;
    await game.p1.play("triple");
    await game.settle();
    expect(game.zoneOf("triple")).toBe("base");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.deck()).toHaveLength(deckBefore - 1);
  });

  test("two Explorers on board → two triggers → draw 2", async () => {
    const game = await withExplorer({ energy: 7, power: { body: 2 } }).unit(P1, "base", CARD, "explorer2").hand(P1, ANIVIA, "anivia").build();
    await game.p1.play("anivia");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("a ONE-pip card (Dauntless Vanguard, 4 + [body]) is below the threshold — no trigger, no draw", async () => {
    // Expected: hand stays empty and nothing goes on the chain. Actual: the parsed trigger has no
    // power-cost condition, so ANY card P1 plays draws 1.
    const game = await withExplorer({ energy: 4, power: { body: 1 } }).hand(P1, VANGUARD, "dv").build();
    await game.p1.play("dv", { to: "base" });
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.zoneOf("dv")).toBe("base");
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("a card with NO Power cost (Shipyard Skulker, 3 energy) draws nothing, however much energy it costs", async () => {
    // Expected: no draw. Actual: draws 1 (unconditional play-card trigger).
    const game = await withExplorer({ energy: 3 }).hand(P1, SKULKER, "skulker").build();
    await game.p1.play("skulker");
    await game.settle();
    expect(game.zoneOf("skulker")).toBe("base");
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("paid additional costs are not 'Power cost' (206) — Nilah with Accelerate spends 2 [body] but has 1 printed pip → no draw", async () => {
    // Expected: Nilah enters ready, pool empty, and NO card is drawn. Actual: draws 1.
    const game = await withExplorer({ energy: 4, power: { body: 2 } }).hand(P1, NILAH, "nilah").build();
    await game.p1.play("nilah", { accelerate: true, to: "base" });
    await game.settle();
    expect(game.zoneOf("nilah")).toBe("base");
    expect(game.state("nilah").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("Frostcoat Cub paying its optional [mind] still has printed Power cost 0 → no draw", async () => {
    // Expected: Cub's own -2 trigger may prompt, but the Explorer never triggers. Actual: draws 1.
    const game = await withExplorer({ energy: 3, power: { mind: 1 } }).hand(P1, CUB, "cub").script(P1, ["explorer"]).build();
    await game.p1.play("cub", { payOptional: true });
    await game.settle();
    expect(game.zoneOf("cub")).toBe("base");
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("'you': the OPPONENT playing a [body][body] card draws nobody a card", async () => {
    const game = await withExplorer({}).active(P2).resources(P2, { energy: 7, power: { body: 2 } }).hand(P2, ANIVIA, "theirs").build();
    await game.p2.play("theirs");
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("base");
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.p2.hand()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("works only from the board: with the Explorer still in HAND, playing Anivia draws nothing", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { body: 2 } }).hand(P1, CARD, "explorer").hand(P1, ANIVIA, "anivia").build();
    await game.p1.play("anivia");
    await game.settle();
    expect(game.p1.hand()).toEqual(["explorer"]);
    expect(game.chain()).toEqual([]);
  });

  test("a [rainbow][rainbow] SPELL (On the Hunt) counts: when it resolves P1's units ready and P1 draws 1", async () => {
    const game = await withExplorer({ energy: 1, power: { rainbow: 2 } })
      .unit(P1, "base", { might: 2 }, "tired", { exhausted: true })
      .hand(P1, ON_THE_HUNT, "hunt")
      .build();
    await game.p1.cast("hunt");
    expect(game.p1.hand()).toHaveLength(0); // nothing yet: play-a-spell triggers on resolution
    await game.settle();
    expect(game.zoneOf("hunt")).toBe("trash");
    expect(game.state("tired").isReady).toBe(true);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("a COUNTERED [rainbow][rainbow] spell was never played (359.3.e.10 a contrario): Wind Wall stops On the Hunt → no ready, no draw", async () => {
    const game = await withExplorer({ energy: 1, power: { rainbow: 2 } })
      .resources(P2, { energy: 3, power: { calm: 2 } })
      .unit(P1, "base", { might: 2 }, "tired", { exhausted: true })
      .hand(P1, ON_THE_HUNT, "hunt")
      .hand(P2, WIND_WALL, "wall")
      .build();
    await game.p1.cast("hunt");
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("wall", { targets: "hunt" });
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("hunt")).toBe("trash");
    expect(game.state("tired").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(0);
    expect(game.chain()).toEqual([]);
  });

  test("registry payload — the play-card trigger must carry a 'Power cost ≥ 2' condition on the played card", async () => {
    // Expected: a triggered draw-1 on `play-card` by the controller WITH a restriction/condition
    // comparing the played card's printed power cost to 2. Actual: the condition is dropped entirely.
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 4, might: 4 });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as Record<string, unknown>;
    expect(ability).toMatchObject({
      effect: { amount: 1, type: "draw" },
      trigger: { event: "play-card", on: "controller" },
      type: "triggered",
    });
    const gate = JSON.stringify({ condition: ability.condition, trigger: ability.trigger });
    expect(gate).toMatch(/power/i);
    expect(gate).toMatch(/2/);
  });
});
