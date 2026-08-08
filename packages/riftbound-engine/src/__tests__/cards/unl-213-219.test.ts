/**
 * Gardens of Becoming — unl-213-219 · Battlefield
 *
 *   Units here have "[Exhaust]: Gain 1 XP."
 *
 * Rules: 364 / 053.3 (an unconditional passive: EVERY unit at this battlefield — either player's, no
 * control condition — has the ability exactly while it is here), 135.4.b (granted text is real text),
 * 145.2 / 381 (a unit's activated ability: only on its controller's turn, Main Phase, Open State, not in
 * a showdown), 377.3 (it uses the chain; the opponent may respond before it resolves), the cost is
 * [Exhaust] of THAT unit (it must be ready; a unit that Standard-Moved here this turn is exhausted and
 * cannot pay until its controller's next Awaken), 730.1 (Gain XP = the controller's XP goes up by 1;
 * XP feeds [Level N] thresholds such as Wuju Master's).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Whose XP: the ACTIVATING unit's controller gains it — an enemy unit parked here earns XP for the
 *     enemy on their turn, never for the battlefield's controller/owner.
 *  2. Per-unit, repeatable across units: two ready units here = 2 XP this turn, each exhausting itself;
 *     an exhausted unit offers nothing (so the turn you walk in you cannot cash in — next turn you can).
 *  3. Location-bound: units in a base or at another battlefield never have it; it is gone the moment
 *     the unit leaves.
 *  4. Timing negative space: opponent's turn, inside a showdown — never offered.
 *  5. Partner: at 5 XP with Wuju Master ("[Level 6] Your units have +1 Might"), one activation here
 *     reaches Level 6 and pumps the whole team.
 *  6. Engine status: modelled as a static granting a virtual keyword "ExhaustGainXp" that nothing reads
 *     (the card file says so itself) — no unit ever gets the ability. Positive clauses are BUG tests.
 */

import { describe, expect, test } from "bun:test";
import type { Game } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "unl-213-219";
const WUJU_MASTER = "unl-191-219"; // legend · [Level 6] Your units have +1 Might

function xpOption(game: Game, seat: "p1" | "p2", unit: string) {
  return game[seat].legal().find((o) => o.verb === "activate" && o.card === unit);
}

/** Activate the granted "[Exhaust]: Gain 1 XP" on `unit` and let it resolve. */
async function cashIn(game: Game, seat: "p1" | "p2", unit: string): Promise<void> {
  const opt = xpOption(game, seat, unit);
  expect(opt).toBeDefined();
  await game[seat].choose(opt!.key);
  await game.settle();
}

function board() {
  return scenario()
    .battlefield("gardens", { controller: P1, def: CARD, inert: false })
    .battlefield("plain", { controller: P1 })
    .unit(P1, "gardens", { might: 2, name: "Monk" }, "monk")
    .unit(P1, "gardens", { might: 3, name: "Acolyte" }, "acolyte")
    .unit(P1, "plain", { might: 2, name: "Elsewhere" }, "elsewhere")
    .unit(P1, "base", { might: 1, name: "Home" }, "home");
}

