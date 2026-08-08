/**
 * Moonfall — unl-198-219 · Spell · Mind/Chaos · 3 energy + 1 hybrid [mind|chaos] pip · Action
 *
 *   [Action] (Play on your turn or in showdowns.)
 *   Choose a battlefield where you have units. You may move up to one enemy unit to that battlefield.
 *   Then give enemy units there -2 [Might] this turn.
 *
 * Rules: 355.8/355.10 (the battlefield is a TARGET restricted to "where you have units" — none = not
 * playable), 355.13 ("up to one" may be zero; the rest still resolves), 355.4 (a move effect's
 * destination is fixed as the chosen battlefield), 190.3.a + 323.9/323.13 (an enemy unit that BECOMES
 * PRESENT at a battlefield P1 controls contests it → the next Cleanup stages a Combat with the moved
 * unit's controller as ATTACKER, 464.2.c.1), 464.2.c.3.a (pulled into an ongoing combat it joins its
 * controller's side), 143.2.a/b (Might below 0 reads as 0; a unit only dies from NON-ZERO damage ≥ its
 * Might — a clean 0-Might unit lives, a damaged one can die of the debuff), 135.2.e.6.c (the hybrid pip
 * is paid with mind OR chaos power, never another domain), "this turn" ends in the Ending Step.
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The signature line on YOUR turn: pull a lone enemy from its base (or another battlefield) onto
 *     your defended battlefield — it arrives 2 weaker and is forced to ATTACK you right now.
 *  2. As a defensive Action in the opponent's combat showdown: choose the attacked battlefield, move
 *     nobody, and every attacker there shrinks by 2 before damage — flipping the fight.
 *  3. In your own attack showdown: choose the battlefield you are attacking, drag a SECOND enemy in from
 *     base (it becomes a defender) and both defenders get -2 — your units are never debuffed.
 *  4. Floors: a 2-Might unit at 0 with no damage survives (and is 2 again next turn); a 3-Might unit
 *     already carrying 2 damage drops to 1 and dies on the spot.
 *  5. Legality: no friendly unit at any battlefield → uncastable; fury power cannot pay the pip;
 *     opponent's Neutral Open State → no Action window.
 */

import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-198-219";
const GALIO = "unl-171-219"; // Order champion, 6 Might, Tank, "I don't deal combat damage" — a wall that kills nothing

/** Cast Moonfall choosing `battlefield` and pulling `pull` (null = move nobody), whichever way the engine asks. */
async function castMoonfall(game: Game, seat: Seat, opts: { battlefield: string; pull: string | null }): Promise<void> {
  const s = game.seat(seat);
  const hasTargets = (s.option("cast", "moon")?.fields ?? []).some((f) => f.arg === "targets");
  if (hasTargets) {
    const full = opts.pull ? await s.try((p) => p.cast("moon", { targets: [opts.battlefield, opts.pull as string] })) : { ok: false };
    if (!full.ok) {
      await s.cast("moon", { targets: opts.battlefield });
    }
  } else {
    await s.cast("moon");
  }
  for (let i = 0; i < 8; i++) {
    await game.settle();
    const d = game.decision();
    if (!d || d.kind === "action" || d.seat !== seat) {
      return;
    }
    if (d.kind === "pick") {
      const keys = d.options.map((o) => o.key);
      const bfKey = keys.find((k) => k === opts.battlefield || k === `battlefield-${opts.battlefield}`);
      if (bfKey) {
        await s.pick(bfKey);
      } else if (opts.pull && keys.includes(opts.pull)) {
        await s.pick(opts.pull);
      } else if (opts.pull === null && d.allowDecline) {
        await s.decline();
      } else {
        return;
      }
    } else if (d.kind === "yes-no") {
      await (opts.pull ? s.yes() : s.no());
    } else {
      return;
    }
  }
}

