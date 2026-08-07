/**
 * Poro Snax — sfd-046-221 · Gear · Calm · 1 energy + [calm]
 *
 *   When you play this, draw 1.
 *   [1][calm], [Exhaust], Kill this: Draw 1.
 *
 * Head-judge notes — the tricky spots for this card:
 *  - 359.2.d: non-unit gear enters READY, so the activated ability is usable the turn it lands
 *    (play → trigger draw → activate → draw again = 2 cards for [2] + 2 calm in one turn).
 *  - The play trigger is a triggered ability on the chain (opponents may React before the draw);
 *    the gear itself is not on the chain any more, so killing the Snax in response does not stop
 *    the draw (the ability exists independently of its source).
 *  - "Kill this" and "[Exhaust]" are COSTS (428.6): the Snax is in the trash the moment the ability
 *    is activated, before it resolves; an already-exhausted Snax cannot pay; the [calm] pip may be
 *    paid with pooled [rainbow] power but not with a wrong-domain pip.
 *  - Gear activated abilities without [Action]/[Reaction] are Main-Phase / Open-State only on the
 *    controller's turn — not during a showdown, not on the opponent's turn, not with a chain open.
 *  - Natural counter: Rocket Barrage ("Kill a gear") — once Snax is targeted, its controller can NOT
 *    cash it in "in response" (no Reaction); the Barrage kills it and no card is drawn.
 */

import { describe, expect, test } from "bun:test";
import type { ActionDecision } from "../../harness";
import { loadDefaultCardPool, P1, P2, scenario } from "../../harness";

const CARD = "sfd-046-221";
const ROCKET_BARRAGE = "sfd-077-221";
const CASH_IN = 1; // ability index: #0 is the play trigger, #1 the activated ability

function inHand(energy = 1, power: Record<string, number> = { calm: 1 }) {
  return scenario().resources(P1, { energy, power }).hand(P1, CARD, "snax");
}

function onBoard(energy = 1, power: Record<string, number> = { calm: 1 }) {
  return scenario().resources(P1, { energy, power }).gear(P1, CARD, "snax");
}

