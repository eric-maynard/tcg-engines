/**
 * Oasis Raider — ven-006-166 · Unit · Fury · 4 energy · 4 Might
 *
 *   If you control fewer runes than an opponent at the start of your Beginning Phase,
 *   give me +2 [Might] and [Ganking] this turn. (I can move from battlefield to battlefield.)
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. WHEN the count is taken: the start of YOUR Beginning Phase (315.2.a) — before your Channel
 *     Phase (315.3). Going second you are usually one turn of channeling behind at that instant, so
 *     "1 rune vs their 2" fires; after you channel to 3 the bonus does not switch off (it was given).
 *  2. STRICTLY fewer: equal rune counts (2 vs 2) and more runes (3 vs 2) give nothing — negative space.
 *  3. "Runes you control" = runes on your board (rune pool), ready OR exhausted; runes in the rune
 *     deck and power/energy in the pool are not runes you control.
 *  4. "this turn": the +2 and Ganking expire at end of turn (across game.advanceTurn()) and are NOT
 *     re-granted at the opponent's Beginning Phase even if you are still behind (only YOUR phase).
 *  5. Ganking (810 / 144.4.c.1) is what the bonus is for: with it the Raider can Standard-Move
 *     bf1 → bf2 as a 6-Might attacker; without the trigger it cannot gank at all.
 *  6. Location-agnostic: the Raider gets the bonus whether it woke up in base or at a battlefield.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-006-166";

/** P2 is about to end their turn. P1 has `mine` runes on board, P2 has `theirs`. Raider at `where`. */
function dawn(mine: number, theirs: number, where: "base" | "bf1" = "base") {
  return scenario()
    .turn(2)
    .active(P2)
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .runes(P1, "fury", mine)
    .runes(P2, "fury", theirs)
    .unit(P1, where, CARD, "raider");
}

describe("Oasis Raider (ven-006-166)", () => {
  test("registry: one Beginning-Phase trigger, conditioned on fewer runes, giving +2 Might and Ganking for the turn", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 4, might: 4 });
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { type: "fewer-runes-than-opponent" },
      effect: {
        effects: [
          { amount: 2, duration: "turn", target: "self", type: "modify-might" },
          { duration: "turn", keyword: "Ganking", target: "self", type: "grant-keyword" },
        ],
        type: "sequence",
      },
      trigger: { event: "beginning-phase", on: "controller" },
      type: "triggered",
    });
  });

  test("cost: 4 energy for a 4-Might unit that enters the base exhausted; 3 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "raider").build();
    await game.p1.play("raider");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("base");
    expect(game.state("raider")).toMatchObject({ baseMight: 4, isExhausted: true, might: 4 });
    expect(game.state("raider").keywords).not.toContain("Ganking");
    const poor = await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "raider").build();
    expect(poor.p1.can("play", "raider")).toBe(false);
  });

  test("fewer runes (1 vs 2) at the start of your Beginning Phase → +2 Might (6) and Ganking this turn; you still channel to 3 afterwards", async () => {
    const game = await dawn(1, 2).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.runes()).toHaveLength(3); // channel phase happened after the check
    expect(game.state("raider").might).toBe(6);
    expect(game.state("raider").keywords).toContain("Ganking");
    expect(game.state("raider").grantedKeywords).toEqual(
      expect.arrayContaining([expect.objectContaining({ duration: "turn", keyword: "Ganking" })]),
    );
  });

  test("negative space: EQUAL rune counts (2 vs 2) give nothing", async () => {
    const game = await dawn(2, 2).build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("raider").might).toBe(4);
    expect(game.state("raider").keywords).not.toContain("Ganking");
    expect(game.state("raider").grantedKeywords).toEqual([]);
  });

  test("negative space: MORE runes than the opponent (3 vs 1) give nothing", async () => {
    const game = await dawn(3, 1).build();
    await game.advanceTurn();
    expect(game.state("raider").might).toBe(4);
    expect(game.state("raider").keywords).not.toContain("Ganking");
  });

  test("exhausted runes still count as runes you control: 2 exhausted vs their 2 ready → not fewer → nothing", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .runes(P1, "fury", 2, { exhausted: true })
      .runes(P2, "fury", 2)
      .unit(P1, "base", CARD, "raider")
      .build();
    await game.advanceTurn();
    expect(game.state("raider").might).toBe(4);
    expect(game.state("raider").keywords).not.toContain("Ganking");
  });

  test("'this turn': the bonus is gone once the turn passes, and the opponent's Beginning Phase does not re-grant it", async () => {
    const game = await dawn(0, 2).build();
    await game.advanceTurn(); // P1's turn: 0 < 2 → bonus
    expect(game.state("raider").might).toBe(6);
    await game.advanceTurn(); // P2's turn: P1 (2 runes) is still behind P2 (4) but it is not P1's phase
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("raider").might).toBe(4);
    expect(game.state("raider").keywords).not.toContain("Ganking");
    expect(game.state("raider").grantedKeywords).toEqual([]);
  });

  test("Ganking pay-off: a Raider that woke up at bf1 may Standard-Move bf1 → bf2 and attacks there as a 6", async () => {
    const game = await dawn(1, 2, "bf1").unit(P2, "bf2", { might: 5, name: "Sentinel" }, "sentinel").build();
    await game.advanceTurn();
    expect(game.state("raider").isReady).toBe(true); // Awaken readied it
    expect(game.p1.can("gank", "raider")).toBe(true);
    await game.p1.gank("raider", "bf2");
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.state("raider").combatRole).toBe("attacker");
    expect(game.state("raider").might).toBe(6);
    await game.settle();
    // 6 into a 5: the Sentinel dies, 5 damage on a 6-Might Raider is not lethal → it conquers bf2.
    expect(game.zoneOf("sentinel")).toBe("trash");
    expect(game.locationOf("raider")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
  });

  test("negative space: without the trigger (equal runes) a Raider at bf1 has no Ganking and cannot move to bf2", async () => {
    const game = await dawn(2, 2, "bf1").build();
    await game.advanceTurn();
    expect(game.p1.can("gank", "raider")).toBe(false);
    const r = await game.p1.try((p) => p.gank("raider", "bf2"));
    expect(r.ok).toBe(false);
    expect(game.locationOf("raider")).toBe("bf1");
  });

  test("the trigger uses the chain at the start of the Beginning Phase (before channel/draw) and is sourced from the Raider", async () => {
    const game = await dawn(1, 2).build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "raider", controller: P1, triggered: true })]);
    expect(game.p1.runes()).toHaveLength(1); // not channeled yet
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("raider").might).toBe(6);
  });

  test("only an OPPONENT is compared: in a 2-player game P2's own Raider checks against P1 at P2's Beginning Phase", async () => {
    const game = await scenario()
      .turn(3)
      .active(P1)
      .runes(P1, "fury", 3)
      .runes(P2, "fury", 2)
      .unit(P2, "base", CARD, "theirs")
      .unit(P1, "base", CARD, "mine")
      .build();
    await game.advanceTurn(); // → P2's turn; P2 has 2 < 3
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("theirs").might).toBe(6);
    expect(game.state("theirs").keywords).toContain("Ganking");
    // P1's Raider is untouched during P2's Beginning Phase.
    expect(game.state("mine").might).toBe(4);
    expect(game.violations()).toEqual([]);
  });
});
