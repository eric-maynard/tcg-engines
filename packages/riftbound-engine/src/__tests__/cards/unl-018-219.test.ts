/**
 * Yeti Brawler — unl-018-219 · Unit · Fury · 6 energy · 6 Might
 *
 *   When I conquer, if you assigned 3 or more excess damage, play two Gold gear tokens exhausted.
 *   (They have "[Reaction][>] Kill this, [Exhaust]: [Add] [rainbow].")
 *
 * Head-judge checklist for this card:
 *  1. "Excess damage" (465.2.c / 626.1.d.2): what the ATTACKING side assigned beyond each defender's
 *     remaining lethal need. 6 into a 3-Might defender = exactly 3 → Gold; 6 into a 4 = 2 → one short,
 *     no Gold (but the conquer point still scores). Damage already on a defender lowers its need
 *     (5-Might with 2 damage needs 3 → 3 excess). It is summed over all defenders (two 1s → 4).
 *  2. "you assigned": the whole attacking side counts — Yeti 6 + a 2-Might ally into a 5 = 3 excess.
 *     Assault raises the assigned total too (Cleave: Yeti 9 into a 6 → 3 excess, and it now survives).
 *  3. "When I conquer" needs an actual conquer BY Yeti's side with Yeti there: walking onto an EMPTY
 *     enemy battlefield conquers with no combat (0 excess → no Gold); DEFENDING successfully is not a
 *     conquer at all; a tie (6 into 6, both die) conquers nothing.
 *  4. Output: two Gold gear TOKENS in P1's base, EXHAUSTED (not crackable until P1's next Awaken),
 *     never in P2's base; the trigger is conditional ("if"), so when the condition fails nothing is
 *     even offered.
 *  5. Cost: 6 energy, no power; enters exhausted.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-018-219";
const CLEAVE = "ogn-004-298"; // Fury [Action] 1: give a unit [Assault 3] this turn

const golds = (game: Game, seat: "p1" | "p2" = "p1") => game[seat].base().filter((id) => game.state(id).name === "Gold");

/** Yeti ready in P1's base; P2 holds bf1 with the given defenders (might or [might, damage]). */
function facing(...defenders: (number | [number, number])[]) {
  const b = scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "yeti");
  defenders.forEach((d, i) => {
    const [might, damage] = typeof d === "number" ? [d, 0] : d;
    b.unit(P2, "bf1", { might, name: `Def${i + 1}` }, `d${i + 1}`, damage > 0 ? { damage } : undefined);
  });
  return b;
}

/**
 * Attack bf1 with the given units and fight it out. Damage-assignment prompts (465.2.c) are answered:
 * P1's with `allocation` (or the engine's suggested split), the defender's with the suggested split.
 */
async function attack(game: Game, units: string | string[] = "yeti", allocation?: Record<string, number>): Promise<void> {
  await game.p1.move(units, "bf1");
  for (let i = 0; i < 4; i++) {
    await game.settle({ maxSteps: 60 });
    const d = game.decision();
    if (d?.kind !== "distribute") {
      return;
    }
    const suggested = (d as unknown as { defaultAllocation?: Record<string, number> }).defaultAllocation ?? {};
    await game.seat(d.seat).distribute(d.seat === P1 && allocation ? allocation : suggested);
  }
}

