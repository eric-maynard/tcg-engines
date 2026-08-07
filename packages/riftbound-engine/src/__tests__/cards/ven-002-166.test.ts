/**
 * Blade Twirler — ven-002-166 · Unit · Fury · 4 energy · 4 Might
 *
 *   The first time I move each turn, choose a player. They [Burn 1].
 *   (They put the top card of their Main Deck into their trash.)
 *
 * Head-judge checklist (the tricky spots this file covers):
 *  1. "Choose a player" — the CONTROLLER of the trigger picks ANY player, including themself
 *     (self-mill feeds Flow / trash synergies). The parser hard-codes `player:"opponent"` → BUG.
 *  2. "The first time … each turn" (383.1): a second move the same turn (readied by Upstage Comedy)
 *     must not trigger; the count resets on a later turn; several units moving together = one move.
 *  3. "I move" is ANY move (446.1), not just your Standard Move: an opponent Charm-ing it on THEIR
 *     turn still triggers, and the trigger is controlled by Blade Twirler's controller.
 *  4. Recalls are not moves (456): Zhonya's Hourglass saving it, or Possession stealing it, must not
 *     trigger — and after Possession the NEW controller owns the next trigger (controller ≠ owner).
 *  5. Burn with an empty Main Deck → Burn Out (440.4 / 431.2): recycle trash, an opponent gains 1
 *     point, then burn 1. The engine silently burns nothing → BUG.
 *  6. It is a triggered chain item: the opponent may respond; killing Blade Twirler in response does
 *     not stop the burn.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";
import type { PickDecision } from "../../harness";

const CARD = "ven-002-166";
const FILLER = "ogn-175-298";
const UPSTAGE_COMEDY = "unl-009-219"; // Fury spell, 2: Ready a unit.
const CHARM = "ogn-043-298"; // Calm spell, 1+[calm]: Move an enemy unit.
const POSSESSION = "ogn-203-298"; // Chaos spell, 8+[chaos]x3: take control of an enemy unit at a battlefield and recall it.
const ZHONYAS = "ogn-077-298"; // Calm gear: if a friendly unit would die, kill this instead; heal/exhaust/recall it.
const SNIPE = {
  abilities: [{ effect: { amount: 4, target: { type: "unit" }, type: "damage" }, timing: "reaction", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  name: "Test Snipe",
  timing: "reaction",
} as const;

function board() {
  return scenario()
    .battlefield("bf1", { controller: P1 })
    .unit(P1, "base", CARD, "bt")
    .deck(P1, [FILLER, FILLER, FILLER], ["myTop", "my2", "my3"])
    .deck(P2, [FILLER, FILLER, FILLER], ["theirTop", "their2", "their3"]);
}

/** If the engine asks who burns, name `who`; otherwise do nothing (engine currently auto-picks the opponent). */
async function chooseIfAsked(game: Awaited<ReturnType<ReturnType<typeof board>["build"]>>, who: string) {
  const d = game.decision();
  if (d?.kind === "pick") {
    const key = (d as PickDecision).options.find((o) => o.seatRef === who)?.key ?? who;
    await game.seat(d.seat).pick(key);
    await game.settle();
  }
}

