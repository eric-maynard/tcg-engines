/**
 * Gloomist — unl-193-219 · Legend (Vex) · Calm/Chaos
 *
 *   When you or an ally hold, you may exhaust me to draw 1.
 *
 * Rules: 469.2 / 315.2.b (Hold = during YOUR Beginning Phase you keep control of a battlefield you
 * did not score this turn; +1 point per battlefield), 383.4.d.2.b (a Hold Effect that references the
 * holding PLAYER goes on the chain once per Hold performed), 383.3.b (leading "you may [exhaust me]
 * to …": the choice and the exhaust happen at FINALIZATION; "no" removes the item; an exhausted
 * legend cannot pay), 315.1 → 315.2 (Awaken readies everything BEFORE the Beginning Phase, so the
 * legend is practically always ready when you hold), 489 ("ally" = a TEAMMATE in team modes; in a
 * duel or free-for-all every other player is an opponent), 469.1 (Conquer is not Hold), 431 (a draw
 * from an empty Main Deck Burns Out: recycle trash, an opponent gains 1, then draw).
 *
 * Head-judge notes — the tricky spots for THIS card:
 *  1. Turn shape: Awaken → Beginning (hold scores; this trigger; the phase HOLDS while it is on the
 *     chain and P2 gets priority) → Channel 2 → Draw 1 → Main. So "yes" ends the sequence with hand
 *     +2 and an exhausted legend; "no" with hand +1 and a ready legend.
 *  2. Two battlefields held = two Holds = two triggers, but one legend exhausts once → ONE extra card.
 *  3. A legend that went into my turn exhausted is readied by Awaken first → the option is live.
 *  4. Not mine, not an ally: the opponent's hold (2p) and BOTH opponents' holds (3p FFA) never ask me.
 *  5. Conquering (walking in / winning combat) is scoring but not holding → silence.
 *  6. "you may" has teeth: saying yes on an empty deck Burns you Out (opponent +1) before the card comes.
 *  7. Partners: Navori Fighting Pit's own hold trigger shares the chain with Gloomist's; Blue Sentinel
 *     ("your hold effects for holding here trigger an additional time") doubles the TRIGGER, not the
 *     legend's stamina — still one draw.
 */

import { describe, expect, test } from "bun:test";
import { loadDefaultCardPool, P1, P2, P3, scenario } from "../../harness";

const CARD = "unl-193-219";
const NAVORI_PIT = "ogn-283-298"; // Battlefield: When you hold here, buff a unit here.
const BLUE_SENTINEL = "unl-087-219"; // 4 Might: your hold effects for holding here trigger an additional time
const FILLER = "ogn-175-298";

/** P2 is about to end turn 2; P1 (Gloomist, empty hand) controls bf1 with a 3-Might holder on it. */
function aboutToHold() {
  return scenario().turn(2).active(P2).legend(P1, CARD, "gl").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", { might: 3, name: "Holder" }, "holder");
}

const payIfAble = (d: { kind: string; canAccept?: boolean }) => (d.kind === "yes-no" ? (d.canAccept === false ? "no" : "yes") : undefined);

