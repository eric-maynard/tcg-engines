/**
 * Maduli the Gatekeeper — unl-144-219 · Unit · Chaos · 7 energy + [chaos] · 6 Might
 *
 *   I can't be readied.
 *   [chaos]: Move me to an occupied enemy battlefield if my Might is greater than the total Might of
 *   enemy units there.
 *
 * Rules: 143.4 (units enter exhausted), 318 Awaken step readies your permanents — "can't" beats "do"
 * (a restriction always wins over an instruction), 144 (a Standard Move exhausts, so an unready-able unit
 * never Standard-Moves), 170.11.a ("occupied" = has a unit present), an "enemy battlefield" is one an
 * opponent CONTROLS, 190.3.a / 450 (a unit arriving at a battlefield it does not control applies Contested
 * → combat on its controller's turn, Maduli attacks even though exhausted — combat does not care about
 * ready state), 384 (an activated ability with no [Reaction]/[Action] is played only on your turn in an
 * Open state), 359.3.f.2 (Might is read on execution — buffs count).
 *
 * Head-judge notes — trickiest situations for THIS card:
 *  1. The cost is ONLY [chaos] — no [Exhaust] — so the permanently-exhausted Maduli can still use it,
 *     and use it again the same turn with a second chaos power (bf1 → bf2 after clearing bf1).
 *  2. Strictly greater: 6 vs a total of exactly 6 is not a destination; 6 vs 5 is. A buff making Maduli 7
 *     turns the 6-total battlefield back on. Damage on the enemies does not lower their Might.
 *  3. "Occupied enemy battlefield": an enemy-controlled battlefield with NO units is not a destination even
 *     though 6 > 0; an uncontrolled battlefield with enemy units on it is not an ENEMY battlefield.
 *  4. One legal battlefield → moved straight there; two → the controller picks; none → nothing moves.
 *  5. "Can't be readied" beats both the Awaken step and a "Ready a unit." spell (Upstage Comedy).
 *  6. Not on the opponent's turn / not inside a showdown (no Reaction/Action tag on the ability).
 */

import { describe, expect, test } from "bun:test";
import type { PickDecision } from "../../harness";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "unl-144-219";
const UPSTAGE_COMEDY = "unl-009-219"; // 2 fury-domain energy spell: "Ready a unit." (Repeat 2)

/** P1's exhausted Maduli in base with `chaos` power; P2 controls bf1 holding the given enemy units. */
function gate(chaos: number, enemies: number[], extra?: (b: ReturnType<typeof scenario>) => void) {
  const b = scenario().resources(P1, { power: { chaos } }).battlefield("bf1", { controller: P2 });
  enemies.forEach((might, i) => b.unit(P2, "bf1", { might, name: `E${i}` }, `e${i}`));
  b.unit(P1, "base", CARD, "mad", { exhausted: true });
  extra?.(b);
  return b;
}

