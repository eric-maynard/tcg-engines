/**
 * Wages of Pain — sfd-070-221 · Spell · Mind · 3 energy (no power)
 *
 *   [Hidden] (Hide now for [rainbow] to react with later for [energy_0].)
 *   [Action] (Play on your turn or in showdowns.)
 *   Deal 3 to a unit at a battlefield. Play a Gold gear token exhausted.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. ONE spell, two instructions: the Gold token is not conditional on the damage. If the target
 *      becomes illegal in response (Flash moves it home) the damage is skipped but the caster still
 *      gets the Gold (359.3.e.5 — the Void Seeker example is this exact shape).
 *   2. Targets: "a unit at a battlefield" — either side's, never a unit in a base; with no unit at any
 *      battlefield the spell cannot be played at all.
 *   3. [Action] timing (turn states 507–510): own turn open ✓, showdown with Focus on the opponent's
 *      turn ✓, opponent's turn neutral ✗, and NOT in response on a closed chain (that needs Reaction).
 *   4. Hidden (811): hide for [rainbow] at a battlefield you control; from the next turn play it for 0,
 *      even at Reaction speed, but the target must be at THAT battlefield (811.1.d.2); with no unit there
 *      it cannot be played from facedown (811.1.d). The Gold token still comes (811.2).
 *   5. Exactly-lethal: 3 damage kills a 3-Might unit, a 4-Might unit survives marked with 3.
 *   6. The Gold token belongs to the CASTER, enters his base exhausted (so no same-turn [rainbow]).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";
import type { Game } from "../../harness";

const CARD = "sfd-070-221";
const FLASH = "ogs-011-024"; // [Reaction] 2 energy: Move up to 2 friendly units to base.

const golds = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

function board() {
  return scenario()
    .resources(P1, { energy: 3 })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 3, name: "Three" }, "three")
    .unit(P2, "bf1", { might: 4, name: "Four" }, "four")
    .unit(P2, "base", { might: 1, name: "Homebody" }, "home")
    .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
    .hand(P1, CARD, "wop");
}

describe("Wages of Pain (sfd-070-221)", () => {
  test.failing("BUG: registry payload — Hidden + ONE [Action] spell ability whose effect is the sequence [deal 3 to a battlefield unit, Gold token exhausted]", async () => {
    // Expected: a single spell ability (the engine resolves exactly one per card) carrying both
    // instructions. Actual: the parser split the text into two separate `spell` abilities.
    const game = await scenario().hand(P1, CARD, "wop").build();
    expect(game.state("wop")).toMatchObject({ cardType: "spell", energyCost: 3, name: "Wages of Pain" });
    expect(game.state("wop").powerCost).toEqual([]);
    const def = peekDefaultCardPool()?.get(CARD);
    expect(def?.timing).toBe("action");
    expect(def?.abilities).toEqual([
      { keyword: "Hidden", type: "keyword" },
      {
        effect: {
          effects: [
            { amount: 3, target: { location: "battlefield", type: "unit" }, type: "damage" },
            { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
          ],
          type: "sequence",
        },
        timing: "action",
        type: "spell",
      },
    ]);
  });

  test("cost + clause 1: 3 energy; 3 damage is exactly lethal to a 3-Might unit at a battlefield; spell → trash", async () => {
    const game = await board().build();
    await game.p1.cast("wop", { targets: "three" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "wop", controller: P1, triggered: false })]);
    await game.settle();
    expect(game.zoneOf("three")).toBe("trash");
    expect(game.zoneOf("wop")).toBe("trash");
    expect((await board().resources(P1, { energy: 2 }).build()).p1.can("cast", "wop")).toBe(false);
  });

  test("one short of lethal: a 4-Might unit survives, marked with 3 damage, still at its battlefield", async () => {
    const game = await board().build();
    await game.p1.cast("wop", { targets: "four" });
    await game.settle();
    expect(game.zoneOf("four")).toBe("battlefield-bf1");
    expect(game.state("four").damage).toBe(3);
    expect(game.state("four").might).toBe(4); // damage does not reduce Might
  });

  test.failing("BUG: the 3 damage is healed at the end of the turn (143.3.b.1) — the engine's damage counter stays at 3", async () => {
    // Expected: after the Ending Step the surviving unit reads 0 damage. Actual: the end-of-turn heal
    // clears meta.damage only and the counter store written by the damage effect still reports 3.
    const game = await board().build();
    await game.p1.cast("wop", { targets: "four" });
    await game.settle();
    expect(game.state("four").damage).toBe(3);
    await game.advanceTurn();
    expect(game.zoneOf("four")).toBe("battlefield-bf1");
    expect(game.state("four").damage).toBe(0);
  });

  test("targets: only units AT A BATTLEFIELD (either side) — base units are not offered; no battlefield unit ⇒ not castable", async () => {
    const game = await board().battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2 }, "fwd").build();
    const targets = game.p1.option("cast", "wop")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toHaveLength(3);
    expect(targets).toEqual(expect.arrayContaining([["three"], ["four"], ["fwd"]]));
    expect((await game.p1.try((p) => p.cast("wop", { targets: "home" }))).ok).toBe(false);
    expect((await game.p1.try((p) => p.cast("wop", { targets: "mine" }))).ok).toBe(false);
    const none = await scenario().resources(P1, { energy: 3 }).battlefield("bf1").unit(P2, "base", { might: 1 }, "home").hand(P1, CARD, "wop").build();
    expect(none.p1.can("cast", "wop")).toBe(false);
  });

  test.failing("BUG: clause 2 — the CASTER also gets a Gold gear token in base, exhausted (even when the target was an enemy)", async () => {
    // Expected: after resolution P1's base holds one exhausted Gold token and P2 has none.
    // Actual: only the first parsed spell ability (the damage) resolves; no token is created.
    const game = await board().build();
    await game.p1.cast("wop", { targets: "four" });
    await game.settle();
    expect(game.state("four").damage).toBe(3);
    const mine = golds(game, "p1");
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0]!)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold" });
    expect(golds(game, "p2")).toHaveLength(0);
    expect(game.p1.can("activate", mine[0]!)).toBe(false); // exhausted: no [rainbow] this turn
  });

  test.failing("BUG: target made illegal in response (Flash moves it home) — no damage, but the Gold token is still played (359.3.e.5)", async () => {
    // Expected: Four reaches base undamaged; P1 still gets an exhausted Gold. Actual: no Gold token.
    const game = await board().resources(P2, { energy: 2 }).hand(P2, FLASH, "flash").build();
    await game.p1.cast("wop", { targets: "four" });
    await game.p1.passPriority();
    await game.p2.cast("flash", { targets: ["four"] });
    expect(game.chain().map((c) => c.cardId)).toEqual(["wop", "flash"]);
    await game.settle();
    expect(game.locationOf("four")).toBe("base");
    expect(game.state("four").damage).toBe(0);
    expect(game.zoneOf("wop")).toBe("trash");
    expect(golds(game, "p1")).toHaveLength(1);
  });

  test("[Action]: not castable from hand on the opponent's turn in a neutral state, nor in response on a closed chain on your own turn", async () => {
    const oppTurn = await board().active(P2).build();
    expect(oppTurn.p1.can("cast", "wop")).toBe(false);
    // Own turn, but a chain is open (P1 cast something else and holds priority): Action speed is too slow.
    const bolt = { abilities: [{ effect: { amount: 1, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }], cardType: "spell", domain: "mind", energyCost: 0, name: "Ping", timing: "action" };
    const closed = await board().hand(P1, bolt, "ping").build();
    await closed.p1.cast("ping", { targets: "four" });
    expect(closed.chain()).toHaveLength(1);
    expect(closed.actingSeat()).toBe(P1);
    expect(closed.p1.can("cast", "wop")).toBe(false);
  });

  test("[Action] in a showdown on the opponent's turn: with Focus, P1 kills the lone 3-Might attacker before combat and keeps the battlefield", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 1, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .hand(P1, CARD, "wop")
      .build();
    await game.p2.move("raider", "bf1");
    expect(game.p1.can("cast", "wop")).toBe(false); // attacker has Focus first
    await game.p2.passFocus();
    expect(game.p1.can("cast", "wop")).toBe(true);
    await game.p1.cast("wop", { targets: "raider" });
    expect(game.p1.energy()).toBe(0);
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("holder")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("Hidden: hide for [rainbow] at a battlefield you control (energy untouched, no chain); not at an enemy battlefield; not playable from facedown this turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2 }, "foe")
      .hand(P1, CARD, "wop")
      .build();
    expect(game.p1.option("hide", "wop")?.fields.find((f) => f.arg === "to")?.options).toEqual(["bf1"]);
    await game.p1.hide("wop", "bf1");
    expect(game.zoneOf("wop")).toBe("facedown-bf1");
    expect(game.state("wop").isHidden).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { rainbow: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.p1.can("reveal", "wop")).toBe(false);
    const broke = await scenario().resources(P1, { energy: 3 }).battlefield("bf1", { controller: P1 }).hand(P1, CARD, "wop").build();
    expect(broke.p1.can("hide", "wop")).toBe(false);
  });

  test("Hidden → Reaction: on the opponent's turn it is played from facedown for 0 onto their chain; the target must be at THAT battlefield (811.1.d.2)", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 2, name: "Guard" }, "guard")
      .unit(P2, "bf1", { might: 3, name: "Intruder" }, "intruder") // parked here without combat (setup)
      .unit(P2, "bf2", { might: 3, name: "Elsewhere" }, "elsewhere")
      .hand(P1, CARD, "wop")
      .hand(P2, FLASH, "flash")
      .build();
    await game.p1.hide("wop", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.tapRunes(2); // pools emptied over the turn change; P2 channelled 2 runes
    await game.p2.cast("flash", { targets: ["elsewhere"] }); // any P2 spell to open a chain
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "wop")).toBe(true);
    await game.p1.reveal("wop");
    expect(game.p1.energy()).toBe(0); // played for 0
    expect(game.p1.power()).toBe(0);
    expect(game.chain().map((c) => c.cardId)).toEqual(["flash", "wop"]);
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick") {
      const offered = d.options.map((o) => o.card ?? o.key).sort();
      expect(offered).toEqual(["guard", "intruder"]); // "elsewhere" (bf2) is out of reach
      await game.p1.pick("intruder");
      await game.settle();
    }
    expect(game.zoneOf("intruder")).toBe("trash");
    expect(game.zoneOf("elsewhere")).not.toBe("trash");
    expect(game.zoneOf("wop")).toBe("trash");
  });

  test.failing("BUG: facedown ⇒ Reaction, not 'free action' — during the opponent's Neutral Open state P1 holds no priority (312.2) and may not play it from facedown", async () => {
    // Expected: on P2's open main phase (no chain, no showdown) P1 has no priority-class option at all;
    // the reveal only becomes legal once P2 opens a chain/showdown and priority or Focus reaches P1.
    // Actual: revealHidden is offered to P1 throughout P2's open turn (harness flags singleDecisionCursor).
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4 }, "guard")
      .hand(P1, CARD, "wop")
      .build();
    await game.p1.hide("wop", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
    expect(game.p1.can("reveal", "wop")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("Hidden with no unit at its battlefield — it cannot be played from facedown (811.1.d), even on a later turn", async () => {
    // Expected: with bf1 empty the facedown spell has no legal target there, so revealHidden is not
    // offered. Actual: the engine offers the reveal regardless of the battlefield-local target check.
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3 }, "elsewhere")
      .hand(P1, CARD, "wop")
      .build();
    await game.p1.hide("wop", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("wop")).toBe("facedown-bf1");
    expect(game.p1.can("reveal", "wop")).toBe(false);
  });

  test.failing("BUG: played from facedown it still plays the exhausted Gold token for the caster (811.2)", async () => {
    // Expected: one exhausted Gold in P1's base after the hidden play resolves. Actual: no token.
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 4, name: "Guard" }, "guard")
      .hand(P1, CARD, "wop")
      .build();
    await game.p1.hide("wop", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.reveal("wop");
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("guard");
      await game.settle();
    }
    expect(game.state("guard").damage).toBe(3);
    expect(golds(game, "p1")).toHaveLength(1);
    expect(game.state(golds(game, "p1")[0]!).isExhausted).toBe(true);
    expect(game.violations()).toEqual([]);
  });
});