describe("Gloomist (unl-193-219)", () => {
  test("registry payload: Legend (Vex · Calm/Chaos) with ONE optional hold trigger for you-or-allies, cost 'exhaust me', effect draw 1", async () => {
    const def = (await loadDefaultCardPool()).get(CARD);
    expect(def).toMatchObject({ cardType: "legend", championTag: "Vex", domain: ["calm", "chaos"], name: "Gloomist" });
    expect(def?.abilities).toEqual([
      {
        condition: { cost: { exhaust: true }, type: "pay-cost" },
        effect: { amount: 1, type: "draw" },
        optional: true,
        trigger: { event: "hold", on: "controller-or-allies" },
        type: "triggered",
      },
    ]);
  });

  test("holding bf1 at the start of my turn: the point is scored, the trigger waits in the Beginning Phase and asks me yes/no with the legend still ready and nothing drawn yet", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.phase()).toBe("beginning");
    expect(game.p1.points()).toBe(1);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "gl", controller: P1, triggered: true, type: "ability" })]);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "gl" } });
    expect(game.state("gl").isExhausted).toBe(false);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("'yes': the legend exhausts at once (cost at finalization), P2 gets priority on the item, then it draws 1 — after Channel + Draw I sit in main with 2 cards, 2 runes and an exhausted legend", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    await game.p1.yes();
    expect(game.state("gl").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(0); // not before resolution
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.phase()).toBe("beginning"); // the phase holds for the chain
    await game.p2.passPriority();
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.p1.runes()).toHaveLength(2);
    expect(game.state("gl").isExhausted).toBe(true);
    expect(game.p1.points()).toBe(1);
    expect(game.violations()).toEqual([]);
  });

  test("'no' (383.3.a.2): the item disappears, the legend stays READY, and only the Draw Phase card arrives (hand 1)", async () => {
    const game = await aboutToHold().build();
    await game.p2.endTurn();
    await game.p1.no();
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("gl").isExhausted).toBe(false);
    expect(game.p1.hand()).toHaveLength(1);
    expect(game.p1.points()).toBe(1);
  });

  test("holding TWO battlefields: two Holds → two Gloomist items (2 points), but the legend can be exhausted only once → exactly ONE extra card (hand 2, not 3)", async () => {
    const game = await aboutToHold().battlefield("bf2", { controller: P1 }).unit(P1, "bf2", { might: 2, name: "Second" }, "second").build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(2);
    expect(game.chain().filter((i) => i.cardId === "gl")).toHaveLength(2);
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    expect(game.state("gl").isExhausted).toBe(true);
    game.script(P1, [payIfAble, payIfAble]); // the second item: unpayable → declined (or never acceptable)
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.p1.hand()).toHaveLength(2);
  });

  test("Awaken comes first (315.1): a legend that was EXHAUSTED going into my turn is readied before the hold, so the option is live and 'yes' still draws", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .card("gl", { def: CARD, meta: { exhausted: true }, owner: P1, zone: "legendZone" })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .build();
    expect(game.state("gl").isExhausted).toBe(true);
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1, source: { cardId: "gl" } });
    expect(game.state("gl").isExhausted).toBe(false);
    await game.p1.yes();
    await game.settle();
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.state("gl").isExhausted).toBe(true);
  });

  test("negative space — the OPPONENT holding on their turn is neither 'you' nor 'an ally': they score, my legend never stirs, I draw nothing", async () => {
    const game = await scenario().turn(3).active(P1).legend(P1, CARD, "gl").battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 3 }, "theirs").build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p2.points()).toBe(1);
    expect(game.state("gl").isExhausted).toBe(false);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("negative space — three-player free-for-all: BOTH other players hold on their turns and neither is an ally (489: allies exist only in team modes) — no prompt, no draw for me", async () => {
    const game = await scenario({ players: 3 })
      .turn(4)
      .active(P1)
      .legend(P1, CARD, "gl")
      .battlefield("bf2", { controller: P2 })
      .battlefield("bf3", { controller: P3 })
      .unit(P2, "bf2", { might: 3 }, "h2")
      .unit(P3, "bf3", { might: 3 }, "h3")
      .build();
    await game.p1.endTurn();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.chain()).toEqual([]);
    await game.settle();
    expect(game.p2.points()).toBe(1);
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P3);
    expect(game.seat(P3).points()).toBe(1);
    expect(game.chain()).toEqual([]);
    expect((await game.settle()).reason).toBe("open");
    expect(game.state("gl").isExhausted).toBe(false);
    expect(game.p1.hand()).toHaveLength(0);
  });

  test("negative space — CONQUERING is scoring but not holding (469.1 vs 469.2): walking onto an empty enemy field and winning a combat each score a point without any Gloomist prompt", async () => {
    const walk = await scenario().legend(P1, CARD, "gl").battlefield("bf1", { controller: P2 }).unit(P1, "base", { might: 2 }, "walker").build();
    await walk.p1.move("walker", "bf1");
    expect((await walk.settle()).reason).toBe("open");
    expect(walk.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(walk.p1.points()).toBe(1);
    expect(walk.state("gl").isExhausted).toBe(false);
    expect(walk.p1.hand()).toHaveLength(0);

    const fight = await scenario().legend(P1, CARD, "gl").battlefield("bf1", { controller: P2 }).unit(P2, "bf1", { might: 2 }, "sentry").unit(P1, "base", { might: 3 }, "bruiser").build();
    await fight.p1.move("bruiser", "bf1");
    expect((await fight.settle()).reason).toBe("open");
    expect(fight.zoneOf("sentry")).toBe("trash");
    expect(fight.p1.points()).toBe(1);
    expect(fight.chain()).toEqual([]);
    expect(fight.p1.hand()).toHaveLength(0);
  });

  test("'you may' has teeth (431): saying yes with an EMPTY Main Deck Burns me Out — my trash is recycled into the deck, P2 gains 1 point, and only then do I draw", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .fillDecks(false)
      .legend(P1, CARD, "gl")
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .trash(P1, FILLER, "t1")
      .trash(P1, FILLER, "t2")
      .deck(P2, [FILLER, FILLER, FILLER])
      .build();
    expect(game.p1.deck()).toEqual([]);
    await game.p2.endTurn();
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P1 });
    await game.p1.yes();
    await game.settle({ policy: "first" }); // "choose an opponent to gain 1 point" is forced in a duel
    expect(game.phase()).toBe("main");
    expect(game.p2.points()).toBe(1); // one Burn Out (the trigger's draw); the Draw Phase then found a card
    expect(game.p1.points()).toBe(1);
    expect(game.p1.trash()).toEqual([]);
    expect([...game.p1.hand()].sort()).toEqual(["t1", "t2"]); // trigger draw + draw phase
    expect(game.isOver()).toBe(false);
  });

  test("partner — Navori Fighting Pit: its own 'hold here' trigger and Gloomist's share the chain; both resolve → the holder is buffed AND I draw (hand 2)", async () => {
    const game = await scenario()
      .turn(2)
      .active(P2)
      .legend(P1, CARD, "gl")
      .battlefield("bf1", { controller: P1, def: NAVORI_PIT, inert: false })
      .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
      .build();
    await game.p2.endTurn();
    expect(game.chain().map((i) => i.cardId).sort()).toEqual(["bf1", "gl"]);
    game.script(P1, [payIfAble]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("holder")).toMatchObject({ isBuffed: true, might: 4 });
    expect(game.p1.hand()).toHaveLength(2);
    expect(game.state("gl").isExhausted).toBe(true);
  });

  test("partner — Blue Sentinel holding here doubles my hold effects: TWO Gloomist items off one hold, yet still only one payable exhaust → one extra card", async () => {
    const game = await scenario().turn(2).active(P2).legend(P1, CARD, "gl").battlefield("bf1", { controller: P1 }).unit(P1, "bf1", BLUE_SENTINEL, "blue").build();
    await game.p2.endTurn();
    expect(game.p1.points()).toBe(1);
    expect(game.chain().filter((i) => i.cardId === "gl")).toHaveLength(2);
    game.script(P1, [payIfAble, payIfAble]);
    await game.settle();
    expect(game.phase()).toBe("main");
    expect(game.state("gl").isExhausted).toBe(true);
    expect(game.p1.hand()).toHaveLength(2);
  });
});
