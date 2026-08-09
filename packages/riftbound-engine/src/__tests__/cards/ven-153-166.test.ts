/**
 * Matriarch of War — ven-153-166 · Legend (Ambessa) · Body/Order
 *
 *   When you empower something else, empower me. (I become Empowered if I'm not already.)
 *   Disempower me, [rainbow], [Exhaust]: Ready a unit.
 *
 * Rules: 441 Empower (binary status; 441.1.c empowering an Empowered object does nothing; 441.2.a
 * BECOMING Empowered is the referencable event; 441.3.a the player a Game Effect directs to empower is
 * the one who "empowers"); 355.9.a.4 legends can be Empowered; 442 Disempower; 383 triggered ability
 * → chain item; 376/377 activated ability with three mandatory costs (Disempower me = must currently
 * BE Empowered, [rainbow] = one power of ANY domain — 135.2.e.5.a, [Exhaust] = must be ready), no
 * Action/Reaction tag → your turn, Open state, no showdown (151.2 / 381); "a unit" = any unit.
 *
 * Head-judge corner cases covered here:
 *   1. "something ELSE": the legend's own false→true edge must not re-trigger the ability (no second
 *      chain item / no loop); empowering while already Empowered is a harmless no-op.
 *   2. "YOU empower": it is about who performs the action, not whose card it is — my Sanction on an
 *      ENEMY unit should count; the opponent's Sanction on MY unit (or on theirs) should not.
 *   3. Activation gating: not Empowered ✗ · no power ✗ · exhausted ✗ · all three ✓; the [rainbow] pip is
 *      payable with body/order power; all costs leave immediately, the ready waits on the chain.
 *   4. The engine loop in one turn: Sunhawk's [Empower] → trigger → legend Empowered → cash it in to
 *      ready an exhausted attacker, which then attacks and conquers.
 *   5. Persistence: Empowered survives turn changes; after use the legend is disempowered+exhausted,
 *      readies at your Awaken but needs a fresh empower before it can go again.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-153-166";
const SUNHAWK = "ven-122-166"; // Order 3-Might: [Empower] [2]; [Empowered][>] +1 Might and Deflect 2
const MARAUDER = "ven-074-166"; // Body 2-Might: [Empower] — [1] or [body]; [Empowered][>] +1 Might
const SANCTION = "ven-035-166"; // Calm Reaction 3+[calm]: mode 0 = Empower a unit (disempower it at end of turn)

function primed(power: Record<string, number> = { body: 1 }, meta: Record<string, unknown> = { empowered: true }) {
  return scenario()
    .resources(P1, { power })
    .card("mow", { def: CARD, meta, owner: P1, zone: "legendZone" })
    .unit(P1, "base", { might: 3, name: "Tired" }, "tired", { exhausted: true })
    .unit(P2, "base", { might: 3, name: "Their Tired" }, "theirs", { exhausted: true });
}

describe("Matriarch of War (ven-153-166)", () => {
  test("registry payload: #0 triggered on your empower → empower self; #1 activated, cost {disempower self, [rainbow], exhaust} → ready a unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", name: "Matriarch of War" });
    expect(def?.domain).toEqual(["body", "order"]);
    expect(def?.abilities).toEqual([
      { effect: { target: "self", type: "empower" }, trigger: { event: "empower", on: "controller" }, type: "triggered" },
      { cost: { disempower: "self", exhaust: true, power: ["rainbow"] }, effect: { target: { type: "unit" }, type: "ready" }, type: "activated" },
    ]);
  });

  test("empowering your unit (Solari Sunhawk's [Empower] [2]) triggers the legend: a triggered chain item the opponent can see, then the legend is Empowered", async () => {
    const game = await scenario().resources(P1, { energy: 2 }).legend(P1, CARD, "mow").unit(P1, "base", SUNHAWK, "hawk").build();
    expect(game.state("mow").isEmpowered).toBe(false);
    await game.p1.activate("hawk");
    expect(game.p1.energy()).toBe(0);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Sunhawk's Empower resolves
    expect(game.state("hawk")).toMatchObject({ isEmpowered: true, might: 4 });
    expect(game.state("mow").isEmpowered).toBe(false); // not yet — the trigger is a chain item
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mow", controller: P1, triggered: true })]);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.passPriority();
    expect(game.state("mow").isEmpowered).toBe(true);
    await game.settle();
    expect(game.state("mow").isEmpowered).toBe(true);
    expect(game.violations()).toEqual([]);
  });

  test("'something ELSE' — the legend becoming Empowered by its own trigger must not trigger it again (a second Matriarch item appears on the chain)", async () => {
    // Expected: after the trigger resolves the chain is empty and P1 is back in an open main phase.
    // Actual: the empower event on the legend itself re-fires the ability (harmless, but a spurious
    // chain item and priority round).
    const game = await scenario().resources(P1, { energy: 2 }).legend(P1, CARD, "mow").unit(P1, "base", SUNHAWK, "hawk").build();
    await game.p1.activate("hawk");
    await game.p1.passPriority();
    await game.p2.passPriority(); // hawk empowered → trigger #1 on the chain
    await game.p1.passPriority();
    await game.p2.passPriority(); // trigger #1 resolves → legend empowered
    expect(game.state("mow").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("already Empowered + you empower something else: nothing changes (441.1.c) — still Empowered once everything settles, no violation", async () => {
    const game = await scenario().resources(P1, { energy: 1 }).card("mow", { def: CARD, meta: { empowered: true }, owner: P1, zone: "legendZone" }).unit(P1, "base", MARAUDER, "mara").build();
    await game.p1.activate("mara");
    await game.settle();
    expect(game.state("mara")).toMatchObject({ isEmpowered: true, might: 3 });
    expect(game.state("mow").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });

  test("only when YOU empower: the opponent empowering their own Marauder on their turn leaves your legend un-Empowered", async () => {
    const game = await scenario().active(P2).resources(P2, { energy: 1 }).legend(P1, CARD, "mow").unit(P2, "base", MARAUDER, "theirs").build();
    await game.p2.activate("theirs");
    await game.settle();
    expect(game.state("theirs").isEmpowered).toBe(true);
    expect(game.state("mow").isEmpowered).toBe(false);
    expect(game.chain()).toEqual([]);
  });

  test.failing("BUG: 'you empower something' is about the ACTOR (441.3.a) — my Sanction empowering an ENEMY unit should empower my legend", async () => {
    // Expected: P1 performed the Empower → trigger → legend Empowered. Actual: the engine keys the
    // event to the empowered card's owner (P2), so nothing triggers.
    const game = await scenario()
      .resources(P1, { energy: 3, power: { calm: 1 } })
      .legend(P1, CARD, "mow")
      .unit(P2, "base", { might: 2, name: "Foe" }, "foe")
      .hand(P1, SANCTION, "sanc")
      .build();
    await game.p1.cast("sanc", { mode: 0, targets: "foe" });
    await game.settle();
    expect(game.state("foe").isEmpowered).toBe(true);
    expect(game.state("mow").isEmpowered).toBe(true);
  });

  test.failing("BUG: …and the opponent's Sanction empowering MY unit is THEM empowering it — my legend must stay un-Empowered", async () => {
    // Expected: no trigger for P1. Actual: owner-keyed matching fires Matriarch of War for P1.
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { calm: 1 } })
      .legend(P1, CARD, "mow")
      .unit(P1, "base", { might: 2, name: "Mine" }, "mine")
      .hand(P2, SANCTION, "sanc")
      .build();
    await game.p2.cast("sanc", { mode: 0, targets: "mine" });
    await game.settle();
    expect(game.state("mine").isEmpowered).toBe(true);
    expect(game.state("mow").isEmpowered).toBe(false);
  });

  test("activation gating — every cost is mandatory: not Empowered ✗, Empowered but no power ✗, Empowered + power but exhausted ✗, all three ✓", async () => {
    expect((await primed({ body: 1 }, {}).build()).p1.can("activate", "mow")).toBe(false);
    expect((await primed({}).build()).p1.can("activate", "mow")).toBe(false);
    expect((await primed({ body: 1 }, { empowered: true, exhausted: true }).build()).p1.can("activate", "mow")).toBe(false);
    const ok = await primed({ body: 1 }).build();
    expect(ok.p1.legal().map((o) => o.key)).toContain("activateAbility:mow#1");
    expect(ok.p1.legal().map((o) => o.key)).not.toContain("activateAbility:mow#0"); // #0 is the trigger, never activatable
  });

  test("Disempower me, [rainbow], [Exhaust]: all three costs leave on activation ([rainbow] paid with BODY power), the target is named, P2 gets priority, the unit readies on resolution", async () => {
    const game = await primed({ body: 1 }).build();
    const targets = game.p1.option("activate", "mow")?.fields.find((f) => f.name === "targets")?.options;
    expect(targets).toEqual(expect.arrayContaining([["tired"], ["theirs"]])); // "a unit": either side
    await game.p1.activate("mow", undefined, { targets: "tired" });
    expect(game.state("mow")).toMatchObject({ isEmpowered: false, isExhausted: true });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { body: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "mow", controller: P1, targets: ["tired"], triggered: false })]);
    expect(game.state("tired").isExhausted).toBe(true);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.settle();
    expect(game.state("tired").isReady).toBe(true);
    expect(game.state("theirs").isExhausted).toBe(true);
    expect(game.p1.can("activate", "mow")).toBe(false); // spent: disempowered and exhausted
  });

  test("[rainbow] accepts order power too, and universal power; the ready may even go to an ENEMY unit", async () => {
    const order = await primed({ order: 1 }).build();
    expect(order.p1.can("activate", "mow")).toBe(true);
    const any = await primed({ rainbow: 1 }).build();
    await any.p1.activate("mow", undefined, { targets: "theirs" });
    await any.settle();
    expect(any.p1.power()).toBe(0);
    expect(any.state("theirs").isReady).toBe(true);
    expect(any.state("tired").isExhausted).toBe(true);
  });

  test("timing (no Action/Reaction tag): not on the opponent's turn, not with Focus inside a showdown", async () => {
    const opp = await primed().active(P2).build();
    expect(opp.p1.legal()).toEqual([]);
    const sd = await primed().battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2 }, "def").unit(P1, "base", { might: 3 }, "atk").build();
    expect(sd.p1.can("activate", "mow")).toBe(true);
    await sd.p1.move("atk", "bf1");
    expect(sd.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(sd.p1.can("activate", "mow")).toBe(false);
  });

  test("the whole engine in one turn: Sunhawk [Empower] → legend Empowered → Disempower/[body]/[Exhaust] readies the spent Bruiser → it attacks and conquers", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2, power: { body: 1 } })
      .legend(P1, CARD, "mow")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 3, name: "Def" }, "def")
      .unit(P1, "base", SUNHAWK, "hawk")
      .unit(P1, "base", { might: 4, name: "Bruiser" }, "bruiser", { exhausted: true })
      .build();
    expect(game.p1.can("activate", "mow")).toBe(false);
    expect((await game.p1.try((p) => p.move("bruiser", "bf1"))).ok).toBe(false); // exhausted units can't move
    await game.p1.activate("hawk");
    await game.settle();
    expect(game.state("mow").isEmpowered).toBe(true);
    await game.p1.activate("mow", undefined, { targets: "bruiser" });
    await game.settle();
    expect(game.state("bruiser").isReady).toBe(true);
    await game.p1.move("bruiser", "bf1");
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
    expect(game.state("mow")).toMatchObject({ isEmpowered: false, isExhausted: true });
  });

  test("persistence: Empowered survives turn changes unused; once spent the legend readies at your Awaken but stays disempowered until you empower something again", async () => {
    const kept = await primed({}).build(); // Empowered, no power to spend it
    await kept.advanceTurn();
    await kept.advanceTurn();
    expect(kept.turnPlayer()).toBe(P1);
    expect(kept.state("mow")).toMatchObject({ isEmpowered: true, isReady: true });

    const spent = await primed({ body: 1 }).resources(P1, { energy: 0 }).unit(P1, "base", MARAUDER, "mara").build();
    await spent.p1.activate("mow", undefined, { targets: "tired" });
    await spent.settle();
    await spent.advanceTurn();
    await spent.advanceTurn();
    expect(spent.state("mow")).toMatchObject({ isEmpowered: false, isReady: true });
    expect(spent.p1.can("activate", "mow")).toBe(false);
    await spent.p1.tapRune(); // 1 energy for the Marauder's [Empower] — [1]
    await spent.p1.activate("mara");
    await spent.settle();
    expect(spent.state("mara").isEmpowered).toBe(true);
    expect(spent.state("mow").isEmpowered).toBe(true); // re-armed
  });
});
