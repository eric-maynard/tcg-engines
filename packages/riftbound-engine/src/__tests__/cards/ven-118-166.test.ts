/**
 * Horns of the Dragon — ven-118-166 · Unit · Order · 6 energy (no power) · 6 Might
 *
 *   [Tank] (I must be assigned combat damage first.)
 *
 * Rules: 815.1.b (Tank = "I must be assigned lethal damage before any other unit with the SAME
 * CONTROLLER as me that does not have [Tank] during the Combat Damage step" — attacker or defender),
 * 815.1.c.1 (lethal must be reached on a unit before moving on), 815.1.c.2 (several Tanks: any of
 * them, non-Tanks stay invalid until ALL Tanks have lethal), 423.1.b/c (a stunned unit deals no
 * combat damage but still needs full lethal), 465.2.c (assignment prompt), 143.3.b.2 (heal at cleanup).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. Tank soaks BEFORE the ally even when the incoming damage is not lethal to the Tank but would
 *     have killed the ally outright (5 into Horns 6 + ally 2 → ally untouched, Horns heals).
 *  2. Overflow arithmetic: exactly 8 into Horns + a 2-Might ally kills both; 7 kills Horns and leaves
 *     the ally on 1 damage (one short) — the assigner may NOT short the Tank to finish the ally.
 *  3. When a real choice exists (9 into Horns + 2 + 2) the assigning player is prompted, and an
 *     allocation that leaves Horns below lethal while damaging a non-Tank is rejected.
 *  4. Tank is symmetric: an ATTACKING Horns also eats the defender's damage before its fellow attacker.
 *  5. A STUNNED Horns contributes 0 damage yet still must be assigned lethal first.
 *  6. Two Tanks side by side: both need lethal before the third unit can be touched.
 *  7. Tank only governs COMBAT damage assignment — a spell may still pick off the ally beside it.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-118-166";
const BOLT = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Bolt",
  timing: "action",
} as const;

/** P2 defends bf1 with Horns + a 2-Might ally (listed FIRST so a greedy non-Tank line would hit it); P1 attacks with `atk` Might. */
function defence(atk: number) {
  return scenario()
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2, name: "Squire" }, "small")
    .unit(P2, "bf1", CARD, "horns")
    .unit(P1, "base", { might: atk, name: "Bruiser" }, "atk");
}

/** Pass focus/priority until a non-action prompt (e.g. the damage assignment) or the open main phase. */
async function stepToPrompt(game: Game): Promise<Decision | null> {
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d || (d.kind === "action" && d.context === "main")) {
      return null;
    }
    if (d.kind !== "action") {
      return d;
    }
    if (d.context === "procedure" && d.options[0]) {
      await game.seat(d.seat).choose(d.options[0].key);
    } else {
      await game.seat(d.seat).pass();
    }
  }
  return null;
}

