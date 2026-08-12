/**
 * Interaction: Sky Splitter (ogn-014-298) — "[Action] … Deal 5 to a unit at a
 *   battlefield" × Piercing Light (sfd-023-221) — "[Action] [Repeat] [2][fury]
 *   Deal 2 to a unit at a battlefield, then deal 2 to up to one other unit"
 *   × Discipline (ogn-058-298) — "[Reaction] Give a unit +2 [Might] this turn. Draw 1."
 *
 * A showdown is open at bf1 and P1 holds Focus. Which of P1's cards may be
 * played in the Showdown OPEN state, who gets priority once an [Action] CLOSES
 * the state, what may each seat add then, and where does Focus land when the
 * chain empties (countered or not)?
 *
 * NOTE on the third card: the question was posed with Piercing Light as the
 * UNTAGGED card, but sfd-023-221 is printed (and modelled) as an [Action]. The
 * "no timing tag" role is therefore played by an ordinary unit in hand — rule
 * 343.1.a is about Cards of all Categories, not spells only — and Piercing
 * Light is kept as a SECOND [Action], which is exactly the card 358.4 forbids
 * once somebody else's Action closed the state.
 *
 * Rules: 343.1 / 343.1.a / 343.1.b (Showdown State: cards and abilities cannot
 * be played by default), 358.4 (the timing permission check: Showdown Closed ⇒
 * [Action] only for the card that CLOSED the state, [Reaction] for anyone
 * else), 337.1.a (finalizing passes no Priority), 337.4 (Priority to the
 * controller of the newest item), 339.1 / 339.2 (pass in sequence ⇒ Resolve),
 * 309.1.a (Closed State ⇒ [Reaction]s), 312.2.d / 313.2 / 313.4 (passing,
 * Focus carries Priority), 340.2 / 340.2.a (chain empty ⇒ Open State, Focus
 * passes in a showdown), 346 / 346.1 (Focus passes only for a chain a PLAYED
 * CARD opened), 347.2.a / 348 (all players pass in sequence ⇒ the Showdown
 * ends), 419.4.b (a countered card still counts as Finalized/played).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const SKY_SPLITTER = "ogn-014-298";
const PIERCING_LIGHT = "sfd-023-221";
const DISCIPLINE = "ogn-058-298";
const WIND_WALL = "ogn-064-298"; // [Reaction] Counter a spell (no cost cap)

/** The showdown-holder's focus seat, straight off the engine's showdown stack. */
function focusHolder(game: Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>): string | undefined {
  return game.gameState.interaction?.showdownStack?.[0]?.focusPlayer;
}

/**
 * P1 moves a 5-Might unit into P2's bf1 → a Combat Showdown with P1 (the
 * attacker) on Focus. Sky Splitter's Energy cost is reduced by the highest
 * Might among units P1 controls (5), so each copy costs [3] out of the pool.
 */
