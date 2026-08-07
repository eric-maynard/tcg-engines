/**
 * Affectionate Poro — ven-024-166 · Unit · Calm · 3 energy (no power) · 3 Might
 *
 *   When a combat that I was in ends, if I haven't been dealt damage this turn, draw 1.
 *
 * Head-judge notes — the tricky situations for this card:
 *   1. The trigger point is "combat ends" (466.7.b) — AFTER the combat cleanup healed everyone
 *      (466.1.a.1). Being at 0 damage then is irrelevant: what matters is whether damage was DEALT
 *      to the Poro at any time this turn (combat or spell, before or during the combat).
 *   2. Attacking an EMPTY enemy battlefield is a conquer with no combat at all → no draw.
 *   3. Ways to be "in a combat" without being dealt damage: a friendly [Tank] soaks the lethal
 *      assignment first (815); the lone opposing unit is STUNNED (deals no combat damage); the Poro
 *      DEFENDS next to a Tank on the opponent's turn (draw on their turn).
 *   4. Near misses that must NOT draw: a 2-Might blocker hits the Poro for 2 (it survives and even
 *      conquers, but was dealt damage); a bolt earlier this turn dealt it damage before a clean combat;
 *      the Poro dies in the combat (dealt damage AND no longer on the board).
 *   5. "this turn": damage dealt on a previous turn does not matter on the next.
 *   6. Only combats "I was in": a combat elsewhere between other units draws nothing.
 *   7. Registry: the effect must be a conditional draw, not an unparsed `raw` blob.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-024-166";
const BOLT = {
  abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 1,
  name: "Ping",
  timing: "action",
} as const;

describe("Affectionate Poro (ven-024-166)", () => {
  // Expected: triggered on combat-end/self with an "if not dealt damage this turn" condition and a draw 1
  // effect. Actual: the trigger is recognised but the effect is `{ type: "raw", text: … }` (unimplemented).
  test("registry payload — 3-cost 3-Might Calm unit whose combat-end trigger is a CONDITIONAL DRAW, not raw text", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "calm", energyCost: 3, might: 3, name: "Affectionate Poro" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ability = def?.abilities?.[0] as { type: string; trigger: unknown; effect: { type: string } };
    expect(ability).toMatchObject({ trigger: { event: "combat-end", on: "self" }, type: "triggered" });
    expect(ability.effect.type).not.toBe("raw");
    expect(JSON.stringify(ability)).toContain('"draw"');
  });

  test("costs exactly 3 energy; a 3-Might unit entering the base exhausted; 2 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "poro").build();
    await game.p1.play("poro");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("poro")).toMatchObject({ baseMight: 3, isExhausted: true, might: 3, zone: "base" });
    const poor = await scenario().resources(P1, { energy: 2, power: { calm: 3 } }).hand(P1, CARD, "poro").build();
    expect(poor.p1.can("play", "poro")).toBe(false);
  });

  // Expected: the friendly Tank must take the defender's 2 (815) → Poro dealt nothing → combat ends → draw 1.
  // Actual: no combat-end event exists in the engine, so nothing triggers.
  test("attacking beside a friendly [Tank] that soaks all the damage → Poro undamaged → draws 1 when the combat ends", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker")
      .unit(P1, "base", CARD, "poro")
      .unit(P1, "base", { keywords: ["Tank"], might: 5, name: "Wall" }, "wall")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move(["poro", "wall"], "bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  // Expected: a stunned defender contributes no damage → Poro takes nothing, kills it, combat ends → draw 1.
  // Actual: no combat-end trigger support.
  test("alone into a STUNNED 2-Might defender → dealt no damage → draws 1 (and conquers)", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Dazed" }, "dazed", { stunned: true })
      .unit(P1, "base", CARD, "poro")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("dazed")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });

  // Expected: defending on P2's turn next to a friendly Tank that absorbs the 1-Might attacker → the Poro was in
  // the combat, undamaged → P1 draws 1 during P2's turn. Actual: no combat-end trigger support.
  test("as a DEFENDER on the opponent's turn (Tank ally soaks) → P1 draws 1 when that combat ends", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "poro")
      .unit(P1, "bf1", { keywords: ["Tank"], might: 4, name: "Wall" }, "wall")
      .unit(P2, "base", { might: 1, name: "Poker" }, "poker")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.move("poker", "bf1");
    await game.settle();
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.p2.hand()).toHaveLength(0);
  });

  test("near miss: alone into a 2-Might blocker — Poro is dealt 2, survives (healed after, 466.1.a.1), conquers … and draws NOTHING", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker")
      .unit(P1, "base", CARD, "poro")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.state("poro")).toMatchObject({ damage: 0, location: "bf1" });
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("no combat, no trigger: walking into an EMPTY enemy battlefield conquers without a combat → no draw", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "poro").build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("dealt damage EARLIER this turn (a 1-damage Ping), then a clean Tank-covered combat → still no draw ('this turn', not 'this combat')", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker")
      .unit(P1, "base", CARD, "poro")
      .unit(P1, "base", { keywords: ["Tank"], might: 5, name: "Wall" }, "wall")
      .hand(P1, BOLT, "ping")
      .build();
    await game.p1.cast("ping", { targets: "poro" });
    await game.settle();
    expect(game.state("poro").damage).toBe(1);
    const hand0 = game.p1.hand().length;
    await game.p1.move(["poro", "wall"], "bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("the Poro DIES in the combat (3 into a 5-Might wall): dealt damage and off the board → no draw, no point", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Wall" }, "wall")
      .unit(P1, "base", CARD, "poro")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("poro", "bf1");
    await game.settle();
    expect(game.zoneOf("poro")).toBe("trash");
    expect(game.p1.points()).toBe(0);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  test("only combats 'I was in': another friendly unit fights and wins at bf1 while the Poro sits in base → no draw", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 1, name: "Speck" }, "speck")
      .unit(P1, "base", CARD, "poro")
      .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("speck")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0);
  });

  // Expected: damage dealt LAST turn is forgotten; on P1's next turn a Tank-covered combat is clean → draw 1.
  // The Ending Step clears the turn-scoped `dealtDamageThisTurn` marker (rule 517.2.b).
  test("'this turn' resets — pinged on turn N, clean (Tank-covered) combat on P1's next turn → draws 1", async () => {
    const game = await scenario()
      .resources(P1, { energy: 1 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Blocker" }, "blocker")
      .unit(P1, "base", CARD, "poro")
      .unit(P1, "base", { keywords: ["Tank"], might: 5, name: "Wall" }, "wall")
      .hand(P1, BOLT, "ping")
      .build();
    await game.p1.cast("ping", { targets: "poro" });
    await game.settle();
    expect(game.state("poro").damage).toBe(1);
    await game.advanceTurn(); // → P2 (marked damage clears at end of turn)
    await game.advanceTurn(); // → P1's next turn
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("poro")).toMatchObject({ damage: 0, isReady: true });
    const hand0 = game.p1.hand().length;
    await game.p1.move(["poro", "wall"], "bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.locationOf("poro")).toBe("bf1");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
  });
});