describe("Gardens of Becoming (unl-213-219)", () => {
  // BUG — expected: a ready unit here offers an activated ability; using it exhausts that unit (the whole
  // cost — no energy/power), puts a non-triggered P1 item on the chain, P2 gets priority, and on
  // resolution P1 gains exactly 1 XP. Actual: the grant is an unread virtual keyword; nothing is offered.
  test.failing("BUG: a ready unit here has '[Exhaust]: Gain 1 XP' — exhausts itself, uses the chain, controller gains 1 XP", async () => {
    const game = await board().resources(P1, { energy: 1 }).build();
    expect(game.p1.xp()).toBe(0);
    const opt = xpOption(game, "p1", "monk");
    expect(opt).toBeDefined();
    await game.p1.choose(opt!.key);
    expect(game.state("monk").isExhausted).toBe(true); // cost paid on activation
    expect(game.p1.energy()).toBe(1); // nothing else paid
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: false })]);
    expect(game.p1.xp()).toBe(0); // not before resolution
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority();
    expect(game.p1.xp()).toBe(1);
    expect(game.p2.xp()).toBe(0);
    expect(xpOption(game, "p1", "monk")).toBeUndefined(); // exhausted now
  });

  // BUG — expected: each unit here carries its own copy; two ready units → two activations → 2 XP.
  test.failing("BUG: per-unit — two ready units here cash in once each for 2 XP total, both end exhausted", async () => {
    const game = await board().build();
    await cashIn(game, "p1", "monk");
    await cashIn(game, "p1", "acolyte");
    expect(game.p1.xp()).toBe(2);
    expect(game.state("monk").isExhausted).toBe(true);
    expect(game.state("acolyte").isExhausted).toBe(true);
    expect(game.p1.legal().some((o) => o.verb === "activate")).toBe(false);
  });

  test("negative space — location-bound: units in a base or at another battlefield never offer the ability", async () => {
    const game = await board().build();
    expect(xpOption(game, "p1", "home")).toBeUndefined();
    expect(xpOption(game, "p1", "elsewhere")).toBeUndefined();
    expect(game.p1.can("activate", "home")).toBe(false);
    expect(game.p1.can("activate", "elsewhere")).toBe(false);
  });

  // BUG — expected: "units here" is every unit, so an ENEMY unit sitting at P1's Gardens earns XP for
  // ITS controller (P2) on P2's turn; P1 gains nothing from it and cannot use P2's unit.
  test.failing("BUG: an enemy unit here earns XP for ITS controller on their turn (not for the Gardens' controller)", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("gardens", { controller: P2, def: CARD, inert: false, owner: P1 })
      .unit(P2, "gardens", { might: 2, name: "Interloper" }, "interloper")
      .unit(P1, "base", { might: 1, name: "Home" }, "home")
      .build();
    expect(xpOption(game, "p1", "interloper")).toBeUndefined();
    await cashIn(game, "p2", "interloper");
    expect(game.p2.xp()).toBe(1);
    expect(game.p1.xp()).toBe(0);
    expect(game.state("interloper").isExhausted).toBe(true);
  });

  test("negative space — [Exhaust] needs a READY unit: the turn a unit walks onto the (empty) Gardens it conquers but arrives exhausted and has nothing to activate", async () => {
    const game = await scenario()
      .battlefield("gardens", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Pilgrim" }, "pilgrim")
      .build();
    await game.p1.move("pilgrim", "gardens");
    await game.settle();
    expect(game.gameState.battlefields.gardens?.controller).toBe(P1);
    expect(game.state("pilgrim")).toMatchObject({ isExhausted: true, location: "gardens" });
    expect(xpOption(game, "p1", "pilgrim")).toBeUndefined();
    expect(game.p1.xp()).toBe(0);
    // an exhausted unit seeded here likewise offers nothing
    const tired = await scenario().battlefield("gardens", { controller: P1, def: CARD, inert: false }).unit(P1, "gardens", { might: 2, name: "Tired" }, "tiredMonk", { exhausted: true }).build();
    expect(xpOption(tired, "p1", "tiredMonk")).toBeUndefined();
  });

  // BUG — expected: …and on the controller's NEXT turn (Awaken readied it, it held the Gardens) the same
  // unit can cash in for 1 XP.
  test.failing("BUG: next turn the unit that walked in (now ready, still here) can cash in for 1 XP", async () => {
    const game = await scenario()
      .battlefield("gardens", { controller: null, def: CARD, inert: false })
      .unit(P1, "base", { might: 2, name: "Pilgrim" }, "pilgrim")
      .build();
    await game.p1.move("pilgrim", "gardens");
    await game.settle();
    await game.advanceTurn(); // P2
    await game.advanceTurn(); // P1 again: awaken → ready; hold → 2 points total
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("pilgrim")).toMatchObject({ isReady: true, location: "gardens" });
    expect(game.p1.points()).toBe(2);
    await cashIn(game, "p1", "pilgrim");
    expect(game.p1.xp()).toBe(1);
  });

  test("negative space — timing (145.2 / 381): a ready unit here offers nothing on the OPPONENT's turn, nor while its controller holds Focus in a showdown elsewhere", async () => {
    const oppTurn = await board().active(P2).build();
    expect(xpOption(oppTurn, "p1", "monk")).toBeUndefined();
    expect(oppTurn.p1.legal().some((o) => o.verb === "activate")).toBe(false);

    const showdown = await board().battlefield("enemy", { controller: P2 }).unit(P2, "enemy", { might: 5, name: "Wall" }, "wall").build();
    await showdown.p1.move("home", "enemy");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(xpOption(showdown, "p1", "monk")).toBeUndefined();
  });

  test("negative space — it leaves with the unit: a Ganking unit that steps off the Gardens to another battlefield has no such ability there", async () => {
    const game = await scenario()
      .battlefield("gardens", { controller: P1, def: CARD, inert: false })
      .battlefield("open", { controller: null })
      .unit(P1, "gardens", { keywords: ["Ganking"], might: 2, name: "Wanderer" }, "wanderer")
      .unit(P1, "gardens", { might: 2, name: "Stayer" }, "stayer")
      .build();
    await game.p1.gank("wanderer", "open");
    await game.settle();
    expect(game.locationOf("wanderer")).toBe("open");
    expect(xpOption(game, "p1", "wanderer")).toBeUndefined();
    expect(game.state("wanderer").grantedKeywords).toEqual([]);
  });

  // BUG — expected: partner line — at 5 XP with Wuju Master, one activation here reaches [Level 6] and
  // every P1 unit gains +1 Might (the exhausted Monk included). Actual: no ability to activate.
  test.failing("BUG: partner — Wuju Master at 5 XP: one cash-in here reaches Level 6 and pumps every friendly unit +1", async () => {
    const game = await board().xp(P1, 5).legend(P1, WUJU_MASTER, "wuju").build();
    expect(game.state("home").might).toBe(1);
    await cashIn(game, "p1", "monk");
    expect(game.p1.xp()).toBe(6);
    expect(game.state("home").might).toBe(2);
    expect(game.state("monk").might).toBe(3);
    expect(game.state("elsewhere").might).toBe(3);
  });

  test("control for the partner line: Wuju Master at 6 XP already pumps (+1) and at 5 XP does not — the Gardens is the missing step", async () => {
    const six = await board().xp(P1, 6).legend(P1, WUJU_MASTER, "wuju").build();
    expect(six.state("home").might).toBe(2);
    const five = await board().xp(P1, 5).legend(P1, WUJU_MASTER, "wuju").build();
    expect(five.state("home").might).toBe(1);
    expect(five.p1.xp()).toBe(5);
  });

  // BUG — expected: the payload should carry what the text says — a static over units here that grants
  // an ACTIVATED ability with cost [Exhaust] and effect gain-xp 1 (cf. the `grant-ability` + sibling
  // activated-ability shape used elsewhere). Actual: `grant-keyword: "ExhaustGainXp"` — no cost, no effect.
  test.failing("BUG: registry payload — units here are granted an activated { cost: exhaust, effect: gain-xp 1 }, not a virtual keyword", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "battlefield", name: "Gardens of Becoming" });
    const abilities = (def?.abilities ?? []) as { type: string; effect?: { target?: unknown } }[];
    expect(abilities[0]).toMatchObject({ effect: { target: { location: "here", type: "unit" } }, type: "static" });
    const all = JSON.stringify(abilities);
    expect(all).toContain('"exhaust":true');
    expect(all).toContain('"type":"gain-xp"');
    expect(all).toContain('"amount":1');
    expect(all).not.toContain("ExhaustGainXp");
  });
});
