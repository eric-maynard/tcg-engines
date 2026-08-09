/**
 * Rogue Assassin — ven-139-166 · Legend · Fury/Calm
 *
 *   [Empower] [3][rainbow] ([3][rainbow]: Empower this. Use only if not Empowered.)
 *   [Action][>] [Exhaust]: If it's your turn, move a friendly unit in a showdown to base and if I'm
 *   [Empowered], ready it.
 *
 * Rules: 827/441 (Empower keyword = "[cost]: Empower this. Play only if not Empowered"; an activated
 * ability that uses the chain; Empowered is a persistent binary status), 135.2.e.5.a ([rainbow] = one
 * power of ANY domain), 806.1.c.2 ([Action] on an ability: may be activated during showdowns on any
 * player's turn — permission only, 806.3), legend abilities without [Action]: your turn, open state
 * only, 355.8 (a targeted ability needs a legal target — "a friendly unit in a showdown"), 341/316.8
 * (units at the battlefield where a showdown is ongoing are "in a showdown"), an effect-move to base is
 * not a Standard Move (no exhaustion, ignores the ready requirement), 463 (an attacker that leaves
 * before damage neither deals nor takes combat damage; if no attacker remains the combat just ends),
 * "if I'm Empowered" is checked on resolution, Awaken readies the legend.
 *
 * Head-judge checklist for THIS card:
 *  1. Empower: exactly [3] + one power of any domain, on the chain, then the ability disappears
 *     (not-Empowered restriction) and the status survives turn changes. Not in a showdown / enemy turn.
 *  2. The rescue: with Focus in MY combat showdown, exhaust → pull one attacker home before damage; the
 *     other attacker fights on. Not Empowered → the rescued unit stays exhausted; Empowered → readied,
 *     so it can Standard-Move again this turn.
 *  3. Pull the ONLY attacker → no combat damage at all, defender keeps the battlefield.
 *  4. "If it's your turn": defending on the OPPONENT's turn I may still activate it (Action timing) but
 *     it does nothing except exhaust the legend.
 *  5. No showdown anywhere → no "unit in a showdown" to target → not activatable (355.8); exhausted
 *     legend → not activatable; readies at my next Awaken.
 *  6. Engine status: line 2 parsed as a RAW text effect → every effect clause below is a BUG test.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-139-166";

function legend(meta?: { exhausted?: boolean; empowered?: boolean }) {
  return scenario().card("ra", { def: CARD, meta, owner: P1, zone: "legendZone" });
}

/** P1 (legend `meta`) attacks P2's bf1 (6-Might Wall) with A (3) and B (2); bf2 is open. Returns the game at P1's showdown Focus. */
async function attackWithTwo(meta?: { empowered?: boolean }): Promise<Game> {
  const game = await legend(meta)
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2")
    .unit(P1, "base", { might: 3, name: "A" }, "a")
    .unit(P1, "base", { might: 2, name: "B" }, "b")
    .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
    .build();
  await game.p1.move(["a", "b"], "bf1");
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

/** Activate the [Action] rescue naming `unit`, answer its pick if/when asked, and let the item resolve (stops at Focus/main). */
async function rescue(game: Game, seat: typeof P1, unit: string): Promise<void> {
  await game.seat(seat).activate("ra", 1, { answers: [unit] });
  for (let i = 0; i < 12; i++) {
    const d = game.decision();
    if (!d) {
      return;
    }
    if (d.kind === "pick" && d.seat === seat) {
      await game.seat(seat).pick(unit);
    } else if (d.kind === "action" && d.context === "chain") {
      await game.seat(d.seat).pass();
    } else {
      return;
    }
  }
}

describe("Rogue Assassin (ven-139-166)", () => {
  test("registry payload: Fury/Calm legend; ability #0 = Empower self for [3][rainbow] with the not-Empowered restriction; ability #1 = [Action] [Exhaust] activated", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", domain: ["fury", "calm"], name: "Rogue Assassin" });
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toEqual({
      cost: { energy: 3, power: ["rainbow"] },
      effect: { target: "self", type: "empower" },
      restrictions: [{ type: "not-empowered" }],
      type: "activated",
    });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { exhaust: true }, timing: "action", type: "activated" });
  });

  test("ability #1 should parse to a structured effect — if your turn: move a friendly unit IN A SHOWDOWN to base, then if Empowered ready it — not a raw text blob", async () => {
    // Expected: something like { type:"conditional", condition:{type:"your-turn"}, then:{ type:"sequence", effects:[ {type:"move", target:{controller:"friendly", type:"unit", inShowdown:true}, to:"base"}, {type:"conditional", condition:{type:"empowered"}, then:{type:"ready", target:…}} ] } }.
    // Actual: { type:"raw", text:"If it's your turn, move a friendly unit in a showdown to base and if I'm [Empowered], ready it." }.
    const def = (await loadDefaultCardPool()).get(CARD);
    const effect = (def?.abilities?.[1] as { effect?: { type?: string } }).effect;
    expect(effect?.type).not.toBe("raw");
    const json = JSON.stringify(effect);
    expect(json).toContain('"move"');
    expect(json).toContain('"base"');
    expect(json).toContain('"ready"');
    expect(json.toLowerCase()).toContain("empowered");
  });

  test("[Empower] [3][rainbow]: spends 3 energy + one power of ANY domain (mind here), goes on the chain, resolves to Empowered; afterwards only ability #1 is offered and the status persists into later turns", async () => {
    const game = await legend().resources(P1, { energy: 4, power: { mind: 1 } }).build();
    expect(game.p1.can("activateAbility:ra#0")).toBe(true);
    await game.p1.activate("ra", 0);
    expect(game.p1.resources()).toEqual({ energy: 1, power: { mind: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ra", controller: P1, triggered: false })]);
    expect(game.state("ra").isEmpowered).toBe(false);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2); // a real chain item: the opponent gets priority
    await game.p2.passPriority();
    expect(game.state("ra")).toMatchObject({ isEmpowered: true, isExhausted: false }); // Empower does not exhaust
    expect(game.p1.can("activateAbility:ra#0")).toBe(false); // "Use only if not Empowered"
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ra").isEmpowered).toBe(true);
    expect(game.p1.can("activateAbility:ra#0")).toBe(false);
    expect(game.violations()).toEqual([]);
  });

  test("Empower cost/timing negatives: [2]+power or [3] with no power cannot pay; already Empowered → gone; not on the opponent's turn; not with Focus in a showdown (no [Action] on this line)", async () => {
    expect((await legend().resources(P1, { energy: 2, power: { fury: 3 } }).build()).p1.can("activateAbility:ra#0")).toBe(false);
    expect((await legend().resources(P1, { energy: 3 }).build()).p1.can("activateAbility:ra#0")).toBe(false);
    expect((await legend().resources(P1, { energy: 3, power: { calm: 1 } }).build()).p1.can("activateAbility:ra#0")).toBe(true);
    expect((await legend({ empowered: true }).resources(P1, { energy: 3, power: { calm: 1 } }).build()).p1.can("activateAbility:ra#0")).toBe(false);
    const opp = await legend().active(P2).resources(P1, { energy: 3, power: { fury: 1 } }).build();
    expect(opp.p1.can("activateAbility:ra#0")).toBe(false);
    const sd = await legend()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "a")
      .unit(P2, "bf1", { might: 6 }, "wall")
      .build();
    await sd.p1.move("a", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(sd.p1.can("activateAbility:ra#0")).toBe(false);
    expect(sd.p1.can("activateAbility:ra#1")).toBe(true); // the [Action] line IS available here
  });

  test("[Action] [Exhaust] costs only the exhaust: activating with Focus in my showdown exhausts the legend and opens a chain item the opponent may respond to", async () => {
    const game = await attackWithTwo();
    await game.p1.activate("ra", 1, { answers: ["b"] });
    expect(game.state("ra").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    // Answer a finalize-time target ask if the engine makes one, then P1 passes → P2 holds priority.
    if (game.decision()?.kind === "pick") {
      await game.p1.pick("b");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ra", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
  });

  test("the rescue — on my turn, pull attacker B (2) out of the showdown to base BEFORE damage; not Empowered → B stays exhausted; A (3) fights the Wall (6) alone and dies, Wall takes only 3", async () => {
    // Expected: B in base, exhausted, undamaged; A in trash; Wall alive; bf1 still P2's. Actual: the raw effect does nothing — B stays and dies too.
    const game = await attackWithTwo();
    await rescue(game, P1, "b");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.locationOf("a")).toBe("bf1"); // still in the showdown
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash"); // took 6 ≥ 3
    expect(game.zoneOf("wall")).toBe("battlefield-bf1"); // took 3 < 6
    expect(game.zoneOf("b")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test.failing("BUG: Empowered rescue READIES the pulled unit — B comes home ready and can Standard-Move again this turn to take the open bf2", async () => {
    // Expected: B in base READY; after the bf1 combat ends, B moves to empty bf2 and conquers it (1 point).
    // Actual: nothing is moved or readied.
    const game = await attackWithTwo({ empowered: true });
    expect(game.state("ra").isEmpowered).toBe(true);
    await rescue(game, P1, "b");
    expect(game.zoneOf("b")).toBe("base");
    expect(game.state("b").isReady).toBe(true);
    await game.settle(); // A dies into the Wall
    expect(game.zoneOf("a")).toBe("trash");
    await game.p1.move("b", "bf2");
    await game.settle();
    expect(game.locationOf("b")).toBe("bf2");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("pulling the ONLY attacker ends the fight with no damage either way — the lone 3-Might attacker survives at home, the Wall is untouched and keeps bf1", async () => {
    // Expected: A back in base alive (exhausted), Wall undamaged, no conquer, open main phase for P1. Actual: A stays and dies.
    const game = await legend()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "A" }, "a")
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .build();
    await game.p1.move("a", "bf1");
    await rescue(game, P1, "a");
    await game.settle();
    expect(game.zoneOf("a")).toBe("base");
    expect(game.state("a")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.state("wall").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.points() + game.p2.points()).toBe(0);
  });

  test("only 'a friendly unit IN A SHOWDOWN' may be chosen — a friendly unit sitting in base or at another, quiet battlefield is never offered", async () => {
    // Expected: the target ask lists exactly the two attackers at bf1 (a, b) — not Homebody (base) nor Sentry (bf2, no showdown).
    // Actual: no target ask exists at all (raw effect).
    const game = await legend()
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "base", { might: 3, name: "A" }, "a")
      .unit(P1, "base", { might: 2, name: "B" }, "b")
      .unit(P1, "base", { might: 1, name: "Homebody" }, "home")
      .unit(P1, "bf2", { might: 1, name: "Sentry" }, "sentry")
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .build();
    await game.p1.move(["a", "b"], "bf1");
    const pre = game.p1.option("activateAbility:ra#1")?.fields.find((f) => f.arg === "targets" || f.name === "targets")?.options as unknown[] | undefined;
    let offered: string[] | undefined = pre?.map((o) => (Array.isArray(o) ? String(o[0]) : String(o)));
    if (!offered) {
      await game.p1.activate("ra", 1);
      for (let i = 0; i < 8 && !offered; i++) {
        const d = game.decision();
        if (d?.kind === "pick" && d.seat === P1) {
          offered = d.options.map((o) => String(o.card ?? o.key));
        } else if (d?.kind === "action" && d.context === "chain") {
          await game.seat(d.seat).pass();
        } else {
          break;
        }
      }
    }
    expect(offered?.toSorted()).toEqual(["a", "b"]);
  });

  test("'If it's your turn' — defending on the OPPONENT's turn: with Focus I may activate it ([Action]), the legend exhausts, but nothing moves and the combat proceeds (my 3 dies to their 6, they conquer)", async () => {
    const game = await legend({ empowered: true })
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 6, name: "Raider" }, "raider")
      .build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:ra#1")).toBe(true);
    await rescue(game, P1, "holder");
    expect(game.state("ra").isExhausted).toBe(true);
    expect(game.locationOf("holder")).toBe("bf1"); // not my turn → no move, no ready
    await game.settle();
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });

  test.failing("BUG: with no showdown anywhere there is no 'friendly unit in a showdown' to target — the [Action] line must not be activatable in a quiet open state (355.8)", async () => {
    // Expected: not offered (no legal target). Actual: offered — it just exhausts the legend for nothing.
    const game = await legend().unit(P1, "base", { might: 3 }, "a").build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("activateAbility:ra#1")).toBe(false);
  });

  test("[Exhaust] gate: an exhausted Rogue Assassin offers no rescue even mid-showdown; it readies at my next Awaken (Empowered status untouched)", async () => {
    const game = await legend({ empowered: true, exhausted: true })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3, name: "A" }, "a")
      .unit(P1, "base", { might: 3, name: "Spare" }, "spare")
      .unit(P2, "bf1", { might: 6, name: "Wall" }, "wall")
      .build();
    await game.p1.move("a", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 });
    expect(game.p1.can("activateAbility:ra#1")).toBe(false);
    await game.settle();
    expect(game.zoneOf("a")).toBe("trash");
    await game.advanceTurn();
    expect(game.state("ra").isExhausted).toBe(true); // the opponent's Awaken is not mine
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ra")).toMatchObject({ isEmpowered: true, isReady: true });
  });
});
