/**
 * Interaction: Blade Twirler (ven-002-166) × Ravenbloom Conservatory (sfd-215-221) — cross-player ordering
 * of a Burn and a top-card reveal on the SAME deck.
 *
 *   Blade Twirler — Unit · Fury · 4 · 4 Might
 *     "The first time I move each turn, choose a player. They [Burn 1]. (They put the top card of their
 *      Main Deck into their trash.)"
 *   Ravenbloom Conservatory — Battlefield
 *     "When you defend here, reveal the top card of your Main Deck. If it's a spell, put it in your hand.
 *      Otherwise, recycle it."
 *
 * Rules: 440.1 / 440.1.a (Burn = top of Main Deck → trash; burn triggers after); 440.4 + 431.1.b / 431.2
 * (burning more than the deck holds → burn what you can, Burn Out — recycle trash into deck, an opponent
 * gains 1 — then finish the burn); 431.1.c (REVEALING from a too-small deck reveals what it can and never
 * Burns Out); 344 / 323.12 (a Showdown/Combat only BEGINS from a Neutral Open State during Cleanup — i.e.
 * after the move trigger's chain has emptied), so the defend trigger fires AFTER the burn; 416.1.a
 * (recycle → bottom of the Main Deck); 056 (burned/recycled cards go to their OWNER's zones); 413 / 422.1
 * ("put it in your hand" is not a Draw; a Burn is not a Discard).
 *
 * Board: P1's turn. P2 controls Ravenbloom with a 6-Might Gardener defending (Twirler's 4 dies to it, so
 * combat itself never touches P2's deck or trash). P2's deck top→bottom: SP (spell), UN (unit), D3, D4;
 * P1's deck: P1a, P1b, P1c. Blade Twirler moves base → Ravenbloom for the first time this turn.
 *   (a) P1 chooses P2: Twirler's trigger resolves first (P2 may respond) → SP burned into P2's trash;
 *       chain empties → combat showdown begins → Ravenbloom reveals the CURRENT top = UN → recycled to the
 *       bottom. P2 deck afterwards D3 D4 UN, trash +SP, hand unchanged.
 *   (b) P1 chooses THEMSELF: P1a → P1's trash; Ravenbloom then reveals SP (spell) → P2's hand; deck UN D3 D4.
 *   (c) P1 chooses P2 whose deck is EMPTY with trash {SP}, P1 on 6 (Victory 8): Burn Out once — recycle SP,
 *       P1 6→7 (no win), burn SP right back (deck empty, trash {SP}); then Ravenbloom reveals nothing from
 *       the empty deck and causes NO Burn Out (431.1.c) — P1 stays on 7.
 *   (d) Neither the hand-put (not a Draw) nor the burn (not a Discard) fires draw/discard triggers.
 */
import { describe, expect, test } from "bun:test";
import type { Game, Seat } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const BLADE_TWIRLER = "ven-002-166";
const RAVENBLOOM = "sfd-215-221";

const SP = { abilities: [], cardType: "spell", energyCost: 1, name: "Deck Spell SP", timing: "action" } as const;
const unitCard = (name: string) => ({ cardType: "unit", energyCost: 1, might: 1, name }) as const;