describe("Poro Snax (sfd-046-221)", () => {
  test("cost: 1 energy + 1 calm to play; lands in base READY (359.2.d); unaffordable without the calm pip or the energy", async () => {
    const game = await inHand().build();
    await game.p1.play("snax");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("snax")).toBe("base");
    expect(game.state("snax").isReady).toBe(true);
    const noCalm = await inHand(1, {}).build();
    expect(noCalm.p1.can("playGear", "snax")).toBe(false);
    const wrongPip = await inHand(1, { fury: 1 }).build();
    expect(wrongPip.p1.can("playGear", "snax")).toBe(false);
    const noEnergy = await inHand(0, { calm: 1 }).build();
    expect(noEnergy.p1.can("playGear", "snax")).toBe(false);
  });

  test("'When you play this, draw 1' is a triggered ability on the chain; it resolves into exactly one drawn card", async () => {
    const game = await inHand().deckTop(P1, "ogn-175-298", "topcard").build();
    expect(game.p1.hand()).toEqual(["snax"]);
    await game.p1.play("snax");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snax", controller: P1, triggered: true })]);
    expect(game.p1.hand()).toEqual([]); // not drawn yet — opponents may still React
    await game.settle();
    expect(game.p1.hand()).toEqual(["topcard"]);
    expect(game.chain()).toHaveLength(0);
  });

  test("the opponent gets priority on the play trigger before the card is drawn (Closed state), then it resolves", async () => {
    const game = await inHand().build();
    await game.p1.play("snax");
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect((game.decision() as ActionDecision).context).toBe("chain");
    expect(game.p1.hand()).toHaveLength(0);
    await game.p2.passPriority();
    expect(game.p1.hand()).toHaveLength(1);
  });

  test("activated: pays [1][calm], exhaust and kill (Snax hits the trash immediately as a cost), then draws 1 on resolution", async () => {
    const game = await onBoard().build();
    const hand0 = game.p1.hand().length;
    await game.p1.activate("snax", CASH_IN);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("snax")).toBe("trash"); // cost paid before resolution
    expect(game.p1.hand()).toHaveLength(hand0); // effect not yet resolved
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "snax", triggered: false })]);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(hand0 + 1);
    expect(game.zoneOf("snax")).toBe("trash");
    expect(game.p1.gear()).toEqual([]);
  });

  test("full line in one turn: play (draw 1) then immediately cash in (draw 1) — 2 energy + 2 calm buys two cards and leaves no gear", async () => {
    const game = await inHand(2, { calm: 2 }).build();
    await game.p1.play("snax");
    await game.settle();
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.can("activate", "snax")).toBe(true); // entered ready
    await game.p1.activate("snax", CASH_IN);
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { calm: 0 } });
    expect(game.zoneOf("snax")).toBe("trash");
  });

  test("activation cost edge cases: exhausted → illegal; no calm → illegal; wrong-domain pip → illegal; no energy → illegal", async () => {
    const ready = await onBoard().build();
    // An exhausted gear cannot pay [Exhaust].
    const tapped = await scenario().resources(P1, { energy: 1, power: { calm: 1 } }).gear(P1, CARD, "snax", { exhausted: true }).build();
    expect(tapped.state("snax").isExhausted).toBe(true);
    expect(tapped.p1.can("activate", "snax")).toBe(false);
    expect(ready.p1.can("activate", "snax")).toBe(true); // control: the ready one can
    const noCalm = await onBoard(1, {}).build();
    expect(noCalm.p1.can("activate", "snax")).toBe(false);
    const wrongPip = await onBoard(1, { fury: 1 }).build();
    expect(wrongPip.p1.can("activate", "snax")).toBe(false);
    const noEnergy = await onBoard(0, { calm: 1 }).build();
    expect(noEnergy.p1.can("activate", "snax")).toBe(false);
    const r = await noEnergy.p1.try((p) => p.activate("snax", CASH_IN));
    expect(r.ok).toBe(false);
    expect(noEnergy.zoneOf("snax")).toBe("base"); // nothing was paid
  });

  test("pooled [rainbow] power should pay the activated ability's [calm] pip (135.2.e.5.b) — the engine refuses the activation", async () => {
    // Expected: with 1 energy + 1 rainbow power the cash-in is legal and spends both.
    // Actual: activateAbility is not offered (rainbow only pays card power costs today).
    const rainbow = await onBoard(1, { rainbow: 1 }).build();
    expect(rainbow.p1.can("activate", "snax")).toBe(true);
    await rainbow.p1.activate("snax", CASH_IN);
    expect(rainbow.p1.resources().energy).toBe(0);
    expect(rainbow.p1.power()).toBe(0);
    await rainbow.settle();
    expect(rainbow.zoneOf("snax")).toBe("trash");
  });

  test("timing: no [Action]/[Reaction] — not activatable on the opponent's turn, nor while a chain is open on your own turn", async () => {
    const oppTurn = await onBoard().active(P2).build();
    expect(oppTurn.p1.can("activate", "snax")).toBe(false);
    const r = await oppTurn.p1.try((p) => p.activate("snax", CASH_IN));
    expect(r.ok).toBe(false);
    expect(oppTurn.zoneOf("snax")).toBe("base");
    // Own turn, but a chain is open (Snax #2's play trigger pending) → Closed state → not legal.
    const closed = await onBoard(2, { calm: 2 }).hand(P1, CARD, "second").build();
    await closed.p1.play("second");
    expect(closed.chain()).toHaveLength(1);
    expect(closed.p1.can("activate", "snax")).toBe(false);
    await closed.settle();
    expect(closed.p1.can("activate", "snax")).toBe(true); // Open again
  });

  test("timing: not activatable during a showdown on your own turn (gear abilities are Open-state only)", async () => {
    const game = await onBoard()
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 5 }, "wall")
      .unit(P1, "base", { might: 1 }, "scout")
      .build();
    await game.p1.move("scout", "bf1");
    expect((game.decision() as ActionDecision).context).toBe("showdown");
    expect(game.p1.can("activate", "snax")).toBe(false);
  });

  test("counter-play: Rocket Barrage 'Kill a gear' on the Snax — its controller cannot cash it in in response; it dies and draws nothing", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P1, { energy: 1, power: { calm: 1 } })
      .resources(P2, { energy: 4, power: { mind: 1 } })
      .gear(P1, CARD, "snax")
      .hand(P2, ROCKET_BARRAGE, "barrage")
      .build();
    const hand0 = game.p1.hand().length;
    await game.p2.cast("barrage");
    // Walk the chain / prompts: whenever P1 holds priority the cash-in must not be legal.
    for (let i = 0; i < 12 && game.zoneOf("snax") !== "trash"; i++) {
      const d = game.decision();
      if (!d) {
        break;
      }
      if (d.seat === P1) {
        expect(game.p1.can("activate", "snax")).toBe(false);
        await game.p1.passPriority();
      } else if (d.kind === "action") {
        await game.p2.passPriority();
      } else if (d.kind === "pick") {
        const gearMode = d.options.find((o) => /kill|gear/i.test(o.label));
        await game.p2.answer({ keys: [gearMode?.key ?? d.options.find((o) => o.card === "snax")?.key ?? d.options[0]!.key], kind: "pick" });
      } else {
        break;
      }
    }
    expect(game.zoneOf("snax")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(hand0); // killed, not cashed in
  });

  test("parsed abilities match the printed text: play-self trigger drawing 1, and an activated [1][calm]+Exhaust+Kill-this drawing 1", async () => {
    const pool = await loadDefaultCardPool();
    const def = pool.get(CARD);
    expect(def).toMatchObject({ cardType: "gear", energyCost: 1, powerCost: ["calm"] });
    const abilities = (def?.abilities ?? []) as Record<string, unknown>[];
    expect(abilities).toHaveLength(2);
    expect(abilities[0]).toMatchObject({ effect: { amount: 1, type: "draw" }, trigger: { event: "play-self" }, type: "triggered" });
    expect(abilities[1]).toMatchObject({
      cost: { energy: 1, exhaust: true, kill: "self", power: ["calm"] },
      effect: { amount: 1, type: "draw" },
      type: "activated",
    });
  });
});
