/**
 * Interaction: Blind Fury (ogn-025-298) · Spell · Fury · 4+[fury][fury] · Action
 *     "Each opponent reveals the top card of their Main Deck. Choose one and banish it, then play it,
 *      ignoring its cost. Then recycle the rest."
 *   × Nocturne, Horrifying (ogn-194-298) · Champion Unit · Chaos · 4+[chaos] · 4 Might
 *     "[Ganking] As you look at or reveal me from the top of your deck, you may banish me. If you do,
 *      you may play me for [rainbow]."
 *
 * Question (1v1): P1 casts Blind Fury; P2's top card is Nocturne, P2 has one [rainbow]; P2's second card
 * is S. (a) Who reveals, is Nocturne public to BOTH seats, and is it still "the top card of P2's deck"
 * while revealed? (b) Is P2 given an optional Decision in the middle of P1's spell? (c) P2 banishes and
 * pays [rainbow]: what is left for Blind Fury; who controls Nocturne? (d) P2 declines: outcome, controller
 * vs owner? (e) Vanilla top card: any P2 Decision? Is S ever exposed?
 *
 * Rules: 424.1 (a reveal presents the card to ALL players), 424.1.a / 424.1.a.2 (Revealed is a state, not
 * a zone — the card stays where it is), 424.4 / 424.4.a (a revealed card can be manipulated / redirected
 * while revealed), 108.4.d (the Main Deck is Secret), 108.6.e (banishment is Public), 128.3, 419.3;
 * Nocturne ruling: its self-replacement is applied immediately during Blind Fury's resolution (not a
 * trigger); Blind Fury ruling: the caster plays and controls the chosen card, its owner is unchanged.
 *
 * Expected: (a) P2 is the revealing player; Nocturne is on the public record and (while revealed) still
 * P2's top deck card — deck count unchanged, in no other zone. (b) Yes: an optional yes/no for seat P2
 * while Blind Fury is mid-resolution; P1 sees a pending P2 decision and cannot answer it. (c) Nocturne →
 * P2's banishment → played by P2 for [rainbow] → P2's base, controller = owner = P2; Blind Fury then has
 * nothing to choose/banish/play/recycle and just finishes (P1's 4+[fury][fury] stay paid). (d) P1 MUST
 * choose Nocturne (only revealed card; no decline), it passes through P2's banishment and P1 plays it
 * free: controller P1, owner P2; nothing to recycle. (e) Vanilla: no P2 prompt at all; P1 must take it.
 * In every branch S is never revealed: not on the public record, hidden in both seats' views, and simply
 * the new (anonymous) top card afterwards.
 */
import { describe, expect, test } from "bun:test";
import type { CardView, Decision } from "../../../harness";
import { P1, P2, isHiddenView, scenario } from "../../../harness";

const BLIND_FURY = "ogn-025-298";
const NOCTURNE = "ogn-194-298";
/** P2's second card — a recognisable inert filler that must never be exposed. */
const S = { abilities: [], cardType: "spell", domain: "chaos", energyCost: 9, name: "Card S" } as const;
const VANILLA = { might: 2, name: "Vanilla Top" } as const;

type Game = Awaited<ReturnType<ReturnType<typeof scenario>["build"]>>;

/**
 * P1's turn with exactly Blind Fury's 4+[fury][fury]. P2 has exactly one [rainbow] (Nocturne's
 * alternative price) and no energy. P2's deck, top first: `top` (Nocturne unless overridden), `s`, then
 * harness filler. No battlefields, so any unit play can only go to its controller's base (no prompt).
 */
function board(top: string | Record<string, unknown> = NOCTURNE) {
  return scenario()
    .resources(P1, { energy: 4, power: { fury: 2 } })
    .resources(P2, { power: { rainbow: 1 } })
    .deck(P2, [top, S], ["top", "s"])
    .hand(P1, BLIND_FURY, "fury");
}

/** Cast Blind Fury and pass priority twice so it starts resolving; returns the first prompt it parks. */
async function castAndStartResolving(game: Game): Promise<Decision | null> {
  await game.p1.cast("fury");
  expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
  await game.p1.passPriority();
  await game.p2.passPriority();
  return game.decision();
}

function publicRevealIds(game: Game): string[] {
  return (game.gameState.publicReveals ?? []).flatMap((r) => [...r.cardIds]);
}

/** How `viewer` sees the card `id` (searching every zone of that seat's redacted observation). */
function viewOf(game: Game, viewer: typeof P1 | typeof P2, id: string): CardView | undefined {
  const zones = game.view(viewer).zones;
  const internalZone = game.zoneOf(id);
  const list = zones[internalZone] ?? [];
  const idx = game.cardsAt(internalZone).indexOf(id);
  return list[idx];
}

const isNocturneOptIn = (d: Decision | null): boolean => d?.kind === "yes-no" && d.seat === P2 && d.source?.cardId === "top";

