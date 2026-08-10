/**
 * Interaction: Rogue Assassin (ven-139-166, P1's Legend)
 *     "[Empower] [3][rainbow]. / [Action][>] [Exhaust]: If it's your turn, move a friendly unit in a
 *      showdown to base and if I'm [Empowered], ready it."
 *   × Akali, Deadly Weapon (ven-021-166, P1's 3-Might unit)
 *     "[Empower] [2][fury]. When I move, you may deal 1 to a unit at a battlefield I moved to or
 *      from. If I'm [Empowered], deal 2 instead. [Empowered][>] I have +1 [Might]."
 *
 * Question: of the three activated abilities {legend Empower, legend [Action] rescue, Akali Empower},
 * which are LISTED for P1 (and P2) in each timing window — Neutral Open on P1's turn, the Closed
 * state while Akali's move trigger is on the chain, the combat Showdown with Focus on P1's turn, and
 * the combat Showdown with Focus on P2's turn — and what does the rescue do in each?
 *
 * Rules: 381 (activated abilities: controller's turn + Open State), 174.8 (legends have activated
 * abilities), 827.1 / 827.1.c.1 (Empower IS an activated ability "[Cost]: Empower this"), 145.2 /
 * 151.2 ("… and not during a Showdown" for untagged activations), 402.3 (no legal object → not legal
 * to activate), 347.1 (with Focus: play a legally timed card/ability — [Action] reaches showdowns on
 * any player's turn), 404.1 (pay the [Exhaust] cost on activation), 406.4 (opponent may React before
 * resolution), 191.4.a (the source's controller controls the ability — never P2).
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const ROGUE_ASSASSIN = "ven-139-166";
const AKALI = "ven-021-166";

const LEGEND_EMPOWER = "activateAbility:ra#0";
const LEGEND_ACTION = "activateAbility:ra#1";
const AKALI_EMPOWER = "activateAbility:akali#0";
const THREE = [LEGEND_EMPOWER, LEGEND_ACTION, AKALI_EMPOWER];

/** Which of the three abilities are in `seat`'s current legal menu. */
function listed(game: Game, seat: typeof P1): string[] {
  const keys = new Set(game.seat(seat).legal().map((o) => o.key));
  return THREE.filter((k) => keys.has(k));
}

/** P1's turn: legend ready & not Empowered, Akali ready in base, P2 holds bf1 with one 2-Might defender. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 1, rainbow: 1 } })
    .legend(P1, ROGUE_ASSASSIN, "ra")
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", AKALI, "akali")
    .unit(P2, "bf1", { might: 2, name: "Defender" }, "def");
}

/** Mirror on P2's turn: Akali (exhausted, so "ready it" would be observable) holds bf1; P2 has a raider in base. */
function mirror() {
  return scenario()
    .active(P2)
    .resources(P1, { energy: 5, power: { fury: 1, rainbow: 1 } })
    .legend(P1, ROGUE_ASSASSIN, "ra")
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "bf1", AKALI, "akali", { exhausted: true })
    .unit(P2, "base", { might: 2, name: "Raider" }, "raider");
}

/** Move Akali in, decline her ping, and arrive at P1's showdown Focus. */
async function attackAndReachFocus(): Promise<Game> {
  const game = await board().build();
  await game.p1.move("akali", "bf1");
  await game.p1.no(); // decline "you may deal 1" on the way in
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
  return game;
}

