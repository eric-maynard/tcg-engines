/**
 * Blue Sentinel — unl-087-219 · Unit · Mind · 4 energy + [mind] · 4 might
 *
 *   [Shield 2] (+2 [Might] while I'm a defender.)
 *   Your hold effects for holding here trigger an additional time.
 *   When I hold, [Add] [rainbow] at the start of your next Main Phase.
 *   (Abilities that add resources can't be reacted to.)
 *
 * Head-judge notes (trickiest situations for THIS card):
 *  1. The [Add] is DELAYED to "the start of your next Main Phase" for a reason: every Rune Pool
 *     empties as the Main Phase begins (316.3) and only then do start-of-Main-Phase effects happen
 *     (316.4). Adding the power during the Beginning Phase (when the hold happens) would lose it.
 *     So the observable contract is: after the turn rolls into P1's Main Phase, P1 has the power.
 *  2. "Your hold effects for holding HERE trigger an additional time" (cf. Red Brambleback for
 *     conquer): Blue Sentinel's OWN hold effect is one of them (→ 2 power), so are a co-located
 *     Ahri ("When I hold, you score 1 point" → +2), Voracious Gromp's Hunt 3 (→ 6 XP) and the
 *     battlefield's own "When you hold here" (Grove of the God-Willow → draw 2, 383.4.d.2.b).
 *  3. Negative space: hold effects at ANOTHER battlefield you hold trigger once; CONQUER effects at
 *     this battlefield are not hold effects (Gromp conquering beside it → 3 XP); the hold POINT itself
 *     is not an "effect" and is never doubled; nothing happens on the opponent's turn.
 *  4. Shield 2 (814) only while DEFENDING, and it is real Might (offence too): a 5-Might attacker
 *     fails to kill it (5 < 6) AND dies to the 6 back; a 6 trades; attacking, Sentinel is a plain 4.
 *  5. [Add] abilities never open a chain (429.2): the opponent gets no priority window off the hold
 *     trigger.
 *  6. Cost: 4 + [mind]; 4 with off-domain power or 3 + [mind] is not enough.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-087-219";
const AHRI = "ogn-066-298"; // Champion unit · When I hold, you score 1 point.
const GROMP = "unl-100-219"; // Unit · 5 Might · [Hunt 3] (When I conquer or hold, gain 3 XP.)
const GROVE = "ogn-280-298"; // Battlefield · When you hold here, draw 1.

/** P2 is about to end turn 2; P1 controls bf1 (held next Beginning Phase) with Blue Sentinel on it. */
function aboutToHold() {
  return scenario().turn(2).active(P2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "bs");
}

