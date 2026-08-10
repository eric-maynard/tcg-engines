/**
 * Interaction: Blind Fury (ogn-025-298) · Spell (Action) · Fury · 4 + [fury][fury]
 *     "Each opponent reveals the top card of their Main Deck. Choose one and banish it, then play it,
 *      ignoring its cost. Then recycle the rest."
 *   × Void Hatchling (sfd-018-221) · Unit · Fury · 2 · 2 Might
 *     "If you would reveal cards from a deck, look at the top card first. You may recycle it. Then
 *      reveal those cards."
 *
 * Question (1v1, P1's turn; P2's deck top = T1 then T2):
 *  (a) P2 controls the Hatchling and P1 casts Blind Fury. P2 is the player who "would reveal cards from a
 *      deck", so does the Hatchling's replacement give P2 a private LOOK at T1 plus a may-recycle opt-in in
 *      the middle of P1's spell — and does P1's (redacted / AI-seat) view of that pending decision carry
 *      neither T1's id nor its name?
 *  (b) P2 recycles T1: P1 observes only an anonymous deck→deck-bottom recycle (count unchanged, no
 *      identity); T2 is then revealed publicly, attributed to P2, visible in both views, and still "the top
 *      card of P2's deck" while revealed; P1 banishes/plays T2 (P1 controls, P2 owns); nothing left to
 *      recycle; afterwards neither view lists any P2 deck identity.
 *  (c) P2 keeps T1: T1 is revealed publicly and P1 proceeds with T1; T2 is never exposed to either seat.
 *  (d) No-side: P1 (the caster) controls the Hatchling instead — nothing happens for P1 (P1 never "would
 *      reveal"); and a Hatchling never applies to "they reveal their hand" (Sabotage) — not "from a deck".
 *
 * Rules: 424.1 (a reveal shows the card to ALL players), 424.1.a.2 (a revealed card stays in its zone —
 * still the top card), 424.1.a.3 (Revealed lasts until the revealing effect finishes), 424.2.a (moving a
 * card between secret positions reveals nothing), 128.3 / 128.4 (look = only the instructed player sees),
 * 108.4.d (Main Deck is Secret), 303.2.a (opponent), 416 (recycle → bottom of owner's Main Deck).
 * Blind Fury ruling: the caster plays and controls the chosen card; its owner is unchanged.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Decision, Game, Viewer } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const BLIND_FURY = "ogn-025-298";
const VOID_HATCHLING = "sfd-018-221";
const SABOTAGE = "ogn-156-298"; // "Choose an opponent. They reveal their hand. Choose a non-unit card from it, and recycle that card."
const SCRAPHEAP = "ogn-182-298"; // a gear (non-unit) for Sabotage to find
const FILLER = "ogn-175-298";

/** P2's deck, top first — recognisable inert vanilla units so "play it" lands in a base with no prompt. */
const T1 = { might: 3, name: "Card T1" } as const;
const T2 = { might: 4, name: "Card T2" } as const;
const T3 = { might: 1, name: "Card T3" } as const;

const P2_DECK_IDS = ["t1", "t2", "t3"] as const;

/**
 * P1's turn with exactly Blind Fury's 4 + [fury][fury]. P2's Main Deck is EXACTLY [T1, T2, T3] (top first)
 * so bottom placement is provable; `hatchlingSide` decides who controls the Void Hatchling. No battlefields.
 */
function board(hatchlingSide: typeof P1 | typeof P2 = P2) {
  return scenario()
    .fillDecks({ main: 0, runes: 12 })
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .unit(hatchlingSide, "base", VOID_HATCHLING, "hatch")
    .deck(P2, [T1, T2, T3], [...P2_DECK_IDS])
    .deck(P1, [FILLER, FILLER], ["p1d1", "p1d2"])
    .hand(P1, BLIND_FURY, "fury");
}

/** Cast Blind Fury, both pass → it starts resolving; returns the first prompt it parks on. */
async function castAndStartResolving(game: Game): Promise<Decision | null> {
  await game.p1.cast("fury");
  await game.p1.passPriority();
  await game.p2.passPriority();
  expect(game.zoneOf("fury")).toBe("chain"); // mid-resolution
  return game.decision();
}

