/**
 * Yone, Blademaster — sfd-116-221 · Champion Unit (Yone) · Body · 5 energy + [body] · 5 Might
 *
 *   [Weaponmaster] (When you play me, you may [Equip] one of your Equipment to me for [rainbow]
 *   less, even if it's already attached.)
 *   When I conquer a battlefield that was uncontrolled, deal damage equal to my Might to an
 *   enemy unit in a base.
 *
 * Rules: 821 (Weaponmaster), 469.1 / 466.5.d (Conquer = gaining control of a battlefield you have
 * not scored this turn — by winning combat OR by walking onto it), 383.4.c (conquer effects of
 * units present at the conquer), 188 (control: a battlefield is uncontrolled when no player
 * controls it), 359.3.e (“my Might” is read when the instruction executes — Equipment and
 * -Might effects count), 143.2.a (damage ≥ Might kills), 467 (Hold scoring is not a Conquer).
 *
 * Head-judge corner cases considered:
 *   1. "that was uncontrolled": walking onto a NEUTRAL battlefield triggers; taking a battlefield
 *      the opponent controlled — empty or by winning combat — must NOT (engine drops the
 *      qualifier → BUG tests).
 *   2. Target restriction "enemy unit IN A BASE": enemy units at battlefields and friendly base
 *      units are never offered; with no enemy unit in any base the conquer still scores and
 *      nothing else happens.
 *   3. Damage = CURRENT Might: 5 bare (exactly lethal on 5, one short on 6), 7 with Doran's Blade.
 *   4. Only "when *I* conquer": another friendly unit conquering while Yone sits home does nothing;
 *      Holding the battlefield next turn scores but is not a conquer.
 *   5. Cost 5 + [body]; Weaponmaster makes Doran's Blade (Equip [body]) free on entry.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-116-221";
const DORANS_BLADE = "sfd-095-221"; // Body Equipment · Equip [body] · +2 Might

/** Yone ready in base, a neutral bf1, and two enemy units at home (5 and 6 Might). */
function neutralBoard() {
  return scenario()
    .battlefield("bf1") // controller: null → uncontrolled
    .unit(P1, "base", CARD, "yone")
    .unit(P2, "base", { might: 5, name: "Exact" }, "exact")
    .unit(P2, "base", { might: 6, name: "Sturdy" }, "sturdy");
}

