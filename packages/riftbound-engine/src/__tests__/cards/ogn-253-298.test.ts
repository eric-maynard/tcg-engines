/**
 * Hand of Noxus — ogn-253-298 · Legend (Darius) · Fury/Order
 *
 *   [Exhaust]: [Reaction], [Legion] — [Add] [1]. (Abilities that add resources
 *   can't be reacted to. Get the effect if you've played a card this turn.)
 *
 * Rules: 812 Legion (dependent keyword: active once a DIFFERENT card has been Finalized by you
 * this turn — 812.1.c / 419.4.b: a spell still sitting on the chain already counts); 813 Reaction
 * (activate in Closed States / showdowns / on any player's turn); 429.2–429.2.a + 400.2 ([Add]
 * abilities resolve the moment they are finalized — no chain item, priority does not move);
 * 165 the added Energy sits in the Rune Pool and empties at end of turn.
 *
 * Head-judge corner cases covered here:
 *   1. Legion NOT met (no card played yet this turn): the legend must not produce Energy — either
 *      the ability is not offered at all, or exhausting it adds nothing.
 *   2. Legion is per TURN: satisfied on turn N, it is off again on your next turn even though the
 *      legend readied — and "played a card" means a CARD: activating Hand of Noxus itself is not a
 *      play (Darius, Trifarian's "second card" must not see it).
 *   3. Reaction on the OPPONENT's turn: respond to their spell with your own Reaction spell (that
 *      finalized spell satisfies Legion while still on the chain), then crack the legend with the
 *      chain open → +1 immediately, chain unchanged, you keep priority.
 *   4. In a showdown with Focus (Action/Reaction window) it is usable; the exhausted legend cannot
 *      be used twice in a turn; it readies at your next Awaken.
 *   5. The Energy is real: Poro (2) → Hand of Noxus (+1) → Trifarian Gloryseeker (2, Legion buff).
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, loadDefaultCardPool, scenario } from "../../harness";

const CARD = "ogn-253-298";
const PORO = "ogn-210-298"; // Daring Poro — Order unit, 2 energy
const GLORYSEEKER = "ogn-217-298"; // Order unit, 2 energy: [Legion] — When you play me, buff me.
const CALL_TO_GLORY = "ogn-207-298"; // Order Reaction spell, 3 energy: give a unit +3 Might this turn
const CLEAVE = "ogn-004-298"; // Fury Action spell, 1 energy
const DARIUS = "ogn-027-298"; // When you play your second card in a turn, give me +2 Might and ready me.

function ownTurn(energy = 2) {
  return scenario().resources(P1, { energy }).legend(P1, CARD, "hon").hand(P1, PORO, "poro");
}

describe("Hand of Noxus (ogn-253-298)", () => {
  test("Legion met: after playing a card this turn, [Exhaust] adds exactly 1 Energy immediately — no chain item, priority stays put", async () => {
    const game = await ownTurn(2).build();
    await game.p1.play("poro");
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.state("hon").isReady).toBe(true);
    await game.p1.activate("hon");
    expect(game.state("hon").isExhausted).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.chain()).toEqual([]); // 429.2: resolved on finalize, nothing to react to
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("Legion condition on the activated ability — with no card played this turn the legend adds nothing (812.1.c)", async () => {
    // Expected: either the ability is not offered, or exhausting it adds nothing (the [Add] text is
    // the Legion-dependent part). Actual: +1 Energy is added unconditionally (2 → 3).
    const game = await ownTurn(2).build();
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
    if (game.p1.can("activate", "hon")) {
      await game.p1.activate("hon");
      await game.settle();
    }
    expect(game.p1.energy()).toBe(2);
  });

  test("cost is [Exhaust] only: no energy/power is spent, and an already-exhausted legend cannot be activated again this turn", async () => {
    const game = await ownTurn(2).build();
    await game.p1.play("poro");
    await game.settle();
    await game.p1.activate("hon");
    expect(game.p1.resources()).toEqual({ energy: 1, power: {} });
    expect(game.p1.can("activate", "hon")).toBe(false);
    const again = await game.p1.try((p) => p.activate("hon"));
    expect(again.ok).toBe(false);
    expect(game.p1.energy()).toBe(1);
  });

  test("the added Energy is spendable right away: Poro (2) → +1 → Trifarian Gloryseeker (2) enters buffed by its own Legion", async () => {
    const game = await ownTurn(3).hand(P1, GLORYSEEKER, "gs").build();
    await game.p1.play("poro");
    await game.settle();
    expect(game.p1.can("play", "gs")).toBe(false); // 1 energy left, needs 2
    await game.p1.activate("hon");
    expect(game.p1.energy()).toBe(2);
    await game.p1.play("gs");
    await game.settle();
    expect(game.zoneOf("gs")).toBe("base");
    expect(game.state("gs").isBuffed).toBe(true);
    expect(game.p1.energy()).toBe(0);
  });

  test("[Reaction] on the opponent's turn: answer their spell with Call to Glory, then crack the legend with the chain still open (419.4.b — a finalized spell on the chain satisfies Legion)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 1 })
      .resources(P1, { energy: 3 })
      .legend(P1, CARD, "hon")
      .unit(P1, "base", { might: 2 }, "ally")
      .unit(P2, "base", { might: 2 }, "foe")
      .hand(P1, CALL_TO_GLORY, "ctg")
      .hand(P2, CLEAVE, "cleave")
      .build();
    expect(game.p1.legal()).toEqual([]); // Neutral Open on P2's turn: nothing for P1, not even a Reaction ability
    await game.p2.cast("cleave", { targets: "foe" });
    await game.p2.passPriority();
    expect(game.actingSeat()).toBe(P1);
    await game.p1.cast("ctg", { targets: "ally" });
    expect(game.p1.energy()).toBe(0);
    expect(game.chain().map((c) => c.name)).toEqual(["Cleave", "Call to Glory"]);
    expect(game.p1.can("activate", "hon")).toBe(true);
    await game.p1.activate("hon");
    expect(game.p1.energy()).toBe(1);
    expect(game.chain().map((c) => c.name)).toEqual(["Cleave", "Call to Glory"]); // no ability item added
    expect(game.actingSeat()).toBe(P1); // 429.2.a: priority did not pass
    await game.settle();
    expect(game.state("ally").might).toBe(5);
    expect(game.state("hon").isExhausted).toBe(true);
  });

  test("[Reaction] ⊇ [Action]: usable while you hold Focus in a combat showdown you opened (card played earlier this turn)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 2 })
      .legend(P1, CARD, "hon")
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2 }, "def")
      .unit(P1, "base", { might: 3 }, "atk")
      .hand(P1, PORO, "poro")
      .build();
    await game.p1.play("poro");
    await game.settle();
    await game.p1.move("atk", "bf1");
    expect(game.decision()).toMatchObject({ context: "showdown", kind: "action", seat: P1 });
    expect(game.p1.can("activate", "hon")).toBe(true);
    await game.p1.activate("hon");
    expect(game.p1.energy()).toBe(1);
    expect(game.decision()).toMatchObject({ context: "showdown", seat: P1 }); // Focus kept
    await game.settle();
    expect(game.zoneOf("def")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("activating the legend is not 'playing a card': Darius, Trifarian's second-card trigger ignores it, then fires on the real second card", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .legend(P1, CARD, "hon")
      .unit(P1, "base", DARIUS, "darius", { exhausted: true })
      .hand(P1, PORO, "poro")
      .hand(P1, CLEAVE, "cleave")
      .build();
    await game.p1.play("poro");
    await game.settle();
    await game.p1.activate("hon");
    expect(game.gameState.cardsPlayedThisTurn?.[P1]).toBe(1);
    expect(game.chain()).toEqual([]);
    expect(game.state("darius")).toMatchObject({ isExhausted: true, might: 5 });
    await game.p1.cast("cleave", { targets: "poro" });
    await game.settle();
    expect(game.state("darius")).toMatchObject({ isReady: true, might: 7 });
  });

  test("across turns: the exhausted legend stays exhausted through the opponent's turn, readies at YOUR Awaken; unspent Energy emptied (165) and the played-card count reset", async () => {
    const game = await ownTurn(2).build();
    await game.p1.play("poro");
    await game.settle();
    await game.p1.activate("hon");
    expect(game.p1.energy()).toBe(1);
    await game.advanceTurn(); // → P2
    expect(game.state("hon").isExhausted).toBe(true); // only YOUR awaken readies it
    await game.advanceTurn(); // → P1
    expect(game.turnPlayer()).toBe(P1);
    expect(game.state("hon").isReady).toBe(true);
    expect(game.p1.energy()).toBe(0);
    expect(game.gameState.cardsPlayedThisTurn?.[P1] ?? 0).toBe(0);
  });

  test("'this turn' — Legion satisfied last turn must be off again on your next turn until you play a card (812.1.c / 727.1.a.1)", async () => {
    // Expected: turn N+2, nothing played yet → no Energy from the legend. Actual: +1 (Legion unchecked).
    const game = await ownTurn(2).build();
    await game.p1.play("poro");
    await game.settle();
    await game.p1.activate("hon");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state("hon").isReady).toBe(true);
    if (game.p1.can("activate", "hon")) {
      await game.p1.activate("hon");
      await game.settle();
    }
    expect(game.p1.energy()).toBe(0);
  });

  test("only its controller may use it: the opponent never sees an activate option for your legend, even with priority on your turn", async () => {
    const game = await scenario()
      .resources(P1, { energy: 3 })
      .resources(P2, { energy: 3 })
      .legend(P1, CARD, "hon")
      .unit(P1, "base", { might: 2 }, "ally")
      .hand(P1, CLEAVE, "cleave")
      .hand(P2, PORO, "p2poro")
      .build();
    await game.p1.cast("cleave", { targets: "ally" });
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    expect(game.p2.legal().some((o) => o.card === "hon" || o.key.includes("hon"))).toBe(false);
    const r = await game.p2.try((p) => p.activate("hon"));
    expect(r.ok).toBe(false);
    expect(game.state("hon").isReady).toBe(true);
  });

  test("registry payload: one activated ability — cost {exhaust}, timing reaction, Legion condition, effect add-resource energy 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Darius", name: "Hand of Noxus" });
    expect(def?.domain).toEqual(["fury", "order"]);
    expect(def?.abilities).toEqual([
      {
        condition: { type: "legion" },
        cost: { exhaust: true },
        effect: { energy: 1, type: "add-resource" },
        timing: "reaction",
        type: "activated",
      },
    ]);
  });
});
