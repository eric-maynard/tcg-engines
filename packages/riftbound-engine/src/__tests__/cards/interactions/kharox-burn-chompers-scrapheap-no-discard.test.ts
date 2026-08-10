/**
 * Interaction: Kharox (ven-114-166) · Unit · Chaos · 6 · 5 Might
 *     "[Empower] [6][chaos][chaos] ([6][chaos][chaos]: Empower me. Use only if not Empowered.)
 *      When I become [Empowered], choose an opponent. They [Burn 3]. Then you may do this: Choose a unit
 *      in their trash and play it, ignoring its cost. (To Burn 3, they put the top 3 cards of their Main
 *      Deck into their trash.)"
 *   × Flame Chompers (ogn-006-298) · Unit · Fury · 3 · 3 Might · "When you discard me, you may pay [fury] to play me."
 *   × Scrapheap (ogn-182-298) · Gear · Chaos · 2 · "When this is played, discarded, or killed, draw 1."
 *   contrast: Chemtech Enforcer (ogn-003-298) · Unit · Fury · 2 · "[Assault 2] … When you play me, discard 1."
 *
 * Question: P1 Empowers Kharox and (2 players) P2 is the opponent who Burns 3. P2's deck top→bottom: Flame
 * Chompers, Scrapheap, D3, D4 …
 *   (a) Where do the burned cards go — P2's trash or P1's?
 *   (b) Do Flame Chompers' "When you discard me…" / Scrapheap's "…discarded…" fire off a Burn?
 *   (c) Kharox's "Then you may do this: choose a unit in their trash and play it, ignoring its cost" — can
 *       P1 take the just-burned Chompers; who controls it / where does it go; is there a priority window
 *       between the Burn and this choice?
 *   (d) Contrast: P2 plays Chemtech Enforcer and DISCARDS Chompers / Scrapheap from hand.
 *   (e) P2's deck is only [Chompers, Scrapheap], trash {T1}, P1 on 5 points: resolve "Burn 3" fully.
 *
 * Rules: 440.1 (Burn = top of THAT player's deck → THEIR trash), 440.1.a (burn triggers after the burn),
 * 440.4 + 431.1.b / 431.2 (burn as many as possible, Burn Out — recycle trash into deck, an opponent gains
 * 1 point — then burn the rest), 422.1 / 422.1.b (Discard is strictly hand → trash; discard triggers only
 * after an actual discard), 056 (cards go to their OWNER's trash/deck), 416.1.c ("play it" from another
 * player's zone: the player who plays it controls it).
 *
 * Expected: (a) Chompers, Scrapheap, D3 → P2's trash; P2 deck −3; nothing in P1's trash. (b) No: a Burn is
 * not a Discard — no [fury] prompt for P2, no draw for P2. (c) "Then you may do this" is a reflexive
 * trigger: a new chain item after the burn, so there IS a priority window before the choice; P1 may pick
 * any UNIT in P2's trash (Chompers or D3, not the Scrapheap gear), it enters P1's base under P1's control,
 * P2 stays owner, cost ignored; P1 may also decline. (d) Enforcer's discard IS a Discard: Chompers offers
 * "pay [fury] to play me" (yes → P2's base), Scrapheap draws P2 a card. (e) burn 2 (Chompers, Scrapheap),
 * Burn Out (trash {T1, Chompers, Scrapheap} shuffled into the deck, P1 5 → 6), burn 1 more → deck 2 /
 * trash 1; Kharox may then play a unit only if that one re-burned card is a unit; still no discard
 * triggers.
 */