/** P2's Main Deck as `viewer` sees it (top first): ids for face-up cards, "?" for redacted ones. */
function p2DeckSeenBy(game: Game, viewer: Viewer): string[] {
  return game.view(viewer).zones.mainDeck.filter((c: CardView) => c.owner === P2).map((c) => (isHiddenView(c) ? "?" : c.id));
}

function publicReveals(game: Game): readonly { cardIds: readonly string[]; playerId: string }[] {
  return (game.gameState.publicReveals ?? []) as readonly { cardIds: readonly string[]; playerId: string }[];
}

/** Which of P2's deck-card ids / names appear ANYWHERE in what seat `viewer` can read (observation + own decision + menu). */
function leaksTo(game: Game, viewer: typeof P1 | typeof P2): string[] {
  const seat = game.seat(viewer);
  const blob = JSON.stringify([seat.view(), seat.decision(), seat.legal()]);
  const hits: string[] = [];
  for (const id of P2_DECK_IDS) {
    if (blob.includes(`"${id}"`) || blob.includes(`[${id}]`)) {
      hits.push(id);
    }
  }
  for (const name of ["Card T1", "Card T2", "Card T3"]) {
    if (blob.includes(name)) {
      hits.push(name);
    }
  }
  return hits;
}

const isHatchlingLook = (d: Decision | null): boolean =>
  d?.kind === "pick" && d.seat === P2 && d.allowDecline === true && d.meta?.onPicked === "recycle";

