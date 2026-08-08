/**
 * The Dreaming Tree — ogn-292-298 · Battlefield (no cost, colorless)
 *
 *   When a player chooses a friendly unit here with a spell for the first time each turn, they draw 1.
 *   (Origins errata #25: clarified that the trigger applies when "a player" chooses.)
 *
 * Head-judge notes — the tricky spots this file covers:
 *   1. A Targeting Effect (383.4.b): it triggers when a SPELL that TARGETS a unit is FINALIZED
 *      (383.4.b.2) — the draw item goes on the chain above the spell and resolves first, so the card is
 *      drawn before the spell does anything, and even if the spell is later countered (419.4.a.1 only
 *      concerns "play" triggers).
 *   2. "a player … a friendly unit … they draw": symmetric — ANY player targeting a unit THEY control
 *      (740.1.a) at this battlefield draws, controller of the Tree or not (e.g. an attacker mid-showdown
 *      here). Targeting an ENEMY unit here draws for nobody.
 *   3. "for the first time each turn" is per player: P1's second such spell in a turn draws nothing,
 *      but P2's first one that same turn still draws; the count resets every turn (P1 draws again on
 *      the next turn — including on the opponent's turn via a Reaction).
 *   4. "here": the unit must be AT The Dreaming Tree — a friendly unit in base or at another
 *      battlefield does not count. "with a spell": a unit/gear/legend ABILITY choosing it does not count.
 *   5. Negative space must be airtight because a mis-scoped version of this card is a free draw engine.
 *
 * Engine note: the parser emitted trigger event `choose-unit-with-spell` (never raised by the engine)
 * and `draw` for `player: "opponent"`; nothing ever fires (BUG tests below; negatives pass vacuously
 * but pin the scope for when it is implemented).
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-292-298";
const WIND_WALL = "ogn-064-298"; // Reaction · 3 calm · Counter a spell.

/** Inline 1-cost "Deal 1 to a unit" spell; `timing` reaction by default so either player can fire it. */
const spark = (name: string, timing: "reaction" | "action" = "reaction") => ({
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing, type: "spell" }],
  cardType: "spell",
  domain: "calm",
  energyCost: 1,
  name,
  timing,
});

/** Inline gear: "[Exhaust]: Deal 1 to a unit." — an ABILITY that chooses a unit. */
const PROD = {
  abilities: [{ cost: { exhaust: true }, effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "activated" }],
  cardType: "gear",
  domain: "calm",
  energyCost: 1,
  name: "Cattle Prod",
};