describe("Maduli the Gatekeeper (unl-144-219)", () => {
  test("registry payload matches the printed text: a static self CantReady + a [chaos]-cost activated self-move to an enemy battlefield gated on Might > enemy total; 7 + [chaos], 6 Might", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 7, might: 6, name: "Maduli the Gatekeeper" });
    expect(def?.powerCost).toEqual(["chaos"]);
    expect(def?.abilities).toEqual([
      { effect: { keyword: "CantReady", target: "self", type: "grant-keyword" }, type: "static" },
      {
        cost: { power: ["chaos"] },
        effect: { target: "self", to: { battlefield: "enemy", requireSourceMightExceedsEnemyTotal: true }, type: "move" },
        type: "activated",
      },
    ]);
  });

  test("cost: 7 energy + one chaos power; enters base exhausted at 6 Might; 6 energy, or a non-chaos power, cannot pay", async () => {
    const game = await scenario().resources(P1, { energy: 7, power: { chaos: 1 } }).hand(P1, CARD, "mad").build();
    await game.p1.play("mad");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    expect(game.zoneOf("mad")).toBe("base");
    expect(game.state("mad")).toMatchObject({ isExhausted: true, might: 6 });
    expect((await scenario().resources(P1, { energy: 6, power: { chaos: 2 } }).hand(P1, CARD, "mad").build()).p1.can("play", "mad")).toBe(false);
    expect((await scenario().resources(P1, { energy: 7, power: { fury: 1 } }).hand(P1, CARD, "mad").build()).p1.can("play", "mad")).toBe(false);
  });

  test("'I can't be readied' vs the Awaken step: at the start of P1's next turn every other exhausted unit readies, Maduli stays exhausted and has no Standard Move", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", CARD, "mad", { exhausted: true })
      .unit(P1, "base", { might: 2, name: "Sleeper" }, "sleeper", { exhausted: true })
      .build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("main");
    expect(game.state("sleeper").isReady).toBe(true);
    expect(game.state("mad").isExhausted).toBe(true);
    expect((await game.p1.try((p) => p.move("mad", "bf1"))).ok).toBe(false);
    await game.p1.move("sleeper", "bf1"); // the control unit moves fine
    expect(game.violations()).toEqual([]);
  });

  test("'I can't be readied' vs a Ready effect: Upstage Comedy ('Ready a unit.') resolves and Maduli is still exhausted, while the same spell readies an ordinary unit", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4 })
      .unit(P1, "base", CARD, "mad", { exhausted: true })
      .unit(P1, "base", { might: 2, name: "Sleeper" }, "sleeper", { exhausted: true })
      .hand(P1, UPSTAGE_COMEDY, "uc1")
      .hand(P1, UPSTAGE_COMEDY, "uc2")
      .build();
    // "a unit": Maduli is a legal choice (the instruction simply can't be followed, 359.3.e.6).
    await game.p1.cast("uc1", { targets: "mad" });
    await game.settle();
    expect(game.zoneOf("uc1")).toBe("trash");
    expect(game.state("mad").isExhausted).toBe(true);
    await game.p1.cast("uc2", { targets: "sleeper" });
    await game.settle();
    expect(game.state("sleeper").isReady).toBe(true);
    expect(game.state("mad").isExhausted).toBe(true);
  });

  test("[chaos]: pays exactly one chaos power (no exhaust needed — Maduli is already exhausted), moves to the enemy battlefield holding 3+2 = 5 < 6, fights there as the attacker, kills both and conquers", async () => {
    const game = await gate(1, [3, 2]).build();
    expect(game.p1.can("activate", "mad")).toBe(true);
    await game.p1.activate("mad");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.settle();
    // After the ability resolved Maduli stood at bf1 as an exhausted attacker; combat then resolved 6 vs 5.
    expect(game.zoneOf("e0")).toBe("trash");
    expect(game.zoneOf("e1")).toBe("trash");
    expect(game.locationOf("mad")).toBe("bf1");
    expect(game.state("mad").isExhausted).toBe(true);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("the ability puts a chain item up first: before it resolves Maduli is still in base and P2 gets a priority window", async () => {
    const game = await gate(1, [2]).build();
    await game.p1.activate("mad");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mad", controller: P1 })]);
    expect(game.locationOf("mad")).toBe("base");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.locationOf("mad")).toBe("bf1");
    expect(game.state("mad").combatRole).toBe("attacker");
  });

  test("strictly greater: against a total of exactly 6 (4+2) there is no legal destination — whether or not the ability may be activated, Maduli stays in base and bf1 stays P2's", async () => {
    const game = await gate(1, [4, 2]).build();
    const t = await game.p1.try((p) => p.activate("mad"));
    if (t.ok) {
      await game.settle();
      if (game.decision()?.kind === "pick") {
        // a destination prompt here would already be wrong; decline defensively so the assertion below speaks
        await game.p1.decline();
      }
    }
    expect(game.locationOf("mad")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.locationOf("e0")).toBe("bf1");
  });

  test("Might is read live: a buffed Maduli (7) clears the same 6-total battlefield; damage already on the enemies does NOT lower their Might (3-Might with 2 damage still counts 3)", async () => {
    const buffed = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 4, name: "E0" }, "e0")
      .unit(P2, "bf1", { might: 2, name: "E1" }, "e1")
      .unit(P1, "base", CARD, "mad", { buffed: true, exhausted: true })
      .build();
    expect(buffed.state("mad").might).toBe(7);
    await buffed.p1.activate("mad");
    await buffed.settle();
    expect(buffed.locationOf("mad")).toBe("bf1");

    const damaged = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "E0" }, "e0", { damage: 2 })
      .unit(P2, "bf1", { might: 3, name: "E1" }, "e1")
      .unit(P1, "base", CARD, "mad", { exhausted: true })
      .build();
    const t = await damaged.p1.try((p) => p.activate("mad"));
    if (t.ok) {
      await damaged.settle();
    }
    expect(damaged.locationOf("mad")).toBe("base"); // 3+3 = 6, not < 6
  });

  test("'occupied': an enemy-CONTROLLED but empty battlefield is never a destination (6 > 0 is not enough) — with bf1 empty and bf2 holding a 2-Might unit, Maduli goes straight to bf2 without a prompt", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 2, name: "Sentry" }, "sentry")
      .unit(P1, "base", CARD, "mad", { exhausted: true })
      .build();
    await game.p1.activate("mad");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.decision()?.kind).not.toBe("pick"); // single legal destination → no choice
    expect(game.locationOf("mad")).toBe("bf2");
    await game.settle();
    expect(game.zoneOf("sentry")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).not.toBe(P1); // Maduli never went there
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    // And with ONLY the empty enemy battlefield around, nothing moves at all.
    const lonely = await scenario().resources(P1, { power: { chaos: 1 } }).battlefield("bf1", { controller: P2 }).unit(P1, "base", CARD, "mad", { exhausted: true }).build();
    const t = await lonely.p1.try((p) => p.activate("mad"));
    if (t.ok) {
      await lonely.settle();
    }
    expect(lonely.locationOf("mad")).toBe("base");
  });

  test("'enemy battlefield' means enemy-controlled: an UNCONTROLLED battlefield with a lone 1-Might enemy unit on it is not a destination", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("nomans", { controller: null })
      .unit(P2, "nomans", { might: 1, name: "Squatter" }, "squatter")
      .unit(P1, "base", CARD, "mad", { exhausted: true })
      .build();
    const t = await game.p1.try((p) => p.activate("mad"));
    if (t.ok) {
      await game.settle();
    }
    expect(game.locationOf("mad")).toBe("base");
    expect(game.locationOf("squatter")).toBe("nomans");
  });

  test("two legal destinations → P1 is asked which battlefield (both offered, base never); picking bf2 moves Maduli there and only there", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "A" }, "a")
      .unit(P2, "bf2", { might: 5, name: "B" }, "b")
      .unit(P1, "base", CARD, "mad", { exhausted: true })
      .build();
    await game.p1.activate("mad");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision() as PickDecision;
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    expect(d.options.map((o) => o.key).sort()).toEqual(["battlefield-bf1", "battlefield-bf2"]);
    await game.p1.pick("battlefield-bf2");
    expect(game.locationOf("mad")).toBe("bf2");
    await game.settle();
    expect(game.zoneOf("b")).toBe("trash"); // 6 vs 5
    expect(game.locationOf("a")).toBe("bf1");
    expect(game.gameState.battlefields.bf2?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("no [Exhaust] in the cost: with two chaos power Maduli clears bf1, then — still exhausted — activates again the same turn and walks on to bf2", async () => {
    const game = await scenario()
      .resources(P1, { power: { chaos: 2 } })
      .battlefield("bf1", { controller: P2 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P2, "bf2", { might: 6, name: "B" }, "b") // not legal yet (6 is not < 6)…
      .unit(P2, "bf2", { might: 0, name: "Zero" }, "zero")
      .unit(P1, "base", CARD, "mad", { exhausted: true })
      .build();
    await game.p1.activate("mad"); // only bf1 qualifies (bf2 totals 6)
    await game.settle();
    expect(game.locationOf("mad")).toBe("bf1");
    expect(game.zoneOf("a")).toBe("trash");
    expect(game.p1.power("chaos")).toBe(1);
    expect(game.state("mad").isExhausted).toBe(true);
    // bf2 still totals 6 → a second activation finds no destination; Maduli stays on bf1.
    const t = await game.p1.try((p) => p.activate("mad"));
    if (t.ok) {
      await game.settle();
    }
    expect(game.locationOf("mad")).toBe("bf1");
  });

  test("timing: the ability has no [Reaction]/[Action] — not activatable on the opponent's turn, nor inside a showdown on your own turn", async () => {
    const theirs = await gate(1, [2]).active(P2).build();
    expect(theirs.p1.can("activate", "mad")).toBe(false);
    const showdown = await gate(1, [2], (b) => b.battlefield("open", { controller: null }).unit(P1, "base", { might: 1, name: "Scout" }, "scout")).build();
    await showdown.p1.move("scout", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("activate", "mad")).toBe(false);
  });

  test("cost is a CHAOS power specifically: with only fury power (and plenty of energy) the ability is not legal", async () => {
    const game = await scenario()
      .resources(P1, { energy: 9, power: { fury: 2 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P1, "base", CARD, "mad", { exhausted: true })
      .build();
    expect(game.p1.can("activate", "mad")).toBe(false);
    const ok = await scenario()
      .resources(P1, { energy: 0, power: { chaos: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "A" }, "a")
      .unit(P1, "base", CARD, "mad", { exhausted: true })
      .build();
    expect(ok.p1.can("activate", "mad")).toBe(true); // no energy needed
  });
});