describe("Rogue Assassin × Akali — which activations are listed when", () => {
  test("(a) Neutral Open, P1's turn: both [Empower]s are listed; the [Action] rescue is NOT (no friendly unit is in a showdown — 402.3)", async () => {
    const game = await board().build();
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(listed(game, P1)).toEqual([LEGEND_EMPOWER, AKALI_EMPOWER]);
    expect(game.p1.can(LEGEND_ACTION)).toBe(false);
    expect(listed(game, P2)).toEqual([]);
  });

  test("(b1) Closed state — Akali's move trigger finalized on the chain: none of the three is listed for either player", async () => {
    const game = await board().build();
    await game.p1.move("akali", "bf1");
    // The optional trigger asks its "you may" at finalization; accept and name the defender.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "akali" } });
    expect(listed(game, P1)).toEqual([]); // already nothing but concede while the item is pending
    await game.p1.yes();
    await game.p1.pick("def");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akali", controller: P1, triggered: true })]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(listed(game, P1)).toEqual([]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(listed(game, P2)).toEqual([]);
    await game.p2.passPriority();
    expect(game.state("def").damage).toBe(1); // not Empowered → 1, not 2
  });

  test("(b2) Showdown Open, P1's turn, P1 has Focus: ONLY the [Action] rescue is listed — neither [Empower] can be used 'in the showdown' (381 / 145.2)", async () => {
    const game = await attackAndReachFocus();
    expect(listed(game, P1)).toEqual([LEGEND_ACTION]);
    expect(game.p1.can(LEGEND_EMPOWER)).toBe(false);
    expect(game.p1.can(AKALI_EMPOWER)).toBe(false);
    await expect(game.p1.activate("ra", 0)).rejects.toThrow();
    await expect(game.p1.activate("akali", 0)).rejects.toThrow();
    expect(listed(game, P2)).toEqual([]);
    // Resources untouched by the rejected attempts.
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1, rainbow: 1 } });
  });

  test("(c1) the rescue with Focus: [Exhaust] is the whole cost (404.1), it is a chain item, and P2 gets a priority window to React (406.4)", async () => {
    const game = await attackAndReachFocus();
    await game.p1.activate("ra", 1);
    expect(game.state("ra").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 5, power: { fury: 1, rainbow: 1 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ra", controller: P1, triggered: false })]);
    expect(game.locationOf("akali")).toBe("bf1"); // nothing happens before resolution
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().map((o) => o.verb)).toContain("passPriority");
  });

  test("(c2) on resolution (P1's turn, legend NOT Empowered): Akali is MOVED to base and stays exhausted; it is a Move, so 'When I move' triggers again and can deal 1 to the defender at bf1 (the battlefield she moved FROM)", async () => {
    const game = await attackAndReachFocus();
    await game.p1.activate("ra", 1);
    await game.p1.passPriority();
    await game.p2.passPriority(); // resolves
    expect(game.zoneOf("akali")).toBe("base");
    expect(game.state("akali")).toMatchObject({ damage: 0, isExhausted: true }); // not readied
    expect(game.state("ra").isEmpowered).toBe(false);
    // Second move trigger: the opt-in is asked again, sourced from Akali.
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "akali" } });
    await game.p1.yes();
    const ask = game.decision();
    if (ask?.kind === "pick") {
      // Akali is no longer at bf1, so the defender is the only unit "at a battlefield I moved from".
      expect(ask.options.map((o) => o.key)).toEqual(["def"]);
      await game.p1.pick("def");
    }
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "akali", targets: ["def"], triggered: true })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("def").damage).toBe(1);
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
  });

  test("(c3) after the rescue the showdown ends with no combat: no combat damage either way, no conquer, bf1 stays P2's, P1 back in an open main phase", async () => {
    const game = await attackAndReachFocus();
    await game.p1.activate("ra", 1);
    await game.p1.passPriority();
    await game.p2.passPriority();
    await game.p1.no(); // decline the outgoing ping to isolate combat damage
    await game.settle();
    expect(game.zoneOf("akali")).toBe("base");
    expect(game.state("akali")).toMatchObject({ damage: 0, isExhausted: true });
    expect(game.zoneOf("def")).toBe("battlefield-bf1");
    expect(game.state("def").damage).toBe(0);
    expect(game.gameState.battlefields.bf1).toMatchObject({ contested: false, controller: P2 });
    expect(game.p1.points()).toBe(0);
    expect(game.p2.points()).toBe(0);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(d1) P2's turn, P2 attacks Akali and passes Focus: for P1 ONLY the [Action] rescue is listed (Action reaches showdowns on any turn); both [Empower]s are absent (not P1's turn, not Neutral Open — 381)", async () => {
    const game = await mirror().build();
    // P2's Neutral Open: nothing of P1's is listed (not P1's turn).
    expect(listed(game, P1)).toEqual([]);
    expect(listed(game, P2)).toEqual([]);
    await game.p2.move("raider", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(listed(game, P2)).toEqual([]);
    await game.p2.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(listed(game, P1)).toEqual([LEGEND_ACTION]);
    expect(game.p1.can(LEGEND_EMPOWER)).toBe(false);
    expect(game.p1.can(AKALI_EMPOWER)).toBe(false);
  });

  test("(d2) activated on P2's turn: the legend is exhausted (cost paid), the item resolves, 'If it's your turn' is false → Akali neither moves nor readies and no move trigger fires", async () => {
    const game = await mirror().build();
    await game.p2.move("raider", "bf1");
    await game.p2.passFocus();
    await game.p1.activate("ra", 1);
    expect(game.state("ra").isExhausted).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "ra", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    await game.p2.passPriority(); // resolves → does nothing
    expect(game.locationOf("akali")).toBe("bf1");
    expect(game.state("akali").isExhausted).toBe(true);
    expect(game.chain()).toEqual([]); // no Akali move trigger
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" }); // no opt-in prompt either
    // Combat then proceeds normally: Akali (3) kills the Raider (2) and holds bf1.
    await game.settle();
    expect(game.zoneOf("raider")).toBe("trash");
    expect(game.locationOf("akali")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("(e) P2 is never offered any of the three — P2 controls none of the sources (191.4.a)", async () => {
    // P1's turn: open, closed (trigger on chain), showdown with P2 holding Focus, RA item priority.
    const game = await board().build();
    expect(listed(game, P2)).toEqual([]);
    await game.p1.move("akali", "bf1");
    await game.p1.yes();
    await game.p1.pick("def");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(listed(game, P2)).toEqual([]);
    await game.p2.passPriority();
    await game.p1.passFocus();
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P2 });
    expect(listed(game, P2)).toEqual([]); // P2 with Focus in the showdown
    expect(game.p2.can(LEGEND_ACTION)).toBe(false);
    await expect(game.p2.activate("ra", 1)).rejects.toThrow();

    // P2's own turn, Neutral Open and with Focus as the attacker.
    const theirs = await mirror().resources(P2, { energy: 5, power: { fury: 1, rainbow: 1 } }).build();
    expect(listed(theirs, P2)).toEqual([]);
    await theirs.p2.move("raider", "bf1");
    expect(listed(theirs, P2)).toEqual([]);
    await expect(theirs.p2.activate("ra", 0)).rejects.toThrow();
    await expect(theirs.p2.activate("akali", 0)).rejects.toThrow();
  });
});
