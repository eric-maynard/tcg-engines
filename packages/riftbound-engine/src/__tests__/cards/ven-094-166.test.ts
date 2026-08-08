/**
 * Mask Mother — ven-094-166 · Unit · Chaos · 3 energy (no power) · 3 Might
 *
 *   When you discard me, you may pay [1] to give a friendly unit +2 [Might] this turn.
 *
 * Head-judge notes — the trickiest situations for THIS card:
 *  1. rule 422.1 — "discard" is hand → trash ONLY. Burning her off the top of the deck (440), killing
 *     her on the board, or recycling her is NOT a discard: no prompt, nothing to pay.
 *  2. rule 422.1.b / 385.2 — the trigger lives in a non-board zone and resolves with Mask Mother already
 *     in the trash; she is not a "friendly unit" (units are on the board) and can never buff herself.
 *  3. rule 383.3.b — "you may pay [1]" is the ability's base cost, paid on acceptance: exactly 1 ENERGY
 *     (never power), and with 0 energy the option cannot be taken and no buff appears.
 *  4. "When YOU discard me" — the discarding player is whoever moves her hand → trash, even when an
 *     OPPONENT's effect (Bewitching Spirit: "choose a player. They discard 1") forces it on THEIR turn:
 *     the trigger is Mask Mother's owner's, they pay, and one of THEIR units gets +2 ("friendly" is
 *     relative to the ability's controller — 359.3.f.4).
 *  5. Discard as a COST (Brazen Buccaneer's optional additional cost) is still a discard (422.3) → fires.
 *  6. "+2 this turn" is a turn-scoped modification (317.2.c) — gone after the turn ends; with two friendly
 *     units the controller picks exactly one.
 */

import { describe, expect, test } from "bun:test";
import type { Decision, Game, Seat } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "ven-094-166";
const ENFORCER = "ogn-003-298"; // Fury unit, 2: [Assault 2]. When you play me, discard 1.
const BEWITCHING = "unl-121-219"; // Chaos unit, 3: When you play me, choose a player. They discard 1.
const BUCCANEER = "ogn-002-298"; // Fury unit, 6: you may discard 1 as an additional cost → costs [2] less.
const KENNEN = "ven-113-166"; // Chaos unit, 3 + [chaos]: When you play me, [Burn 2].
const VENGEANCE = "ogn-229-298"; // Order spell, 4 + [order][order]: Kill a unit.

/** P1: `energy`, Enforcer + Mask Mother in hand (so the forced single discard hits her), `allies` vanilla units in base. */
function enforcerBoard(energy: number, allies = 1) {
  const b = scenario().resources(P1, { energy }).hand(P1, ENFORCER, "ce").hand(P1, CARD, "mm");
  for (let i = 0; i < allies; i++) {
    b.unit(P1, "base", { might: 2, name: `Ally ${i + 1}` }, `ally${i + 1}`);
  }
  return b;
}

/** Play Enforcer → its trigger resolves → Mask Mother (the only other hand card) is discarded. */
async function discardViaEnforcer(game: Game): Promise<void> {
  await game.p1.play("ce", { to: "base" });
  await game.settle();
  if (game.decision()?.kind === "pick" && game.zoneOf("mm") === "hand") {
    await game.p1.pick("mm");
    await game.settle();
  }
  expect(game.zoneOf("mm")).toBe("trash");
}

/** Answer a "choose a player" prompt (pick with seatRef, or Bewitching Spirit's choose-mode: 0 = opponent, 1 = self). */
async function choosePlayer(game: Game, chooser: Seat, who: Seat): Promise<void> {
  const d = game.decision() as Decision;
  expect(d).toMatchObject({ kind: "pick", seat: chooser });
  const opts = d.kind === "pick" ? d.options : [];
  const bySeat = opts.find((o) => o.seatRef === who || o.label === who || o.key === who);
  if (bySeat) {
    await game.seat(chooser).pick(bySeat.key);
  } else {
    await game.seat(chooser).chooseMode(who === chooser ? 1 : 0);
  }
  await game.settle();
}

/** If the +2 recipient is asked for, name it. */
async function pickRecipientIfAsked(game: Game, seat: Seat, unit: string): Promise<void> {
  if (game.decision()?.kind === "pick" && game.decision()?.seat === seat) {
    await game.seat(seat).pick(unit);
    await game.settle();
  }
}