import { describe, expect, test } from "bun:test";
import type { Decision, Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const KHAROX = "ven-114-166";
const FLAME_CHOMPERS = "ogn-006-298";
const SCRAPHEAP = "ogn-182-298";
const CHEMTECH_ENFORCER = "ogn-003-298";
const filler = (n: number) => ({ cardType: "unit", domain: "fury", energyCost: 1, might: 1, name: `Deck Unit D${n}` });
const T1 = { cardType: "spell", domain: "fury", energyCost: 1, name: "Trash Spell T1" };

/**
 * P1's turn. P1: Kharox (not Empowered) in base with exactly 6 energy + 2 chaos. P2: deck top→bottom
 * Chompers, Scrapheap, D3, D4, D5, D6 (+ filler); hand Chemtech Enforcer + a second Chompers + a second
 * Scrapheap; 2 energy + 2 fury (Enforcer's cost and a payable [fury] for Chompers — so an erroneous
 * discard prompt would be ACCEPTABLE and visible).
 */
function board() {
  return scenario()
    .resources(P1, { energy: 6, power: { chaos: 2 } })
    .resources(P2, { energy: 2, power: { fury: 2 } })
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", KHAROX, "kharox")
    .deck(P2, [FLAME_CHOMPERS, SCRAPHEAP, filler(3), filler(4), filler(5), filler(6)], ["chompers", "scrap", "d3", "d4", "d5", "d6"])
    .hand(P2, CHEMTECH_ENFORCER, "enforcer")
    .hand(P2, FLAME_CHOMPERS, "chompersInHand")
    .hand(P2, SCRAPHEAP, "scrapInHand");
}

/** (e): P2's deck is exactly [Chompers, Scrapheap], trash {T1}; P1 on 5 points; no deck filler anywhere. */
function burnoutBoard() {
  return scenario()
    .fillDecks(false)
    .resources(P1, { energy: 6, power: { chaos: 2 } })
    .resources(P2, { power: { fury: 2 } })
    .points(P1, 5)
    .battlefield("bf1", { controller: null })
    .unit(P1, "base", KHAROX, "kharox")
    .deck(P1, [filler(7), filler(8), filler(9)])
    .deck(P2, [FLAME_CHOMPERS, SCRAPHEAP], ["chompers", "scrap"])
    .trash(P2, T1, "t1");
}

const brief = (d: Decision | null) =>
  d && { kind: d.kind, seat: d.seat, ...(d.kind === "action" ? { context: d.context } : {}), prompt: d.prompt };

/**
 * Activate Kharox's Empower and pass priority around until the first non-priority decision after the
 * "When I become Empowered" trigger has started resolving (or the open main phase). Records every
 * decision seen so tests can assert what P2 was / was not asked.
 */
async function empowerAndBurn(game: Game): Promise<Decision[]> {
  const seen: Decision[] = [];
  await game.p1.activate("kharox");
  for (let i = 0; i < 16; i++) {
    const d = game.decision();
    if (!d) {
      break;
    }
    seen.push(d);
    if (d.kind !== "action" || d.context === "main") {
      // "choose an opponent" with a single opponent may or may not be asked; answer it and keep going.
      if (d.kind === "pick" && d.seat === P1 && d.options.some((o) => o.seatRef === P2 || o.key === P2)) {
        await game.p1.pick(P2);
        continue;
      }
      break;
    }
    if (game.p2.trash().length > 0) {
      break; // the burn has landed and someone has priority — stop here (that is facet (c)'s window)
    }
    await game.acting().pass();
  }
  return seen;
}

/** From wherever empowerAndBurn stopped, pass priority until P1's "play a unit from their trash" offer (or main phase). */
async function toPlayOffer(game: Game): Promise<Extract<Decision, { kind: "pick" }> | null> {
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d) {
      return null;
    }
    if (d.kind === "pick" && d.seat === P1) {
      return d;
    }
    if (d.kind === "action" && d.context !== "main" && d.passKey) {
      await game.acting().pass();
      continue;
    }
    return null;
  }
  return null;
}