describe("Blade Twirler (ven-002-166)", () => {
  test("registry payload: one triggered ability — on self move, first time each turn, effect burns 1", async () => {
    const def = peekDefaultCardPool()?.get(CARD) ?? (await scenario().build(), peekDefaultCardPool()?.get(CARD));
    expect(def).toMatchObject({ cardType: "unit", domain: "fury", energyCost: 4, might: 4, name: "Blade Twirler" });
    const abilities = def?.abilities as Record<string, unknown>[];
    expect(abilities).toHaveLength(1);
    expect(abilities[0]).toMatchObject({
      effect: { amount: 1, type: "mill" },
      trigger: { event: "move", on: "self", restrictions: [{ type: "first-time-each-turn" }] },
      type: "triggered",
    });
  });

  test("registry payload should encode 'choose a player' (any player), not a hard-coded opponent burn", async () => {
    // Expected: the effect carries a player choice (cf. Bewitching Spirit's `choice` / a choose-player prompt).
    // Actual: `{ type: "mill", amount: 1, player: "opponent" }`.
    await scenario().build();
    const effect = (peekDefaultCardPool()?.get(CARD)?.abilities as { effect: { player?: string } }[])[0]?.effect;
    expect(effect?.player).not.toBe("opponent");
  });

  test("cost: 4 energy, no power; enters the base exhausted; 3 energy (even with fury power) is not enough", async () => {
    const game = await scenario().resources(P1, { energy: 4 }).hand(P1, CARD, "bt").build();
    await game.p1.play("bt", { to: "base" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("bt")).toBe("base");
    expect(game.state("bt")).toMatchObject({ isExhausted: true, might: 4 });
    expect(game.chain()).toEqual([]); // playing is not moving
    const poor = await scenario().resources(P1, { energy: 3, power: { fury: 2 } }).hand(P1, CARD, "bt").build();
    expect(poor.p1.can("play", "bt")).toBe(false);
  });

  test("first move of the turn puts a triggered item on the chain; on resolution the (opponent) player burns exactly their top card", async () => {
    const game = await board().build();
    await game.p1.move("bt", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P1, triggered: true })]);
    expect(game.p2.trash()).toEqual([]); // nothing burns before resolution
    await game.settle();
    await chooseIfAsked(game, P2);
    expect(game.p2.trash()).toEqual(["theirTop"]);
    expect(game.p2.deck()[0]).toBe("their2");
    expect(game.p1.trash()).toEqual([]);
    expect(game.p1.deck()[0]).toBe("myTop");
    expect(game.locationOf("bt")).toBe("bf1");
    expect(game.violations()).toEqual([]);
  });

  test("'choose a player' — the controller is prompted and may pick THEMSELF to burn their own top card", async () => {
    // Expected: after both pass, P1 gets a pick between player-1 / player-2; picking player-1 mills myTop.
    // Actual: no prompt; the opponent is burned automatically.
    const game = await board().build();
    await game.p1.move("bt", "bf1");
    await game.settle();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1 });
    const key = (d as PickDecision).options.find((o) => o.seatRef === P1)?.key ?? P1;
    await game.p1.pick(key);
    await game.settle();
    expect(game.p1.trash()).toEqual(["myTop"]);
    expect(game.p2.trash()).toEqual([]);
  });

  test("'first time each turn': readied by Upstage Comedy and moved again the same turn → no second burn; next turn it triggers again", async () => {
    const game = await board().resources(P1, { energy: 2 }).hand(P1, UPSTAGE_COMEDY, "upstage").build();
    await game.p1.move("bt", "bf1");
    await game.settle();
    await chooseIfAsked(game, P2);
    expect(game.p2.trash()).toEqual(["theirTop"]);
    await game.p1.cast("upstage", { targets: "bt" });
    await game.settle();
    expect(game.state("bt").isReady).toBe(true);
    await game.p1.move("bt", "base");
    expect(game.chain()).toEqual([]); // second move: nothing triggers
    await game.settle();
    expect(game.p2.trash()).toEqual(["theirTop"]);
    expect(game.p1.trash()).toEqual(["upstage"]);
    // A full round later the once-per-turn budget is back.
    await game.advanceToTurnOf(P2);
    await game.advanceToTurnOf(P1);
    await game.p1.move("bt", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", triggered: true })]);
    await game.settle();
    await chooseIfAsked(game, P2);
    expect(game.p2.trash()).toHaveLength(2);
  });

  test("moving together with another unit is ONE move event for Blade Twirler → one trigger, one card burned", async () => {
    const game = await board().unit(P1, "base", { might: 2, name: "Buddy" }, "buddy").build();
    await game.p1.move(["bt", "buddy"], "bf1");
    expect(game.chain()).toHaveLength(1);
    await game.settle();
    await chooseIfAsked(game, P2);
    expect(game.p2.trash()).toEqual(["theirTop"]);
    expect(game.locationOf("buddy")).toBe("bf1");
  });

  test("'I move' by any means: the opponent Charm-ing it on THEIR turn triggers it, controlled by Blade Twirler's controller (P1)", async () => {
    const game = await board().active(P2).resources(P2, { energy: 1, power: { calm: 1 } }).hand(P2, CHARM, "charm").build();
    await game.p2.cast("charm", { targets: "bt" });
    // Resolve Charm; the only destination is bf1. Stop when Blade Twirler's trigger appears.
    for (let i = 0; i < 12 && !game.chain().some((c) => c.cardId === "bt"); i++) {
      const d = game.decision();
      if (d?.kind === "pick") {
        await game.seat(d.seat).pick("bf1");
      } else {
        await game.acting().pass();
      }
    }
    expect(game.locationOf("bt")).toBe("bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P1, triggered: true })]);
    await game.settle();
    await chooseIfAsked(game, P2);
    expect(game.p2.trash().toSorted()).toEqual(["charm", "theirTop"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.turnPlayer()).toBe(P2);
  });

  test("Possession: take control + recall is NOT a move (456) → no burn; the new controller's later move triggers it under THEIR control", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { energy: 8, power: { chaos: 3 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", CARD, "bt")
      .hand(P2, POSSESSION, "pos")
      .deck(P1, [FILLER, FILLER], ["myTop", "my2"])
      .deck(P2, [FILLER, FILLER], ["theirTop", "their2"])
      .build();
    await game.p2.cast("pos", { targets: "bt" });
    await game.settle();
    if (game.decision()?.kind === "pick") {
      await game.acting().pick("bt"); // the recall step re-asks for "it"
      await game.settle();
    }
    expect(game.state("bt")).toMatchObject({ controller: P2, location: "base", owner: P1 });
    expect(game.chain()).toEqual([]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.trash()).toEqual(["pos"]); // only the spell itself
    // Now P2 (controller, not owner) moves it: P2 controls the trigger.
    await game.p2.move("bt", "bf2");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", controller: P2, triggered: true })]);
    await game.settle();
    await chooseIfAsked(game, P1);
    expect(game.p1.trash()).toEqual(["myTop"]);
    expect(game.p2.trash()).toEqual(["pos"]);
  });

  test("Zhonya's Hourglass saving it from lethal combat recalls it — not a move, so nothing burns; its next real move still counts as the first", async () => {
    const game = await scenario()
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", CARD, "bt")
      .gear(P1, ZHONYAS, "zhonyas")
      .unit(P2, "base", { might: 6, name: "Brute" }, "brute")
      .deck(P1, [FILLER, FILLER], ["myTop", "my2"])
      .deck(P2, [FILLER, FILLER], ["theirTop", "their2"])
      .build();
    await game.p2.move("brute", "bf1");
    await game.settle();
    expect(game.zoneOf("zhonyas")).toBe("trash");
    expect(game.state("bt")).toMatchObject({ damage: 0, isExhausted: true, location: "base", zone: "base" });
    expect(game.p2.trash()).toEqual([]);
    expect(game.p1.trash()).toEqual(["zhonyas"]);
    // P1's turn: awaken readies it; its first move this turn triggers normally.
    await game.advanceToTurnOf(P1);
    await game.p1.move("bt", "bf1");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "bt", triggered: true })]);
  });

  test("the trigger is a chain item the opponent may answer: sniping Blade Twirler in response does not stop the burn", async () => {
    const game = await board().hand(P2, SNIPE, "snipe").build();
    await game.p1.move("bt", "bf1");
    expect(game.actingSeat()).toBe(P1);
    await game.p1.passPriority();
    expect(game.actingSeat()).toBe(P2);
    await game.p2.cast("snipe", { targets: "bt" });
    expect(game.chain().map((c) => c.name)).toEqual(["Blade Twirler", "Test Snipe"]);
    await game.settle();
    await chooseIfAsked(game, P2);
    expect(game.zoneOf("bt")).toBe("trash");
    expect(game.p2.trash().toSorted()).toEqual(["snipe", "theirTop"]);
  });

  test("attacking is a move too: trigger first, then the showdown; Blade Twirler (4) kills a 2-Might defender and conquers", async () => {
    const game = await scenario()
      .battlefield("bf1", { controller: P2 })
      .unit(P1, "base", CARD, "bt")
      .unit(P2, "bf1", { might: 2, name: "Picket" }, "picket")
      .deck(P2, [FILLER, FILLER], ["theirTop", "their2"])
      .build();
    await game.p1.move("bt", "bf1");
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1, source: { cardId: "bt" } });
    await game.settle();
    await chooseIfAsked(game, P2);
    expect(game.p2.trash().toSorted()).toEqual(["picket", "theirTop"]);
    expect(game.locationOf("bt")).toBe("bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.p1.points()).toBe(1);
  });

  test("burning a player whose Main Deck is empty makes them Burn Out (440.4/431.2): recycle trash → an opponent gains 1 point → then burn 1", async () => {
    // Expected: P2 (0 cards in deck, 2 in trash) recycles t1+t2 into the deck, P1 gains 1 point, then P2 burns 1
    // → P2 ends with 1 in deck / 1 in trash and P1 on 1 point. Actual: handle_mill just stops at an empty deck.
    const game = await scenario()
      .fillDecks(false)
      .runeDeck(P1, ["ogn-089-298", "ogn-089-298"])
      .runeDeck(P2, ["ogn-089-298", "ogn-089-298"])
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "base", CARD, "bt")
      .deck(P1, [FILLER, FILLER], ["myTop", "my2"])
      .trash(P2, FILLER, "t1")
      .trash(P2, FILLER, "t2")
      .build();
    expect(game.p2.deck()).toEqual([]);
    await game.p1.move("bt", "bf1");
    await game.settle();
    await chooseIfAsked(game, P2);
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick(P1); // 431.2.c: P2 chooses an opponent to gain the point (only P1 here)
      await game.settle();
    }
    expect(game.p1.points()).toBe(1);
    expect(game.p2.deck()).toHaveLength(1);
    expect(game.p2.trash()).toHaveLength(1);
  });
});
