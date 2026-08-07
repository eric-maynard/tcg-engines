/**
 * Blood Money — sfd-162-221 · Spell · Order · 2 energy (no power)
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Kill a unit at a battlefield with 2 [Might] or less. If it was an enemy unit, play a Gold
 *   gear token exhausted. If it was a friendly unit, play two Gold gear tokens exhausted.
 *
 * Rules: 812 (Action: my Open turn, or any showdown while I hold Focus — not a bare enemy chain),
 * 355.9.b (targeting restriction: at a battlefield AND Might ≤ 2, using CURRENT Might incl.
 * modifiers; damage does not lower Might), 359.3.e.4/5 (a target pumped above 2 in response is
 * no longer legal → not killed, and the "if it was…" instructions tied to it are not followed),
 * 187.5 (Gold = gear token "[Reaction] Kill this, [Exhaust]: [Add] [rainbow]"), 184.1 (enters
 * exhausted as stated), 740.1.a (friendly/enemy is about CONTROL), 190.4.c (an emptied
 * battlefield becomes uncontrolled in the next Open cleanup).
 *
 * Head-judge corner cases for THIS card:
 *  1. Response window: P2 Disciplines the 2-Might target to 4 → Blood Money resolves doing
 *     NOTHING (no kill, no Gold) — the payoff is conditional on the kill's target being legal.
 *  2. Enemy kill → exactly 1 exhausted Gold for ME (not for the victim's controller); friendly
 *     kill → exactly 2, both exhausted, both mine.
 *  3. Might window: 3-Might unit carrying 2 damage is NOT legal; a 3-Might unit at −1 (2) IS.
 *  4. Location: units in either base are never legal, even at 1 Might.
 *  5. Showdown use as the defender: kill the lone 2-Might attacker mid-showdown → combat ends,
 *     I keep the battlefield, and I bank a Gold.
 *  6. The Gold arrives exhausted, so it cannot be cashed the same turn; next turn it adds [rainbow].
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "sfd-162-221";
const DISCIPLINE = "ogn-058-298"; // Reaction · 2 · Give a unit +2 Might this turn. Draw 1.

function board(energy = 2) {
  return scenario()
    .resources(P1, { energy })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "Foe" }, "foe")
    .unit(P2, "bf1", { might: 3, name: "Big Foe" }, "big")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "bf2", { might: 1, name: "Ally" }, "ally")
    .unit(P1, "base", { might: 1, name: "Reserve" }, "reserve")
    .hand(P1, CARD, "bm");
}

function goldOf(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, seat: "p1" | "p2") {
  return game[seat].gear().filter((g) => game.state(g).name === "Gold");
}

describe("Blood Money (sfd-162-221)", () => {
  test("costs 2 energy; kills the chosen 2-Might ENEMY unit at a battlefield and plays exactly one exhausted Gold token into MY base", async () => {
    const game = await board(2).build();
    await game.p1.cast("bm", { targets: "foe" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bm", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.state("foe").owner).toBe(P2);
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(1);
    expect(game.state(gold[0] as string)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, location: "base", owner: P1 });
    expect(goldOf(game, "p2")).toEqual([]);
    expect(game.zoneOf("bm")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("killing a FRIENDLY unit instead pays two exhausted Gold tokens (not one, not three); the enemy gets nothing", async () => {
    const game = await board(2).build();
    await game.p1.cast("bm", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    const gold = goldOf(game, "p1");
    expect(gold).toHaveLength(2);
    expect(gold.every((g) => game.state(g).isExhausted && game.state(g).isToken)).toBe(true);
    expect(goldOf(game, "p2")).toEqual([]);
    expect(game.p1.units("bf2")).toEqual([]);
    // rule 190.4.c — with no unit left there in an Open state I lose control of bf2 in the cleanup.
    expect(game.gameState.battlefields.bf2?.controller).toBeNull();
  });

  test("targeting: only units AT A BATTLEFIELD with Might ≤ 2 — Big Foe (3), Homebody/Reserve (in bases) are not offered", async () => {
    const game = await board(2).build();
    const targets = game.p1.option("cast", "bm")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(2);
    expect(targets).toEqual(expect.arrayContaining([["foe"], ["ally"]]));
    for (const bad of ["big", "home", "reserve"]) {
      const r = await game.p1.try((p) => p.cast("bm", { targets: bad }));
      expect(!r.ok && r.error.code).toBe("ILLEGAL_ARGS");
    }
    expect(game.zoneOf("bm")).toBe("hand");
  });

  test("Might is CURRENT Might: a damaged 3-Might unit is still 3 (illegal); a 3-Might unit at −1 is 2 (legal); a buffed 2-Might unit is 3 (illegal)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Wounded" }, "wounded", { damage: 2 })
      .unit(P2, "bf1", { might: 3, name: "Shrunk" }, "shrunk", { mightModifier: -1 })
      .unit(P2, "bf1", { might: 2, name: "Buffed" }, "buffed", { buffed: true })
      .hand(P1, CARD, "bm")
      .build();
    expect(game.state("wounded").might).toBe(3);
    expect(game.state("shrunk").might).toBe(2);
    expect(game.state("buffed").might).toBe(3);
    const targets = game.p1.option("cast", "bm")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual([["shrunk"]]);
    await game.p1.cast("bm", { targets: "shrunk" });
    await game.settle();
    expect(game.zoneOf("shrunk")).toBe("trash");
    expect(goldOf(game, "p1")).toHaveLength(1);
  });

  test("no legal target (only 3+ Might at battlefields / small units in bases) or 1 energy → not castable", async () => {
    const none = await scenario()
      .resources(P1, { energy: 5 })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3 }, "big")
      .unit(P2, "base", { might: 1 }, "home")
      .hand(P1, CARD, "bm")
      .build();
    expect(none.p1.can("cast", "bm")).toBe(false);
    expect((await board(1).build()).p1.can("cast", "bm")).toBe(false);
  });

  // BUG — expected (359.3.e.4/5): Discipline resolves first (Foe → 4 Might), so Foe no longer
  // meets "2 Might or less" and Blood Money resolves ignoring both the kill and the Gold payoff.
  // Actual: the Might restriction is only checked at cast time — Foe (4 Might) is killed and a Gold is made.
  test("response (359.3.e.4/5) — P2 Disciplines Foe to 4 Might with Blood Money on the chain → no longer a legal target → NO kill and NO Gold", async () => {
    const game = await board(2).resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p1.cast("bm", { targets: "foe" });
    if (game.actingSeat() === P1) {
      await game.p1.passPriority();
    }
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("disc", { targets: "foe" });
    expect(game.chain().map((c) => c.name)).toEqual(["Blood Money", "Discipline"]);
    await game.settle();
    expect(game.state("foe").might).toBe(4);
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(goldOf(game, "p1")).toEqual([]);
    expect(goldOf(game, "p2")).toEqual([]);
    expect(game.zoneOf("bm")).toBe("trash");
    expect(game.p1.energy()).toBe(0); // cost stays paid
  });

  test("[Action] timing: castable with Focus in the OPPONENT's showdown — as defender I kill the lone 2-Might attacker, keep bf2, and bank a Gold", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 1, name: "Ally" }, "ally")
      .unit(P2, "base", { might: 2, name: "Raider" }, "raider")
      .hand(P1, CARD, "bm")
      .build();
    expect(game.p1.can("cast", "bm")).toBe(false); // P2's Neutral Open turn: not my window
    await game.p2.move("raider", "bf2");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("cast", "bm")).toBe(true);
    await game.p1.cast("bm", { targets: "raider" });
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf2");
    expect(game.gameState.battlefields.bf2).toMatchObject({ contested: false, controller: P1 });
    expect(goldOf(game, "p1")).toHaveLength(1);
    expect(game.p2.points()).toBe(0);
  });

  test("[Action] timing, negative space: on the opponent's turn with only a chain open (no showdown) it is NOT castable", async () => {
    const game = await board(2).active(P2).resources(P2, { energy: 2 }).hand(P2, DISCIPLINE, "disc").build();
    await game.p2.cast("disc", { targets: "foe" });
    if (game.actingSeat() === P2) {
      await game.p2.passPriority();
    }
    expect(game.actingSeat()).toBe(P1);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.can("cast", "bm")).toBe(false);
  });

  test("the Gold token is real Gold (187.5): exhausted now (cannot be cashed this turn), ready after my next Awaken, then Kill+Exhaust adds 1 power", async () => {
    const game = await board(2).build();
    await game.p1.cast("bm", { targets: "foe" });
    await game.settle();
    const gold = goldOf(game, "p1")[0] as string;
    expect(game.p1.can("activate", gold)).toBe(false);
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    expect(game.state(gold).isReady).toBe(true);
    expect(game.p1.can("activate", gold)).toBe(true);
    const before = game.p1.power();
    await game.p1.activate(gold);
    await game.settle();
    expect(game.has(gold) ? game.zoneOf(gold) : "gone").not.toBe("base");
    expect(game.p1.power()).toBe(before + 1);
  });

  // BUG — expected (740.1.a: friendly = shares a controller): a P2-OWNED unit that I CONTROL is a
  // friendly unit, so killing it pays two Gold. Actual: the friendly/enemy branch is decided by
  // ownership and only one Gold is created.
  test("friendly = CONTROLLED by me (740.1.a) — killing a P2-owned unit I control pays TWO Gold; the card goes to its OWNER's trash", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .battlefield("bf2", { controller: P1 })
      .card("stolen", { controller: P1, def: { cardType: "unit", might: 2, name: "Stolen" }, owner: P2, zone: "bf2" })
      .hand(P1, CARD, "bm")
      .build();
    expect(game.state("stolen")).toMatchObject({ controller: P1, owner: P2 });
    await game.p1.cast("bm", { targets: "stolen" });
    await game.settle();
    expect(game.zoneOf("stolen")).toBe("trash");
    expect(game.state("stolen").owner).toBe(P2);
    expect(goldOf(game, "p1")).toHaveLength(2);
    expect(goldOf(game, "p2")).toEqual([]);
  });

  test("parsed abilities: an action-timed spell — kill (unit at a battlefield, Might ≤ 2) then a friendly?two-Gold:one-Gold conditional, tokens exhausted", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: "order", energyCost: 2, timing: "action" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    const ab = def?.abilities?.[0] as { type: string; timing: string; effect: { type: string; target: unknown; effects: unknown[] } };
    expect(ab).toMatchObject({ timing: "action", type: "spell" });
    expect(ab.effect).toMatchObject({
      target: { filter: { might: { lte: 2 } }, location: "battlefield", type: "unit" },
      type: "sequence",
    });
    expect(ab.effect.effects[0]).toMatchObject({ type: "kill" });
    expect(ab.effect.effects[1]).toMatchObject({
      condition: { controller: "friendly", type: "target-controller" },
      else: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      then: { amount: 2, ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
      type: "conditional",
    });
  });
});
