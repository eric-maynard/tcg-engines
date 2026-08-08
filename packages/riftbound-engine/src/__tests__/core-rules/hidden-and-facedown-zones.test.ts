/**
 * Core rules — Hide action, Facedown Zones (capacity / control) and playing from Hidden.
 *
 * CARD-INDEPENDENT: every Hidden card, unit and spell below is an inline filler definition.
 *
 * Correction to the popular shorthand "a facedown card loses Hidden when control is lost": having
 * Hidden is a characteristic independent of being facedown (811.5.a). What actually happens is that
 * the facedown card is REMOVED to its owner's Trash (revealed, 421.4) during the next Cleanup
 * (107.3.d, 323.7) or at combat resolution (466.5.c).
 *
 * Rules covered (riftbound-rules ids):
 *   107.3.a-f            Facedown Zones: capacity 1 (modifiable), controller must control the
 *                        battlefield, removed on control loss, public zone / private card
 *   108.3                Champion Zone (Hide is legal from here — 811.1.b / 421.2.a)
 *   128.4 / 128.5        Private vs Public information
 *   135.2.e.5.a          [A] is paid with Power of any domain (never with Energy)
 *   152.2 / 457.1 / 458.1  gear played from facedown enters AT the battlefield, then is Recalled
 *   190.4.b / 190.4.c    control cannot change mid-combat; lost at the next cleanup in an Open State
 *   191.1                the hider is the controller
 *   309.1 / 310.1.a      Closed State / Neutral Open permissions
 *   319.5 / 323.6 / 323.7 / 327  cleanup after a chain item: lose control (step 4), trash facedown
 *                        cards at battlefields you no longer control (step 5)
 *   421.1-421.4          Hide is a Discretionary Action; facedown cards are revealed on zone change
 *   466.5 / 466.5.c-d    combat resolution: conquer, remove Hidden cards of the other player
 *   811.1.b              "hand or Champion Zone, on your turn, Open State, pay [A], battlefield you
 *                        control without a facedown card; from the next turn: gains Reaction, play
 *                        ignoring base cost"
 *   811.1.c.2 / 811.1.c.3  hiding opens no chain; playing from facedown does
 *   811.1.d / .d.1 / .d.1.a / .d.2  played-from-hidden choices restricted to that battlefield;
 *                        unplayable spell if no legal target; permanents (incl. gear) enter there
 *   811.3                from hand: full cost, normal timing, unrestricted targets
 *   811.5 / 811.5.a      "has Hidden" is a characteristic, independent of being facedown
 *   811.6 / 811.6.a      Reaction only while facedown / played from facedown
 */

import { describe, expect, test } from "bun:test";
import type { CardView } from "../../harness";
import { P1, P2, isHiddenView, scenario } from "../../harness";

// ---------------------------------------------------------------------------
// Inline filler definitions
// ---------------------------------------------------------------------------

/** Hidden spell (no Action/Reaction printed) · 3 energy + [fury] · "Deal 2 to a unit." */
const HIDDEN_PING = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 3,
  keywords: ["Hidden"],
  name: "Filler Hidden Ping",
  powerCost: ["fury"],
  timing: "standard",
};

/** Hidden spell · 2 energy · "Deal 2 to a unit." (no power pip, for exact-cost checks). */
const HIDDEN_PING_2E = { ...HIDDEN_PING, energyCost: 2, name: "Filler Hidden Ping (2)", powerCost: [] as string[] };

/** The same spell WITHOUT the Hidden keyword. */
const PLAIN_PING = { ...HIDDEN_PING, keywords: [] as string[], name: "Filler Plain Ping" };

/** Hidden unit · 4 energy + [fury] · N Might. */
const hiddenUnit = (might: number) => ({
  cardType: "unit",
  domain: "fury",
  energyCost: 4,
  keywords: ["Hidden"],
  might,
  name: `Filler Hidden Unit ${might}`,
  powerCost: ["fury"],
});

/** Hidden gear · 2 energy. */
const HIDDEN_GEAR = { cardType: "gear", domain: "fury", energyCost: 2, keywords: ["Hidden"], name: "Filler Hidden Gear" };

