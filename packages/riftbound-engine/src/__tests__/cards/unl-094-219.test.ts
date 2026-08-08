/**
 * Gemhand Hunter — unl-094-219 · Unit · Body · 2 energy (no power) · 2 might
 *
 *   [Hunt] (When I conquer or hold, gain 1 XP.)
 *   [Level 6][>] I have +1 [Might]. (While you have 6+ XP, get the effect.)
 *
 * Rules: 823 (Hunt X = "When I conquer or hold, my controller gains X XP"; a triggered ability, so it
 * uses the chain), 383.4.c.2 / 383.4.d.2 (only units PRESENT at the conquered / held battlefield have
 * their "When I conquer/hold" fire), 824.1.c (Level N text is active exactly while the controller has
 * N+ XP — a passive, continuously re-evaluated, so crossing 6 in either direction flips the +1 at
 * once), 730/733 (XP is gained/spent, persists across turns, no cap), 465 (combat uses current might).
 *
 * Head-judge notes — the tricky spots this file covers:
 *  1. "When I conquer": the Hunter must be among the conquering units — an ally conquering while the
 *     Hunter idles in base gives no XP; Hunter + ally conquering together gives exactly 1 XP (one Hunt).
 *  2. "When I hold": Hunter at the held battlefield in YOUR Beginning Phase → +1 XP (+ the hold point);
 *     Hunter in base while another unit holds → point but no XP; opponent's Beginning Phase → nothing.
 *  3. Level threshold is exact and live: 5 XP → 2 might, 6 XP → 3; a Hunt that takes you 5 → 6 turns
 *     the bonus on right after that conquer; spending back below 6 turns it off.
 *  4. The fight that EARNS the 6th XP is still fought at 2 might (XP arrives after the conquer):
 *     at 5 XP a 2-might defender trades with the Hunter — no conquer, no XP.
 *  5. Only YOUR XP counts: the opponent sitting on 6+ XP does nothing for your Hunter (824.1.c.1).
 *  6. A lost attack (no conquer) and a successful DEFENCE (not a conquer) give no XP.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-094-219";
const KEEPER = "unl-203-219"; // Legend · Body/Order · "When you hold, gain 1 XP. Spend 3 XP, [Exhaust]: Draw 1." — natural XP sink

function attacker(xp: number, foeMight?: number) {
  const b = scenario().xp(P1, xp).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "hunter").unit(P1, "base", { might: 3, name: "Ally" }, "ally");
  return foeMight === undefined ? b : b.unit(P2, "bf1", { might: foeMight, name: "Foe" }, "foe");
}

describe("Gemhand Hunter (unl-094-219)", () => {
  test("registry payload: Hunt 1 keyword (+ its conquer/hold gain-xp triggers) and a Level-6-gated static +1 might on itself", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "body", energyCost: 2, might: 2, name: "Gemhand Hunter" });
    expect(def?.powerCost).toBeUndefined();
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toContainEqual({ keyword: "Hunt", type: "keyword", value: 1 });
    expect(abilities).toContainEqual({ effect: { amount: 1, type: "gain-xp" }, trigger: { event: "conquer", on: "self" }, type: "triggered" });
    expect(abilities).toContainEqual({ effect: { amount: 1, type: "gain-xp" }, trigger: { event: "hold", on: "self" }, type: "triggered" });
    expect(abilities).toContainEqual(
      expect.objectContaining({ condition: { threshold: 6, type: "while-level" }, effect: expect.objectContaining({ amount: 1, type: "modify-might" }), type: "static" }),
    );
    expect(abilities).toHaveLength(4);
  });

  test("cost: 2 energy, no power; enters base exhausted; 2 might at 0 XP; keywords include Hunt; 1 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "hunter").build();
    await game.p1.play("hunter");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("hunter")).toBe("base");
    expect(game.state("hunter")).toMatchObject({ baseMight: 2, isExhausted: true, might: 2 });
    expect(game.state("hunter").keywords).toContain("Hunt");
    expect((await scenario().resources(P1, { energy: 1, power: { body: 2 } }).hand(P1, CARD, "h").build()).p1.can("play", "h")).toBe(false);
  });

  test("Level 6 static is exact and reads only YOUR XP: 5 XP → 2 might; 6 XP → 3 might; opponent at 9 XP with you at 0 → 2 might", async () => {
    const five = await scenario().xp(P1, 5).unit(P1, "base", CARD, "hunter").build();
    expect(five.state("hunter").might).toBe(2);
    const six = await scenario().xp(P1, 6).unit(P1, "base", CARD, "hunter").build();
    expect(six.state("hunter")).toMatchObject({ baseMight: 2, might: 3 });
    const theirs = await scenario().xp(P1, 0).xp(P2, 9).unit(P1, "base", CARD, "hunter").build();
    expect(theirs.state("hunter").might).toBe(2);
  });

  test("Hunt on CONQUER: walking onto an empty enemy battlefield conquers it → Hunt on the chain → +1 XP and +1 point", async () => {
    const game = await attacker(0).build();
    await game.p1.move("hunter", "bf1");
    await game.settle();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
  });

  test("Hunt on a COMBAT conquer: 2-might Hunter beats a 1-might Foe → +1 XP; taking XP 5 → 6 switches the Level bonus on right away (3 might after the fight)", async () => {
    const game = await attacker(5, 1).build();
    expect(game.state("hunter").might).toBe(2);
    await game.p1.move("hunter", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("hunter")).toBe("bf1");
    expect(game.p1.xp()).toBe(6);
    expect(game.state("hunter").might).toBe(3);
    expect(game.violations()).toEqual([]);
  });

  test("the fight that would earn the 6th XP is fought at 2 might: at 5 XP into a 2-might Foe both die → no conquer, XP stays 5", async () => {
    const game = await attacker(5, 2).build();
    await game.p1.move("hunter", "bf1");
    await game.settle();
    expect(game.zoneOf("hunter")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1);
    expect(game.p1.xp()).toBe(5);
    expect(game.p1.points()).toBe(0);
  });

  test("at 6 XP the +1 is real combat might: 3-might Hunter kills a 2-might Foe and survives (takes 2 < 3), conquering for a 7th XP", async () => {
    const game = await attacker(6, 2).build();
    expect(game.state("hunter").might).toBe(3);
    await game.p1.move("hunter", "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.locationOf("hunter")).toBe("bf1");
    expect(game.p1.xp()).toBe(7);
    expect(game.state("hunter").might).toBe(3); // still just +1 (733: no further scaling)
  });

  test("'When I conquer' needs the Hunter THERE: the Ally conquering alone gives the point but no XP; Hunter + Ally together give exactly 1 XP", async () => {
    const solo = await attacker(0).build();
    await solo.p1.move("ally", "bf1");
    await solo.settle();
    expect(solo.p1.points()).toBe(1);
    expect(solo.p1.xp()).toBe(0);

    // Foe at 1 might so the defender's damage cannot kill the Hunter (a dead Hunter is not "present" → no XP, legitimately).
    const together = await attacker(0, 1).build();
    await together.p1.move(["hunter", "ally"], "bf1"); // 2+3 = 5 ≥ 1
    await together.settle();
    expect(together.locationOf("hunter")).toBe("bf1");
    expect(together.zoneOf("foe")).toBe("trash");
    expect(together.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(together.p1.xp()).toBe(1);
  });

  test("a LOST attack is not a conquer (no XP), and a successful DEFENCE is not a conquer either (no XP)", async () => {
    const lost = await attacker(0, 5).build();
    await lost.p1.move("hunter", "bf1");
    await lost.settle();
    expect(lost.zoneOf("hunter")).toBe("trash");
    expect(lost.p1.xp()).toBe(0);

    const defend = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "hunter")
      .unit(P2, "base", { might: 1, name: "Raider" }, "raider")
      .build();
    await defend.p2.move("raider", "bf1");
    await defend.settle();
    expect(defend.zoneOf("raider")).toBe("trash");
    expect(defend.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(defend.p1.xp()).toBe(0);
    expect(defend.p2.xp()).toBe(0);
  });

  test("Hunt on HOLD: Hunter at your battlefield through your Beginning Phase → Hunt on the chain, +1 point, +1 XP; XP persists into later turns", async () => {
    const game = await scenario().turn(2).active(P2).xp(P1, 2).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "hunter").build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hunter", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(3);
    await game.advanceTurn(); // → P2: XP is not a per-turn pool
    expect(game.p1.xp()).toBe(3);
    await game.advanceTurn(); // → P1 holds again
    expect(game.p1.xp()).toBe(4);
    expect(game.p1.points()).toBe(2);
  });

  test("hold XP that reaches 6 turns the bonus on for that very turn: 5 XP + hold → 6 XP, Hunter is 3 might in the main phase", async () => {
    const game = await scenario().turn(2).active(P2).xp(P1, 5).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "hunter").build();
    expect(game.state("hunter").might).toBe(2);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.xp()).toBe(6);
    expect(game.state("hunter").might).toBe(3);
  });

  test("'When I hold' needs the Hunter THERE: Hunter in base while a Grunt holds → point yes, XP no; and nothing at all in the OPPONENT's Beginning Phase", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Grunt" }, "grunt")
      .unit(P1, "base", CARD, "hunter")
      .build();
    await game.p2.endTurn();
    expect(game.chain().some((i) => i.cardId === "hunter")).toBe(false);
    await game.settle();
    expect(game.p1.points()).toBe(1);
    expect(game.p1.xp()).toBe(0);

    const opp = await scenario().turn(3).active(P1).battlefield("bf1", { controller: P1 }).unit(P1, "bf1", CARD, "hunter").build();
    await opp.advanceTurn(); // P1 ends → P2's Beginning Phase: P1 holds nothing now
    expect(opp.turnPlayer()).toBe(P2);
    expect(opp.p1.xp()).toBe(0);
    expect(opp.p1.points()).toBe(0);
  });

  test("live re-evaluation downward (824.1.c) through a real XP spend — Keeper of the Hammer's 'Spend 3 XP, [Exhaust]: Draw 1' drops you below 6 and the Hunter is 2 might again", async () => {
    const game = await scenario().xp(P1, 8).legend(P1, KEEPER, "keeper").unit(P1, "base", CARD, "hunter").build();
    expect(game.state("hunter").might).toBe(3);
    await game.p1.activate("keeper");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1); // the draw happened, so the XP was spent
    expect(game.p1.xp()).toBeLessThan(6); // (Keeper's exact charge is that card's concern, not this file's)
    expect(game.state("hunter")).toMatchObject({ baseMight: 2, might: 2 });
  });

  test("Defender's choice matters for 'present': Hunter (2) + Ally (3) into a 4-might Foe — Foe may put lethal on the Hunter, and a Hunter that dies in the winning combat earns no XP", async () => {
    // 383.4.c.2: only units present when control is gained trigger. The engine's default assignment kills the Hunter here.
    const game = await attacker(0, 4).build();
    await game.p1.move(["hunter", "ally"], "bf1");
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    if (game.zoneOf("hunter") === "trash") {
      expect(game.p1.xp()).toBe(0);
    } else {
      expect(game.p1.xp()).toBe(1);
    }
  });
});