describe("Yone, Blademaster (sfd-116-221)", () => {
  test("parsed abilities: Weaponmaster keyword + a self-conquer trigger dealing self-Might damage to an enemy unit in a base", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", energyCost: 5, isChampion: true, might: 5, powerCost: ["body"], tags: ["Yone"] });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toEqual({ keyword: "Weaponmaster", type: "keyword" });
    expect(def?.abilities?.[1]).toMatchObject({
      effect: {
        amount: { might: "self" },
        target: { controller: "enemy", location: "base", type: "unit" },
        type: "damage",
      },
      trigger: { event: "conquer", on: "self" },
      type: "triggered",
    });
  });

  test("cost: 5 energy + 1 body, enters exhausted as a 5-Might Weaponmaster; short on energy or body → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 6, power: { body: 1 } }).hand(P1, CARD, "yone").build();
    await game.p1.play("yone");
    expect(game.p1.resources()).toEqual({ energy: 1, power: { body: 0 } });
    await game.settle();
    expect(game.zoneOf("yone")).toBe("base");
    expect(game.state("yone")).toMatchObject({ isExhausted: true, might: 5 });
    expect(game.state("yone").keywords).toContain("Weaponmaster");
    const lowEnergy = await scenario().resources(P1, { energy: 4, power: { body: 1 } }).hand(P1, CARD, "yone").build();
    expect(lowEnergy.p1.can("play", "yone")).toBe(false);
    const noBody = await scenario().resources(P1, { energy: 5 }).hand(P1, CARD, "yone").build();
    expect(noBody.p1.can("play", "yone")).toBe(false);
  });

  test("Weaponmaster: on entry Doran's Blade (Equip [body]) attaches for free → 7 Might", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { body: 1 } })
      .gear(P1, DORANS_BLADE, "blade")
      .hand(P1, CARD, "yone")
      .build();
    await game.p1.play("yone");
    expect(game.decision()).toMatchObject({ allowDecline: true, kind: "pick", seat: P1 });
    await game.p1.pick("blade");
    await game.settle();
    expect(game.state("blade").attachedTo).toBe("yone");
    expect(game.state("yone").might).toBe(7);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
  });

  test("conquering an UNCONTROLLED battlefield: scores, then offers only enemy units in a base; 5 damage is exactly lethal on a 5-Might unit", async () => {
    const game = await neutralBoard()
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 1, name: "Outpost" }, "outpost")
      .unit(P1, "base", { might: 1, name: "Page" }, "page")
      .build();
    await game.p1.move("yone", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card).sort() : [];
    expect(offered).toEqual(["exact", "sturdy"]); // not "outpost" (at a battlefield), not "page" (friendly)
    await game.p1.pick("exact");
    await game.settle();
    expect(game.zoneOf("exact")).toBe("trash");
    expect(game.state("sturdy").damage).toBe(0);
    expect(game.violations()).toEqual([]);
  });

  test("one short: 5 damage on the 6-Might unit leaves it alive with 5 damage", async () => {
    const game = await neutralBoard().build();
    await game.p1.move("yone", "bf1");
    await game.settle();
    await game.p1.pick("sturdy");
    await game.settle();
    expect(game.zoneOf("sturdy")).toBe("base");
    expect(game.state("sturdy").damage).toBe(5);
    expect(game.zoneOf("exact")).toBe("base");
  });

  test("'equal to my Might' is read on resolution: wearing Doran's Blade (7 Might) it kills a 7-Might unit", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .gear(P1, DORANS_BLADE, "blade", { attachedTo: "yone" })
      .unit(P1, "base", CARD, "yone", { equippedWith: ["blade"] })
      .unit(P2, "base", { might: 7, name: "Colossus" }, "colossus")
      .build();
    expect(game.state("yone").might).toBe(7);
    await game.p1.move("yone", "bf1");
    await game.settle(); // single legal target → forced
    expect(game.zoneOf("colossus")).toBe("trash");
  });

  test("no enemy unit in any base: the conquer still scores and no prompt or damage happens", async () => {
    const game = await scenario()
      .battlefield("bf1")
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "base", CARD, "yone")
      .unit(P2, "bf2", { might: 2, name: "Outpost" }, "outpost")
      .build();
    await game.p1.move("yone", "bf1");
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("outpost").damage).toBe(0);
    expect(game.zoneOf("outpost")).toBe("battlefield-bf2");
  });

  test("'that was uncontrolled' — winning combat for a battlefield the OPPONENT controlled must not trigger the damage", async () => {
    // Expected: bf1 was controlled by P2, so after Yone kills the defender and conquers, no enemy base unit is
    // damaged and no target prompt appears. Actual: the qualifier is not parsed; 5 damage is dealt anyway.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Defender" }, "defender")
      .unit(P1, "base", CARD, "yone")
      .unit(P2, "base", { might: 6, name: "Sturdy" }, "sturdy")
      .build();
    await game.p1.move("yone", "bf1");
    await game.settle();
    expect(game.zoneOf("defender")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()?.kind).not.toBe("pick");
    expect(game.state("sturdy").damage).toBe(0);
  });

  test("'that was uncontrolled' — walking onto an EMPTY battlefield the opponent controlled must not trigger either", async () => {
    // Expected: control passes P2 → P1 (a conquer), but the battlefield was not uncontrolled → no damage.
    // Actual: Sturdy takes 5.
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "yone")
      .unit(P2, "base", { might: 6, name: "Sturdy" }, "sturdy")
      .build();
    await game.p1.move("yone", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("sturdy").damage).toBe(0);
  });

  test("'when I conquer': another friendly unit conquering a neutral battlefield while Yone stays home does nothing", async () => {
    const game = await neutralBoard().unit(P1, "base", { might: 2, name: "Scout" }, "scout").build();
    await game.p1.move("scout", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("exact").damage).toBe(0);
    expect(game.state("sturdy").damage).toBe(0);
  });

  test("Holding is not conquering: scoring bf1 at the start of Yone's next turn deals no damage", async () => {
    const game = await neutralBoard().build();
    await game.p1.move("yone", "bf1");
    await game.settle();
    await game.p1.pick("exact"); // the conquer trigger kills Exact; Sturdy is never touched
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.zoneOf("exact")).toBe("trash");
    await game.advanceTurn(); // P2's turn
    await game.advanceTurn(); // P1's turn: Hold bf1 → +1 point, but no conquer trigger
    expect(game.turnPlayer()).toBe(P1);
    expect(game.locationOf("yone")).toBe("bf1");
    expect(game.p1.points()).toBe(2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.state("sturdy").damage).toBe(0);
    expect(game.zoneOf("sturdy")).toBe("base");
  });
});