/** [Action] Draw 1 — a free chain opener. */
const ACTION_DRAW = {
  abilities: [{ effect: { amount: 1, type: "draw" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Action Draw",
  timing: "action",
};

/** [Action] Deal 2 to a unit. */
const ACTION_PING_2 = {
  abilities: [{ effect: { amount: 2, target: { type: "unit" }, type: "damage" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Action Ping 2",
  timing: "action",
};

/** [Action] Kill a unit at a battlefield. */
const KILL_AT_BATTLEFIELD = {
  abilities: [{ effect: { target: { location: "battlefield", type: "unit" }, type: "kill" }, timing: "action", type: "spell" }],
  cardType: "spell",
  domain: "fury",
  energyCost: 0,
  keywords: ["Action"],
  name: "Filler Kill At Battlefield",
  timing: "action",
};

/** Unit with an inline static "+1 facedown capacity at battlefields you control" (capability probe). */
const CAPACITY_BOOSTER = {
  abilities: [{ effect: { amount: 1, type: "increase-hidden-capacity" }, type: "static" }],
  cardType: "unit",
  domain: "fury",
  energyCost: 0,
  might: 2,
  name: "Filler Capacity Booster",
};

// ---------------------------------------------------------------------------
// State readers
// ---------------------------------------------------------------------------

type G = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;
type TurnState = "neutral-open" | "neutral-closed" | "showdown-open" | "showdown-closed";

function showdownOf(game: G) {
  const stack = game.gameState.interaction?.showdownStack ?? [];
  const top = stack[stack.length - 1];
  return top?.active ? top : undefined;
}

function priorityOf(game: G): string | undefined {
  const chain = game.gameState.interaction?.chain;
  return chain?.active ? chain.activePlayer : undefined;
}

function turnStateOf(game: G): TurnState {
  const hasShowdown = showdownOf(game) !== undefined;
  const hasChain = game.gameState.interaction?.chain?.active ?? false;
  if (hasShowdown) {
    return hasChain ? "showdown-closed" : "showdown-open";
  }
  return hasChain ? "neutral-closed" : "neutral-open";
}

function chainIds(game: G): string[] {
  return game.chain().map((c) => c.cardId);
}

/** Battlefields the seat's `hide` option for `card` would accept. */
function hideDestinations(game: G, seat: typeof P1, card: string): string[] {
  const opt = game.seat(seat).option("hide", card);
  const field = opt?.fields.find((f) => f.arg === "to");
  return ((field?.options ?? []) as string[]).slice();
}

/** Card ids offered by the current pick prompt (empty if not a pick). */
function pickOffered(game: G): string[] {
  const d = game.decision();
  return d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : [];
}

/** Does `viewer`'s view of `zone` contain a face-up entry for `card`? */
function seesIdentity(game: G, viewer: typeof P1, zone: string, card: string): boolean {
  const entries: readonly CardView[] = game.seat(viewer).view().zones[zone] ?? [];
  return entries.some((v) => !isHiddenView(v) && v.id === card);
}

// ===========================================================================
// 1. Basic Hide
// ===========================================================================

describe("811.1.b / 421 / 811.1.c.2 / 191.1: Hide — pay [A], the card goes facedown at a battlefield you control, no chain opens", () => {
  function hideBoard() {
    return scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .hand(P1, HIDDEN_PING, "H");
  }

  test("P1 hides H at bf1: H is in facedown-bf1, controller P1, marked hidden this turn; costs exactly 1 power and NO energy (135.2.e.5.a); no chain, still Neutral Open with P1 acting", async () => {
    const game = await hideBoard().build();
    expect(game.p1.can("hide", "H")).toBe(true);
    expect(hideDestinations(game, P1, "H")).toEqual(["bf1"]);
    await game.p1.hide("H", "bf1");
    expect(game.zoneOf("H")).toBe("facedown-bf1");
    expect(game.state("H").controller).toBe(P1); // 191.1
    expect(game.state("H").owner).toBe(P1);
    expect(game.state("H").isHidden).toBe(true);
    expect(game.state("H").meta.hidden).toBe(true);
    expect(game.state("H").meta.hiddenOnTurn).toBe(game.turnNumber());
    expect(game.p1.facedown("bf1")).toEqual(["H"]);
    expect(game.p1.power("fury")).toBe(0);
    expect(game.p1.energy()).toBe(5); // Hide costs [A] only, never the card's energy cost
    // 811.1.c.2: hiding does not open a chain — nobody gets a reaction window.
    expect(game.chain()).toEqual([]);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p2.can("passPriority")).toBe(false);
    expect(game.p1.hand()).not.toContain("H");
  });

  test("privacy (107.3.f, 128.4, 811.6.a): P2 sees that facedown-bf1 is occupied by a P1 card but not WHICH card; P1 sees its own card", async () => {
    const game = await hideBoard().build();
    await game.p1.hide("H", "bf1");
    const p2Zone = game.p2.view().zones["facedown-bf1"] ?? [];
    expect(p2Zone).toHaveLength(1);
    const entry = p2Zone[0] as CardView;
    expect(isHiddenView(entry)).toBe(true);
    expect(entry).toMatchObject({ hidden: true, owner: P1, zone: "facedown-bf1" });
    expect("id" in entry).toBe(false);
    expect("name" in entry).toBe(false);
    expect("defId" in entry).toBe(false);
    const bfView = game.p2.view().battlefields.find((b) => b.id === "bf1");
    expect(bfView).toMatchObject({ controller: P1, facedownCount: 1 });
    // The hider may look at it.
    expect(seesIdentity(game, P1, "facedown-bf1", "H")).toBe(true);
    expect(seesIdentity(game, P2, "facedown-bf1", "H")).toBe(false);
  });
});

// ===========================================================================
// 2. Hide refused: battlefield not controlled by the hider
// ===========================================================================

describe("811.1.b / 107.3.c / 190: Hide requires a battlefield the hider CONTROLS — presence of units is not control", () => {
  test("(a) uncontrolled empty bf1 is not a legal Hide destination; card stays in hand, power untouched, nothing facedown", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: null })
      .hand(P1, HIDDEN_PING, "H")
      .build();
    expect(game.p1.can("hide", "H")).toBe(false);
    const r = await game.p1.try((p) => p.hide("H", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.p1.power()).toBe(1);
    expect(game.cardsAt("facedown:bf1")).toEqual([]);
  });

  test("(b) bf1 controlled by P2 (P2 unit there): rejected", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Filler Enemy" }, "enemy")
      .hand(P1, HIDDEN_PING, "H")
      .build();
    expect(game.p1.can("hide", "H")).toBe(false);
    const r = await game.p1.try((p) => p.hide("H", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.p1.power()).toBe(1);
    expect(game.cardsAt("facedown:bf1")).toEqual([]);
  });

  test("(c) bf1 controlled by P2 but contested by P1 with a P1 unit present (control has not flipped): still rejected — your units being there is not control (190.4)", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { contested: true, contestedBy: P1, controller: P2 })
      .unit(P2, "bf1", { might: 2, name: "Filler Enemy" }, "enemy")
      .unit(P1, "bf1", { might: 2, name: "Filler Mine" }, "mine")
      .hand(P1, HIDDEN_PING, "H")
      .build();
    expect(game.p1.can("hide", "H")).toBe(false);
    const r = await game.p1.try((p) => p.hide("H", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.p1.power()).toBe(1);
  });

  test("positive control: same hand and power, but bf2 IS controlled by P1 → Hide to bf2 succeeds while bf1 (uncontrolled) is never offered", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: null })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf2", { might: 2, name: "Filler Holder" }, "holder")
      .hand(P1, HIDDEN_PING, "H")
      .build();
    expect(hideDestinations(game, P1, "H")).toEqual(["bf2"]);
    const bad = await game.p1.try((p) => p.hide("H", "bf1"));
    expect(bad.ok).toBe(false);
    expect(game.zoneOf("H")).toBe("hand");
    await game.p1.hide("H", "bf2");
    expect(game.zoneOf("H")).toBe("facedown-bf2");
    expect(game.p1.power()).toBe(0);
  });
});

// ===========================================================================
// 3. Hide refused: wrong timing / no Hidden keyword / energy cannot pay [A]
// ===========================================================================