describe("setup — Empowering Kharox", () => {
  test("[Empower] costs exactly 6 + [chaos][chaos]; once it resolves Kharox is Empowered and 'When I become Empowered' goes on the chain as P1's triggered item", async () => {
    const game = await board().build();
    expect(game.state("kharox").isEmpowered).toBe(false);
    await game.p1.activate("kharox");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kharox", controller: P1, triggered: false })]);
    await game.p1.passPriority();
    await game.p2.passPriority();
    expect(game.state("kharox").isEmpowered).toBe(true);
    expect(game.chain()).toEqual([expect.objectContaining({ cardId: "kharox", controller: P1, triggered: true })]);
    expect(game.p2.trash()).toEqual([]); // nothing burned before the trigger resolves
  });

  test("'Use only if not Empowered': after it resolves the Empower ability is no longer offered", async () => {
    const game = await board().resources(P1, { energy: 12, power: { chaos: 4 } }).build();
    await empowerAndBurn(game);
    await toPlayOffer(game);
    if (game.decision()?.kind === "pick") {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.state("kharox").isEmpowered).toBe(true);
    expect(game.p1.resources()).toEqual({ energy: 6, power: { chaos: 2 } });
    expect(game.p1.can("activate", "kharox")).toBe(false);
  });
});

describe("(a) Burn 3 moves the top 3 of P2's deck into P2's OWN trash (440.1, 056)", () => {
  test("Flame Chompers, Scrapheap and D3 land in P2's trash in that order; P2's deck shrinks by exactly 3; P1's trash stays empty", async () => {
    const game = await board().build();
    const deck = game.p2.deck();
    expect(deck.slice(0, 4)).toEqual(["chompers", "scrap", "d3", "d4"]);
    await empowerAndBurn(game);
    expect(game.p2.trash()).toEqual(["chompers", "scrap", "d3"]);
    expect(game.p2.deck()).toHaveLength(deck.length - 3);
    expect(game.p2.deck()[0]).toBe("d4");
    expect(game.p1.trash()).toEqual([]);
    for (const c of ["chompers", "scrap", "d3"]) {
      expect(game.state(c)).toMatchObject({ owner: P2, zone: "trash" });
    }
  });
});