describe("Blind Fury × enemy Void Hatchling — the revealing OPPONENT looks first (privately), may recycle, then reveals", () => {
  // ---------------------------------------------------------------- (a) the private look
  test("(a) the first prompt of Blind Fury's resolution belongs to P2 (the revealer): an optional look-and-may-recycle of exactly T1, raised while P1's spell is still on the chain", async () => {
    const game = await board().build();
    const d = await castAndStartResolving(game);
    expect(isHatchlingLook(d)).toBe(true);
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, min: 0, seat: P2, timing: "RES" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["t1"]);
    expect(game.actingSeat()).toBe(P2);
    // Looking is not revealing (128.4): nothing is on the public record yet, T1 has not moved.
    expect(publicReveals(game)).toEqual([]);
    expect(game.zoneOf("t1")).toBe("mainDeck");
    expect(game.p2.deck()).toEqual(["t1", "t2", "t3"]);
  });

  test("(a) the look is PRIVATE to P2: P2's own view shows T1 face-up on top and the full prompt (decidable from P2's seat alone) …", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    expect(p2DeckSeenBy(game, P2)).toEqual(["t1", "?", "?"]);
    const own = game.p2.decision();
    expect(own).toMatchObject({ kind: "pick", seat: P2 });
    expect(own?.kind === "pick" ? own.options.map((o) => o.key) : []).toEqual(["t1"]);
    expect(JSON.stringify(game.view(P2).decision)).toContain("t1");
  });

  test("(a) … while P1's view (the AI seat's observation) shows only 'a pick is pending for P2' — no option list, no T1 id, no T1 name, no defId — and P1 can neither answer nor act", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    const seen = game.view(P1).decision;
    expect(seen).toMatchObject({ kind: "pick", seat: P2 });
    expect(seen && "options" in seen).toBe(false);
    expect(p2DeckSeenBy(game, P1)).toEqual(["?", "?", "?"]);
    expect(leaksTo(game, P1)).toEqual([]);
    expect(game.p1.decision()).toBeNull();
    expect(game.p1.legal()).toEqual([]);
    expect((await game.p1.try((p) => p.pick("t1"))).ok).toBe(false);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
  });

  // ---------------------------------------------------------------- (b) P2 recycles T1
  test("(b) P2 recycles T1: it goes top → bottom of P2's deck (416); P1 learns nothing about it — same deck count, every position still anonymous, no public-reveal entry for T1 (424.2.a)", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    const countBefore = p2DeckSeenBy(game, P1).length;
    await game.p2.pick("t1");
    expect(game.p2.deck()).toEqual(["t2", "t3", "t1"]); // omniscient: T1 is now the bottom card
    expect(game.zoneOf("t1")).toBe("mainDeck");
    expect(publicReveals(game).flatMap((r) => [...r.cardIds])).not.toContain("t1");
    const p1Deck = p2DeckSeenBy(game, P1);
    expect(p1Deck).toHaveLength(countBefore);
    expect(p1Deck.slice(1)).toEqual(["?", "?"]); // (index 0 is the now-revealed T2, next test)
    expect(leaksTo(game, P1)).not.toContain("t1");
    expect(leaksTo(game, P1)).not.toContain("Card T1");
    // Even P2 no longer sees T1: it sits at a secret position again (108.4.d).
    expect(p2DeckSeenBy(game, P2)[2]).toBe("?");
  });

  test("(b) 'Then reveal those cards' now reveals the NEW top card T2 to everyone (424.1): on the public record attributed to P2, face-up as 'Card T2' at the top of P2's deck in BOTH views, and still in the Main Deck (424.1.a.2)", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    await game.p2.pick("t1");
    expect(publicReveals(game)).toContainEqual(expect.objectContaining({ cardIds: ["t2"], playerId: P2 }));
    expect(game.zoneOf("t2")).toBe("mainDeck");
    expect(game.p2.deck()[0]).toBe("t2");
    for (const viewer of [P1, P2]) {
      const deck = p2DeckSeenBy(game, viewer);
      expect(deck[0]).toBe("t2");
      const top = game.view(viewer).zones.mainDeck.find((c: CardView) => c.owner === P2);
      expect(top && !isHiddenView(top) ? top.name : undefined).toBe("Card T2");
    }
    expect(game.zoneOf("fury")).toBe("chain");
  });

  test("(b) P1 must then choose T2 (the only revealed card — mandatory, no decline), banishes and plays it ignoring cost: T2 ends in P1's base, controller P1, owner P2; nothing is left to recycle; Blind Fury → P1's trash", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    await game.p2.pick("t1");
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["t2"]);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    await game.p1.pick("t2");
    await game.settle();
    expect(game.zoneOf("t2")).toBe("base");
    expect(game.state("t2")).toMatchObject({ controller: P1, might: 4, owner: P2 });
    expect(game.p1.units("base")).toContain("t2");
    expect(game.p2.units()).not.toContain("t2");
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.banishment()).toEqual([]); // passed through P2's banishment and left again
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // "ignoring its cost" — only Blind Fury was paid
    expect(game.p2.deck()).toEqual(["t3", "t1"]); // "recycle the rest": nothing else was revealed
    expect(game.zoneOf("fury")).toBe("trash");
    expect(game.p1.trash()).toContain("fury");
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    expect(game.violations()).toEqual([]);
  });

  test("(b) after Blind Fury has finished resolving, the reveal window is closed: NEITHER seat's view lists any identity in P2's deck (T3 on top, T1 on the bottom — both anonymous)", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    await game.p2.pick("t1");
    await game.p1.pick("t2");
    await game.settle();
    for (const viewer of [P1, P2]) {
      expect(p2DeckSeenBy(game, viewer)).toEqual(["?", "?"]);
      expect(leaksTo(game, viewer).filter((x) => x !== "t2" && x !== "Card T2")).toEqual([]); // T2 is public — it is on the board
    }
  });

  // ---------------------------------------------------------------- (c) P2 keeps T1
  test("(c) P2 declines the recycle: T1 stays on top and is revealed publicly (attributed to P2, face-up in both views); P1 must take T1 → P1's base, controller P1 / owner P2; deck becomes [T2, T3]", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    await game.p2.decline();
    expect(game.p2.deck()).toEqual(["t1", "t2", "t3"]);
    expect(publicReveals(game)).toContainEqual(expect.objectContaining({ cardIds: ["t1"], playerId: P2 }));
    for (const viewer of [P1, P2]) {
      expect(p2DeckSeenBy(game, viewer)).toEqual(["t1", "?", "?"]);
    }
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["t1"]);
    await game.p1.pick("t1");
    await game.settle();
    expect(game.zoneOf("t1")).toBe("base");
    expect(game.state("t1")).toMatchObject({ controller: P1, might: 3, owner: P2 });
    expect(game.p2.deck()).toEqual(["t2", "t3"]);
    expect(game.zoneOf("fury")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  test("(c) in the keep branch T2 never leaves Secret status: not on the public record and anonymous to BOTH seats at every step (look → reveal → pick → done)", async () => {
    const game = await board().build();
    const expectT2Secret = (): void => {
      expect(publicReveals(game).flatMap((r) => [...r.cardIds])).not.toContain("t2");
      for (const viewer of [P1, P2] as const) {
        expect(leaksTo(game, viewer)).not.toContain("t2");
        expect(leaksTo(game, viewer)).not.toContain("Card T2");
      }
    };
    await castAndStartResolving(game);
    expectT2Secret();
    await game.p2.decline();
    expectT2Secret();
    await game.p1.pick("t1");
    expectT2Secret();
    await game.settle();
    expectT2Secret();
    expect(game.p2.deck()[0]).toBe("t2"); // simply the new anonymous top card
  });

  // ---------------------------------------------------------------- (d) no-side contrasts
  test("(d) contrast — the CASTER's own Hatchling does nothing: P1 never 'would reveal' (the opponents do), so no look/recycle prompt is raised for anyone; the first prompt is P1's mandatory pick of the publicly revealed T1", async () => {
    const game = await board(P1).build();
    const d = await castAndStartResolving(game);
    expect(isHatchlingLook(d)).toBe(false);
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["t1"]);
    expect(publicReveals(game)).toContainEqual(expect.objectContaining({ cardIds: ["t1"], playerId: P2 }));
    expect(game.p2.deck()).toEqual(["t1", "t2", "t3"]); // nothing was recycled first
    expect(game.p1.deck()).toEqual(["p1d1", "p1d2"]); // and P1's own deck is untouched
    await game.p1.pick("t1");
    await game.settle();
    expect(game.state("t1")).toMatchObject({ controller: P1, owner: P2, zone: "base" });
  });

  test("(d) contrast — a HAND reveal is not 'from a deck': Sabotage on P2 with Hatchlings on BOTH sides raises no look prompt for either seat; the first prompt is P1's pick from P2's revealed hand, both decks untouched", async () => {
    const seen: string[] = [];
    const game = await scenario()
      .fillDecks({ main: 0, runes: 12 })
      .resources(P1, { energy: 1, power: { body: 1 } })
      .unit(P1, "base", VOID_HATCHLING, "myHatch")
      .unit(P2, "base", VOID_HATCHLING, "theirHatch")
      .deck(P2, [T1, T2], ["t1", "t2"])
      .deck(P1, [FILLER, FILLER], ["p1d1", "p1d2"])
      .hand(P2, SCRAPHEAP, "gearG")
      .hand(P1, SABOTAGE, "sab")
      .build();
    await game.p1.cast("sab");
    await game.p1.passPriority();
    await game.p2.passPriority();
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", seat: P1, semantics: "from-revealed", source: { cardId: "sab" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["gearG"]);
    expect(d?.kind === "pick" ? d.meta?.onPicked : undefined).toBe("recycle");
    await game.settle({
      policy: (x) => {
        seen.push(`${x.seat}:${x.kind}:${x.prompt}`);
        if (x.kind === "action" && x.passKey) {
          return { key: x.passKey, kind: "action" };
        }
        if (x.kind === "pick" && x.options.length > 0) {
          return { keys: [x.options[0]?.key as string], kind: "pick" };
        }
        return undefined;
      },
    });
    expect(seen.some((s) => s.startsWith(`${P2}:`) && !s.includes(":action:"))).toBe(false); // P2 was never prompted
    expect(game.p2.deck().slice(0, 2)).toEqual(["t1", "t2"]);
    expect(game.p1.deck()).toEqual(["p1d1", "p1d2"]);
    expect(game.zoneOf("gearG")).toBe("mainDeck"); // recycled from hand
    expect(game.zoneOf("sab")).toBe("trash");
  });
});