/** Test-only P2 permanents that turn a draw / a discard into a visible resource, to prove (d) by absence. */
const DRAW_WATCHER = {
  abilities: [{ effect: { power: ["calm"], type: "add-resource" }, trigger: { event: "draw", on: "controller" }, type: "triggered" }],
  cardType: "gear",
  energyCost: 1,
  name: "Draw Watcher (when you draw, add [calm])",
} as const;
const DISCARD_WATCHER = {
  abilities: [{ effect: { energy: 1, type: "add-resource" }, trigger: { event: "discard", on: "controller" }, type: "triggered" }],
  cardType: "gear",
  energyCost: 1,
  name: "Discard Watcher (when you discard, add [1])",
} as const;
/** Positive controls for the watchers: a real opponent draw / discard. */
const TEST_GIFT = { abilities: [{ effect: { amount: 1, player: "opponent", type: "draw" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 0, name: "Test Gift", timing: "action" } as const;
const TEST_MINDROT = { abilities: [{ effect: { amount: 1, player: "opponent", type: "discard" }, timing: "action", type: "spell" }], cardType: "spell", energyCost: 0, name: "Test Mindrot", timing: "action" } as const;

function board(opts: { watchers?: boolean } = {}) {
  let b = scenario()
    .fillDecks(false)
    .battlefield("rc", { controller: P2, def: RAVENBLOOM, inert: false, owner: P2 })
    .unit(P2, "rc", { might: 6, name: "Gardener" }, "gardener")
    .unit(P1, "base", BLADE_TWIRLER, "twirler")
    .deck(P2, [SP, unitCard("Deck Unit UN"), unitCard("D3"), unitCard("D4")], ["sp", "un", "d3", "d4"])
    .deck(P1, [unitCard("P1a"), unitCard("P1b"), unitCard("P1c")], ["p1a", "p1b", "p1c"]);
  if (opts.watchers) {
    b = b.gear(P2, DRAW_WATCHER, "drawWatch").gear(P2, DISCARD_WATCHER, "discardWatch").hand(P2, unitCard("Held"), "held").hand(P1, TEST_GIFT, "gift").hand(P1, TEST_MINDROT, "mindrot");
  }
  return b;
}

/** (c): P2's Main Deck EMPTY, trash exactly {SP}; P1 on 6 of 8. */
function burnOutBoard() {
  return scenario()
    .fillDecks(false)
    .victoryScore(8)
    .points(P1, 6)
    .battlefield("rc", { controller: P2, def: RAVENBLOOM, inert: false, owner: P2 })
    .unit(P2, "rc", { might: 6, name: "Gardener" }, "gardener")
    .unit(P1, "base", BLADE_TWIRLER, "twirler")
    .trash(P2, SP, "sp")
    .deck(P1, [unitCard("P1a"), unitCard("P1b"), unitCard("P1c")], ["p1a", "p1b", "p1c"]);
}

/**
 * Move Twirler into Ravenbloom, let both players pass on its trigger, and answer "choose a player" with
 * `who`. Returns with the burn done and whatever comes next (Ravenbloom's trigger) pending.
 */
async function twirlInChoosing(game: Game, who: Seat): Promise<void> {
  await game.p1.move("twirler", "rc");
  // rule 355.10 / 402.2 — the player is a target of the trigger, named as it is finalized.
  expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
  await game.p1.pick(who);
  expect(game.chain()).toEqual([expect.objectContaining({ cardId: "twirler", controller: P1, triggered: true })]);
  await game.p1.passPriority();
  expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 }); // P2 may respond first
  await game.p2.passPriority();
}

/** Pass priority until the chain is empty and the combat showdown's Focus window is open. */
async function toOpenShowdown(game: Game): Promise<void> {
  for (let i = 0; i < 8 && game.chain().length > 0; i++) {
    await game.acting().passPriority();
  }
  expect(game.chain()).toEqual([]);
  expect(game.decision()).toMatchObject({ context: "showdown", kind: "action" });
}

describe("Blade Twirler burns BEFORE Ravenbloom Conservatory reveals", () => {
  // ── (a) ordering ──────────────────────────────────────────────────────────────────────────

  test("(a) on the move only Twirler's trigger is on the chain: rc is contested but no showdown has begun and Ravenbloom has NOT triggered yet (344, 323.12); P2 gets priority to respond before it resolves", async () => {
    const game = await board().build();
    await game.p1.move("twirler", "rc");
    // rule 355.10 / 402.2 — the burned player is named at finalization, before anyone holds priority.
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P1 });
    await game.p1.pick(P2);
    expect(game.zoneOf("twirler")).toBe("battlefield-rc");
    expect(game.chain().map((c) => c.name)).toEqual(["Blade Twirler"]);
    expect(game.gameState.battlefields.rc).toMatchObject({ contested: true, contestedBy: P1, controller: P2 });
    expect(game.gameState.interaction?.showdownStack ?? []).toEqual([]);
    expect(game.state("gardener").combatRole).not.toBe("defender");
    await game.p1.passPriority();
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
    expect(game.p2.legal().map((o) => o.verb)).toContain("passPriority");
    // Nothing burned or revealed yet.
    expect(game.p2.deck()).toEqual(["sp", "un", "d3", "d4"]);
    expect(game.p2.trash()).toEqual([]);
  });

  test("(a) P1 names P2 → SP (the top card) is burned into P2's OWN trash (440.1, 056); only now does the combat showdown begin and Ravenbloom's defend trigger go on the chain, controlled by P2", async () => {
    const game = await board().build();
    await twirlInChoosing(game, P2);
    expect(game.zoneOf("sp")).toBe("trash");
    expect(game.p2.trash()).toEqual(["sp"]);
    expect(game.p1.trash()).toEqual([]);
    expect(game.p2.deck()).toEqual(["un", "d3", "d4"]);
    const sd = game.gameState.interaction?.showdownStack ?? [];
    expect(sd).toHaveLength(1);
    expect(sd[0]).toMatchObject({ attackingPlayer: P1, battlefieldId: "rc", defendingPlayer: P2, isCombatShowdown: true });
    expect(game.state("gardener").combatRole).toBe("defender");
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rc", controller: P2, name: "Ravenbloom Conservatory", triggered: true })]);
  });

  test("(a) Ravenbloom then reveals the CURRENT top card = UN (a unit) → recycled to the bottom (416.1.a): P2 deck D3 D4 UN, hand unchanged, trash still just SP", async () => {
    const game = await board().build();
    await twirlInChoosing(game, P2);
    await toOpenShowdown(game);
    expect(game.p2.deck()).toEqual(["d3", "d4", "un"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.trash()).toEqual(["sp"]);
    expect(game.zoneOf("un")).toBe("mainDeck");
  });

  test("(a) end state after the combat plays out (Twirler 4 dies to Gardener 6, P2 keeps rc): P2 deck D3 D4 UN / trash [SP] / hand [] — P1 deck untouched, P1 trash [Twirler]", async () => {
    const game = await board().build();
    await twirlInChoosing(game, P2);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.p2.deck()).toEqual(["d3", "d4", "un"]);
    expect(game.p2.trash()).toEqual(["sp"]);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p1.deck()).toEqual(["p1a", "p1b", "p1c"]);
    expect(game.p1.trash()).toEqual(["twirler"]);
    expect(game.gameState.battlefields.rc).toMatchObject({ contested: false, controller: P2 });
    expect(game.violations()).toEqual([]);
  });

  // ── (b) P1 burns THEMSELF ────────────────────────────────────────────────────────────────

  test("(b) P1 names THEMSELF: P1a goes from the top of P1's deck to P1's trash; P2's deck is untouched by the burn", async () => {
    const game = await board().build();
    await twirlInChoosing(game, P1);
    expect(game.p1.trash()).toEqual(["p1a"]);
    expect(game.p1.deck()).toEqual(["p1b", "p1c"]);
    expect(game.p2.trash()).toEqual([]);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rc", controller: P2, triggered: true })]);
    expect(game.p2.deck()).toEqual(["sp", "un", "d3", "d4"]); // reveal not resolved yet
  });

  test("(b) …so Ravenbloom reveals SP (a spell) → put into P2's hand; P2 deck UN D3 D4, P2 trash empty", async () => {
    const game = await board().build();
    await twirlInChoosing(game, P1);
    await toOpenShowdown(game);
    expect(game.p2.hand()).toEqual(["sp"]);
    expect(game.zoneOf("sp")).toBe("hand");
    expect(game.p2.deck()).toEqual(["un", "d3", "d4"]);
    expect(game.p2.trash()).toEqual([]);
    await game.settle();
    expect(game.p2.hand()).toEqual(["sp"]);
    expect(game.p1.trash()).toEqual(["p1a", "twirler"]);
    expect(game.violations()).toEqual([]);
  });

  // ── (c) Burn 1 into an EMPTY deck: exactly one Burn Out, then an empty reveal ─────────────

  test("(c) P2's deck empty, trash {SP}: Burn 1 → Burn Out ONCE (431.1.b/431.2): SP recycled into the deck, P1 (P2's only opponent) 6 → 7 — not 8, no win — then the burn completes and SP lands right back in P2's trash; deck empty again", async () => {
    const game = await burnOutBoard().build();
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual(["sp"]);
    await twirlInChoosing(game, P2);
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick(P1); // 431.2.c "chooses an opponent" — only P1 exists; harmless if asked
    }
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual(["sp"]);
    expect(game.zoneOf("sp")).toBe("trash");
    // and the defend trigger is what comes next
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "rc", controller: P2, triggered: true })]);
  });

  test("(c) Ravenbloom then 'reveals the top card' of an EMPTY deck: nothing is revealed, nothing goes to hand or bottom, and — being a reveal, not a draw/burn — it causes NO further Burn Out (431.1.c): P1 stays on 7 through the whole combat", async () => {
    const game = await burnOutBoard().build();
    await twirlInChoosing(game, P2);
    if (game.decision()?.kind === "pick" && game.decision()?.seat === P2) {
      await game.p2.pick(P1);
    }
    await toOpenShowdown(game);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.deck()).toEqual([]);
    expect(game.p2.trash()).toEqual(["sp"]);
    const r = await game.settle();
    expect(r.reason).toBe("open");
    expect(game.isOver()).toBe(false);
    expect(game.p1.points()).toBe(7);
    expect(game.p2.points()).toBe(0);
    expect(game.p2.trash()).toEqual(["sp"]);
    expect(game.gameState.battlefields.rc?.controller).toBe(P2);
    expect(game.violations()).toEqual([]);
  });

  // ── (d) not a Draw, not a Discard ─────────────────────────────────────────────────────────

  test("(d) control: the test watchers DO fire on a real draw (Test Gift → P2 draws → +[calm]) and a real discard (Test Mindrot → P2 discards → +[1])", async () => {
    const game = await board({ watchers: true }).build();
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.p1.cast("mindrot");
    await game.settle({ policy: "first" });
    expect(game.p2.trash()).toEqual(["held"]);
    expect(game.p2.energy()).toBe(1);
    await game.p1.cast("gift");
    await game.settle({ policy: "first" });
    expect(game.p2.hand()).toEqual(["sp"]);
    expect(game.p2.power("calm")).toBe(1);
  });

  test("(d) the SP BURNED in (a) is not 'discarded' (422.1 — a discard comes from hand) and UN's recycle is no draw: neither watcher fires — P2 stays at 0 energy / 0 calm", async () => {
    const game = await board({ watchers: true }).build();
    await twirlInChoosing(game, P2);
    await toOpenShowdown(game);
    expect(game.p2.trash()).toEqual(["sp"]);
    expect(game.p2.deck()).toEqual(["d3", "d4", "un"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p2.hand()).toEqual(["held"]);
  });

  test("(d) Ravenbloom's 'put it in your hand' in (b) is not a Draw (413): SP reaches P2's hand but the draw watcher stays silent — 0 calm; and P1's self-burn of P1a is no discard for anyone", async () => {
    const game = await board({ watchers: true }).build();
    await twirlInChoosing(game, P1);
    await toOpenShowdown(game);
    expect(game.p2.hand().sort()).toEqual(["held", "sp"]);
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.p1.trash()).toEqual(["p1a"]);
    await game.settle();
    expect(game.p2.resources()).toEqual({ energy: 0, power: {} });
    expect(game.violations()).toEqual([]);
  });
});
