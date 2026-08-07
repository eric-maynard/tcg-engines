/**
 * Black Market Broker — sfd-121-221 · Unit · Chaos · 3 energy (no power) · 3 Might
 *
 *   When you play a card from face down, play a Gold gear token exhausted.
 *
 * Head-judge notes (the tricky spots this file covers):
 *   1. HIDING is not playing (811.1.c.1) — paying [rainbow] to put a card facedown makes no Gold; only
 *      the later play FROM facedown does. Playing a Hidden card normally from hand makes none either.
 *   2. "When YOU play" — the opponent's facedown plays never pay you, and a Broker still in your hand
 *      (not on the board) has no working ability.
 *   3. It triggers on the play itself, at Reaction speed on the opponent's turn too; the trigger joins
 *      the chain the hidden play opened (811.1.c.3) and the Gold lands in the Broker controller's BASE,
 *      exhausted (so no [rainbow] the same turn), regardless of which battlefield the card came from.
 *   4. Stacking: two Brokers → two Golds; Bushwhack from facedown (itself "play a Gold") → 2 Golds.
 *   5. Any card type counts ("a card"): a hidden unit (Teemo) and a hidden spell (Bushwhack) both do.
 */

import { describe, expect, test } from "bun:test";
import { P1, P2, peekDefaultCardPool, scenario } from "../../harness";
import type { Game } from "../../harness";

const CARD = "sfd-121-221";
const TEEMO = "ogn-197-298"; // Teemo, Scout — [Hidden] champion unit, 2 energy
const BUSHWHACK = "sfd-004-221"; // [Hidden] spell: friendly units enter ready this turn; play a Gold token exhausted

const golds = (game: Game, seat: "p1" | "p2") => game[seat].gear().filter((id) => game.state(id).isToken && game.state(id).name === "Gold");