describe("Yeti Brawler (unl-018-219)", () => {
  test("registry payload: conquer trigger on self, condition excess-damage-assigned ≥ 3, effect create 2 Gold gear tokens not ready", async () => {
    await facing(3).build();
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 6, might: 6, name: "Yeti Brawler" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([
      {
        condition: { amount: 3, type: "excess-damage-assigned" },
        effect: { amount: 2, ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
        trigger: { event: "conquer", on: "self" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 6 energy, no power; enters the base exhausted at 6 Might; 5 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 6 }).hand(P1, CARD, "yeti").build();
    await game.p1.play("yeti");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("yeti")).toBe("base");
    expect(game.state("yeti")).toMatchObject({ isExhausted: true, might: 6 });
    expect((await scenario().resources(P1, { energy: 5, power: { fury: 3 } }).hand(P1, CARD, "y").build()).p1.can("play", "y")).toBe(false);
  });

  test("6 into a 3-Might defender = exactly 3 excess: conquers (+1) and plays two EXHAUSTED Gold gear tokens into P1's base", async () => {
    const game = await facing(3).build();
    await attack(game);
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.locationOf("yeti")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const g = golds(game);
    expect(g).toHaveLength(2);
    for (const id of g) {
      expect(game.state(id)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold", owner: P1, zone: "base" });
      expect(game.p1.can("activate", id)).toBe(false); // exhausted: no cash this turn
    }
    expect(golds(game, "p2")).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("one short: 6 into a 4-Might defender is only 2 excess — conquer point yes, Gold no (nothing offered)", async () => {
    const game = await facing(4).build();
    await attack(game);
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(golds(game)).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("excess is measured against REMAINING lethal: a 5-Might defender already carrying 2 damage needs 3, so 6 assigned = 3 excess → Gold", async () => {
    const game = await facing([5, 2]).build();
    expect(game.state("d1").damage).toBe(2);
    await attack(game);
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(golds(game)).toHaveLength(2);
  });

  test("excess is summed across defenders: 6 split over two 1-Might units (needs 1 + 1) = 4 excess → Gold", async () => {
    const game = await facing(1, 1).build();
    await attack(game, "yeti", { d1: 3, d2: 3 });
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.zoneOf("d2")).toBe("trash");
    expect(game.p1.points()).toBe(1);
    expect(golds(game)).toHaveLength(2);
  });

  test("'you assigned' counts the whole attacking side: Yeti (6) + a 2-Might ally into a (stunned) 5-Might defender = 8 assigned, 3 excess → Gold; Yeti alone = 1 excess → none", async () => {
    // The defender is stunned (deals no combat damage) so no defender-side assignment prompt is involved.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "yeti")
      .unit(P1, "base", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "bf1", { might: 5, name: "Dazed" }, "d1", { stunned: true })
      .build();
    await attack(game, ["yeti", "buddy"]);
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.locationOf("buddy")).toBe("bf1");
    expect(golds(game)).toHaveLength(2);
    // Alone the Yeti would only have had 1 excess:
    const solo = await facing(5).build();
    await attack(solo);
    expect(solo.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(golds(solo)).toEqual([]);
  });

  test("same joint attack into an UN-stunned 5-Might defender: P2 answers its 5-damage split over Yeti+Buddy (465.2.c.7) once, Def dies to 6+2, P1 conquers, 3 excess → Gold", async () => {
    const game = await facing(5).unit(P1, "base", { might: 2, name: "Buddy" }, "buddy").build();
    await attack(game, ["yeti", "buddy"]);
    expect(game.decision()?.kind).not.toBe("distribute");
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(golds(game)).toHaveLength(2);
  });

  test("Fury partner — Cleave first ([Assault 3] → 9 as attacker) into a 6-Might defender: survives, conquers, 3 excess → Gold; without it 6-vs-6 is a wipe with no conquer and no Gold", async () => {
    const game = await facing(6).resources(P1, { energy: 1 }).hand(P1, CLEAVE, "cleave").build();
    await game.p1.cast("cleave", { targets: "yeti" });
    await game.settle();
    expect(game.state("yeti").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    await attack(game);
    expect(game.zoneOf("d1")).toBe("trash");
    expect(game.locationOf("yeti")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(golds(game)).toHaveLength(2);

    const plain = await facing(6).build();
    await attack(plain);
    expect(plain.zoneOf("d1")).toBe("trash");
    expect(plain.zoneOf("yeti")).toBe("trash");
    expect(plain.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(plain.p1.points()).toBe(0);
    expect(golds(plain)).toEqual([]);
  });

  test("negative space: conquering an EMPTY enemy battlefield involves no combat — 0 excess, point scored, no Gold", async () => {
    const game = await scenario().battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "yeti").build();
    await game.p1.move("yeti", "bf1");
    await game.settle();
    await game.settle(); // pass through the non-combat showdown if it was handed back
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(golds(game)).toEqual([]);
  });

  test("negative space: DEFENDING is not conquering — P2's 3-Might raider dies to Yeti at P1's bf1 (3 'excess' the other way), no Gold for anyone", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "yeti")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(golds(game)).toEqual([]);
    expect(golds(game, "p2")).toEqual([]);
    expect(game.p1.points()).toBe(0);
  });

  test("the Gold pays off next turn: after P1's next Awaken both tokens are ready and crack for 2 [rainbow] total", async () => {
    const game = await facing(3).build();
    await attack(game);
    expect(golds(game)).toHaveLength(2);
    await game.advanceToTurnOf(P2);
    expect(golds(game).every((id) => game.state(id).isExhausted)).toBe(true);
    await game.advanceToTurnOf(P1);
    const [g1, g2] = golds(game) as [string, string];
    expect(game.state(g1).isReady).toBe(true);
    await game.p1.activate(g1);
    await game.p1.activate(g2);
    expect(game.p1.power("rainbow")).toBe(2);
    expect(golds(game)).toEqual([]);
    expect(game.chain()).toEqual([]);
  });
});
