/**
 * Heart of the Tempest — ven-197-166 · Legend · Order/Chaos
 *
 *   When you play a card from anywhere other than your hand, empower me.
 *   [Action][>] Disempower me, [Exhaust]: Give a unit [Assault 2] this turn.
 *
 * Rules: 419.1.a (by default cards are played from hand or the Champion Zone; effects also play
 * them from facedown (811), trash, deck …), 419.4.a (play triggers fire when the played card
 * resolves), 441 / 442 (Empower / Disempower — binary status; disempowering a non-empowered object
 * does nothing, so the cost is unpayable), 202–203 (a status change as a COST is paid on
 * activation), 377.3 (activated abilities use the chain), 806.1.c.2 ([Action] on an ability: may
 * be activated during showdowns on any player's turn) + 381 (otherwise only your turn, Open State),
 * 807 (Assault X = +X Might only while an attacker; 807.2 values sum), 317.2 ("this turn" expires).
 *
 * Head-judge notes — the tricky situations for THIS card:
 *  1. What counts as "not from your hand": a facedown [Hidden] card played later, your Chosen
 *     Champion from the Champion Zone, a unit The Harrowing plays from trash — all must empower;
 *     an ordinary hand play must NOT.
 *  2. The Disempower is a COST: not empowered → the ability is simply not available; empowered but
 *     exhausted → also unavailable; paying it flips the legend to not-empowered immediately, before
 *     anyone can respond, and the Assault arrives only on resolution.
 *  3. [Action] permission: usable in a showdown on the OPPONENT's turn (e.g. to no effect on a
 *     defender — Assault does nothing while defending), but not in their neutral Main Phase.
 *  4. Assault 2 is attacker-only Might: a 2-Might unit attacks as 4 and beats a 3; the same grant
 *     on a defender leaves it at 2 and it dies to a 3-Might attacker.
 *  5. Expiry: the grant is gone after the turn ends; the legend readies at your next Awaken but
 *     stays disempowered until another off-hand play.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-197-166";
const DISCIPLE = "ven-117-166"; // Disciple of Shen — Order unit 2, [Hidden]
const XIN_ZHAO = "sfd-176-221"; // Xin Zhao, Vigilant — Order champion unit, 3 + [order]
const HARROWING = "ogn-198-298"; // The Harrowing — Chaos spell 6 + [chaos][chaos]: play a unit from your trash
const SARGE = "ogn-219-298"; // Vanguard Sergeant — vanilla Order 4/4

/** P1's turn, legend already empowered, a 2-Might ally in base and a 3-Might enemy holding bf1. */
function empowered() {
  return scenario()
    .card("hot", { def: CARD, meta: { empowered: true }, owner: P1, zone: "legendZone" })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 2, name: "Striker" }, "striker")
    .unit(P2, "bf1", { might: 3, name: "Guard" }, "guard");
}

