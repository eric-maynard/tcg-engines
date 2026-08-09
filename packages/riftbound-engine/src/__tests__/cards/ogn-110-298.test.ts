/**
 * Ekko, Recurrent — ogn-110-298 · Champion Unit · Mind · 5 energy + 1 [mind] · 5 Might
 *
 *   [Accelerate] (You may pay [1][mind] as an additional cost to have me enter ready.)
 *   [Deathknell] — Recycle me to ready your runes. (When I die, get the effect.)
 *
 * Rule 805 (Accelerate: optional additional cost → enters ready);
 * rule 808 + 383.3.b (Deathknell; "Recycle me" is the trigger's cost, paid from
 * the trash, then "ready your runes" resolves); rule 416.1.a (recycled to the Main Deck).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../harness";

const CARD = "ogn-110-298";
/** Inline vanilla 6-damage spell used to kill Ekko outside combat. */
const BOLT = {
  abilities: [{ effect: { amount: 6, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Bolt 6",
  timing: "action",
};

describe("Ekko, Recurrent (ogn-110-298)", () => {
  test("costs 5 energy + 1 mind; enters exhausted as a 5-Might unit", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).hand(P1, CARD, "ekko").build();
    await game.p1.play("ekko");
    await game.settle();
    expect(game.zoneOf("ekko")).toBe("base");
    expect(game.state("ekko").might).toBe(5);
    expect(game.state("ekko").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    const noPower = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "ekko").build();
    expect(noPower.p1.can("play", "ekko")).toBe(false);
    const noEnergy = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, CARD, "ekko").build();
    expect(noEnergy.p1.can("play", "ekko")).toBe(false);
  });

  test("[Accelerate]: paying an extra [1][mind] (6 energy + 2 mind total) makes him enter ready", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { mind: 2 } }).hand(P1, CARD, "ekko").build();
    await game.p1.play("ekko", { accelerate: true });
    await game.settle();
    expect(game.zoneOf("ekko")).toBe("base");
    expect(game.state("ekko").isReady).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
  });

  test("[Accelerate] is optional and must be affordable: with exactly 5 + [mind] only the plain (exhausted) play works", async () => {
    const game = await scenario().resources(P1, { energy: 5, power: { mind: 1 } }).hand(P1, CARD, "ekko").build();
    const t = await game.p1.try((p) => p.play("ekko", { accelerate: true }));
    expect(t.ok).toBe(false);
    expect(game.zoneOf("ekko")).toBe("hand");
    await game.p1.play("ekko", { accelerate: false });
    await game.settle();
    expect(game.state("ekko").isExhausted).toBe(true);
  });

  test("[Deathknell] on a spell death — the trigger resolves by recycling him to the bottom of the main deck and readying all your runes", async () => {
    // Expected (808, 383.3.b, 416.1.a): Ekko dies → Deathknell on the chain → resolves: Ekko leaves the
    // trash for the deck bottom and every P1 rune is ready (tappable again).
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ekko")
      .runes(P1, "mind", 3)
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.tapRunes(3);
    expect(game.p1.runes({ ready: true })).toHaveLength(0);
    await game.p1.cast("bolt", { targets: "ekko" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bolt resolves, Ekko dies
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ekko", triggered: true })]);
    await game.settle();
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p1.deck().at(-1)).toBe("ekko");
    expect(game.p1.runes({ ready: true })).toHaveLength(3);
    expect(game.p1.can("tapRune")).toBe(true);
    expect(game.p1.energy()).toBe(3); // readying runes adds no energy by itself
  });

  test("[Deathknell] 'Recycle me' is the trigger's BASE COST — paid on finalization, not on resolution", async () => {
    // rule 383.3.b (Ekko is the printed example) + 383.3.b.1 / 740.4.a.2: a cost written at the
    // start of a trigger's instructions must be PAID to finalize the item onto the Chain, and the
    // payoff happens only because it was paid. So while the item sits on the Chain, Ekko has
    // already left the trash for the deck — and the runes are still exhausted.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ekko")
      .runes(P1, "mind", 2)
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p1.tapRunes(2);
    await game.p1.cast("bolt", { targets: "ekko" });
    await game.p1.passPriority();
    await game.p2.passPriority(); // Bolt resolves, Ekko dies, Deathknell is finalized
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ekko", triggered: true })]);
    expect(game.zoneOf("ekko")).toBe("mainDeck"); // base cost already paid
    expect(game.p1.runes({ ready: true })).toHaveLength(0); // payoff waits for resolution
    await game.settle();
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });

  test("[Deathknell] also triggers when he dies in combat (rule 323.4 / 808)", async () => {
    // Expected: 5-Might Ekko attacks a 6-Might defender, takes lethal damage → Deathknell → recycled,
    // runes readied.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "ekko")
      .unit(P2, "bf1", { might: 6 }, "wall")
      .runes(P1, "mind", 2)
      .build();
    await game.p1.tapRunes(2);
    await game.p1.move("ekko", "bf1");
    await game.settle();
    expect(game.zoneOf("wall")).toBe("battlefield-bf1");
    expect(game.zoneOf("ekko")).toBe("mainDeck");
    expect(game.p1.runes({ ready: true })).toHaveLength(2);
  });

  test("[Deathknell] readies only YOUR runes", async () => {
    // Expected: P1's rune readied, P2's exhausted rune untouched.
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "ekko")
      .runes(P1, "mind", 1)
      .rune(P2, "fury", { alias: "theirs" })
      .hand(P1, BOLT, "bolt")
      .build();
    await game.p2.do("exhaustRune", { runeId: "theirs" });
    expect(game.state("theirs").isExhausted).toBe(true);
    await game.p1.tapRunes(1);
    await game.p1.cast("bolt", { targets: "ekko" });
    await game.settle();
    expect(game.state("theirs").isExhausted).toBe(true);
    expect(game.p1.runes({ ready: true })).toHaveLength(1);
    expect(game.zoneOf("ekko")).toBe("mainDeck");
  });
});