/** P1: Broker in base, controls bf1 (held by a vanilla unit), one [rainbow] floating, `hidden` in hand. */
function board(hidden = TEEMO) {
  return scenario()
    .resources(P1, { power: { rainbow: 1 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 3, name: "Holder" }, "holder")
    .unit(P2, "bf2", { might: 3, name: "Their Holder" }, "theirHolder")
    .unit(P1, "base", CARD, "broker")
    .hand(P1, hidden, "hid");
}

/** Hide `hid` at bf1 and come back around to P1's next turn (it may now be played from facedown). */
async function hiddenAndRipe(hidden = TEEMO): Promise<Game> {
  const game = await board(hidden).build();
  await game.p1.hide("hid", "bf1");
  await game.advanceTurn();
  await game.advanceTurn();
  expect(game.turnPlayer()).toBe(P1);
  expect(game.zoneOf("hid")).toBe("facedown-bf1");
  return game;
}

describe("Black Market Broker (sfd-121-221)", () => {
  test("registry payload: one triggered ability — controller plays a card from hidden → create an exhausted Gold gear token", async () => {
    const game = await scenario().hand(P1, CARD, "broker").build();
    expect(game.state("broker")).toMatchObject({ baseMight: 3, cardType: "unit", energyCost: 3, name: "Black Market Broker" });
    expect(game.state("broker").powerCost).toEqual([]);
    expect(game.state("broker").keywords).not.toContain("Hidden");
    expect(peekDefaultCardPool()?.get(CARD)?.abilities).toEqual([
      {
        effect: { ready: false, token: { name: "Gold", type: "gear" }, type: "create-token" },
        trigger: { event: "play-from-hidden", on: "controller" },
        type: "triggered",
      },
    ]);
  });

  test("cost: 3 energy, no power; enters the base exhausted as a 3-Might unit; nothing triggers on its own play; 2 energy is short", async () => {
    const game = await scenario().resources(P1, { energy: 3 }).hand(P1, CARD, "broker").build();
    await game.p1.play("broker");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.zoneOf("broker")).toBe("base");
    expect(game.state("broker")).toMatchObject({ isExhausted: true, might: 3 });
    expect(golds(game, "p1")).toHaveLength(0);
    expect((await scenario().resources(P1, { energy: 2 }).hand(P1, CARD, "broker").build()).p1.can("play", "broker")).toBe(false);
  });

  test("hiding a card is NOT playing it (811.1.c.1): no chain, no Gold", async () => {
    const game = await board().build();
    await game.p1.hide("hid", "bf1");
    expect(game.zoneOf("hid")).toBe("facedown-bf1");
    expect(game.chain()).toEqual([]);
    expect(golds(game, "p1")).toHaveLength(0);
  });

  test("playing the hidden card from facedown on a later turn: the trigger joins that chain and P1 gets ONE exhausted Gold in base", async () => {
    const game = await hiddenAndRipe();
    await game.p1.reveal("hid");
    const ids = game.chain().map((c) => c.cardId);
    expect(ids).toContain("hid");
    expect(game.chain().some((c) => c.cardId === "broker" && c.triggered)).toBe(true);
    expect(golds(game, "p1")).toHaveLength(0); // nothing before the trigger resolves
    await game.settle();
    expect(game.zoneOf("hid")).toBe("battlefield-bf1"); // a hidden permanent is played to THAT battlefield
    const mine = golds(game, "p1");
    expect(mine).toHaveLength(1);
    expect(game.state(mine[0]!)).toMatchObject({ cardType: "gear", controller: P1, isExhausted: true, isToken: true, name: "Gold", zone: "base" });
    expect(golds(game, "p2")).toHaveLength(0);
    expect(game.p1.can("activate", mine[0]!)).toBe(false); // exhausted: no [rainbow] this turn
  });

  test("negative space: playing a Hidden card NORMALLY from hand (811.3) is not 'from face down' — no Gold", async () => {
    const game = await board().resources(P1, { energy: 2, power: { rainbow: 1 } }).build();
    await game.p1.play("hid", { to: "base" });
    await game.settle();
    expect(game.zoneOf("hid")).toBe("base");
    expect(golds(game, "p1")).toHaveLength(0);
    expect(game.p1.power("rainbow")).toBe(1);
  });

  test("'When YOU play': the opponent playing THEIR facedown card gives the Broker's controller nothing (and them nothing either)", async () => {
    const game = await scenario()
      .active(P2)
      .resources(P2, { power: { rainbow: 1 } })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3 }, "theirHolder")
      .unit(P1, "base", CARD, "broker")
      .hand(P2, TEEMO, "theirs")
      .build();
    await game.p2.hide("theirs", "bf2");
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.reveal("theirs");
    expect(game.chain().some((c) => c.cardId === "broker")).toBe(false);
    await game.settle();
    expect(game.zoneOf("theirs")).toBe("battlefield-bf2");
    expect(golds(game, "p1")).toHaveLength(0);
    expect(golds(game, "p2")).toHaveLength(0);
  });

  test("a Broker still in HAND is not on the board — its ability does nothing when you play from facedown", async () => {
    const game = await scenario()
      .resources(P1, { power: { rainbow: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3 }, "holder")
      .hand(P1, CARD, "broker")
      .hand(P1, TEEMO, "hid")
      .build();
    await game.p1.hide("hid", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.reveal("hid");
    await game.settle();
    expect(game.zoneOf("hid")).toBe("battlefield-bf1");
    expect(golds(game, "p1")).toHaveLength(0);
  });

  test("Reaction-speed hidden play on the OPPONENT's turn (in their showdown at bf1) still triggers: Gold for P1, in P1's base", async () => {
    const game = await board().unit(P2, "base", { might: 1, name: "Poker" }, "poker").build();
    await game.p1.hide("hid", "bf1");
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.move("poker", "bf1"); // showdown at bf1; attacker has Focus
    await game.p2.passFocus();
    expect(game.p1.can("reveal", "hid")).toBe(true);
    await game.p1.reveal("hid");
    expect(game.chain().some((c) => c.cardId === "broker" && c.triggered && c.controller === P1)).toBe(true);
    await game.settle();
    expect(golds(game, "p1")).toHaveLength(1);
    expect(game.state(golds(game, "p1")[0]!)).toMatchObject({ isExhausted: true, zone: "base" });
    expect(golds(game, "p2")).toHaveLength(0);
    // Teemo (1+3 this turn) joined the defence: 3 + 4 vs 1 — the poker dies and P1 keeps bf1.
    expect(game.zoneOf("poker")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
  });

  test("two Brokers, one facedown play → two triggers, two exhausted Golds", async () => {
    const game = await board().unit(P1, "base", CARD, "broker2").build();
    await game.p1.hide("hid", "bf1");
    await game.advanceTurn();
    await game.advanceTurn();
    await game.p1.reveal("hid");
    const brokerTriggers = game.chain().filter((c) => c.triggered && c.cardId.startsWith("broker")).map((c) => c.cardId).sort();
    expect(brokerTriggers).toEqual(["broker", "broker2"]); // (Teemo's own play trigger is also there)
    await game.settle();
    const mine = golds(game, "p1");
    expect(mine).toHaveLength(2);
    expect(mine.every((id) => game.state(id).isExhausted)).toBe(true);
  });

  test("'a card' includes spells: Bushwhack played from facedown makes its own Gold AND the Broker's — two Golds", async () => {
    const game = await hiddenAndRipe(BUSHWHACK);
    await game.p1.reveal("hid");
    await game.settle();
    expect(game.zoneOf("hid")).toBe("trash");
    expect(golds(game, "p1")).toHaveLength(2);
    expect(golds(game, "p2")).toHaveLength(0);
  });

  test("the Gold is real (187.5): next turn, once ready, 'Kill this, [Exhaust]: [Add] [rainbow]' works", async () => {
    const game = await hiddenAndRipe();
    await game.p1.reveal("hid");
    await game.settle();
    const gold = golds(game, "p1")[0]!;
    await game.advanceTurn();
    await game.advanceTurn();
    expect(game.state(gold).isReady).toBe(true);
    await game.p1.activate(gold);
    // rule 186.1 — the cashed-in token ceases to exist rather than landing in a zone.
    expect(game.has(gold) ? game.zoneOf(gold) : "gone").not.toBe("base");
    expect(game.p1.power("rainbow")).toBe(1);
  });
});