describe("Horns of the Dragon (ven-118-166)", () => {
  test("registry payload: 6-cost Order unit, no power, 6 Might, exactly one ability — the Tank keyword", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "order", energyCost: 6, might: 6, name: "Horns of the Dragon" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toEqual([{ keyword: "Tank", type: "keyword" }]);
  });

  test("cost: exactly 6 energy; enters the base exhausted as a 6-Might Tank; 5 energy (even with order power) is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 7 }).hand(P1, CARD, "horns").build();
    await game.p1.play("horns");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    await game.settle();
    expect(game.state("horns")).toMatchObject({ isExhausted: true, keywords: ["Tank"], might: 6, zone: "base" });
    const poor = await scenario().resources(P1, { energy: 5, power: { order: 2 } }).hand(P1, CARD, "horns").build();
    expect(poor.p1.can("play", "horns")).toBe(false);
  });

  test("defending: a 5-Might attacker's damage all lands on Horns (not lethal) — the 2-Might Squire beside it is untouched, Horns heals, attacker dies to 8", async () => {
    const game = await defence(5).build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.state("small").damage).toBe(0);
    expect(game.zoneOf("horns")).toBe("battlefield-bf1");
    expect(game.state("horns").damage).toBe(0); // 5 marked, healed at combat cleanup
    expect(game.zoneOf("atk")).toBe("trash"); // 6 + 2 = 8 ≥ 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  test("control (no Tank): the same 5-Might attacker into a vanilla 6 + the Squire kills the Squire", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Squire" }, "small")
      .unit(P2, "bf1", { might: 6, name: "Plain Six" }, "six")
      .unit(P1, "base", { might: 5, name: "Bruiser" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    await game.settle({ policy: "first" });
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.zoneOf("six")).toBe("battlefield-bf1");
  });

  test("exactly lethal overflow: 8 into Horns (6) + Squire (2) kills both; a 9-Might attacker survives the 8 back and conquers", async () => {
    const game = await defence(9).build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("horns")).toBe("trash");
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.locationOf("atk")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("one short: 7 kills Horns and leaves the Squire alive (only 1 left over) — the battlefield holds", async () => {
    const game = await defence(7).build();
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("horns")).toBe("trash");
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.zoneOf("atk")).toBe("trash"); // took 8 ≥ 7
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p1.points()).toBe(0);
  });

  test("assignment prompt (9 into Horns + A + B): the attacker is asked; shorting the Tank to hit both non-Tanks is rejected, Horns 6 / A 2 / B 1 is accepted", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf1", CARD, "horns")
      .unit(P2, "bf1", { might: 2, name: "B" }, "b")
      .unit(P1, "base", { might: 9, name: "Bruiser" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    const d = await stepToPrompt(game);
    expect(d).toMatchObject({ kind: "distribute", seat: P1, total: 9 });
    const illegal = await game.p1.try((p) => p.distribute({ a: 2, b: 2, horns: 5 }));
    expect(illegal.ok).toBe(false);
    expect(game.state("a").damage).toBe(0); // nothing applied
    await game.p1.distribute({ a: 2, b: 1, horns: 6 });
    await game.settle();
    expect(game.zoneOf("horns")).toBe("trash");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.zoneOf("b")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("Tank is symmetric (815.1.b 'same controller as me'): an ATTACKING Horns soaks the 5-Might defender's damage, its 2-Might partner survives, 8 kills the defender → conquer", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Warden" }, "warden")
      .unit(P1, "base", { might: 2, name: "Partner" }, "partner")
      .unit(P1, "base", CARD, "horns")
      .build();
    await game.p1.move(["partner", "horns"], "bf1");
    await game.settle();
    expect(game.zoneOf("warden")).toBe("trash");
    expect(game.locationOf("partner")).toBe("bf1");
    expect(game.locationOf("horns")).toBe("bf1");
    expect(game.state("horns").damage).toBe(0);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("a STUNNED Horns deals nothing (423.1.b) but must still be assigned lethal first: 4-Might attacker into stunned Horns + a 3-Might ally → ally untouched, attacker eats 3 and lives", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Ally" }, "ally")
      .unit(P2, "bf1", CARD, "horns", { stunned: true })
      .unit(P1, "base", { might: 4, name: "Raider" }, "atk")
      .build();
    expect(game.state("horns").isStunned).toBe(true);
    await game.p1.move("atk", "bf1");
    await game.settle();
    expect(game.zoneOf("ally")).toBe("battlefield-bf1"); // 4 ≥ 3 would have killed it without Tank
    expect(game.zoneOf("horns")).toBe("battlefield-bf1"); // 4 < 6
    expect(game.zoneOf("atk")).not.toBe("trash"); // only the ally's 3 came back (< 4)
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("two Tanks (815.1.c.2): 13 into Horns + Horns + Squire → both Tanks take lethal (12) and only 1 reaches the Squire, which survives", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Squire" }, "small")
      .unit(P2, "bf1", CARD, "h1")
      .unit(P2, "bf1", CARD, "h2")
      .unit(P1, "base", { might: 13, name: "Colossus" }, "atk")
      .build();
    await game.p1.move("atk", "bf1");
    const d = await stepToPrompt(game);
    if (d?.kind === "distribute") {
      // Lethal on one Tank only, then the Squire: illegal while the other Tank is short.
      expect((await game.p1.try((p) => p.distribute({ h1: 6, h2: 5, small: 2 }))).ok).toBe(false);
      await game.p1.distribute({ h1: 6, h2: 6, small: 1 });
    }
    await game.settle();
    expect(game.zoneOf("h1")).toBe("trash");
    expect(game.zoneOf("h2")).toBe("trash");
    expect(game.zoneOf("small")).toBe("battlefield-bf1");
    expect(game.zoneOf("atk")).toBe("trash"); // 6 + 6 + 2 = 14 ≥ 13
  });

  test("negative space: Tank does not shield the ally from SPELL damage — a 2-damage bolt may target and kill the Squire right next to Horns", async () => {
    const game = await defence(1).resources(P1, { energy: 0 }).hand(P1, BOLT, "bolt").build();
    const targets = game.p1.option("cast", "bolt")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["small"], ["horns"]]));
    await game.p1.cast("bolt", { targets: "small" });
    await game.settle();
    expect(game.zoneOf("small")).toBe("trash");
    expect(game.state("horns").damage).toBe(0);
  });
});