describe("Heart of the Tempest (ven-197-166)", () => {
  test("registry payload: [play-card-not-from-hand → empower self] trigger + [Action] (disempower self + exhaust → Assault 2 to a unit this turn)", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", domain: ["order", "chaos"], name: "Heart of the Tempest" });
    expect(def?.abilities).toEqual([
      { effect: { target: "self", type: "empower" }, trigger: { event: "play-card-not-from-hand", on: "controller" }, type: "triggered" },
      {
        cost: { disempower: "self", exhaust: true },
        effect: { duration: "turn", keyword: "Assault", target: { type: "unit" }, type: "grant-keyword", value: 2 },
        timing: "action",
        type: "activated",
      },
    ]);
  });

  test("activation: Disempower + Exhaust are paid up front, the ability sits on the chain naming its target, and Assault 2 (turn) is granted on resolution", async () => {
    const game = await empowered().build();
    const targets = game.p1.option("activate", "hot")?.fields.find((f) => f.arg === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["striker"], ["guard"]])); // "a unit": either side
    await game.p1.activate("hot", 1, { targets: "striker" });
    expect(game.state("hot")).toMatchObject({ isEmpowered: false, isExhausted: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "hot", controller: P1, targets: ["striker"], triggered: false })]);
    expect(game.state("striker").grantedKeywords).toEqual([]);
    await game.settle();
    expect(game.state("striker").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 2 }]);
    expect(game.state("striker").might).toBe(2); // not attacking yet → no bonus (807.1.c)
    expect(game.violations()).toEqual([]);
  });

  test("Assault 2 is real attacking Might: the 2-Might Striker attacks as 4, kills the 3-Might Guard and conquers", async () => {
    const game = await empowered().build();
    await game.p1.activate("hot", 1, { targets: "striker" });
    await game.settle();
    await game.p1.move("striker", "bf1");
    expect(game.state("striker")).toMatchObject({ combatRole: "attacker", might: 4 });
    await game.settle();
    expect(game.zoneOf("guard")).toBe("trash");
    expect(game.zoneOf("striker")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("near miss: without the grant the same attack loses (2 into 3)", async () => {
    const game = await empowered().build();
    await game.p1.move("striker", "bf1");
    await game.settle();
    expect(game.zoneOf("striker")).toBe("trash");
    expect(game.zoneOf("guard")).toBe("battlefield-bf1");
  });

  test("cost negative space: not empowered → not offered at all; empowered but exhausted → not offered", async () => {
    const plain = await scenario().legend(P1, CARD, "hot").unit(P1, "base", { might: 2 }, "striker").build();
    expect(plain.state("hot").isEmpowered).toBe(false);
    expect(plain.p1.legal().some((o) => o.key.startsWith("activateAbility:hot"))).toBe(false);
    const tired = await scenario()
      .card("hot", { def: CARD, meta: { empowered: true, exhausted: true }, owner: P1, zone: "legendZone" })
      .unit(P1, "base", { might: 2 }, "striker")
      .build();
    expect(tired.p1.legal().some((o) => o.key.startsWith("activateAbility:hot"))).toBe(false);
  });

  test("[Action] timing: on the opponent's turn it is NOT available in their neutral Main Phase, but IS once a showdown opens and P1 holds Focus", async () => {
    const game = await scenario()
      .active(P2)
      .card("hot", { def: CARD, meta: { empowered: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Holder" }, "holder")
      .unit(P2, "base", { might: 3, name: "Raider" }, "raider")
      .build();
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:hot"))).toBe(false);
    await game.p2.move("raider", "bf1"); // combat showdown, attacker (P2) has Focus first
    await game.p2.passFocus();
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("activate", "hot")).toBe(true);
    await game.p1.activate("hot", 1, { targets: "holder" });
    await game.settle();
    // Assault on a DEFENDER is worthless (807.1.c): 2 vs 3 → Holder dies, Raider conquers.
    expect(game.zoneOf("holder")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.state("hot")).toMatchObject({ isEmpowered: false, isExhausted: true });
  });

  test("'this turn': the grant expires at end of turn; the legend readies at P1's next Awaken but stays disempowered", async () => {
    const game = await empowered().build();
    await game.p1.activate("hot", 1, { targets: "striker" });
    await game.settle();
    await game.advanceTurn();
    expect(game.state("striker").grantedKeywords).toEqual([]);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("hot")).toMatchObject({ isEmpowered: false, isReady: true });
    expect(game.p1.legal().some((o) => o.key.startsWith("activateAbility:hot"))).toBe(false);
  });

  test("negative space for the trigger: playing a unit FROM HAND does not empower the legend", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).legend(P1, CARD, "hot").hand(P1, SARGE, "sarge").build();
    await game.p1.play("sarge");
    await game.settle();
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("hot").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test("playing a [Hidden] card from facedown is a play 'from anywhere other than your hand' and must empower the legend — no trigger fires", async () => {
    // Expected: after Disciple of Shen is played from facedown, Heart of the Tempest is Empowered
    // (and its [Action] ability becomes available). Actual: isEmpowered stays false — the
    // `play-card-not-from-hand` trigger event is never raised by the engine.
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .legend(P1, CARD, "hot")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "anchor")
      .hand(P1, DISCIPLE, "shen")
      .build();
    await game.p1.hide("shen", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.reveal("shen");
    await game.settle();
    expect(game.zoneOf("shen")).toBe("battlefield-bf1");
    expect(game.state("hot").isEmpowered).toBe(true);
    expect(game.p1.can("activate", "hot")).toBe(true);
  });

  test("playing your Chosen Champion from the Champion Zone (not your hand) must empower the legend — no trigger fires", async () => {
    // Expected: Xin Zhao enters base and the legend becomes Empowered. Actual: not empowered.
    const game = await scenario().resources(P1, { energy: 3, power: { order: 1 } }).legend(P1, CARD, "hot").champion(P1, XIN_ZHAO, "xin").build();
    await game.p1.playChampion("base");
    await game.settle();
    expect(game.zoneOf("xin")).toBe("base");
    expect(game.state("hot").isEmpowered).toBe(true);
  });

  test("a unit The Harrowing plays from your TRASH must empower the legend — no trigger fires", async () => {
    // Expected: Vanguard Sergeant is played from trash → legend Empowered. Actual: the unit arrives
    // in base but the legend is not empowered.
    const game = await scenario()
      .resources(P1, { energy: 6, power: { chaos: 2 } })
      .legend(P1, CARD, "hot")
      .trash(P1, SARGE, "sarge")
      .hand(P1, HARROWING, "harrow")
      .build();
    const viaTargets = game.p1.option("cast", "harrow")?.fields.some((f) => f.arg === "targets") === true;
    await (viaTargets ? game.p1.cast("harrow", { targets: "sarge" }) : game.p1.cast("harrow", { answers: ["sarge", "base"] }));
    await game.settle({ policy: "first" });
    expect(game.zoneOf("sarge")).toBe("base");
    expect(game.state("hot").isEmpowered).toBe(true);
  });
});
