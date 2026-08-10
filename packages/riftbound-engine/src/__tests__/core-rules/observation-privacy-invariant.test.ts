/**
 * Core rules — harness-wide information invariant: no seat's Observation ever
 * names a card id that seat is not entitled to know.
 *
 * CARD-INDEPENDENT: every card below is an inline filler definition.
 *
 * This is the cross-cutting guard behind the individual reveal/redaction card
 * tests. Instead of asserting on one prompt's fields it scans the WHOLE
 * serialized Observation for every card id in the game, so a leak through a
 * NEW observation field (a future state slice, prompt kind or chain field)
 * fails here even if no card test covers it.
 *
 * Rules covered (riftbound-rules ids):
 *   127          private zones (hand, facedown) vs secret zones (deck order)
 *   128.3-128.5  private vs public information
 *   421.4        a facedown card is revealed to all players when the game ends
 *   424.1.a.3    a revealed card is public only while the revealing effect resolves
 */

import { describe, expect, test } from "bun:test";
import type { Seat } from "../../harness";
import {
  P1,
  P2,
  SPECTATOR,
  getInternalState,
  isPrivateZone,
  isSecretZone,
  scenario,
} from "../../harness";

const FILLER_UNIT = {
  cardType: "unit",
  domain: "fury",
  energyCost: 1,
  might: 2,
  name: "Filler Privacy Unit",
};

/** [Action] Draw 1 — moves a card from a secret zone into a private one. */
const ACTION_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Action Draw",
  timing: "action",
};

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * Ground truth, derived from the card's real zone rather than from the code
 * under test: may `viewer` learn that this card is THIS card?
 *
 * rule 127 — a private zone is readable by its owner only; a secret zone by
 * nobody. rule 421.4 — once the game is finished facedown cards are public.
 * rule 424.1.a.3 — the in-flight reveal prompt is public to its prompter.
 */
function mayKnow(game: Game, viewer: Seat, id: string): boolean {
  const internal = getInternalState(game.engine);
  const inst = internal.cards[id];
  const zone = inst?.zone ?? "unknown";
  const owner = inst?.owner ?? "";
  if (!isPrivateZone(zone)) {
    return true;
  }
  if (zone.startsWith("facedown-") && game.gameState.status === "finished") {
    return true;
  }
  const pending = game.gameState.pendingChoice;
  if (
    pending?.type === "reveal-and-pick" &&
    pending.prompter === viewer &&
    (pending.revealed as readonly string[] | undefined)?.includes(id)
  ) {
    return true;
  }
  const grants = game.gameState.visibilityGrants ?? [];
  const kind = zone === "hand" ? "hand" : "facedown";
  if (!isSecretZone(zone) && grants.some((g) => g.viewer === viewer && g.owner === owner && g.zones.includes(kind))) {
    return true;
  }
  return !isSecretZone(zone) && owner === viewer;
}

/** Every card id the engine knows about. */
function allCardIds(game: Game): string[] {
  return Object.keys(getInternalState(game.engine).cards);
}

function mentions(json: string, id: string): boolean {
  return json.includes(`"${id}"`);
}

/**
 * The invariant: for both seats, the serialized Observation names no card id
 * that seat may not know. Returns the ids that leaked (empty = clean).
 */
function leaks(game: Game): string[] {
  const out: string[] = [];
  for (const seat of [P1, P2] as Seat[]) {
    const json = JSON.stringify(game.view(seat));
    for (const id of allCardIds(game)) {
      if (!mayKnow(game, seat, id) && mentions(json, id)) {
        out.push(`${seat} sees ${id} (${getInternalState(game.engine).cards[id]?.zone})`);
      }
    }
  }
  return out;
}

function board() {
  return scenario()
    .resources(P1, { energy: 5, power: { fury: 2 } })
    .resources(P2, { energy: 5, power: { fury: 2 } })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .hand(P1, FILLER_UNIT, "p1UnitInHand")
    .hand(P1, ACTION_DRAW, "p1DrawSpell")
    .hand(P2, FILLER_UNIT, "p2UnitInHand")
    .hand(P2, ACTION_DRAW, "p2DrawSpell")
    .deck(P1, [FILLER_UNIT, FILLER_UNIT, FILLER_UNIT], ["p1Deck1", "p1Deck2", "p1Deck3"])
    .deck(P2, [FILLER_UNIT, FILLER_UNIT, FILLER_UNIT], ["p2Deck1", "p2Deck2", "p2Deck3"]);
}

describe("Observation privacy — harness-wide invariant (127 / 128.3-128.5)", () => {
  test("the scan is non-vacuous: the spectator view DOES name every private card id", async () => {
    const game = await board().build();
    const json = JSON.stringify(game.view(SPECTATOR));
    for (const id of ["p1UnitInHand", "p2UnitInHand", "p1Deck1", "p2Deck1"]) {
      expect(mentions(json, id)).toBe(true);
    }
    // …and each seat's own hand card is named in its own view (owner may look).
    expect(mentions(JSON.stringify(game.view(P1)), "p1UnitInHand")).toBe(true);
    expect(mentions(JSON.stringify(game.view(P2)), "p2UnitInHand")).toBe(true);
  });

  test("no seat's Observation names a card in the other seat's hand or in either deck — at rest", async () => {
    const game = await board().build();
    expect(leaks(game)).toEqual([]);
  });

  test("…and after each step of a scripted two-turn game (play, cast+draw, turn boundary, opposing play)", async () => {
    const game = await board().build();
    expect(leaks(game)).toEqual([]);

    await game.p1.play("p1UnitInHand", { to: "base" });
    expect(leaks(game)).toEqual([]);
    await game.settle();
    expect(leaks(game)).toEqual([]);

    // A draw moves a card deck → hand: it must stay unknown to P2 in both zones.
    await game.p1.cast("p1DrawSpell");
    expect(leaks(game)).toEqual([]);
    await game.settle();
    expect(leaks(game)).toEqual([]);
    expect(game.p1.hand()).toContain("p1Deck1");

    await game.p1.endTurn();
    expect(leaks(game)).toEqual([]);
    await game.settle();
    expect(leaks(game)).toEqual([]);

    // P2's turn: a card leaving P2's hand for a public zone becomes nameable to P1.
    await game.p2.cast("p2DrawSpell");
    expect(leaks(game)).toEqual([]);
    await game.settle();
    expect(leaks(game)).toEqual([]);
    expect(mentions(JSON.stringify(game.view(P1)), "p2DrawSpell")).toBe(true);
    expect(game.p2.hand()).toContain("p2Deck1");
  });

  test("a facedown card stays private to its hider while the game runs (107.3.a, 128.4)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 5, power: { fury: 2 } })
      .resources(P2, { energy: 5, power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .facedown(P1, "bf1", FILLER_UNIT, "p1Facedown")
      .hand(P2, FILLER_UNIT, "p2UnitInHand")
      .deck(P1, [FILLER_UNIT], ["p1Deck1"])
      .deck(P2, [FILLER_UNIT], ["p2Deck1"])
      .build();
    expect(leaks(game)).toEqual([]);
    expect(mentions(JSON.stringify(game.view(P1)), "p1Facedown")).toBe(true);
    expect(mentions(JSON.stringify(game.view(P2)), "p1Facedown")).toBe(false);
  });
});