describe("Blue Sentinel (unl-087-219)", () => {
  test("cost: 4 energy + 1 mind for a 4-Might unit with Shield that enters the base exhausted; off-domain power or 3 energy → not playable", async () => {
    const game = await scenario().resources(P1, { energy: 4, power: { mind: 1 } }).hand(P1, CARD, "bs").build();
    await game.p1.play("bs");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    await game.settle();
    expect(game.state("bs")).toMatchObject({ isExhausted: true, might: 4, zone: "base" });
    expect(game.state("bs").keywords).toContain("Shield");
    const offDomain = await scenario().resources(P1, { energy: 4, power: { fury: 2 } }).hand(P1, CARD, "bs").build();
    expect(offDomain.p1.can("play", "bs")).toBe(false);
    const short = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).hand(P1, CARD, "bs").build();
    expect(short.p1.can("play", "bs")).toBe(false);
  });

  test("Shield 2 while defending: a 5-Might attacker cannot kill it (5 < 4+2) and, Might being Might, takes 6 back and dies; bf1 stays P1's", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "bs")
      .unit(P2, "base", { might: 5, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.state("bs")).toMatchObject({ combatRole: "defender", might: 6 });
    await game.settle();
    expect(game.zoneOf("bs")).toBe("battlefield-bf1");
    expect(game.zoneOf("raider")).toBe("trash"); // 6 ≥ 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.state("bs").might).toBe(4); // Shield ends with the defender designation (814.1.d.1)
    expect(game.state("bs").damage).toBe(0); // healed at Combat Cleanup

    // One short of breaking it vs exactly enough: a 6-Might attacker trades (6 ≥ 6 both ways).
    const six = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "bs")
      .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
      .build();
    await six.p2.move("brute", "bf1");
    await six.settle();
    expect(six.zoneOf("bs")).toBe("trash");
    expect(six.zoneOf("brute")).toBe("trash");
  });

  test("Shield does nothing while ATTACKING: Blue Sentinel (4) into a 5-Might defender dies and deals only 4", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5, name: "Warden" }, "warden")
      .unit(P1, "base", CARD, "bs")
      .build();
    await game.p1.move("bs", "bf1");
    expect(game.state("bs")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("bs")).toBe("trash");
    expect(game.zoneOf("warden")).toBe("battlefield-bf1"); // 4 < 5
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("holding scores the normal single point and opens no chain for the [Add] trigger (429.2 — can't be reacted to)", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1); // the hold point is never doubled
  });

  // BUG — expected (316.3 → 316.4): the [Add] happens "at the start of your next Main Phase", i.e.
  // AFTER the pools empty, so P1 opens the Main Phase with the power available (2, since Blue
  // Sentinel's own hold effect is one of "your hold effects for holding here"). Actual: the card is
  // wired as an immediate add-resource at hold time (Beginning Phase); the Main Phase then empties
  // the pool and P1 starts with nothing.
  test("after holding, P1 starts the Main Phase with the added power (delayed [Add], 316.3/316.4)", async () => {
    const game = await aboutToHold().build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.p1.power()).toBeGreaterThanOrEqual(1);
  });

  test("its own hold effect triggers an additional time here → exactly 2 power at the start of the Main Phase", async () => {
    const game = await aboutToHold().build();
    await game.advanceTurn();
    expect(game.p1.power()).toBe(2);
    expect(game.p1.energy()).toBe(0);
  });

  // BUG — expected: "Your hold effects for holding here trigger an additional time" doubles every
  // hold effect of P1's for bf1 — Ahri's "When I hold, you score 1 point" beside it fires twice
  // (1 hold + 2 = 3 points). Actual: the static is encoded as an inert `HoldRepeatHere` keyword the
  // engine never reads (contrast Red Brambleback's `trigger-double`), so Ahri fires once (2 points).
  test("a co-located Ahri's hold effect triggers twice → P1 on 3 points", async () => {
    const game = await aboutToHold().unit(P1, "bf1", AHRI, "ahri").build();
    await game.p2.endTurn();
    expect(game.chain().filter((i) => i.cardId === "ahri")).toHaveLength(2);
    await game.settle();
    expect(game.p1.points()).toBe(3);
  });

  test("a co-located Voracious Gromp's Hunt 3 (a hold effect, 823.1.b) triggers twice → 6 XP", async () => {
    const game = await aboutToHold().unit(P1, "bf1", GROMP, "gromp").build();
    await game.advanceTurn();
    expect(game.p1.xp()).toBe(6);
  });

  test("the battlefield's own 'When you hold here, draw 1' (Grove of the God-Willow) is your hold effect for holding here → draw 2 (+1 draw phase = 3 in hand)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1, def: GROVE, inert: false, owner: P1 })
      .unit(P1, "bf1", CARD, "bs")
      .build();
    expect(game.p1.hand()).toHaveLength(0);
    await game.advanceTurn();
    expect(game.p1.hand()).toHaveLength(3);
  });

  test("negative space — 'for holding HERE': Gromp and Ahri holding a DIFFERENT battlefield trigger exactly once (3 XP, +1 point)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", CARD, "bs")
      .unit(P1, "bf2", GROMP, "gromp")
      .unit(P1, "bf2", AHRI, "ahri")
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.points()).toBe(3); // two battlefields held + Ahri once
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.hand()).toHaveLength(1); // just the draw phase
  });

  test("negative space — CONQUER effects here are not hold effects: Gromp conquering bf1 alongside Blue Sentinel gains exactly 3 XP", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "bs")
      .unit(P1, "base", GROMP, "gromp")
      .build();
    await game.p1.move(["bs", "gromp"], "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3);
    expect(game.p1.power()).toBe(0); // "When I hold" — conquering adds nothing
  });

  test("negative space — only YOUR Beginning Phase holds: across the opponent's turn nothing triggers, no points, no power", async () => {
    const game = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "bs").unit(P1, "bf1", AHRI, "ahri").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.points()).toBe(0);
    expect(game.p1.power()).toBe(0);
    expect(game.p2.points()).toBe(0);
  });

  test("registry payload: Shield 2 keyword, a self static for the hold doubling, and a 'When I hold' add-resource [rainbow] trigger", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "mind", energyCost: 4, might: 4, name: "Blue Sentinel", powerCost: ["mind"] });
    const abilities = (def?.abilities ?? []) as { type: string; keyword?: string; value?: number; trigger?: unknown; effect?: { type?: string; power?: string[] } }[];
    expect(abilities).toHaveLength(3);
    expect(abilities[0]).toEqual({ keyword: "Shield", type: "keyword", value: 2 });
    expect(abilities[1]?.type).toBe("static");
    expect(abilities[2]).toMatchObject({ effect: { power: ["rainbow"], type: "add-resource" }, trigger: { event: "hold", on: "self" }, type: "triggered" });
  });
});