describe("Mask Mother (ven-094-166)", () => {
  test("registry payload: ONE optional triggered ability — on self discard, pay {energy:1}, +2 Might (turn) to a friendly unit", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "unit", domain: "chaos", energyCost: 3, might: 3, name: "Mask Mother" });
    expect(def?.powerCost ?? []).toEqual([]);
    expect(def?.abilities).toHaveLength(1);
    expect(def?.abilities?.[0]).toMatchObject({
      condition: { cost: { energy: 1 }, type: "pay-cost" },
      effect: { amount: 2, duration: "turn", target: { controller: "friendly", type: "unit" }, type: "modify-might" },
      optional: true,
      trigger: { event: "discard", on: "self" },
      type: "triggered",
    });
  });

  test("cost: 3 energy, no power — a plain 3-Might unit when simply played (no trigger); 2 energy is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "mm").build();
    await game.p1.play("mm", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.state("mm")).toMatchObject({ isExhausted: true, might: 3, zone: "base" });
    expect(game.chain()).toEqual([]);
    expect(game.decision()?.kind).toBe("action");
    const poor = await scenario().resources(P1, { energy: 2, power: { chaos: 3 } }).hand(P1, CARD, "mm").build();
    expect(poor.p1.can("play", "mm")).toBe(false);
  });

  test("discarded by your own effect: P1 is asked yes/no (source = Mask Mother); nothing is paid or buffed before answering", async () => {
    const game = await enforcerBoard(3).build();
    await discardViaEnforcer(game);
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mm" } });
    expect(game.p1.energy()).toBe(1); // 3 − 2 for the Enforcer; the [1] is not yet paid
    expect(game.state("ally1").might).toBe(2);
  });

  test("accepting pays exactly 1 ENERGY and gives the friendly unit +2 Might; she stays in the trash; the bonus is gone next turn", async () => {
    const game = await enforcerBoard(3).build();
    await discardViaEnforcer(game);
    await game.p1.yes();
    await game.settle();
    await pickRecipientIfAsked(game, P1, "ally1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    expect(game.state("ally1")).toMatchObject({ baseMight: 2, might: 4 });
    expect(game.state("ce").might).toBe(2); // the Enforcer was not the pick
    expect(game.zoneOf("mm")).toBe("trash"); // this is not Flame Chompers — she does not come back
    expect(game.violations()).toEqual([]);
    await game.advanceTurn();
    expect(game.state("ally1").might).toBe(2);
  });

  test("two friendly units (+ the Enforcer): the controller picks exactly one recipient; Mask Mother herself is never offered", async () => {
    const game = await enforcerBoard(3, 2).build();
    await discardViaEnforcer(game);
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card) : [];
    expect([...offered].sort()).toEqual(["ally1", "ally2", "ce"]);
    await game.p1.pick("ally2");
    await game.settle();
    expect(game.state("ally2").might).toBe(4);
    expect(game.state("ally1").might).toBe(2);
    expect(game.state("ce").might).toBe(2);
  });

  test("declining spends nothing and buffs nobody", async () => {
    const game = await enforcerBoard(3).build();
    await discardViaEnforcer(game);
    await game.p1.no();
    await game.settle();
    expect(game.p1.energy()).toBe(1);
    expect(game.state("ally1").might).toBe(2);
    expect(game.state("ce").might).toBe(2);
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toEqual([]);
  });

  test("with 0 energy left the [1] cannot be paid: no buff appears whatever is answered, energy never goes negative", async () => {
    const game = await enforcerBoard(2).build(); // exactly the Enforcer's cost
    await discardViaEnforcer(game);
    expect(game.p1.energy()).toBe(0);
    const d = game.decision();
    if (d?.kind === "yes-no") {
      expect(d.canAccept).not.toBe(true); // an unpayable "yes" must not be advertised as available
      const t = await game.p1.try((p) => p.yes());
      if (!t.ok && game.decision()?.kind === "yes-no") {
        await game.p1.no();
      }
      await game.settle();
      await pickRecipientIfAsked(game, P1, "ally1");
    }
    expect(game.p1.energy()).toBe(0);
    expect(game.state("ally1").might).toBe(2);
    expect(game.state("ce").might).toBe(2);
    expect(game.violations()).toEqual([]);
  });

  test("'When YOU discard me' under an OPPONENT's effect on THEIR turn: Bewitching Spirit makes P1 discard → P1's trigger, P1 pays 1, only P1's units are offered", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 3, power: { chaos: 1 } })
      .resources(P1, { energy: 1 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally1")
      .unit(P2, "base", { might: 2, name: "Theirs" }, "theirs")
      .hand(P1, CARD, "mm")
      .hand(P2, BEWITCHING, "spirit")
      .build();
    await game.p2.play("spirit", { to: "base" });
    await game.settle();
    await choosePlayer(game, P2, P1);
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P1 && game.zoneOf("mm") === "hand") {
      await game.p1.pick("mm"); // P1 chooses which card to discard (only one candidate)
      await game.settle();
    }
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mm" } });
    await game.p1.yes();
    await game.settle();
    const d = game.decision();
    if (d?.kind === "pick" && d.seat === P1) {
      const offered = d.options.map((o) => o.card);
      expect(offered).toEqual(["ally1"]); // "friendly" = Mask Mother's controller's units, not the turn player's
      await game.p1.pick("ally1");
      await game.settle();
    }
    expect(game.p1.energy()).toBe(0);
    expect(game.state("ally1").might).toBe(4);
    expect(game.state("theirs").might).toBe(2);
    expect(game.state("spirit").might).toBe(2);
    expect(game.turnPlayer()).toBe(P2);
    // P2's turn ends → the "+2 this turn" expires with it.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("ally1").might).toBe(2);
  });

  test("discarded as a COST (Brazen Buccaneer's optional additional cost) is still a discard: the trigger fires and can be paid", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5 }) // 6 − 2 = 4 for the Buccaneer, 1 left over for Mask Mother's [1]
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally1")
      .hand(P1, BUCCANEER, "bb")
      .hand(P1, CARD, "mm")
      .build();
    expect(game.p1.can("play", "bb")).toBe(true);
    await game.p1.play("bb", { answers: ["mm"], payOptional: true, to: "base" });
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.p1.energy()).toBe(1);
    await game.settle();
    expect(game.decision()).toMatchObject({ kind: "yes-no", seat: P1, source: { cardId: "mm" } });
    await game.p1.yes();
    await game.settle();
    await pickRecipientIfAsked(game, P1, "ally1");
    expect(game.p1.energy()).toBe(0);
    expect(game.state("ally1").might).toBe(4);
    expect(game.zoneOf("bb")).toBe("base");
  });

  test("negative space — BURNED from the top of the deck (deck → trash, rule 440) is not a discard: no prompt, no buff", async () => {
    const game = await scenario()
      .resources(P1, { energy: 4, power: { chaos: 1 } })
      .unit(P1, "base", { might: 2 }, "ally1")
      .deck(P1, [CARD, "ogn-175-298"], ["mm", "under"])
      .hand(P1, KENNEN, "kennen")
      .build();
    await game.p1.play("kennen", { to: "base" });
    await game.settle();
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.zoneOf("under")).toBe("trash");
    expect(game.decision()?.kind).toBe("action");
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("ally1").might).toBe(2);
  });

  test("negative space — KILLED on the board (board → trash) is not a discard either", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 4, power: { order: 2 } })
      .resources(P1, { energy: 1 })
      .unit(P1, "base", CARD, "mm")
      .unit(P1, "base", { might: 2 }, "ally1")
      .hand(P2, VENGEANCE, "veng")
      .build();
    await game.p2.cast("veng", { targets: "mm" });
    await game.settle();
    expect(game.zoneOf("mm")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "action", seat: P2 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.energy()).toBe(1);
    expect(game.state("ally1").might).toBe(2);
  });

  test("multi-step: discard in response window is irrelevant — the +2 lands before combat this turn and wins a 2-v-3 attack", async () => {
    // Ally (2) would trade down into a 3-Might defender; Enforcer → discard Mask Mother → pay [1] → Ally is 4 → attack kills the 3 and conquers.
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", { might: 2, name: "Ally" }, "ally1")
      .unit(P2, "bf1", { might: 3, name: "Blocker" }, "blocker")
      .hand(P1, ENFORCER, "ce")
      .hand(P1, CARD, "mm")
      .build();
    await discardViaEnforcer(game);
    await game.p1.yes();
    await game.settle();
    await pickRecipientIfAsked(game, P1, "ally1");
    expect(game.state("ally1").might).toBe(4);
    await game.p1.move("ally1", "bf1");
    await game.settle();
    expect(game.zoneOf("blocker")).toBe("trash");
    expect(game.zoneOf("ally1")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });
});