describe("Blind Fury × Nocturne, Horrifying — the OPPONENT reveals (and may hijack) their own top card mid-resolution", () => {
  // ---------------------------------------------------------------- (a) the reveal itself
  test("(a) as Blind Fury resolves Nocturne goes on the PUBLIC reveal record, yet is still the top card of P2's Main Deck: deck count unchanged, not in banishment/hand/base (424.1.a — Revealed is a state, not a zone)", async () => {
    const game = await board().build();
    const deckBefore = game.p2.deck();
    await castAndStartResolving(game);
    expect(publicRevealIds(game)).toContain("top");
    expect(game.zoneOf("top")).toBe("mainDeck");
    expect(game.p2.deck()).toEqual(deckBefore); // same cards, same order, same count
    expect(game.p2.deck()[0]).toBe("top");
    expect(game.p2.banishment()).toEqual([]);
    expect(game.p2.hand()).not.toContain("top");
    expect(game.zoneOf("fury")).toBe("chain"); // Blind Fury is mid-resolution
  });

  // BUG — expected (Blind Fury text: "Each OPPONENT reveals…"): the revealing player is P2, so the shared
  // record should attribute the reveal to P2 (as every owner-reveals path does, e.g. rule 421.4).
  // Actual: the record (and the pick prompt's `revealer`) name the CASTER, P1.
  test("(a) the public reveal record attributes the reveal to the revealing OPPONENT (P2), not to the caster", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    expect(game.gameState.publicReveals ?? []).toContainEqual(expect.objectContaining({ cardIds: ["top"], playerId: P2 }));
  });

  // BUG — expected (424.1 / 424.1.a.3): while revealed, the card is presented to ALL players, so both
  // seats' redacted observations should show P2's top deck card BY IDENTITY (Nocturne) even though the
  // deck is otherwise Secret. Actual: the per-seat view keeps it as an anonymous hidden deck card for
  // both P1 and P2 (only a reveal-and-pick PROMPTER is ever un-redacted); identity is available solely
  // through the publicReveals record / the prompt text.
  test.failing("BUG: (a) while revealed, BOTH seats' views show P2's top deck card face-up as Nocturne", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    for (const seat of [P1, P2]) {
      const v = viewOf(game, seat, "top");
      expect(v).toBeDefined();
      expect(v && isHiddenView(v)).toBe(false);
      expect(v && !isHiddenView(v) ? v.name : undefined).toBe("Nocturne, Horrifying");
    }
  });

  // ---------------------------------------------------------------- (b) P2's decision inside P1's spell
  test("(b) an OPTIONAL yes/no is surfaced to seat P2 (Nocturne's 'as you reveal me… you may banish me') while P1's Blind Fury is still resolving; P1 sees a pending P2 decision and cannot answer it", async () => {
    const game = await board().build();
    const d = await castAndStartResolving(game);
    expect(isNocturneOptIn(d)).toBe(true);
    expect(d).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2 });
    expect(game.actingSeat()).toBe(P2);
    expect(game.zoneOf("fury")).toBe("chain"); // mid-resolution of P1's spell
    // P1's (redacted) view: somebody else's decision, seat P2 — nothing for P1 to act on.
    expect(game.view(P1).decision).toMatchObject({ kind: "yes-no", seat: P2 });
    expect(game.p1.legal()).toEqual([]);
    expect((await game.p1.try((p) => p.yes())).ok).toBe(false);
    expect((await game.p1.try((p) => p.pick("top"))).ok).toBe(false);
  });

  // ---------------------------------------------------------------- (c) P2 hijacks Nocturne
  test("(c) P2 says yes: Nocturne is redirected top-of-deck → P2's banishment (424.4.a, 108.6.e) and P2 is then asked the second 'you may play me for [rainbow]'", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    await game.p2.yes(); // banish me
    expect(game.zoneOf("top")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["top"]);
    expect(game.p1.banishment()).toEqual([]);
    expect(game.p2.deck()[0]).toBe("s"); // S is now the (anonymous) top card
    expect(game.decision()).toMatchObject({ canAccept: true, kind: "yes-no", seat: P2, source: { cardId: "top" } });
    expect(game.p2.power("rainbow")).toBe(1); // not paid yet
    expect(game.zoneOf("fury")).toBe("chain"); // Blind Fury still hasn't finished
  });

  test("(c) …and pays [rainbow]: Nocturne enters P2's base — controller AND owner P2 — for exactly one rainbow (no energy); Blind Fury then has nothing to choose, banish, play or recycle and simply finishes; P1's cost stays paid", async () => {
    const game = await board().build();
    const deckBefore = game.p2.deck();
    await castAndStartResolving(game);
    await game.p2.yes(); // banish
    await game.p2.yes(); // play for [rainbow]
    await game.settle();
    expect(game.zoneOf("top")).toBe("base");
    expect(game.state("top")).toMatchObject({ controller: P2, isExhausted: true, might: 4, owner: P2 });
    expect(game.p2.units("base")).toContain("top");
    expect(game.p1.units()).not.toContain("top");
    expect(game.p2.resources()).toEqual({ energy: 0, power: { rainbow: 0 } });
    expect(game.p2.banishment()).toEqual([]);
    // Blind Fury: no P1 prompt ever appeared; it is done and in the trash, costs unrefunded.
    expect(game.zoneOf("fury")).toBe("trash");
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } });
    expect(game.chain()).toEqual([]);
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
    // "recycle the rest": nothing — S was never revealed and stays on top; the deck is just one shorter.
    expect(game.p2.deck()).toEqual(deckBefore.slice(1));
    expect(game.violations()).toEqual([]);
  });

  test("(c′) P2 banishes but declines to pay: Nocturne stays in P2's banishment, [rainbow] kept; Blind Fury still finds no revealed card and does nothing further", async () => {
    const game = await board().build();
    await castAndStartResolving(game);
    await game.p2.yes(); // banish
    await game.p2.no(); // don't play
    await game.settle();
    expect(game.zoneOf("top")).toBe("banishment");
    expect(game.p2.banishment()).toEqual(["top"]);
    expect(game.p2.power("rainbow")).toBe(1);
    expect(game.zoneOf("fury")).toBe("trash");
    expect(game.p1.units()).toEqual([]);
    expect(game.p2.deck()[0]).toBe("s");
    expect(game.decision()).toMatchObject({ context: "main", kind: "action", seat: P1 });
  });

  // ---------------------------------------------------------------- (d) P2 declines
  test("(d) P2 declines: Blind Fury continues — P1 MUST choose (only Nocturne offered, no decline), it passes through its OWNER's banishment and P1 plays it free: controller P1, owner P2; nothing recycled; P2 keeps its [rainbow]", async () => {
    const game = await board().build();
    const deckBefore = game.p2.deck();
    await castAndStartResolving(game);
    await game.p2.no();
    expect(game.zoneOf("top")).toBe("mainDeck"); // still there until P1's choice moves it
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P1, semantics: "from-revealed" });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["top"]);
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false); // "Choose one" is mandatory
    await game.p1.pick("top");
    await game.settle();
    expect(game.zoneOf("top")).toBe("base");
    expect(game.state("top")).toMatchObject({ controller: P1, owner: P2 });
    expect(game.p1.units("base")).toContain("top");
    expect(game.p2.units()).not.toContain("top");
    expect(game.p1.banishment()).toEqual([]); // never P1's banishment
    expect(game.p2.banishment()).toEqual([]); // passed through and left again
    expect(game.p1.resources()).toEqual({ energy: 0, power: { fury: 0 } }); // "ignoring its cost"
    expect(game.p2.power("rainbow")).toBe(1);
    expect(game.p2.deck()).toEqual(deckBefore.slice(1)); // nothing recycled; S is the new top
    expect(game.zoneOf("fury")).toBe("trash");
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (e) vanilla contrast + S secrecy
  test("(e) contrast — vanilla top card: NO decision is ever surfaced to P2; the first prompt is P1's mandatory pick, and P1 plays the vanilla unit (controller P1, owner P2)", async () => {
    const game = await board(VANILLA).build();
    const d = await castAndStartResolving(game);
    expect(isNocturneOptIn(d)).toBe(false);
    expect(d).toMatchObject({ allowDecline: false, kind: "pick", min: 1, seat: P1 });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card ?? o.key) : []).toEqual(["top"]);
    expect(publicRevealIds(game)).toContain("top");
    expect((await game.p1.try((p) => p.decline())).ok).toBe(false);
    await game.p1.pick("top");
    await game.settle();
    expect(game.zoneOf("top")).toBe("base");
    expect(game.state("top")).toMatchObject({ controller: P1, might: 2, owner: P2 });
    expect(game.p2.deck()[0]).toBe("s");
  });

  test("S (P2's next card) is never exposed in ANY branch: not on the public record, anonymous in both seats' views throughout, and simply the new top card afterwards (108.4.d)", async () => {
    const expectSSecret = (game: Game): void => {
      expect(publicRevealIds(game)).not.toContain("s");
      for (const seat of [P1, P2]) {
        const v = viewOf(game, seat, "s");
        expect(v === undefined || isHiddenView(v)).toBe(true);
        expect(JSON.stringify(game.view(seat).decision ?? {})).not.toContain("Card S");
      }
    };
    // branch (c): P2 hijacks
    const c = await board().build();
    await castAndStartResolving(c);
    expectSSecret(c);
    await c.p2.yes();
    expectSSecret(c);
    await c.p2.yes();
    await c.settle();
    expectSSecret(c);
    expect(c.p2.deck()[0]).toBe("s");
    // branch (d): P2 declines, P1 takes Nocturne
    const d = await board().build();
    await castAndStartResolving(d);
    await d.p2.no();
    expectSSecret(d);
    await d.p1.pick("top");
    await d.settle();
    expectSSecret(d);
    expect(d.p2.deck()[0]).toBe("s");
    // branch (e): vanilla
    const e = await board(VANILLA).build();
    await castAndStartResolving(e);
    expectSSecret(e);
    await e.p1.pick("top");
    await e.settle();
    expectSSecret(e);
    expect(e.zoneOf("s")).toBe("mainDeck");
  });
});