describe("(b) a Burn is not a Discard — neither Flame Chompers nor Scrapheap triggers (422.1 vs 440.1)", () => {
  test("P2 is never asked to pay [fury] for the burned Chompers, spends nothing, and Chompers stays in P2's trash (until/unless P1 takes it)", async () => {
    const game = await board().build();
    const seen = await empowerAndBurn(game);
    const offer = await toPlayOffer(game);
    if (offer) {
      await game.p1.decline();
    }
    await game.settle();
    const asked = [...seen, game.decision()].filter((d) => d && d.seat === P2 && d.kind !== "action");
    expect(asked).toEqual([]);
    expect(game.p2.resources()).toEqual({ energy: 2, power: { fury: 2 } });
    expect(game.zoneOf("chompers")).toBe("trash");
    expect(game.p2.units()).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("Scrapheap's 'discarded' clause does not fire: P2 draws nothing (hand size unchanged, D4 still on top of the deck)", async () => {
    const game = await board().build();
    const hand = game.p2.hand().length;
    await empowerAndBurn(game);
    if (await toPlayOffer(game)) {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.p2.hand()).toHaveLength(hand);
    expect(game.p2.deck()[0]).toBe("d4");
    expect(game.zoneOf("scrap")).toBe("trash");
    expect(game.p1.hand()).toHaveLength(0); // and certainly P1 drew nothing either
  });
});

describe("(c) 'Then you may do this: choose a unit in their trash and play it, ignoring its cost'", () => {
  // DESIGN: "Then you may do this: …" is a reflexive clause of the SAME triggered ability, not a second
  // trigger. rule 402.1: the "you may" decision is made by the controller while performing that Triggered
  // Ability; rule 402.2: every choice the ability requires (here, which unit to play) is made in the same
  // step. Both sit inside that one chain item's own resolution, so no new item is created and neither player
  // receives priority between the burn and P1's pick. A facet asserting a reflexive chain item plus a
  // response window contradicts 402.1/402.2 — the engine's inline prompt is correct.
  test("no extra chain item and no priority window between the burn and P1's choice — the reflexive 'you may' resolves inline (402.1, 402.2)", async () => {
    const game = await board().build();
    await empowerAndBurn(game);
    expect(game.p2.trash()).toEqual(["chompers", "scrap", "d3"]);
    // Only Kharox's own trigger is on the chain — it is still mid-resolution; no SECOND, reflexive item.
    expect(game.chain().map((i) => i.cardId)).toEqual(["kharox"]);
    expect(game.chain()).toEqual([expect.objectContaining({ controller: P1, triggered: true })]);
    // …and the very next decision is P1's pick, not a priority window either player could act in.
    expect(brief(game.decision())).toMatchObject({ kind: "pick", seat: P1 });
  });

  test("P1 is offered exactly the UNIT cards in P2's trash — the just-burned Flame Chompers and D3, not the Scrapheap (gear) — and may decline", async () => {
    const game = await board().build();
    await empowerAndBurn(game);
    const offer = await toPlayOffer(game);
    expect(offer).not.toBeNull();
    expect(offer!.seat).toBe(P1);
    expect(offer!.allowDecline).toBe(true);
    expect(offer!.options.map((o) => o.card ?? o.key).sort()).toEqual(["chompers", "d3"]);
  });

  test("picking Flame Chompers: it is played from P2's trash into P1's base under P1's CONTROL, P2 remains its OWNER, and P1 (on 0 energy / 0 power) pays nothing", async () => {
    const game = await board().build();
    await empowerAndBurn(game);
    await toPlayOffer(game);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    await game.p1.pick("chompers");
    await game.settle();
    expect(game.state("chompers")).toMatchObject({ controller: P1, location: "base", owner: P2, zone: "base" });
    expect(game.p1.units("base").sort()).toEqual(["chompers", "kharox"]);
    expect(game.p2.units()).toEqual([]);
    expect(game.p1.resources()).toEqual({ energy: 0, power: { chaos: 0 } });
    expect(game.p2.trash()).toEqual(["scrap", "d3"]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  test("declining: nothing is played — all three burned cards stay in P2's trash and P1's board is just Kharox", async () => {
    const game = await board().build();
    await empowerAndBurn(game);
    const offer = await toPlayOffer(game);
    expect(offer).not.toBeNull();
    await game.p1.decline();
    await game.settle();
    expect(game.p2.trash()).toEqual(["chompers", "scrap", "d3"]);
    expect(game.p1.units()).toEqual(["kharox"]);
    expect(game.violations()).toEqual([]);
  });
});

describe("(d) contrast — a REAL discard (Chemtech Enforcer 'When you play me, discard 1') does fire both triggers", () => {
  /** P2's turn: play Enforcer (2), pass its play trigger through, discard `card` when asked. */
  async function enforcerDiscards(card: "chompersInHand" | "scrapInHand"): Promise<Game> {
    const game = await board().active(P2).build();
    await game.p2.play("enforcer");
    for (let i = 0; i < 8; i++) {
      const d = game.decision();
      if (d?.kind === "pick" && d.seat === P2) {
        await game.p2.pick(card);
        break;
      }
      if (d?.kind === "action" && d.context !== "main") {
        await game.acting().pass();
        continue;
      }
      break;
    }
    return game;
  }

  test("discarding Flame Chompers from hand: P2 IS asked 'pay [fury] to play me' — yes → 1 fury spent, Chompers enters P2's base", async () => {
    const game = await enforcerDiscards("chompersInHand");
    const d = game.decision();
    expect(d).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(d?.kind === "yes-no" ? d.canAccept : undefined).not.toBe(false);
    await game.p2.yes();
    await game.settle();
    expect(game.state("chompersInHand")).toMatchObject({ controller: P2, location: "base" });
    expect(game.p2.resources()).toEqual({ energy: 0, power: { fury: 1 } }); // 2 for Enforcer, [fury] for Chompers
    expect(game.p2.units("base").sort()).toEqual(["chompersInHand", "enforcer"]);
  });

  test("discarding Scrapheap from hand: its 'discarded' trigger draws P2 a card (the deck-top Chompers); Scrapheap → P2's trash", async () => {
    const game = await enforcerDiscards("scrapInHand");
    await game.settle();
    expect(game.zoneOf("scrapInHand")).toBe("trash");
    expect(game.p2.trash()).toEqual(["scrapInHand"]);
    // hand: 3 − Enforcer − Scrapheap + 1 drawn = 2, and the drawn card is the old deck top
    expect(game.p2.hand().sort()).toEqual(["chompers", "chompersInHand"]);
    expect(game.p2.deck()[0]).toBe("scrap");
  });
});

describe("(e) Burn 3 with a 2-card deck — burn 2, Burn Out, burn 1 more (440.4, 431.1.b, 431.2)", () => {
  test("setup: P2's deck is exactly [Chompers, Scrapheap], trash {T1}; P1 on 5 points", async () => {
    const game = await burnoutBoard().build();
    expect(game.p2.deck()).toEqual(["chompers", "scrap"]);
    expect(game.p2.trash()).toEqual(["t1"]);
    expect(game.p1.points()).toBe(5);
    expect(game.p2.points()).toBe(0);
  });

  test("after full resolution: P2's trash was recycled into the deck (Burn Out) and exactly one more card burned → deck 2 + trash 1 = the same three cards {T1, Chompers, Scrapheap}; P1 gained the Burn Out point (5 → 6), P2 none", async () => {
    const game = await burnoutBoard().build();
    await empowerAndBurn(game);
    if (await toPlayOffer(game)) {
      await game.p1.decline();
    }
    await game.settle();
    expect(game.p2.deck()).toHaveLength(2);
    expect(game.p2.trash()).toHaveLength(1);
    expect([...game.p2.deck(), ...game.p2.trash()].sort()).toEqual(["chompers", "scrap", "t1"]);
    expect(game.p1.points()).toBe(6);
    expect(game.p2.points()).toBe(0);
    expect(game.isOver()).toBe(false);
    expect(game.p1.trash()).toEqual([]);
  });

  test("Kharox's follow-up may only offer the single re-burned card, and only if it is a unit (Chompers) — never T1 (spell) / Scrapheap (gear), never a card now back in the deck", async () => {
    const game = await burnoutBoard().build();
    await empowerAndBurn(game);
    const offer = await toPlayOffer(game);
    const reburned = game.p2.trash();
    expect(reburned).toHaveLength(1);
    if (reburned[0] === "chompers") {
      expect(offer).not.toBeNull();
      expect(offer!.options.map((o) => o.card ?? o.key)).toEqual(["chompers"]);
      await game.p1.pick("chompers");
      await game.settle();
      expect(game.state("chompers")).toMatchObject({ controller: P1, location: "base", owner: P2 });
      expect(game.p2.trash()).toEqual([]);
    } else {
      // a non-unit was re-burned → no legal choice → no offer at all
      expect(offer).toBeNull();
      await game.settle();
      expect(game.p1.units()).toEqual(["kharox"]);
      expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    }
  });

  test("still no discard triggers anywhere in the Burn / Burn Out / burn-the-rest sequence: P2 is never prompted, spends no fury, draws nothing", async () => {
    const game = await burnoutBoard().build();
    const seen = await empowerAndBurn(game);
    if (await toPlayOffer(game)) {
      await game.p1.decline();
    }
    await game.settle();
    expect(seen.filter((d) => d.seat === P2 && d.kind !== "action")).toEqual([]);
    expect(game.p2.power("fury")).toBe(2);
    expect(game.p2.hand()).toEqual([]);
    expect(game.p2.units()).toEqual([]);
    expect(game.violations()).toEqual([]);
  });
});