function myTurnBoard() {
  return scenario()
    .resources(P1, { energy: 3, power: { mind: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
    .unit(P2, "base", { might: 4, name: "Brute" }, "brute")
    .unit(P2, "base", { might: 3, name: "Bystander" }, "bystander")
    .unit(P2, "bf2", { might: 4, name: "Far Post" }, "far")
    .hand(P1, CARD, "moon");
}

describe("Moonfall (unl-198-219)", () => {
  test("registry payload: 3-cost Mind/Chaos Action spell with one hybrid pip; a battlefield-targeted (hasFriendlyUnits) sequence of 'move up to 1 enemy unit → here' then '-2 Might this turn to ALL enemy units here'", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", domain: ["mind", "chaos"], energyCost: 3, name: "Moonfall", timing: "action" });
    expect(def?.powerCost).toEqual(["rainbow"]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        effects: [
          { target: { controller: "enemy", quantity: { upTo: 1 }, type: "unit" }, to: "here", type: "move" },
          { amount: -2, duration: "turn", target: { controller: "enemy", location: "here", quantity: "all", type: "unit" }, type: "modify-might" },
        ],
        target: { filter: { hasFriendlyUnits: true }, type: "battlefield" },
        type: "sequence",
      },
      timing: "action",
      type: "spell",
    });
  });

  test("cost: 3 energy + the hybrid pip paid with MIND or with CHAOS (135.2.e.6.c); fury cannot pay it; 2 energy cannot; the spell ends in the trash", async () => {
    const mind = await myTurnBoard().build();
    await mind.p1.cast("moon");
    expect(mind.p1.resources()).toEqual({ energy: 0, power: { mind: 0 } });
    expect(mind.chain()).toEqual([expect.objectContaining({ cardId: "moon", controller: P1, triggered: false })]);
    await mind.settle({ policy: "first" });
    expect(mind.zoneOf("moon")).toBe("trash");

    const chaos = await myTurnBoard().resources(P1, { energy: 3, power: { chaos: 1, mind: 0 } }).build();
    await chaos.p1.cast("moon");
    expect(chaos.p1.resources()).toEqual({ energy: 0, power: { chaos: 0, mind: 0 } });

    expect((await myTurnBoard().resources(P1, { energy: 3, power: { fury: 1, mind: 0 } }).build()).p1.can("cast", "moon")).toBe(false);
    expect((await myTurnBoard().resources(P1, { energy: 2, power: { mind: 1 } }).build()).p1.can("cast", "moon")).toBe(false);
  });

  test("[Action] timing: no window in the opponent's Neutral Open State; a window once P2 opens a showdown (even at another battlefield) and passes Focus", async () => {
    const game = await myTurnBoard().active(P2).battlefield("bf3", { controller: null }).unit(P2, "base", { might: 1, name: "Walker" }, "walker").build();
    expect(game.p1.can("cast", "moon")).toBe(false);
    await game.p2.move("walker", "bf3");
    await game.p2.passFocus();
    expect(game.p1.can("cast", "moon")).toBe(true);
  });

  test("355.8 — 'a battlefield where you have units' is a mandatory target: with P1's only unit in BASE Moonfall must not be castable", async () => {
    // Expected: no legal battlefield → not playable. Actual: playable (the battlefield is never asked for).
    const game = await scenario().resources(P1, { energy: 3, power: { mind: 1 } }).battlefield("bf1", { controller: P1 }).unit(P1, "base", { might: 3 }, "home").unit(P2, "base", { might: 3 }, "foe").hand(P1, CARD, "moon").build();
    expect(game.p1.can("cast", "moon")).toBe(false);
  });

  test("signature line on P1's turn — pull Brute(4) from P2's base onto bf1: it arrives a 2, contests bf1 and must ATTACK Guard(3) at once (190.3.a / 323.13 / 464.2.c.1); Brute dies, Guard lives, bf1 stays P1's; Bystander and Far Post untouched", async () => {
    const game = await myTurnBoard().build();
    await castMoonfall(game, P1, { battlefield: "bf1", pull: "brute" });
    expect(game.locationOf("brute") === "bf1" || game.zoneOf("brute") === "trash").toBe(true);
    expect(game.state("bystander")).toMatchObject({ might: 3, zone: "base" });
    expect(game.state("far")).toMatchObject({ might: 4, zone: "battlefield-bf2" });
    expect(game.state("guard").might).toBe(3); // never debuffs your own
    await game.settle(); // the staged combat: Brute (attacker, 2) into Guard (3)
    expect(game.zoneOf("brute")).toBe("trash");
    expect(game.state("guard")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
    expect(game.zoneOf("moon")).toBe("trash");
  });

  test("the pulled unit may come from ANOTHER battlefield — Far Post(4) leaves bf2 (a move, not a conquest: bf2 never becomes P1's) and lands on bf1 as a 2, then loses the forced attack into Guard(3)", async () => {
    const game = await myTurnBoard().build();
    await castMoonfall(game, P1, { battlefield: "bf1", pull: "far" });
    expect(game.p2.units("bf2")).toEqual([]);
    expect(game.gameState.battlefields.bf2?.controller ?? null).not.toBe(P1); // 190.4.c: P2 merely loses it in the cleanup
    expect(game.p1.points()).toBe(0);
    await game.settle();
    expect(game.zoneOf("far")).toBe("trash");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.state("brute")).toMatchObject({ might: 4, zone: "base" }); // not chosen, not "there"
  });

  test("defensive Action, move NOBODY (355.13) — P2 attacks bf1 with R1(3)+R2(3) into Guard(3)+Buddy(2); Moonfall on bf1 makes them 1+1: both raiders die, bf1 is held (without it P2 would wipe the defenders)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Guard" }, "guard")
      .unit(P1, "bf1", { might: 2, name: "Buddy" }, "buddy")
      .unit(P2, "base", { might: 3, name: "R1" }, "r1")
      .unit(P2, "base", { might: 3, name: "R2" }, "r2")
      .hand(P1, CARD, "moon")
      .build();
    await game.p2.move(["r1", "r2"], "bf1");
    await game.p2.passFocus();
    await castMoonfall(game, P1, { battlefield: "bf1", pull: null });
    // Either we can still observe the debuff mid-showdown, or combat already resolved — check the outcome.
    if (game.zoneOf("r1") === "battlefield-bf1") {
      expect(game.state("r1").might).toBe(1);
      expect(game.state("r2").might).toBe(1);
      expect(game.state("guard").might).toBe(3);
      await game.settle();
    }
    expect(game.zoneOf("r1")).toBe("trash");
    expect(game.zoneOf("r2")).toBe("trash");
    expect(game.locationOf("guard")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });

  test("in P1's own ATTACK showdown — Striker(3) into Def(3) at bf2; Moonfall on bf2 drags Helper(2) in from P2's base as a second DEFENDER (464.2.c.3.a) and both become 1 and 0: Striker kills both, takes 1, conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Def" }, "def")
      .unit(P2, "base", { might: 2, name: "Helper" }, "helper")
      .unit(P1, "base", { might: 3, name: "Striker" }, "striker")
      .hand(P1, CARD, "moon")
      .build();
    await game.p1.move("striker", "bf2");
    expect(game.p1.can("cast", "moon")).toBe(true); // Striker is at bf2 now → "a battlefield where you have units"
    await castMoonfall(game, P1, { battlefield: "bf2", pull: "helper" });
    if (game.zoneOf("def") === "battlefield-bf2") {
      expect(game.locationOf("helper")).toBe("bf2");
      expect(game.state("helper")).toMatchObject({ combatRole: "defender", might: 0 });
      expect(game.state("def").might).toBe(1);
      expect(game.state("striker").might).toBe(3);
      await game.settle();
    }
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.zoneOf("helper")).toBe("trash"); // 0 Might still needs 1 real damage — Striker has 3 to give
    expect(game.state("striker")).toMatchObject({ damage: 0, zone: "battlefield-bf2" });
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("floors & expiry (143.2.a/b) with Galio as the wall — Tiny(2) pulled onto Galio's battlefield reads 0, nobody deals combat damage, Tiny is recalled ALIVE at 0 Might and is a 2 again next turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", GALIO, "galio")
      .unit(P2, "base", { might: 2, name: "Tiny" }, "tiny")
      .hand(P1, CARD, "moon")
      .build();
    await castMoonfall(game, P1, { battlefield: "bf1", pull: "tiny" });
    await game.settle();
    expect(game.state("tiny")).toMatchObject({ damage: 0, might: 0, zone: "base" }); // 0 vs 0: no result, attacker recalled
    expect(game.state("galio")).toMatchObject({ damage: 0, zone: "battlefield-bf1" });
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    await game.advanceTurn();
    expect(game.state("tiny").might).toBe(2);
  });

  test("a DAMAGED enemy can die of the debuff alone (143.2.a) — Bruised (3 Might carrying 2 damage) pulled onto bf1 becomes a 1 with 2 damage and is killed in the Cleanup before any combat", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", GALIO, "galio") // deals no combat damage, so only the debuff can have killed it
      .unit(P2, "base", { might: 3, name: "Bruised" }, "bruised", { damage: 2 })
      .hand(P1, CARD, "moon")
      .build();
    expect(game.state("bruised")).toMatchObject({ damage: 2, might: 3 });
    await castMoonfall(game, P1, { battlefield: "bf1", pull: "bruised" });
    await game.settle();
    expect(game.zoneOf("bruised")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p2.points()).toBe(0);
  });
});
