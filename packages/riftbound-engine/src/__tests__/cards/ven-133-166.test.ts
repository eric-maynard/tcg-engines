/**
 * Glowstone — ven-133-166 · Gear · Order · 2 energy
 *
 *   [Empower] [rainbow][rainbow] ([rainbow][rainbow]: Empower me. Use only if not Empowered.)
 *   Disempower this, [Exhaust]: Choose a player. They gain control of this and recall it.
 *   (Send it to their base.)
 *   At the end of your turn, kill this and deal 5 to all units you control.
 *
 * Rules: 827/441 (Empower keyword = "[cost]: Empower this. Play only if not Empowered"; the state is
 * binary and persists), [rainbow] = one power of ANY domain, 442 (Disempower removes the state; as
 * a COST it can only be paid while Empowered), 455–458 (a Recall relocates to base and keeps
 * damage/status — so it arrives exhausted from the [Exhaust] cost), 108.2 ("you"/"your" on a
 * permanent = its CONTROLLER; a killed card goes to its OWNER's trash), 517 (end-of-turn trigger in
 * the Ending phase; marked damage is cleared afterwards), gear activated abilities without
 * [Action]/[Reaction]: your turn, open state.
 *
 * Head-judge checklist for THIS card:
 *  1. [rainbow][rainbow] is two power of any mix (order+fury works; one power does not); once
 *     Empowered the Empower ability disappears and the give-away ability appears.
 *  2. The give-away needs BOTH costs: not Empowered → not offered; Empowered but exhausted → not
 *     offered. Paying it disempowers + exhausts, then the chosen player controls it in THEIR base.
 *  3. Hot potato: handed to P2, nothing happens at the end of P1's turn (P1 no longer controls it);
 *     at the end of P2's turn it dies into P1's trash (owner) and P2's units take 5.
 *  4. End of YOUR turn only: with P1's Glowstone, P2 ending the turn does nothing.
 *  5. "deal 5 to all units you control": friendly 5-Might units die, a 6-Might survives (damage then
 *     clears in the Ending phase); ENEMY units are untouched; Glowstone itself is killed → trash.
 *  6. Partner: Matriarch of War ("When you empower something else, empower me") should light up
 *     when Glowstone is Empowered.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ven-133-166";
const MATRIARCH_OF_WAR = "ven-153-166"; // Legend: When you empower something else, empower me.

describe("Glowstone (ven-133-166)", () => {
  test("registry payload: 2-cost Order gear; [Empower rainbow×2 (not-empowered)], [Disempower+Exhaust: control/recall], [end of your turn: kill self + 5 to your units]", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "gear", domain: "order", energyCost: 2, name: "Glowstone" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(3);
    expect(def?.abilities?.[0]).toMatchObject({ cost: { power: ["rainbow", "rainbow"] }, effect: { target: "self", type: "empower" }, restrictions: [{ type: "not-empowered" }], type: "activated" });
    expect(def?.abilities?.[1]).toMatchObject({ cost: { disempower: "self", exhaust: true }, type: "activated" });
    expect(def?.abilities?.[2]).toMatchObject({
      effect: { effects: [{ target: "self", type: "kill" }, { amount: 5, type: "damage" }], type: "sequence" },
      trigger: { event: "end-of-turn", on: "controller" },
      type: "triggered",
    });
  });

  test.failing("BUG: payload — ability #1 must be a structured control-change + recall (it is raw text) and the damage must be scoped to units YOU control", async () => {
    // Expected: abilities[1].effect is executable (not {type:"raw"}); abilities[2] damage target carries controller "friendly".
    // Actual: #1 is { type: "raw", text: … } and #2 targets { type: "unit", quantity: "all" } with no controller.
    const def = (await loadDefaultCardPool()).get(CARD);
    const give = def?.abilities?.[1] as { effect?: { type?: string } };
    expect(give.effect?.type).not.toBe("raw");
    expect(def?.abilities?.[2]).toMatchObject({ effect: { effects: [expect.anything(), { target: { controller: "friendly" } }] } });
  });

  test("costs 2 energy; lands in base ready and un-Empowered; only the Empower ability is offered", async () => {
    const game = await scenario().resources(P1, { energy: 2, power: { order: 2 } }).hand(P1, CARD, "gs").build();
    await game.p1.play("gs");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { order: 2 } });
    await game.settle();
    expect(game.p1.gear()).toEqual(["gs"]);
    expect(game.state("gs")).toMatchObject({ isEmpowered: false, isExhausted: false });
    expect(game.p1.legal().map((o) => o.key).filter((k) => k.startsWith("activateAbility"))).toEqual(["activateAbility:gs#0"]);
    expect((await scenario().resources(P1, { energy: 1, power: { order: 3 } }).hand(P1, CARD, "gs").build()).p1.can("play", "gs")).toBe(false);
  });

  test("[Empower] [rainbow][rainbow]: two power of ANY mix (order+fury) are spent, it uses the chain, resolves to Empowered; then #0 is gone and #1 appears", async () => {
    const game = await scenario().resources(P1, { energy: 3, power: { fury: 1, order: 1 } }).gear(P1, CARD, "gs").build();
    await game.p1.activate("gs", 0);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 0, order: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gs", controller: P1, triggered: false })]);
    expect(game.state("gs").isEmpowered).toBe(false);
    await game.settle();
    expect(game.state("gs")).toMatchObject({ isEmpowered: true, isExhausted: false });
    expect(game.p1.legal().map((o) => o.key).filter((k) => k.startsWith("activateAbility"))).toEqual(["activateAbility:gs#1"]);
    expect(game.violations()).toEqual([]);
  });

  test("negative space on costs: one power cannot Empower; the give-away is not offered while un-Empowered, nor while Empowered-but-exhausted; nothing on the opponent's turn", async () => {
    expect((await scenario().resources(P1, { energy: 9, power: { order: 1 } }).gear(P1, CARD, "gs").build()).p1.can("activate", "gs")).toBe(false);
    const plain = await scenario().gear(P1, CARD, "gs").build();
    expect((await plain.p1.try((p) => p.activate("gs", 1))).ok).toBe(false);
    const tapped = await scenario().gear(P1, CARD, "gs", { empowered: true, exhausted: true }).build();
    expect(tapped.state("gs")).toMatchObject({ isEmpowered: true, isExhausted: true });
    expect((await tapped.p1.try((p) => p.activate("gs", 1))).ok).toBe(false);
    const opp = await scenario().active(P2).resources(P1, { power: { order: 2 } }).gear(P1, CARD, "gs", { empowered: true }).build();
    expect(opp.p1.legal()).toEqual([]);
  });

  test("give-away costs are paid on activation: Glowstone is Disempowered and Exhausted, ability on the chain", async () => {
    const game = await scenario().gear(P1, CARD, "gs", { empowered: true }).build();
    await game.p1.activate("gs", 1);
    expect(game.state("gs")).toMatchObject({ isEmpowered: false, isExhausted: true });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gs", controller: P1 })]);
  });

  test.failing("BUG: 'Choose a player. They gain control of this and recall it.' — choosing P2 puts an exhausted, un-Empowered Glowstone under P2's control in P2's base", async () => {
    // Expected: on resolution P1 picks a player (both offered); picking P2 → controller P2, listed in P2's base, owner still P1.
    // Actual: the effect is unparsed raw text — no prompt, Glowstone stays with P1.
    const game = await scenario().gear(P1, CARD, "gs", { empowered: true }).build();
    await game.p1.activate("gs", 1);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.answer(P2);
    await game.settle();
    expect(game.state("gs")).toMatchObject({ controller: P2, isEmpowered: false, isExhausted: true, owner: P1 });
    expect(game.p2.base()).toContain("gs");
    expect(game.p1.base()).not.toContain("gs");
  });

  test("at the end of YOUR turn: trigger on the chain in the Ending phase; Glowstone is killed → trash; your 5-Might and 2-Might units die, your 6-Might unit survives (damage cleared afterwards) and keeps its battlefield", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P1 })
      .gear(P1, CARD, "gs")
      .unit(P1, "base", { might: 5, name: "Five" }, "five")
      .unit(P1, "base", { might: 2, name: "Two" }, "two")
      .unit(P1, "bf1", { might: 6, name: "Six" }, "six")
      .build();
    await game.p1.endTurn();
    expect(game.phase()).toBe("ending");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gs", controller: P1, triggered: true })]);
    await game.settle();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.zoneOf("five")).toBe("trash"); // exactly lethal
    expect(game.zoneOf("two")).toBe("trash");
    expect(game.state("six")).toMatchObject({ damage: 0, zone: "battlefield-bf1" }); // one short of lethal, then healed
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test.failing("BUG: 'units YOU control' — enemy units take no damage from Glowstone's end-of-turn blast", async () => {
    // Expected: P2's 1-Might unit is untouched. Actual: the damage hits every unit on the board and kills it.
    const game = await scenario().gear(P1, CARD, "gs").unit(P1, "base", { might: 2 }, "mine").unit(P2, "base", { might: 1, name: "Bystander" }, "theirs").build();
    await game.p1.endTurn();
    await game.settle();
    expect(game.zoneOf("mine")).toBe("trash");
    expect(game.state("theirs")).toMatchObject({ damage: 0, zone: "base" });
  });

  test("end of YOUR turn only: P1's Glowstone does nothing when P2's turn ends (still in base, everyone alive), then fires at the end of P1's next turn", async () => {
    const game = await scenario().active(P2).gear(P1, CARD, "gs").unit(P1, "base", { might: 2 }, "mine").build();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.zoneOf("gs")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("trash");
  });

  test.failing("BUG: hot potato — handed to P2, it does NOT fire at the end of P1's turn; at the end of P2's turn it dies into P1's trash (owner) and only P2's units take 5", async () => {
    // Expected per 108.2: controller P2 → "your turn" is P2's. Actual: control never changes (raw effect), so it blows up on P1.
    const game = await scenario()
      .gear(P1, CARD, "gs", { empowered: true })
      .unit(P1, "base", { might: 3, name: "Mine" }, "mine")
      .unit(P2, "base", { might: 3, name: "Theirs" }, "theirs")
      .build();
    await game.p1.activate("gs", 1);
    await game.settle();
    await game.p1.answer(P2);
    await game.settle();
    expect(game.state("gs").controller).toBe(P2);
    await game.advanceTurn(); // P1's turn ends
    expect(game.turnPlayer()).toBe(P2);
    expect(game.zoneOf("gs")).toBe("base");
    expect(game.zoneOf("mine")).toBe("base");
    await game.advanceTurn(); // P2's turn ends
    expect(game.zoneOf("gs")).toBe("trash");
    expect(game.p1.trash()).toContain("gs");
    expect(game.zoneOf("theirs")).toBe("trash");
    expect(game.zoneOf("mine")).toBe("base");
  });

  test("partner — Matriarch of War ('When you empower something else, empower me') becomes Empowered when Glowstone is Empowered", async () => {
    // Expected: after Glowstone's Empower resolves, the legend's trigger resolves and it is Empowered too. Actual: legend stays un-Empowered.
    const game = await scenario().resources(P1, { power: { order: 2 } }).legend(P1, MATRIARCH_OF_WAR, "mat").gear(P1, CARD, "gs").build();
    await game.p1.activate("gs", 0);
    await game.settle();
    await game.settle();
    expect(game.state("gs").isEmpowered).toBe(true);
    expect(game.state("mat").isEmpowered).toBe(true);
  });
});
