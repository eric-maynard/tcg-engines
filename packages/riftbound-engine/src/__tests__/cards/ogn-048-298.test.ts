/**
 * Meditation — ogn-048-298 · Spell · Calm · 2 energy
 *
 *   [Reaction] (Play any time, even before spells and abilities resolve.)
 *   As an additional cost to play this, you may exhaust a friendly unit.
 *   If you do, draw 2. Otherwise, draw 1.
 *
 * Rules: 204.2 / 355.1.a / 356.2 — optional additional costs are chosen and
 * paid while the spell is being played (before it goes on the chain), not on
 * resolution.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-048-298";
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
};

describe("Meditation (ogn-048-298)", () => {
  test("costs 2 energy; 'Otherwise, draw 1' with no friendly unit to exhaust", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "med").build();
    await game.p1.cast("med");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "med", controller: P1 })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.zoneOf("med")).toBe("trash");
    const poor = await scenario().resources(P1, { energy: 1 }).hand(P1, CARD, "med").build();
    expect(poor.p1.can("cast", "med")).toBe(false);
  });

  test("Reaction: playable on the opponent's turn in response to their spell, and resolves first", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .unit(P2, "base", { might: 3 }, "foe")
      .hand(P2, BOLT, "bolt")
      .hand(P1, CARD, "med")
      .build();
    await game.p2.cast("bolt", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.p1.can("cast", "med")).toBe(true);
    await game.p1.cast("med");
    expect(game.chain().map((i) => i.cardId)).toEqual(["bolt", "med"]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.zoneOf("med")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.zoneOf("bolt")).toBe("chain");
  });

  test.failing("BUG: Reaction only adds Closed-state permission — not castable in a Neutral Open state on the opponent's turn (rules 316.5.b, 813.1.c.1)", async () => {
    // Expected: with no chain on P2's turn only the turn player may play spells, so P1 cannot cast yet.
    // Actual: the engine offers playSpell:med to P1 during P2's open main phase.
    const game = await scenario().active(P2).resources(P1, { energy: 2 }).hand(P1, CARD, "med").build();
    expect(game.chain()).toHaveLength(0);
    expect(game.p1.can("cast", "med")).toBe(false);
  });

  test.failing("BUG: paying the optional cost exhausts the chosen friendly unit as you play it, then draws 2 (rules 355.1.a, 356.2)", async () => {
    // Expected: the play bundle offers the optional exhaust cost (payOptional + which unit); the unit is
    // exhausted before Meditation is on the chain; on resolution the caster draws 2.
    // Actual: no such variant exists — the exhaust happens unprompted at resolution and only 1 card is drawn.
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P1, "base", { might: 2 }, "other")
      .hand(P1, CARD, "med")
      .build();
    await game.p1.cast("med", { payOptional: true, targets: "ally" });
    expect(game.zoneOf("med")).toBe("chain");
    expect(game.state("ally").isExhausted).toBe(true); // cost paid at play time
    expect(game.state("other").isExhausted).toBe(false);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
  });

  test.failing("BUG: declining the optional cost leaves friendly units ready and draws exactly 1", async () => {
    // Expected: "you may" — casting without paying exhausts nothing and draws 1.
    // Actual: on resolution the engine exhausts a friendly unit without asking.
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CARD, "med")
      .build();
    await game.p1.cast("med");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    } else if (game.decision()?.kind === "pick") {
      await game.p1.decline();
      await game.settle();
    }
    expect(game.zoneOf("med")).toBe("trash");
    expect(game.state("ally").isExhausted).toBe(false);
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("an already-exhausted unit cannot pay the cost: with only exhausted friendly units you draw 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .unit(P1, "base", { might: 2 }, "tired", { exhausted: true })
      .hand(P1, CARD, "med")
      .build();
    await game.p1.cast("med");
    await game.settle();
    if (game.decision()?.kind === "yes-no") {
      await game.p1.no();
      await game.settle();
    }
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.zoneOf("med")).toBe("trash");
  });
});
