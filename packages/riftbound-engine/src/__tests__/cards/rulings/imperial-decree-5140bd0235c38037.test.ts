/**
 * Ruling 5140bd0235c38037 — Imperial Decree (OGN-221 → ogn-221-298)
 *   "[Action] When any unit takes damage this turn, kill it."
 *   × Nidalee, Cat Form (unl-114-219) · 4 Might · "When I win a combat, draw 1." — standing in for the
 *     ruling's "Draven player draws from their legend" (same "when you win a combat" timing question).
 *
 * Q: Imperial Decree is out and a 1-Might token runs into a lone enemy unit. Does the Decree kill the
 *    defender before its controller gets the "you won the combat" draw?
 * A (this ruling): No — it claims the winner is determined while the Decree's kill is still an unresolved
 *    Pending item, so the defender wins the combat, its draw goes on the chain ABOVE the kill, and (LIFO)
 *    the draw resolves first.
 * A (CR, adjudicated 2026-08-12): the kill resolves FIRST and nobody wins. Imperial Decree is a delayed
 *    TRIGGER (390.2 — "when any unit takes damage this turn", a triggered ability with a time restriction,
 *    not a Delayed Replacement under 390.3: the damage is dealt and marked, the kill is a separate later
 *    event), so it is a chain item produced by dealing combat damage. Rule 465.3 ends the Combat Damage
 *    Step by SKIPPING the FEPR process, so that chain item is still unresolved when the Resolution Step
 *    starts; 466.1 performs the Combat Cleanup, and 466.2 then says in terms: "Resolve any items on the
 *    chain from dealing combat damage and the Combat Cleanup and associated FEPR before performing this
 *    step" — the step being 466.3 Determine Combat Result. So 466.3 reads occupancy AFTER the Decree's
 *    kill: both units are gone, 466.3.d gives No Result, no "when you win a combat" trigger ever fires,
 *    and 466.5.b leaves the battlefield Uncontrolled. See the RULING-CONFLICT facet at the bottom.
 * Rules: 390.2 vs 390.3 (delayed trigger, not a delayed replacement), 320 / 320.1 (a Pending item may be
 *        ADDED during a Cleanup but cannot resolve inside it — it does not survive PAST the 466.2 window),
 *        465.3 (the damage step skips FEPR), 466.2 (drain that chain BEFORE the result step), 466.3.a /
 *        466.3.d (who won / No Result), 466.5.b (Uncontrolled), 339/340 (LIFO, once the chain does run).
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";

const IMPERIAL_DECREE = "ogn-221-298";
const NIDALEE = "unl-114-219";

/** P1 casts Imperial Decree, then throws a 1-Might token at P2's lone 4-Might Nidalee. */
function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { order: 2 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P2, "bf1", NIDALEE, "nid")
    .unit(P1, "base", { might: 1, name: "Recruit" }, "recruit")
    .hand(P1, IMPERIAL_DECREE, "decree")
    .deckTop(P2, { cardType: "spell", energyCost: 8, name: "Fresh" }, "fresh");
}

describe("Ruling 5140bd0235c38037 (RULING-CONFLICT) — CR 465.3/466.2: Imperial Decree's kill resolves BEFORE the combat result is read", () => {
  test("control: without Imperial Decree the defending Nidalee survives, wins the combat and draws", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", NIDALEE, "nid")
      .unit(P1, "base", { might: 1, name: "Recruit" }, "recruit")
      .deckTop(P2, { cardType: "spell", energyCost: 8, name: "Fresh" }, "fresh")
      .build();

    await game.p1.move("recruit", "bf1");
    await game.settle();
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.zoneOf("nid")).toBe("battlefield-bf1");
    expect(game.p2.hand()).toEqual(["fresh"]); // the win-combat draw
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("466.2 window: after combat damage the Decree's kill is a Chain item produced BY dealing combat damage — the defender is still on the board until it resolves", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    expect(game.zoneOf("decree")).toBe("trash");

    await game.p1.move("recruit", "bf1");
    await game.p1.passFocus();
    await game.p2.passFocus();

    // Damage has been dealt: the 1-Might attacker is dead, Nidalee took 1 and lived.
    expect(game.zoneOf("recruit")).toBe("trash");
    expect(game.zoneOf("nid")).toBe("battlefield-bf1");
    // The Decree's delayed "kill it" triggers are waiting on the Chain, unresolved.
    expect(game.chain().every((c) => c.cardId === "decree" && c.triggered)).toBe(true);
    expect(game.chain().length).toBeGreaterThanOrEqual(1);
    expect(game.p2.hand()).toEqual([]); // nothing drawn yet either
  });

  // RULING-CONFLICT (adjudicated 2026-08-12 — this facet PREVIOUSLY asserted the other way, as a
  // `test.failing` "the win-combat draw should resolve BEFORE the Decree kill" bug marker).
  // riftjudge 5140bd0235c38037 has the game "determine the winner of combat by checking the battlefield
  // state" while the Decree's kill is still an unresolved Pending item, so the defender wins, its draw
  // goes on top of the kill and (LIFO) resolves first. That sequence has no home in the CR:
  //   * Imperial Decree is a delayed TRIGGER (390.2), not a delayed replacement (390.3) — the damage is
  //     dealt and marked, and the kill is a separate later event that uses the Chain. So it IS "an item on
  //     the chain from dealing combat damage".
  //   * 465.3 closes the Combat Damage Step by skipping FEPR, so that item is carried, unresolved, into
  //     the Resolution Step. 320/320.1 explain why it could not resolve during the Combat Cleanup (a
  //     Pending item may be ADDED during a Cleanup but nothing is Finalized or Resolved inside one) — they
  //     do NOT let it survive past the window that comes next.
  //   * 466.2 is that window, and it is explicit about what it gates: "Resolve any items on the chain from
  //     dealing combat damage and the Combat Cleanup and associated FEPR BEFORE performing this step" —
  //     the step being 466.3 Determine Combat Result. 466.3.a/b then read who "has units remaining at this
  //     battlefield DURING THIS STEP", i.e. after the kill has already happened.
  // So the kill resolves first, neither player has a unit here at 466.3 → No Result (466.3.d), no player
  // "won a combat", nothing draws, and 466.5.b makes the battlefield Uncontrolled.
  // This is the same 466.2 ordering the whole Resolution Step is built on (see
  // kogmaw-dk-spares-3d-recalled-attackers: a Deathknell that resolves in the 466.2 window changes who is
  // standing here at 466.3). Reading the result earlier — while the damage-step chain is still live —
  // would contradict 466.2 in general, not just here; the ruling is therefore not implementable.
  test("RULING-CONFLICT 5140bd0235c38037 — CR 465.3/466.2: the Decree's kill resolves in the 466.2 window, so 466.3 finds nobody here — No Result, no win-combat draw, battlefield Uncontrolled", async () => {
    const game = await board().build();
    await game.p1.cast("decree");
    await game.settle();
    await game.p1.move("recruit", "bf1");
    await game.settle();

    expect(game.zoneOf("nid")).toBe("trash"); // killed by the Decree, in the 466.2 window
    expect(game.zoneOf("recruit")).toBe("trash"); // killed by combat damage
    expect(game.p2.hand()).toEqual([]); // 466.3.d: No Result — nobody won, so Nidalee never draws
    expect(game.gameState.battlefields.bf1?.controller).toBeNull(); // 466.5.b
    expect(game.violations()).toEqual([]);
  });
});