describe("811.1.b / 421.2 / 309.1 / 310.1.a / 135.2.e.5.a: Hide only on your turn in an Open State, only for cards WITH Hidden, only for Power", () => {
  /** P1 controls bf1 (holder there), has H in hand and 1 fury power. */
  function timingBoard() {
    return scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .hand(P1, HIDDEN_PING, "H");
  }

  test("811.1.b 'on your turn' — during P2's turn (P2 acting in Neutral Open) P1 has no Hide available; engine offers and accepts hideCard for the non-turn player", async () => {
    // Expected: can("hide") is false for P1 on P2's turn and the attempt is rejected.
    // Actual: hideCard only checks the Neutral Open turn STATE, not whose turn it is, so P1 may hide.
    const game = await timingBoard().active(P2).build();
    expect(game.turnPlayer()).toBe(P2);
    expect(game.p1.can("hide", "H")).toBe(false);
    const r = await game.p1.try((p) => p.hide("H", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.p1.power()).toBe(1);
  });

  test("(a') during P2's turn while P1 HOLDS PRIORITY in a Closed State (P2's spell on the chain): Hide is still unavailable to P1", async () => {
    const game = await timingBoard().active(P2).hand(P2, ACTION_DRAW, "p2spell").build();
    await game.p2.cast("p2spell");
    await game.p2.passPriority();
    expect(priorityOf(game)).toBe(P1);
    expect(game.p1.can("hide", "H")).toBe(false);
    const r = await game.p1.try((p) => p.hide("H", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("H")).toBe("hand");
  });

  test("(b) P1's own turn but a chain exists (P1 just played a spell, Neutral Closed, P1 has priority): Hide rejected; after the chain resolves (Neutral Open again) the same Hide succeeds (309.1, 421.2)", async () => {
    const game = await timingBoard().hand(P1, ACTION_DRAW, "opener").build();
    await game.p1.cast("opener");
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(priorityOf(game)).toBe(P1);
    expect(game.p1.can("hide", "H")).toBe(false);
    const r = await game.p1.try((p) => p.hide("H", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("H")).toBe("hand");
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.p1.can("hide", "H")).toBe(true);
    await game.p1.hide("H", "bf1");
    expect(game.zoneOf("H")).toBe("facedown-bf1");
    expect(game.p1.power()).toBe(0);
  });

  test("(b') P1's own turn but a Showdown is in progress (P1 has Focus at another battlefield): not an Open NEUTRAL state for discretionary Hide → rejected", async () => {
    const game = await timingBoard()
      .battlefield("bf2", { controller: null })
      .unit(P1, "base", { might: 2, name: "Filler Scout" }, "scout")
      .build();
    await game.p1.move("scout", "bf2");
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(game.p1.can("hide", "H")).toBe(false);
    const r = await game.p1.try((p) => p.hide("H", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("H")).toBe("hand");
  });

  test("(c) P1's turn, Neutral Open, but the card has NO Hidden keyword: Hide rejected regardless of power (811.1)", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .hand(P1, PLAIN_PING, "plain")
      .build();
    expect(game.state("plain").keywords).not.toContain("Hidden");
    expect(game.p1.can("hide", "plain")).toBe(false);
    const r = await game.p1.try((p) => p.hide("plain", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("plain")).toBe("hand");
    expect(game.p1.power()).toBe(3);
  });

  test("(d) 0 power of any domain but 10 energy: rejected — Energy cannot pay [A] (135.2.e.5.a)", async () => {
    const game = await scenario()
      .resources(P1, { energy: 10 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .hand(P1, HIDDEN_PING, "H")
      .build();
    expect(game.p1.can("hide", "H")).toBe(false);
    const r = await game.p1.try((p) => p.hide("H", "bf1"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("H")).toBe("hand");
    expect(game.p1.energy()).toBe(10);
    // …while ANY domain of power does pay for it (not just the card's own domain).
    const mind = await scenario()
      .resources(P1, { power: { mind: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .hand(P1, HIDDEN_PING, "H")
      .build();
    expect(mind.p1.can("hide", "H")).toBe(true);
    await mind.p1.hide("H", "bf1");
    expect(mind.p1.power()).toBe(0);
  });
});

// ===========================================================================
// 4. Facedown zone capacity
// ===========================================================================

describe("107.3.a / 107.3.b / 811.1.b: each battlefield's Facedown Zone holds exactly one card; another controlled battlefield has its own slot", () => {
  test("H1→bf1 succeeds; H2→bf1 is rejected (1/1) without disturbing H1; H2→bf2 succeeds: facedown-bf1=[H1], facedown-bf2=[H2], power 0", async () => {
    const game = await scenario()
      .resources(P1, { power: { fury: 2 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder 1" }, "h1")
      .unit(P1, "bf2", { might: 2, name: "Filler Holder 2" }, "h2")
      .hand(P1, HIDDEN_PING, "H1")
      .hand(P1, HIDDEN_PING, "H2")
      .build();
    expect(hideDestinations(game, P1, "H1").sort()).toEqual(["bf1", "bf2"]);
    await game.p1.hide("H1", "bf1");
    expect(hideDestinations(game, P1, "H2")).toEqual(["bf2"]); // bf1 is full
    const r = await game.p1.try((p) => p.hide("H2", "bf1"));
    expect(r.ok).toBe(false);
    // MUST NOT stack two at bf1, MUST NOT silently replace/trash H1.
    expect(game.cardsAt("facedown:bf1")).toEqual(["H1"]);
    expect(game.zoneOf("H2")).toBe("hand");
    expect(game.p1.power()).toBe(1);
    await game.p1.hide("H2", "bf2");
    expect(game.cardsAt("facedown:bf1")).toEqual(["H1"]);
    expect(game.cardsAt("facedown:bf2")).toEqual(["H2"]);
    expect(game.p1.power()).toBe(0);
    expect(game.p1.trash()).toEqual([]);
  });
});

// ===========================================================================
// 5. Hide from the Champion Zone; not from anywhere else
// ===========================================================================

describe("811.1.b / 421.2.a / 108.3: Hide is legal from hand OR Champion Zone — and from nowhere else", () => {
  test("811.1.b — a Hidden champion in P1's Champion Zone can be hidden at bf1 (zone empties, card facedown, power −1, no chain); engine only allows Hide from hand", async () => {
    // Expected: hide(champ → bf1) is legal and succeeds. Actual: hideCard requires zone === "hand",
    // so the champion is never offered and the attempt is rejected.
    const game = await scenario()
      .resources(P1, { power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .champion(P1, { cardType: "unit", keywords: ["Hidden"], might: 3, name: "Filler Hidden Champion", tags: ["Champion"] }, "champ")
      .build();
    expect(game.zoneOf("champ")).toBe("championZone");
    expect(game.p1.can("hide", "champ")).toBe(true);
    await game.p1.hide("champ", "bf1");
    expect(game.zoneOf("champ")).toBe("facedown-bf1");
    expect(game.p1.champion()).toBeUndefined();
    expect(game.p1.power()).toBe(0);
    expect(game.chain()).toEqual([]);
  });

  test("negative: Hidden cards in P1's trash, deck, on the board, or already facedown are never Hide candidates — only the copy in hand is (421.2.a)", async () => {
    const game = await scenario()
      .turn(3)
      .resources(P1, { power: { fury: 3 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P1 })
      .unit(P1, "bf1", hiddenUnit(2), "onBoard") // a Hidden unit in play, holding bf1
      .unit(P1, "bf2", { might: 2, name: "Filler Holder" }, "holder2")
      .trash(P1, HIDDEN_PING, "inTrash")
      .deckTop(P1, HIDDEN_PING, "inDeck")
      .facedown(P1, "bf2", HIDDEN_PING, "alreadyDown")
      .hand(P1, HIDDEN_PING, "inHand")
      .build();
    const hideCards = game.p1.legal().filter((o) => o.moveId === "hideCard").map((o) => o.card);
    expect(hideCards).toEqual(["inHand"]);
    for (const c of ["onBoard", "inTrash", "inDeck", "alreadyDown"]) {
      expect(game.p1.can("hide", c)).toBe(false);
    }
    expect(hideDestinations(game, P1, "inHand")).toEqual(["bf1"]); // bf2's slot is taken
  });
});

// ===========================================================================
// 6. Not playable the turn it was hidden; from the NEXT turn (even the opponent's) as a Reaction for 0
// ===========================================================================

describe("811.1.b / 811.6 / 811.1.c.3 / 811.1.d.1: a card hidden on turn N cannot be played from facedown on turn N; from turn N+1 it has Reaction, plays for 0 and a hidden permanent enters AT that battlefield", () => {
  function hideUnitBoard() {
    return scenario()
      .resources(P1, { energy: 5, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: null })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .unit(P1, "base", { might: 2, name: "Filler Scout" }, "scout")
      .hand(P1, hiddenUnit(2), "U")
      .hand(P2, ACTION_DRAW, "p2spell");
  }

  test("turn N: right after hiding, 'play U from facedown' is not legal in Neutral Open even though P1 could afford U outright — nor during a showdown later that turn", async () => {
    const game = await hideUnitBoard().build();
    await game.p1.hide("U", "bf1");
    expect(game.p1.energy()).toBe(5); // could pay 4 — irrelevant
    expect(game.p1.can("reveal", "U")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("U"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("U")).toBe("facedown-bf1");
    // Later in turn N, inside a showdown where P1 has Focus: still no.
    await game.p1.move("scout", "bf2");
    expect(turnStateOf(game)).toBe("showdown-open");
    expect(game.actingSeat()).toBe(P1);
    expect(game.p1.can("reveal", "U")).toBe(false);
    expect(game.zoneOf("U")).toBe("facedown-bf1");
  });

  test("turn N+1 (P2's turn): once P2 opens a chain and P1 receives Priority in the Closed State, playing U from hidden IS legal (Reaction); it costs nothing, U enters the board AT bf1 (not base) and facedown-bf1 empties while P2's spell is still unresolved — no need to wait for P1's own turn N+2", async () => {
    const game = await hideUnitBoard().build();
    await game.p1.hide("U", "bf1");
    const hiddenTurn = game.turnNumber();
    await game.advanceTurn(); // scout's showdown at bf2 is passed through by settle; P2's turn begins
    expect(game.turnPlayer()).toBe(P2);
    expect(game.turnNumber()).toBe(hiddenTurn + 1);
    expect(game.zoneOf("U")).toBe("facedown-bf1");
    await game.p2.cast("p2spell");
    await game.p2.passPriority();
    expect(priorityOf(game)).toBe(P1);
    expect(turnStateOf(game)).toBe("neutral-closed");
    expect(game.p1.can("reveal", "U")).toBe(true);
    const before = game.p1.resources();
    await game.p1.reveal("U");
    expect(game.p1.resources()).toEqual(before); // base cost ignored (energy AND power)
    expect(game.zoneOf("U")).toBe("battlefield-bf1"); // 811.1.d.1 — at THAT battlefield
    expect(game.locationOf("U")).not.toBe("base");
    expect(game.state("U").isHidden).toBe(false);
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(chainIds(game)).toContain("p2spell"); // played in response: P2's spell has not resolved
    expect(game.zoneOf("p2spell")).not.toBe("trash");
  });

  test("811.6 / 335 / 338.1 — on P2's turn in NEUTRAL OPEN (P2 acting, no chain) P1 holds no Priority, so 'play from hidden' must not be available to P1; engine offers and executes revealHidden anyway", async () => {
    // Expected: can("reveal") false while P2 is the acting seat in Neutral Open; attempt rejected.
    // Actual: revealHidden has no timing/priority gate at all once the hide turn has passed.
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .facedown(P1, "bf1", hiddenUnit(2), "U")
      .build();
    expect(game.actingSeat()).toBe(P2);
    expect(turnStateOf(game)).toBe("neutral-open");
    expect(game.p1.can("reveal", "U")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("U"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("U")).toBe("facedown-bf1");
  });
});

// ===========================================================================
// 7. Played-from-hidden targets restricted to that battlefield; from hand unrestricted, full cost
// ===========================================================================

describe("811.1.d / 811.1.d.2 / 811.3: a spell played from facedown may only choose targets at that battlefield (unplayable if none); from hand it is unrestricted, full-cost and normally timed", () => {
  /** S facedown at bf1 (prior turn), S2 (2-energy copy) in hand; enemies E1@bf1, E2@bf2, E3@base; P1's own unit at bf1. */
  function targetBoard() {
    return scenario()
      .turn(3)
      .resources(P1, { energy: 2 })
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P1, "bf1", { might: 3, name: "Filler Mine" }, "mine")
      .unit(P2, "bf1", { might: 3, name: "Filler E1" }, "E1")
      .unit(P2, "bf2", { might: 3, name: "Filler E2" }, "E2")
      .unit(P2, "base", { might: 3, name: "Filler E3" }, "E3")
      .facedown(P1, "bf1", HIDDEN_PING_2E, "S")
      .hand(P1, HIDDEN_PING_2E, "S2");
  }

  test("(a) playing S from hidden: costs 0, opens a chain, and the target prompt offers ONLY units at bf1 (E1 and P1's own unit) — E2 (bf2) and E3 (base) are impossible; choosing E1 deals 2 to it", async () => {
    const game = await targetBoard().build();
    expect(game.p1.can("reveal", "S")).toBe(true);
    await game.p1.reveal("S");
    expect(game.p1.energy()).toBe(2); // free
    expect(chainIds(game)).toEqual(["S"]); // 811.1.c.3 playing from facedown opens a chain
    // The engine may ask at finalization (rules) or on resolution — find the prompt either way.
    if (game.decision()?.kind !== "pick") {
      await game.settle();
    }
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    const offered = pickOffered(game);
    expect(offered.sort()).toEqual(["E1", "mine"]);
    expect(offered).not.toContain("E2");
    expect(offered).not.toContain("E3");
    const bad = await game.p1.try((p) => p.pick("E2"));
    expect(bad.ok).toBe(false);
    await game.p1.pick("E1");
    await game.settle();
    expect(game.state("E1").damage).toBe(2);
    expect(game.state("E2").damage).toBe(0);
    expect(game.state("E3").damage).toBe(0);
    expect(game.zoneOf("S")).toBe("trash");
    expect(game.p1.facedown("bf1")).toEqual([]);
  });

  test("811.1.d — (b) with NO units at bf1 the hidden spell has no legal target under the restriction, so 'play from hidden' is not offered and S stays facedown; engine offers revealHidden regardless", async () => {
    // Expected: can("reveal") false, attempt rejected, S still facedown. Actual: reveal is legal.
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .battlefield("bf2", { controller: P2 })
      .unit(P2, "bf2", { might: 3, name: "Filler E2" }, "E2")
      .unit(P2, "base", { might: 3, name: "Filler E3" }, "E3")
      .facedown(P1, "bf1", HIDDEN_PING_2E, "S")
      .build();
    expect(game.p1.can("reveal", "S")).toBe(false);
    const r = await game.p1.try((p) => p.reveal("S"));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("S")).toBe("facedown-bf1");
  });

  test("(c) cross-check 811.3: the copy in HAND played normally on P1's turn costs its full 2 energy, may target E2 or E3 (any unit anywhere), and has normal non-Reaction timing (not castable on P2's turn / into a chain)", async () => {
    const game = await targetBoard().build();
    const opt = game.p1.option("cast", "S2");
    const legalTargets = ((opt?.fields.find((f) => f.arg === "targets")?.options ?? []) as string[][]).flat();
    expect(legalTargets.sort()).toEqual(["E1", "E2", "E3", "mine"]);
    await game.p1.cast("S2", { targets: "E3" });
    expect(game.p1.energy()).toBe(0); // full cost
    await game.settle();
    expect(game.state("E3").damage).toBe(2);
    expect(game.zoneOf("S2")).toBe("trash");

    // Timing: from hand it has no Reaction — not on P2's turn, not into an existing chain.
    const oppTurn = await targetBoard().active(P2).hand(P2, ACTION_DRAW, "p2spell").build();
    expect(oppTurn.p1.can("cast", "S2")).toBe(false);
    await oppTurn.p2.cast("p2spell");
    await oppTurn.p2.passPriority();
    expect(priorityOf(oppTurn)).toBe(P1);
    expect(oppTurn.p1.can("cast", "S2")).toBe(false); // hand copy: no Reaction
    expect(oppTurn.p1.can("reveal", "S")).toBe(true); // facedown copy: Reaction (811.6)
    const poor = await targetBoard().resources(P1, { energy: 1 }).build();
    expect(poor.p1.can("cast", "S2")).toBe(false); // cannot skip the cost from hand
  });
});

// ===========================================================================
// 8. Hidden GEAR from facedown enters at the battlefield, then is Recalled at the next Cleanup
// ===========================================================================

describe("811.1.d.1.a / 152.2 / 457.1 / 458.1 / 323.7: a hidden gear played from facedown enters AT that battlefield (overriding gear-to-base) and is then Recalled to base — never trashed", () => {
  test("P1 plays G from hidden on a later turn for 0: it is on the board at bf1 (or already recalled to base), and once the dust settles it sits in P1's base as the same object with its ready state unchanged; never trash/hand", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .resources(P1, { energy: 0 })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .facedown(P1, "bf1", HIDDEN_GEAR, "G")
      .hand(P2, ACTION_DRAW, "p2spell")
      .build();
    await game.p2.cast("p2spell");
    await game.p2.passPriority();
    expect(game.p1.can("reveal", "G")).toBe(true);
    await game.p1.reveal("G");
    expect(game.p1.energy()).toBe(0); // cost ignored
    expect(game.state("G").isHidden).toBe(false);
    expect(game.p1.facedown("bf1")).toEqual([]);
    // 811.1.d.1.a: it entered AT bf1 (a "here"-scoped effect would have seen bf1); 457.1 then recalls it.
    expect(["battlefield-bf1", "base"]).toContain(game.zoneOf("G"));
    expect(game.zoneOf("G")).not.toBe("trash");
    const exhaustedOnEntry = game.state("G").isExhausted;
    await game.settle();
    expect(game.zoneOf("G")).toBe("base"); // recalled, not trashed, not bounced to hand
    expect(game.p1.gear()).toContain("G");
    expect(game.state("G").owner).toBe(P1);
    expect(game.state("G").controller).toBe(P1);
    expect(game.state("G").isExhausted).toBe(exhaustedOnEntry); // 458.1 recall changes no status
    expect(game.p1.trash()).not.toContain("G");
  });

  // rule 319.6 / 319.8: a Cleanup happens as soon as objects enter the Board and
  // the play completes, so the recall (457.1 / 518) is already done when the
  // reveal move returns — the gear is never left sitting at bf1 for later moves
  // to find. It still ENTERS at bf1 (811.1.d.1.a): it leaves facedown-bf1 and is
  // recalled from there, rather than being placed into base directly.
  test("immediately after being played from facedown the gear has already been recalled from bf1 to base by that Cleanup (811.1.d.1.a, 152.2, 319.6)", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .facedown(P1, "bf1", HIDDEN_GEAR, "G")
      .hand(P2, ACTION_DRAW, "p2spell")
      .build();
    await game.p2.cast("p2spell");
    await game.p2.passPriority();
    await game.p1.reveal("G");
    expect(game.p1.facedown("bf1")).toEqual([]);
    expect(game.zoneOf("G")).toBe("base");
    expect(game.p1.trash()).not.toContain("G");
  });
});

// ===========================================================================
// 9. Losing control in Neutral Open trashes the facedown card in the same Cleanup, revealed
// ===========================================================================

describe("190.4.c / 323.6 / 323.7 / 107.3.d / 421.4: when the controller's last unit walks away in an Open State, control is lost (cleanup step 4) and the facedown card goes to its owner's trash face-up (step 5) in the same cleanup", () => {
  function walkAwayBoard() {
    return scenario()
      .turn(3)
      .resources(P1, { power: { fury: 0 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler U1" }, "U1")
      .facedown(P1, "bf1", HIDDEN_PING, "H");
  }

  test("P1 moves U1 bf1→base: bf1 becomes uncontrolled, facedown-bf1 empties, H is in P1's (the OWNER's) trash and its identity is now public to both players; no refund, not returned to hand", async () => {
    const game = await walkAwayBoard().build();
    expect(seesIdentity(game, P2, "facedown-bf1", "H")).toBe(false); // private while facedown
    await game.p1.move("U1", "base");
    expect(game.locationOf("U1")).toBe("base");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.cardsAt("facedown:bf1")).toEqual([]);
    expect(game.zoneOf("H")).toBe("trash");
    expect(game.state("H").owner).toBe(P1);
    expect(game.p1.trash()).toContain("H");
    expect(game.state("H").isHidden).toBe(false);
    expect(seesIdentity(game, P2, "trash", "H")).toBe(true); // 421.4 revealed
    expect(seesIdentity(game, P1, "trash", "H")).toBe(true);
    expect(game.p1.hand()).not.toContain("H"); // MUST NOT return to hand
    expect(game.p1.power()).toBe(0); // MUST NOT refund
    expect(game.state("H").keywords).toContain("Hidden"); // 811.5.a: still HAS Hidden — it just is no longer facedown
  });

  test("no window in between: the move is a single step after which P1 is simply back in its Neutral Open main phase — H was never playable between losing control (step 4) and being trashed (step 5)", async () => {
    const game = await walkAwayBoard().build();
    const seq0 = game.seq;
    await game.p1.move("U1", "base");
    expect(game.seq).toBe(seq0 + 1); // exactly one decision step, no intermediate prompt
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "H")).toBe(false);
    expect(game.chain()).toEqual([]);
    expect(game.zoneOf("H")).toBe("trash");
  });
});

// ===========================================================================
// 10. Control cannot change during combat: defender with zero units mid-combat keeps the facedown card
// ===========================================================================

describe("190.4.b / 323.6 / 323.2.a / 811.6: while a Combat is ongoing at bf1, the defender losing its last unit there does NOT lose control, so its facedown card stays and may still be played as a Reaction (entering as a defender)", () => {
  /** P2's turn. P1 controls bf1 with lone D (2) and Hidden 3-Might unit H facedown (prior turn). P2 attacks with A (4) and holds "deal 2". */
  function midCombatBoard() {
    return scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Defender D" }, "D")
      .unit(P2, "base", { might: 4, name: "Filler Attacker A" }, "A")
      .facedown(P1, "bf1", hiddenUnit(3), "H")
      .hand(P2, ACTION_PING_2, "zap");
  }

  /** A attacks bf1; P2 (Focus) zaps D for 2; both pass → D dies in the cleanup, combat still open. */
  async function dKilledMidCombat(): Promise<G> {
    const game = await midCombatBoard().build();
    await game.p2.move("A", "bf1");
    expect(showdownOf(game)?.isCombatShowdown).toBe(true);
    expect(game.actingSeat()).toBe(P2); // attacker has Focus
    await game.p2.cast("zap", { targets: "D" });
    await game.p2.passPriority();
    await game.p1.passPriority(); // zap resolves → D lethal → cleanup kills D
    expect(game.zoneOf("D")).toBe("trash");
    return game;
  }

  test("after D dies mid-combat: bf1 is STILL controlled by P1 (contested by P2), the combat showdown is still in progress and P1 now holds Focus/Priority in it (190.4.b, 346)", async () => {
    const game = await dKilledMidCombat();
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.gameState.battlefields.bf1?.contested).toBe(true);
    expect(game.gameState.battlefields.bf1?.contestedBy).toBe(P2);
    expect(showdownOf(game)?.battlefieldId).toBe("bf1");
    expect(game.p2.points()).toBe(0); // nothing conquered yet
    expect(game.actingSeat()).toBe(P1);
  });

  test("323.7 / 107.3.d — H must STILL be facedown at bf1 (P1 never lost control) and be playable from hidden by P1 in the showdown: it enters at bf1, becomes a defender, and combat proceeds A(4) vs H(3); engine trashes H the moment D dies", async () => {
    // Expected: zoneOf(H) === facedown-bf1, can("reveal", H) true; after reveal H is at bf1 with the
    // defender designation and the eventual combat kills H (4 dmg ≥ 3) while A survives (3 < 4) and
    // conquers. Actual: the post-kill cleanup removes H to P1's trash even though bf1's controller is
    // unchanged, so nothing can be revealed.
    const game = await dKilledMidCombat();
    expect(game.zoneOf("H")).toBe("facedown-bf1");
    expect(game.p1.facedown("bf1")).toEqual(["H"]);
    expect(game.p1.can("reveal", "H")).toBe(true);
    await game.p1.reveal("H");
    expect(game.zoneOf("H")).toBe("battlefield-bf1");
    expect(game.p1.resources()).toEqual({ energy: 0, power: {} });
    // Designation is assigned in the following cleanup (323.2.a) — at the latest once play continues.
    await game.settle();
    expect(game.zoneOf("H")).toBe("trash"); // 4 combat damage on a 3-Might defender
    expect(game.zoneOf("A")).toBe("battlefield-bf1"); // took 3 from H (< 4), healed at combat cleanup
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.p2.points()).toBe(1);
  });
});

// ===========================================================================
// 11. Attacker conquers through combat: defender's un-played facedown card is removed at resolution, revealed
// ===========================================================================

describe("466.5 / 466.5.c / 466.5.d / 421.4: when the attacker wins the combat and takes control, the defender's un-played facedown card is removed to its owner's trash and revealed", () => {
  test("P1 declines to play H; A kills D and survives; P2 conquers bf1 (+1), Contested cleared, facedown-bf1 empty, H face-up in P1's trash (public to P2), H never touched the board or the chain", async () => {
    const game = await scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Defender D" }, "D")
      .unit(P2, "base", { might: 4, name: "Filler Attacker A" }, "A")
      .facedown(P1, "bf1", hiddenUnit(3), "H")
      .build();
    await game.p2.move("A", "bf1");
    let hEverOnChainOrBoard = false;
    for (let i = 0; i < 10 && showdownOf(game); i++) {
      hEverOnChainOrBoard ||= chainIds(game).includes("H") || game.zoneOf("H").startsWith("battlefield");
      await game.acting().pass(); // P2 passes focus, P1 (declining H) passes focus
    }
    await game.settle(); // combat damage + resolution
    expect(hEverOnChainOrBoard).toBe(false);
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("A")).toBe("battlefield-bf1");
    expect(game.state("A").damage).toBe(0); // 466.1.a.1 combat cleanup heals all units
    expect(game.gameState.battlefields.bf1?.controller).toBe(P2);
    expect(game.gameState.battlefields.bf1?.contested).toBe(false);
    expect(game.p2.points()).toBe(1);
    // 466.5.c: H (controller P1 ≠ new bf controller P2) removed → owner's trash, revealed.
    expect(game.cardsAt("facedown:bf1")).toEqual([]);
    expect(game.zoneOf("H")).toBe("trash");
    expect(game.state("H").owner).toBe(P1);
    expect(game.p1.trash()).toContain("H");
    expect(game.p2.trash()).not.toContain("H");
    expect(seesIdentity(game, P2, "trash", "H")).toBe(true);
    // MUST NOT leave H under P2's control / let P2 play it.
    expect(game.p2.can("reveal", "H")).toBe(false);
    expect(game.p1.can("reveal", "H")).toBe(false);
    expect(game.state("H").damage).toBe(0);
  });
});

// ===========================================================================
// 12. LIFO matters: responding from hidden to a kill spell saves control; passing loses both
// ===========================================================================

describe("327 / 811.6 / 811.1.d.1 / 319.5 / 323.6-7 / 190.4.c: playing the hidden unit IN RESPONSE to a kill spell keeps the battlefield; passing loses the unit, the battlefield and the facedown card with no window", () => {
  /** P2's turn, Neutral Open. P1 controls bf1 with lone D and Hidden 2-Might H facedown (prior turn). P2 holds "kill a unit at a battlefield". */
  function lifoBoard() {
    return scenario()
      .turn(3)
      .active(P2)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Defender D" }, "D")
      .facedown(P1, "bf1", hiddenUnit(2), "H")
      .hand(P2, KILL_AT_BATTLEFIELD, "K");
  }

  test("branch (a): P2 casts K on D; P1, receiving Priority in the Closed State, plays H from hidden → H is at bf1 before K resolves; K then kills D; cleanup: P1 still has H at bf1 → control retained, facedown zone simply empty (nothing trashed from it)", async () => {
    const game = await lifoBoard().build();
    await game.p2.cast("K", { targets: "D" });
    await game.p2.passPriority();
    expect(priorityOf(game)).toBe(P1);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P1 });
    expect(game.p1.can("reveal", "H")).toBe(true);
    await game.p1.reveal("H");
    expect(game.zoneOf("H")).toBe("battlefield-bf1"); // permanent: finalized and on the board at once (337.2)
    expect(chainIds(game)).toEqual(["K"]); // K still pending underneath
    expect(game.zoneOf("D")).toBe("battlefield-bf1");
    await game.settle(); // everyone passes → K resolves
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.zoneOf("H")).toBe("battlefield-bf1");
    expect(game.gameState.battlefields.bf1?.controller).toBe(P1);
    expect(game.cardsAt("facedown:bf1")).toEqual([]);
    expect(game.p1.trash()).toEqual(["D"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });

  test("branch (b): P1 passes instead; K resolves, D → trash; chain empty → Open → the very same cleanup: step 4 P1 loses bf1, step 5 H trashed + revealed — and P1 was offered NO decision between K resolving and H hitting the trash", async () => {
    const game = await lifoBoard().build();
    await game.p2.cast("K", { targets: "D" });
    await game.p2.passPriority();
    const seq0 = game.seq;
    await game.p1.passPriority(); // last pass → K resolves → cleanup
    expect(game.seq).toBe(seq0 + 1); // one step: no prompt for P1 in between
    expect(game.zoneOf("D")).toBe("trash");
    expect(game.gameState.battlefields.bf1?.controller).toBeNull();
    expect(game.cardsAt("facedown:bf1")).toEqual([]);
    expect(game.zoneOf("H")).toBe("trash");
    expect(game.state("H").owner).toBe(P1);
    expect(seesIdentity(game, P2, "trash", "H")).toBe(true);
    expect(game.p1.can("reveal", "H")).toBe(false); // not playable "in response to" a cleanup
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P2 });
  });
});

// ===========================================================================
// 13. Capacity modifier (capability probe)
// ===========================================================================

describe("107.3.b / 107.3.b.1 / 107.3.b.2 / 421.4: facedown capacity can be raised by an effect; when the effect ends the zone's controller trashes down to the new maximum immediately, choosing which card goes", () => {
  function boosterBoard() {
    return scenario()
      .resources(P1, { power: { fury: 3 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 2, name: "Filler Holder" }, "holder")
      .unit(P1, "base", CAPACITY_BOOSTER, "M")
      .hand(P1, HIDDEN_PING, "H1")
      .hand(P1, HIDDEN_PING, "H2")
      .hand(P1, HIDDEN_PING, "H3")
      .hand(P2, ACTION_PING_2, "zap");
  }

  test("(capability probe): 107.3.b.1 — with M's static '+1 facedown capacity at battlefields you control' on the board, H1→bf1 AND H2→bf1 both succeed (2/2) while H3→bf1 is rejected; engine does not model a permanent-sourced capacity modifier (only battlefield text baked in at setup)", async () => {
    // Expected: two facedown cards at bf1, third refused. Actual: the second Hide is already refused.
    const game = await boosterBoard().build();
    await game.p1.hide("H1", "bf1");
    expect(game.p1.can("hide", "H2")).toBe(true);
    await game.p1.hide("H2", "bf1");
    expect(game.cardsAt("facedown:bf1").sort()).toEqual(["H1", "H2"]);
    expect(game.p1.can("hide", "H3")).toBe(false);
    expect(game.p1.power()).toBe(1);
  });

  test("(capability probe): 107.3.b.2 — when M leaves the board the maximum drops to 1 < 2 occupants and P1 (the zone's controller) must immediately CHOOSE one of H1/H2 to trash (revealed); the other stays facedown; not both, not random, not deferred to end of turn", async () => {
    // Expected: after M dies a pick decision for P1 over {H1, H2}; picking H2 trashes exactly H2.
    // Actual: capacity boost is never applied, so the position cannot even be reached.
    const game = await boosterBoard().hand(P1, ACTION_PING_2, "ownZap").build();
    await game.p1.hide("H1", "bf1");
    await game.p1.hide("H2", "bf1"); // needs the +1 capacity
    expect(game.cardsAt("facedown:bf1").sort()).toEqual(["H1", "H2"]);
    await game.p1.cast("ownZap", { targets: "M" }); // P1 kills its own booster
    await game.settle();
    expect(game.zoneOf("M")).toBe("trash");
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 }); // P1's choice, not random/oldest
    expect(pickOffered(game).sort()).toEqual(["H1", "H2"]);
    await game.p1.pick("H2");
    expect(game.zoneOf("H2")).toBe("trash");
    expect(seesIdentity(game, P2, "trash", "H2")).toBe(true); // 421.4 revealed
    expect(game.cardsAt("facedown:bf1")).toEqual(["H1"]); // MUST NOT trash both
    expect(game.state("H1").isHidden).toBe(true);
    expect(game.phase()).toBe("main"); // immediate, not deferred to end of turn
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });
});

// ===========================================================================
// 14. "Has Hidden" is a characteristic; Reaction is only granted while facedown / played from facedown
// ===========================================================================

describe("811.5 / 811.5.a / 811.6 / 811.6.a / 811.3 / 309.1.a: 'has Hidden' is true in every zone; the Reaction permission exists only for the facedown copy", () => {
  /** S1 in hand, S2 facedown at bf1 (prior turn); P1 controls bf1 with a unit; an enemy unit at bf1 as a legal target. */
  function characteristicBoard() {
    return scenario()
      .turn(3)
      .resources(P1, { energy: 3, power: { fury: 1 } })
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Filler Mine" }, "mine")
      .unit(P2, "bf1", { might: 3, name: "Filler E1" }, "E1")
      .hand(P1, HIDDEN_PING, "S1")
      .facedown(P1, "bf1", HIDDEN_PING, "S2")
      .hand(P2, ACTION_DRAW, "p2spell");
  }

  test("hasKeyword(Hidden) is TRUE for the copy in hand and for the facedown copy (811.5, 811.5.a)", async () => {
    const game = await characteristicBoard().build();
    expect(game.state("S1").keywords).toContain("Hidden");
    expect(game.state("S1").isHidden).toBe(false); // has Hidden ≠ is facedown
    expect(game.state("S2").keywords).toContain("Hidden");
    expect(game.state("S2").isHidden).toBe(true);
    // Neither copy has a printed Action/Reaction.
    expect(game.state("S1").keywords).not.toContain("Reaction");
    expect(game.state("S1").keywords).not.toContain("Action");
  });

  test("timing on P2's turn with P2's spell on the chain and P1 holding Priority: P1 MAY play S2 from facedown (Reaction via 811.6) but may NOT cast S1 from hand (no Reaction; Hidden-in-hand grants nothing — 309.1.a)", async () => {
    const game = await characteristicBoard().active(P2).build();
    await game.p2.cast("p2spell");
    await game.p2.passPriority();
    expect(priorityOf(game)).toBe(P1);
    expect(game.p1.can("cast", "S1")).toBe(false);
    const r = await game.p1.try((p) => p.cast("S1", { targets: "E1" }));
    expect(r.ok).toBe(false);
    expect(game.zoneOf("S1")).toBe("hand");
    expect(game.p1.can("reveal", "S2")).toBe(true);
    await game.p1.reveal("S2");
    expect(chainIds(game)).toEqual(["p2spell", "S2"]);
    expect(game.p1.resources()).toEqual({ energy: 3, power: { fury: 1 } }); // free from facedown
  });

  test("on P1's own turn in Neutral Open, S1 is playable from hand normally at FULL cost (3 energy + 1 fury) with unrestricted timing rules (811.3)", async () => {
    const game = await characteristicBoard().build();
    expect(game.turnPlayer()).toBe(P1);
    expect(game.p1.can("cast", "S1")).toBe(true);
    await game.p1.cast("S1", { targets: "E1" });
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    await game.settle();
    expect(game.state("E1").damage).toBe(2);
    expect(game.zoneOf("S1")).toBe("trash");
    const poor = await characteristicBoard().resources(P1, { energy: 2, power: { fury: 1 } }).build();
    expect(poor.p1.can("cast", "S1")).toBe(false);
  });

  test("after S2 is trashed by control loss it still 'has Hidden' but carries no Reaction / play-from-hidden permission any more (811.6: only while facedown or played from facedown)", async () => {
    const game = await scenario()
      .turn(3)
      .battlefield("bf1", { controller: P1 })
      .unit(P1, "bf1", { might: 3, name: "Filler Mine" }, "mine")
      .unit(P2, "base", { might: 3, name: "Filler E" }, "E")
      .facedown(P1, "bf1", HIDDEN_PING, "S2")
      .hand(P2, ACTION_DRAW, "p2spell")
      .build();
    await game.p1.move("mine", "base"); // walk away → lose bf1 → S2 trashed
    expect(game.zoneOf("S2")).toBe("trash");
    expect(game.state("S2").keywords).toContain("Hidden");
    expect(game.state("S2").isHidden).toBe(false);
    expect(game.p1.can("reveal", "S2")).toBe(false);
    expect(game.p1.can("cast", "S2")).toBe(false);
    // Even with a chain to react to on P2's turn, the trashed copy has no permission.
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P2);
    await game.p2.cast("p2spell");
    await game.p2.passPriority();
    expect(priorityOf(game)).toBe(P1);
    expect(game.p1.can("reveal", "S2")).toBe(false);
    expect(game.p1.can("cast", "S2")).toBe(false);
    expect(game.p1.legal().some((o) => o.card === "S2")).toBe(false);
  });
});