/** P1's turn. P1 controls the Tree with a 3-Might Dreamer on it, has a unit in base and one at bf2; P2 has a unit in base. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { calm: 2 } })
    .resources(P2, { energy: 5, power: { calm: 2 } })
    .battlefield("tree", { controller: P1, def: CARD, inert: false, owner: P1 })
    .battlefield("bf2", { controller: P1 })
    .unit(P1, "tree", { might: 3, name: "Dreamer" }, "dreamer")
    .unit(P1, "base", { might: 3, name: "Homebody" }, "home")
    .unit(P1, "bf2", { might: 3, name: "Wanderer" }, "wanderer")
    .unit(P2, "base", { might: 3, name: "Their Guy" }, "theirs")
    .hand(P1, spark("Spark A"), "sparkA")
    .hand(P1, spark("Spark B"), "sparkB");
}

async function passAll(game: Game): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context === "main" || !d.passKey) {
      return;
    }
    await game.seat(d.seat).pass();
  }
}

describe("The Dreaming Tree (ogn-292-298)", () => {
  test("registry payload — a spell-targeting trigger on a friendly unit HERE, first time each turn, whose draw goes to the CHOOSING player (parser: unknown event + draw for 'opponent')", async () => {
    // Expected: an engine-known choose/target event scoped to spells + here, restriction first-time-each-turn,
    // effect draw 1 for the triggering player. Actual: event "choose-unit-with-spell", effect.player "opponent".
    await scenario().build();
    const [ability] = (peekDefaultCardPool()?.get(CARD)?.abilities ?? []) as Record<string, unknown>[];
    expect(ability).toMatchObject({
      effect: { amount: 1, type: "draw" },
      trigger: { restrictions: [{ type: "first-time-each-turn" }] },
      type: "triggered",
    });
    expect((ability?.effect as { player?: string } | undefined)?.player).not.toBe("opponent");
    expect((ability?.trigger as { event?: string } | undefined)?.event).not.toBe("choose-unit-with-spell");
  });

  test("P1 targets their own Dreamer HERE with a spell → on finalization a Dreaming Tree item sits ABOVE the spell under P1; it resolves first: P1 draws 1 before Spark deals its damage (383.4.b.2)", async () => {
    // Expected: chain = [Spark A, The Dreaming Tree]; after two passes P1 has +1 card and Dreamer is still undamaged.
    // Actual: no Tree item is ever created.
    const game = await board().build();
    await game.p1.cast("sparkA", { targets: "dreamer" });
    const hand0 = game.p1.hand().length; // sparkA already left the hand
    expect(game.chain().map((c) => c.cardId)).toEqual(["sparkA", "tree"]);
    expect(game.chain()[1]).toMatchObject({ controller: P1, triggered: true });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tree item resolves
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.state("dreamer").damage).toBe(0);
    await passAll(game); // now Spark resolves
    expect(game.state("dreamer").damage).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("'first time each turn' — the first spell at the Dreamer draws 1, the SECOND one the same turn draws nothing (chain holds only the spell)", async () => {
    const game = await board().build();
    await game.p1.cast("sparkA", { targets: "dreamer" });
    await passAll(game);
    const afterFirst = game.p1.hand().length;
    expect(afterFirst).toBe(2); // sparkB + the Tree card (sparkA is in the trash)
    await game.p1.cast("sparkB", { targets: "dreamer" });
    expect(game.chain().map((c) => c.cardId)).toEqual(["sparkB"]);
    await passAll(game);
    expect(game.p1.hand()).toHaveLength(afterFirst - 1); // sparkB spent, nothing drawn
    expect(game.state("dreamer").damage).toBe(2);
  });

  test("per-turn reset, cleanly: turn N draw, then on P1's NEXT turn targeting the Dreamer again draws again", async () => {
    const game = await board().build();
    await game.p1.cast("sparkA", { targets: "dreamer" });
    await passAll(game);
    expect(game.p1.trash()).toContain("sparkA");
    const h1 = game.p1.hand().length; // sparkB + the first Tree draw
    expect(h1).toBe(2);
    await game.advanceTurn(); // → P2
    await game.advanceTurn(); // → P1 (channel 2, draw step +1)
    expect(game.turnPlayer()).toBe(P1);
    const h2 = game.p1.hand().length;
    expect(h2).toBe(h1 + 1);
    await game.p1.tapRune(); // pools emptied at end of turn — pay for Spark B from a fresh rune
    await game.p1.cast("sparkB", { targets: "dreamer" });
    await passAll(game);
    expect(game.p1.hand()).toHaveLength(h2 - 1 + 1); // sparkB spent, Tree drew 1
  });

  test("symmetric 'a player' — P2 ATTACKING into P1's Tree targets P2's own attacker here during the showdown → P2 (not P1) draws 1", async () => {
    // Expected: the raider is a unit friendly to P2 located at the Tree → P2's first such choice this turn → P2 +1 card.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { calm: 1 } })
      .battlefield("tree", { controller: P1, def: CARD, inert: false, owner: P1 })
      .unit(P1, "tree", { might: 5, name: "Defender" }, "defender")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P2, spark("Spark", "action"), "spark")
      .build();
    const p1h = game.p1.hand().length;
    await game.p2.move("raider", "tree");
    expect(game.actingSeat()).toBe(P2); // attacker holds Focus
    await game.p2.cast("spark", { targets: "raider" });
    const p2h = game.p2.hand().length;
    expect(game.chain().some((c) => c.cardId === "tree" && c.controller === P2)).toBe(true);
    await passAll(game);
    expect(game.p2.hand()).toHaveLength(p2h + 1);
    expect(game.p1.hand()).toHaveLength(p1h);
  });

  test("targeting an ENEMY unit here draws for nobody: P2 Sparks P1's Dreamer at the Tree (in response on P1's turn) — no Tree item, no cards", async () => {
    const game = await board().hand(P2, spark("Their Spark"), "theirSpark").build();
    await game.p1.cast("sparkA", { targets: "theirs" }); // P1 opens a chain (target NOT here) so P2 gets priority
    await game.p1.passPriority();
    const p1h = game.p1.hand().length;
    const p2h0 = game.p2.hand().length;
    await game.p2.cast("theirSpark", { targets: "dreamer" });
    expect(game.p2.hand()).toHaveLength(p2h0 - 1);
    expect(game.chain().some((c) => c.cardId === "tree")).toBe(false);
    await passAll(game);
    expect(game.state("dreamer").damage).toBe(1);
    expect(game.state("theirs").damage).toBe(1);
    expect(game.p1.hand()).toHaveLength(p1h);
    expect(game.p2.hand()).toHaveLength(p2h0 - 1);
  });

  test("'here' only: P1 targeting their unit in BASE or at ANOTHER battlefield draws nothing", async () => {
    const game = await board().build();
    await game.p1.cast("sparkA", { targets: "home" });
    let hand = game.p1.hand().length;
    expect(game.chain().map((c) => c.cardId)).toEqual(["sparkA"]);
    await passAll(game);
    expect(game.p1.hand()).toHaveLength(hand);
    await game.p1.cast("sparkB", { targets: "wanderer" });
    hand = game.p1.hand().length;
    expect(game.chain().map((c) => c.cardId)).toEqual(["sparkB"]);
    await passAll(game);
    expect(game.p1.hand()).toHaveLength(hand);
    expect(game.state("home").damage).toBe(1);
    expect(game.state("wanderer").damage).toBe(1);
  });

  test("'with a spell' only: a gear's activated ABILITY choosing the Dreamer here draws nothing", async () => {
    const game = await board().gear(P1, PROD, "prod").build();
    const hand0 = game.p1.hand().length;
    await game.p1.activate("prod", 0, { answers: ["dreamer"] });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("dreamer");
      await game.settle();
    }
    expect(game.state("dreamer").damage).toBe(1);
    expect(game.state("prod").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(hand0);
    expect(game.chain()).toEqual([]);
  });

  test("the draw survives a counter — P2 Wind Walls Spark A after the Tree item resolved: Dreamer undamaged, but P1 keeps the drawn card (383.4.b.2 vs 419.4.a.1)", async () => {
    const game = await board().hand(P2, WIND_WALL, "ww").build();
    await game.p1.cast("sparkA", { targets: "dreamer" });
    const hand0 = game.p1.hand().length;
    await game.p1.passPriority();
    await game.p2.passPriority(); // Tree item (top) resolves → P1 draws; Spark A still pending
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.zoneOf("sparkA")).toBe("chain");
    await game.p1.passPriority();
    await game.p2.cast("ww", { targets: "sparkA" });
    await passAll(game);
    expect(game.zoneOf("sparkA")).toBe("trash");
    expect(game.state("dreamer").damage).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("control of the Tree is irrelevant — the Tree is UNCONTROLLED, P1's lone attacker walks in and, holding Focus in the showdown, Sparks itself → P1 draws", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .battlefield("tree", { controller: null, def: CARD, inert: false, owner: P2 })
      .unit(P1, "base", { might: 3, name: "Walker" }, "walker")
      .hand(P1, spark("Spark", "action"), "spark")
      .build();
    await game.p1.move("walker", "tree");
    // A showdown opens at the empty battlefield with P1 holding Focus — an Action spell is legal now.
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    await game.p1.cast("spark", { targets: "walker" });
    const hand0 = game.p1.hand().length;
    expect(game.chain().some((c) => c.cardId === "tree" && c.controller === P1)).toBe(true);
    await passAll(game);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  test("inert control + no free cards today: with abilities stripped (and, as it stands, even with them) Sparking your own Dreamer draws nothing and leaves no violations", async () => {
    const inert = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .battlefield("tree", { controller: P1, def: CARD, inert: true, owner: P1 })
      .unit(P1, "tree", { might: 3 }, "dreamer")
      .hand(P1, spark("Spark"), "spark")
      .build();
    await inert.p1.cast("spark", { targets: "dreamer" });
    const hand0 = inert.p1.hand().length;
    await inert.settle();
    expect(inert.p1.hand()).toHaveLength(hand0);
    expect(inert.state("dreamer").damage).toBe(1);
    expect(inert.violations()).toEqual([]);
  });
});
