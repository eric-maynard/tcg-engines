/**
 * Perfect Execution — ven-012-166 · Spell · Fury · 3 energy + [fury] · (no timing keyword)
 *
 *   Ready a unit and give it [Assault 3] this turn. (+3 [Might] while it's an attacker.)
 *   [Flow] [3][fury] (You may play this from your trash for its Flow cost. Then banish it.)
 *
 * Head-judge checklist for this card:
 *   1. One target, two instructions: "a unit … it" — a single choice is readied AND gets Assault 3;
 *      the engine must not ask for a second unit.
 *   2. rule 807.1.c/d — Assault is +Might only WHILE ATTACKING: nothing in base, nothing when the
 *      unit ends up defending; 807.2 — it sums with printed Assault (Chemtech Enforcer 2+2+3 = 7).
 *   3. Real combat, exactly-lethal edge: an exhausted 3-Might unit is readied, walks into a 5-Might
 *      defender and wins 6-vs-5, surviving (combat cleanup heals before Assault drops, 466.1/466.7).
 *   4. Timing: no [Action]/[Reaction] → not playable in a showdown or on the opponent's turn, and
 *      Flow does not change that (829.1.b.2). No unit on the board → not playable (355.8).
 *   5. Flow (829): from the trash for [3][fury] (an alternate cost, 829.1.c.1), then BANISHED rather
 *      than trashed — so it cannot be Flowed twice; a hand-cast copy goes to the trash and CAN.
 *   6. "this turn" — Assault 3 is gone after the turn ends; the ready state of course persists.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-012-166";
const CHEMTECH_ENFORCER = "ogn-003-298"; // 2 Might, printed [Assault 2]

function board() {
  return scenario()
    .resources(P1, { energy: 3, power: { fury: 1 } })
    .battlefield("bf1", { controller: P2 })
    .unit(P1, "base", { might: 3, name: "Sleepy Duelist" }, "ally", { exhausted: true })
    .unit(P2, "bf1", { might: 5, name: "Gatekeeper" }, "foe")
    .hand(P1, CARD, "pe");
}

describe("Perfect Execution (ven-012-166)", () => {
  test("registry payload: spell = sequence[ready a unit, grant Assault 3 (turn)] + Flow [3][fury]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "spell", energyCost: 3, powerCost: ["fury"] });
    expect(def?.timing ?? "standard").toBe("standard"); // no [Action]/[Reaction]
    expect(def?.abilities).toHaveLength(2);
    expect(def?.abilities?.[0]).toMatchObject({
      effect: {
        effects: [
          { target: { type: "unit" }, type: "ready" },
          { duration: "turn", keyword: "Assault", target: { type: "unit" }, type: "grant-keyword", value: 3 },
        ],
        type: "sequence",
      },
      type: "spell",
    });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { energy: 3, power: ["fury"] }, keyword: "Flow", type: "keyword" });
  });

  test("costs 3 energy + 1 fury; ONE target is asked; it is readied and gains Assault 3; the spell goes to the trash", async () => {
    const game = await board().build();
    const fields = game.p1.option("cast", "pe")?.fields ?? [];
    expect(fields.filter((f) => f.arg === "targets")).toHaveLength(1);
    await game.p1.cast("pe", { targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain().map((c) => c.cardId)).toEqual(["pe"]);
    const r = await game.settle();
    expect(r.reason).toBe("open"); // no second "choose a unit" prompt
    expect(game.state("ally").isReady).toBe(true);
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("foe").grantedKeywords).toEqual([]);
    expect(game.zoneOf("pe")).toBe("trash");
  });

  test("unaffordable with 3 energy but no fury pip, or with the pip but 2 energy; no unit anywhere → not playable (355.8)", async () => {
    const noFury = await scenario().resources(P1, { energy: 3, power: { calm: 1 } }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "pe").build();
    expect(noFury.p1.can("cast", "pe")).toBe(false);
    const short = await scenario().resources(P1, { energy: 2, power: { fury: 1 } }).unit(P1, "base", { might: 1 }, "u").hand(P1, CARD, "pe").build();
    expect(short.p1.can("cast", "pe")).toBe(false);
    const empty = await scenario().resources(P1, { energy: 3, power: { fury: 1 } }).hand(P1, CARD, "pe").build();
    expect(empty.p1.can("cast", "pe")).toBe(false);
  });

  test("'a unit': friendly or enemy, exhausted or not — an already-ready enemy still gets Assault 3 (415.1.c)", async () => {
    const game = await board().build();
    expect(game.p1.option("cast", "pe")?.fields.find((f) => f.arg === "targets")?.options).toEqual(expect.arrayContaining([["ally"], ["foe"]]));
    await game.p1.cast("pe", { targets: "foe" });
    await game.settle();
    expect(game.state("foe").isReady).toBe(true);
    expect(game.state("foe").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.state("ally").isExhausted).toBe(true); // untouched
  });

  test("Assault is attack-only: in base the unit is still 3 Might; readied, it attacks a 5-Might defender as 6, kills it, survives, and conquers", async () => {
    const game = await board().build();
    await game.p1.cast("pe", { targets: "ally" });
    await game.settle();
    expect(game.state("ally").might).toBe(3); // not an attacker yet
    await game.p1.move("ally", "bf1"); // legal only because Perfect Execution readied it
    expect(game.state("ally").combatRole).toBe("attacker");
    expect(game.state("ally").might).toBe(6);
    expect(game.state("foe").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("ally")).toBe("battlefield-bf1");
    expect(game.state("ally").damage).toBe(0); // healed in combat cleanup before Assault lapsed
    expect(game.state("ally").might).toBe(3); // no longer an attacker
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("negative space: the same 3-Might unit attacking WITHOUT Perfect Execution loses to the 5-Might defender", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 3 }, "ally")
      .unit(P2, "bf1", { might: 5 }, "foe")
      .build();
    await game.p1.move("ally", "bf1");
    expect(game.state("ally").might).toBe(3);
    await game.settle();
    expect(game.zoneOf("ally")).toBe("trash");
    expect(game.zoneOf("foe")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
  });

  test("negative space: Assault 3 on a unit that ends up DEFENDING adds nothing — a 6-Might attacker still kills the 5-Might 'Assault 3' defender", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 6 }, "bruiser")
      .unit(P2, "bf1", { might: 5 }, "foe")
      .hand(P1, CARD, "pe")
      .build();
    await game.p1.cast("pe", { targets: "foe" });
    await game.settle();
    await game.p1.move("bruiser", "bf1");
    expect(game.state("foe").combatRole).toBe("defender");
    expect(game.state("foe").might).toBe(5);
    await game.settle();
    expect(game.zoneOf("foe")).toBe("trash");
    expect(game.zoneOf("bruiser")).toBe("battlefield-bf1");
  });

  test("rule 807.2 stacking: Chemtech Enforcer (2 Might, Assault 2) + Assault 3 attacks as 7", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CHEMTECH_ENFORCER, "enforcer", { exhausted: true })
      .unit(P2, "bf1", { might: 6 }, "wall")
      .hand(P1, CARD, "pe")
      .build();
    await game.p1.cast("pe", { targets: "enforcer" });
    await game.settle();
    await game.p1.move("enforcer", "bf1");
    expect(game.state("enforcer").might).toBe(7);
    await game.settle();
    expect(game.zoneOf("wall")).toBe("trash");
    expect(game.zoneOf("enforcer")).toBe("battlefield-bf1");
  });

  test("'this turn': Assault 3 expires at end of turn; the unit stays ready", async () => {
    const game = await board().build();
    await game.p1.cast("pe", { targets: "ally" });
    await game.settle();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.state("ally").grantedKeywords).toEqual([]);
    expect(game.state("ally").keywords).not.toContain("Assault");
    expect(game.state("ally").isReady).toBe(true);
  });

  test("timing: no [Action] — not playable during a showdown (from hand OR via Flow from trash), nor on the opponent's turn", async () => {
    const showdown = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .battlefield("bf1", { controller: null })
      .unit(P1, "base", { might: 3 }, "scout")
      .unit(P1, "base", { might: 3 }, "other")
      .hand(P1, CARD, "pe")
      .trash(P1, CARD, "peTrash")
      .autoProcedures(false)
      .build();
    await showdown.p1.move("scout", "bf1");
    expect(showdown.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(showdown.p1.can("cast", "pe")).toBe(false);
    expect(showdown.p1.can("cast", "peTrash")).toBe(false);

    const oppTurn = await scenario()
      .active(P2)
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .unit(P1, "base", { might: 3 }, "u")
      .hand(P1, CARD, "pe")
      .trash(P1, CARD, "peTrash")
      .build();
    expect(oppTurn.p1.can("cast", "pe")).toBe(false);
    expect((await oppTurn.p1.try((p) => p.cast("peTrash", { flow: true, targets: "u" }))).ok).toBe(false);
  });

  test("Flow: from the trash it is offered only as a Flow play, costs [3][fury], resolves fully, then is BANISHED and cannot be Flowed again", async () => {
    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .unit(P1, "base", { might: 3 }, "ally", { exhausted: true })
      .trash(P1, CARD, "pe")
      .build();
    expect(game.p1.option("cast", "pe")?.fields.find((f) => f.arg === "flow")?.options).toEqual([true]);
    await game.p1.cast("pe", { flow: true, targets: "ally" });
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } });
    expect(game.zoneOf("pe")).toBe("chain");
    await game.settle();
    expect(game.state("ally").isReady).toBe(true);
    expect(game.state("ally").grantedKeywords).toEqual([{ duration: "turn", keyword: "Assault", value: 3 }]);
    expect(game.zoneOf("pe")).toBe("banishment");
    expect(game.p1.trash()).not.toContain("pe");
    expect(game.p1.can("cast", "pe")).toBe(false);
  });

  test("Flow cost is its own cost: 3 energy without a fury pip cannot Flow it; a hand-cast copy lands in the trash and is THEN a Flow candidate", async () => {
    const noPip = await scenario().resources(P1, { energy: 5 }).unit(P1, "base", { might: 3 }, "u").trash(P1, CARD, "pe").build();
    expect(noPip.p1.can("cast", "pe")).toBe(false);

    const game = await scenario()
      .resources(P1, { energy: 6, power: { fury: 2 } })
      .unit(P1, "base", { might: 3 }, "ally", { exhausted: true })
      .unit(P1, "base", { might: 2 }, "other", { exhausted: true })
      .hand(P1, CARD, "pe")
      .build();
    await game.p1.cast("pe", { targets: "ally" });
    await game.settle();
    expect(game.zoneOf("pe")).toBe("trash");
    expect(game.p1.can("cast", "pe")).toBe(true);
    await game.p1.cast("pe", { flow: true, targets: "other" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("other").isReady).toBe(true);
    expect(game.zoneOf("pe")).toBe("banishment");
    expect(game.violations()).toEqual([]);
  });
});