function board() {
  return scenario()
    .resources(P1, { energy: 12, power: { calm: 4, fury: 4 } })
    .resources(P2, { energy: 12, power: { calm: 4, fury: 4 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", { might: 2 }, "warden")
    .unit(P1, "base", { might: 5 }, "big")
    .hand(P1, SKY_SPLITTER, "sky")
    .hand(P1, SKY_SPLITTER, "sky2")
    .hand(P1, PIERCING_LIGHT, "pierce")
    .hand(P1, DISCIPLINE, "disc")
    .hand(P1, { might: 2 }, "grunt") // untagged card of another Category
    .hand(P2, DISCIPLINE, "disc2")
    .hand(P2, SKY_SPLITTER, "sky3");
}

describe("Showdown Closed: only the caster's Action closed the state", () => {
  test("(a) in the Showdown OPEN state the Focus holder may play [Action] and [Reaction] cards — an untagged card of any Category is never enumerated (343.1.a)", async () => {
    const game = await board().build();
    expect(game.p1.can("play", "grunt")).toBe(true); // legal in the Neutral Open State
    await game.p1.move("big", "bf1");
    expect(focusHolder(game)).toBe(P1);
    expect(game.p1.can("cast", "sky")).toBe(true); // [Action]
    expect(game.p1.can("cast", "disc")).toBe(true); // [Reaction]
    expect(game.p1.can("play", "grunt")).toBe(false); // no timing tag → 343.1.a
  });

  test("an [Action] with [Repeat] (Piercing Light) is offered in a Showdown Open state — 358.4/343.1.a exempt every [Action], not just the ones without a repeat cost", async () => {
    // Expected: Piercing Light is printed "[Action] … Deal 2 to a unit at a
    // battlefield", the board has units at bf1, and P1 holds Focus with 12
    // energy / 4 fury — so it must be playable exactly like Sky Splitter.
    // Actual: the move enumerator emits no `playSpell` row for it once a
    // showdown is in progress (it IS offered in the Neutral Open State).
    const game = await board().build();
    expect(game.p1.can("cast", "pierce")).toBe(true);
    await game.p1.move("big", "bf1");
    expect(game.p1.can("cast", "pierce")).toBe(true);
  });

  test("(b) playing Sky Splitter closes the state and priority comes back to P1 (337.1.a + 337.4), who may now add only a [Reaction] — not a second [Action] (358.4)", async () => {
    const game = await board().build();
    await game.p1.move("big", "bf1");
    await game.p1.cast("sky", { targets: "warden" });

    expect(game.actingSeat()).toBe(P1);
    expect(game.chain()).toHaveLength(1);
    expect(game.chain()[0]).toMatchObject({ cardId: "sky", controller: P1 });
    expect(game.p1.can("cast", "disc")).toBe(true); // [Reaction]
    expect(game.p1.can("cast", "sky2")).toBe(false); // a SECOND [Action] — 358.4
    expect(game.p1.can("play", "grunt")).toBe(false); // untagged — 343.1.a
    await expect(game.p1.cast("sky2", { targets: "warden" })).rejects.toThrow();
  });

  test("(c) P2, who gains priority by P1 passing and did NOT close the state, is held to [Reaction]s only (309.1.a / 358.4)", async () => {
    const game = await board().build();
    await game.p1.move("big", "bf1");
    await game.p1.cast("sky", { targets: "warden" });
    await game.p1.passPriority();

    expect(game.actingSeat()).toBe(P2);
    expect(focusHolder(game)).toBe(P1); // passing PRIORITY is not passing Focus
    expect(game.p2.can("cast", "disc2")).toBe(true);
    expect(game.p2.can("cast", "sky3")).toBe(false);
    await expect(game.p2.cast("sky3", { targets: "big" })).rejects.toThrow();
  });

  test("(d) both pass ⇒ Sky Splitter resolves, the chain empties and Focus passes to P2 (346 / 340.2.a / 313.2)", async () => {
    const game = await board().build();
    await game.p1.move("big", "bf1");
    await game.p1.cast("sky", { targets: "warden" });
    await game.p1.passPriority();
    await game.p2.passPriority();

    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.zoneOf("warden")).toBe("trash"); // 5 damage on a 2-Might unit
    expect(focusHolder(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2); // 313.2 — Focus carries Priority
  });

  test("(d) unchanged when P2 COUNTERS it: the chain was still opened by a played card (346.1 does not apply; 419.4.b keeps Sky Splitter 'played')", async () => {
    const game = await board().hand(P2, WIND_WALL, "wall").build();
    await game.p1.move("big", "bf1");
    await game.p1.cast("sky", { targets: "warden" });
    await game.p1.passPriority();
    await game.p2.cast("wall", { targets: "sky" });
    await game.p2.passPriority();
    await game.p1.passPriority();

    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("sky")).toBe("trash");
    expect(game.has("warden") && game.zoneOf("warden")).toBe("battlefield-bf1"); // never dealt to
    expect(focusHolder(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);
  });

  test("(e) P1 passes Focus without acting and P2 passes too ⇒ all players passed in sequence, the Showdown Closes and resolves as combat (347.2.a / 348 / 348.1)", async () => {
    const game = await board().build();
    await game.p1.move("big", "bf1");
    await game.p1.passFocus();
    expect(focusHolder(game)).toBe(P2);
    expect(game.actingSeat()).toBe(P2);

    await game.p2.passFocus();
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.zoneOf("warden")).toBe("trash"); // 5 vs 2 — the attacker wins combat
    expect(game.gameState.battlefields?.bf1?.controller).toBe(P1);
    expect(game.violations()).toEqual([]);
  });
});
