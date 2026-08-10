/**
 * Interaction (privacy): Rift Herald (unl-179-219) moved by an ENEMY Charm (ogn-043-298), with
 * Undertitan (sfd-175-221) among the looked-at cards.
 *
 *   Rift Herald — Unit · Order · 8 · 7 Might
 *     "When I move to a battlefield, look at the top 3 cards of your Main Deck. You may reveal a
 *      unit from among them and draw it. Recycle the rest. [Deathknell] …"
 *   Charm — Spell (Action) · Calm · 1 + [calm] — "Move an enemy unit."
 *   Undertitan — Unit · Order · 6 · 5 Might — "… As I'm revealed from your deck, [Add] [2]."
 *
 * Rules: 424.1 (a Reveal presents a card to ALL players) / 424.1.a.3 (the Revealed state lasts until
 * the revealing ability finishes resolving) / 424.2.a (only reveal from Private/Secret zones when
 * instructed — "you MAY reveal a unit" reveals only the chosen card); 128.3 + 108.4.d (Main Deck order
 * is Secret), 128.4 (a LOOK is private to the looking player), 128.2.a (privacy follows the zone the
 * card is in — once drawn, the card is as private as the rest of the hand); 416 (Recycle = bottom of
 * the Main Deck).
 *
 * Question. P1's turn; P2's Rift Herald is in P2's base; P2's top three are {Undertitan, X, Y}. P1
 * Charms the Herald to bf1.
 *   (a) The move trigger is P2's ability firing on P1's turn: P2 gets a PRIVATE look-at-3 prompt whose
 *       ids/names are absent from P1's view (= the AI seat's observation when P1 is the bot — the bot
 *       reads the same `observe()` the harness `game.view(seat)` returns).
 *   (b) P2 reveals Undertitan: exactly Undertitan lands on the public reveal record attributed to P2;
 *       its "[Add] [2]" fires (pool is public → same number in both views); it is drawn and afterwards
 *       anonymous in P2's hand from P1's side (count +1); X/Y are never exposed, their recycle is secret.
 *   (c) P2 declines (or there is no unit): nothing public, no Add, three anonymous recycles.
 *   (d) Every decision is computable from the deciding seat's own redacted view; P1 cannot answer P2's
 *       prompt.
 */
import { describe, expect, test } from "bun:test";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";

const RIFT_HERALD = "unl-179-219";
const CHARM = "ogn-043-298";
const UNDERTITAN = "sfd-175-221";
const CARD_X = { abilities: [], cardType: "spell", domain: "order", energyCost: 9, name: "Card X" } as const;
const CARD_Y = { abilities: [], cardType: "gear", domain: "order", energyCost: 9, name: "Card Y" } as const;

/** Every string that would betray the identity of one of P2's top three cards. */
const SECRET_TOKENS = ["titan", "xx", "yy", "Undertitan", "Card X", "Card Y", UNDERTITAN] as const;

function leaksIn(game: Game, viewer: typeof P1 | typeof P2): string[] {
  const blob = JSON.stringify(game.view(viewer));
  return SECRET_TOKENS.filter((t) => blob.includes(t));
}

/**
 * P1 (turn player): 1 energy + 1 calm, Charm in hand. P2: Rift Herald in base, Main Deck top→bottom =
 * Undertitan ("titan"), Card X ("xx", a spell), Card Y ("yy", a gear), then filler. One uncontrolled
 * battlefield bf1 — the only place a unit in base can be moved to, so Charm's destination is forced.
 */
function board(top: readonly [unknown, unknown, unknown] = [UNDERTITAN, CARD_X, CARD_Y], aliases = ["titan", "xx", "yy"]) {
  return scenario()
    .resources(P1, { energy: 1, power: { calm: 1 } })
    .battlefield("bf1", { controller: null })
    .unit(P2, "base", RIFT_HERALD, "herald")
    .deck(P2, top as never, aliases)
    .hand(P1, CHARM, "charm");
}

/** Cast Charm on the Herald and pass priority around until the Herald's look prompt is up. */
async function charmToLookPrompt(game: Game): Promise<void> {
  await game.p1.cast("charm", { targets: "herald" });
  for (let i = 0; i < 8; i++) {
    const d = game.decision();
    if (!d || d.kind !== "action" || d.context !== "chain") {
      return;
    }
    await game.seat(d.seat).passPriority();
  }
}

type Reveals = readonly { cardIds: readonly string[]; playerId: string }[];
const publicReveals = (game: Game): Reveals => (game.gameState as { publicReveals?: Reveals }).publicReveals ?? [];

describe("Rift Herald charmed onto a battlefield — private look, optional single-card reveal (Undertitan)", () => {
  // ---------------------------------------------------------------- (a)
  test("(a) Charm offers exactly the (public) enemy Herald; it resolves and the Herald is at bf1, its move trigger goes on the chain as P2's TRIGGERED ability during P1's turn, P2 holding priority first", async () => {
    const game = await board().build();
    const field = game.p1.option("cast", "charm")?.fields.find((f) => f.name === "targets");
    expect((field?.options ?? []).flat()).toEqual(["herald"]);
    await game.p1.cast("charm", { targets: "herald" });
    expect(game.chain().map((c) => c.name)).toEqual(["Charm"]);
    await game.p1.passPriority();
    await game.p2.passPriority(); // Charm resolves: forced destination bf1
    expect(game.locationOf("herald")).toBe("bf1");
    expect(game.zoneOf("charm")).toBe("trash");
    expect(game.turnPlayer()).toBe(P1);
    expect(game.chain()).toEqual([
      expect.objectContaining({ cardId: "herald", controller: P2, name: "Rift Herald", triggered: true, type: "ability" }),
    ]);
    expect(game.decision()).toMatchObject({ context: "chain", kind: "action", seat: P2 });
  });

  test("(a) once the trigger resolves the look-at-3 prompt belongs to P2: P2's own view lists all three looked cards and offers only the unit (Undertitan) to reveal", async () => {
    const game = await board().build();
    await charmToLookPrompt(game);
    const d = game.decision();
    expect(d).toMatchObject({ allowDecline: true, kind: "pick", max: 1, min: 0, seat: P2, source: { cardId: "herald", pendingChoiceType: "reveal-and-pick" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card) : []).toEqual(["titan"]); // X (spell) / Y (gear) are not units
    const mine = game.view(P2);
    expect((mine.state.pendingChoice as { revealed?: string[] } | undefined)?.revealed).toEqual(["titan", "xx", "yy"]);
    expect(JSON.stringify(mine.decision)).toContain("Undertitan");
  });

  test("(a) P1's view (= the bot seat's observation) shows only THAT P2 has a pending pick: no options, the three looked ids replaced by placeholders, P2's deck fully hidden, no identity string anywhere, public reveal record untouched (128.3 / 128.4)", async () => {
    const game = await board().build();
    expect(leaksIn(game, P1)).toEqual([]); // sanity: nothing leaked before either
    await charmToLookPrompt(game);
    const theirs = game.view(P1);
    expect(theirs.decision).toEqual({ context: undefined, id: expect.any(String), kind: "pick", prompt: expect.any(String), seat: P2 });
    expect("options" in (theirs.decision ?? {})).toBe(false);
    expect((theirs.state.pendingChoice as { revealed?: string[] } | undefined)?.revealed).toEqual(["hidden", "hidden", "hidden"]);
    const p2Deck = (theirs.zones.mainDeck ?? []).filter((c) => c.owner === P2);
    expect(p2Deck.length).toBeGreaterThanOrEqual(3);
    expect(p2Deck.every((c) => "hidden" in c && c.hidden === true)).toBe(true);
    expect(leaksIn(game, P1)).toEqual([]);
    expect(publicReveals(game)).toEqual([]);
    expect(theirs.state.publicReveals ?? []).toEqual([]);
  });

  // ---------------------------------------------------------------- (b)
  test("(b) P2 reveals Undertitan: exactly Undertitan (not X/Y) goes on the public reveal record, attributed to P2; 'As I'm revealed … [Add] [2]' fires — P2's energy 0→2, identical in P1's view, P2's view and the omniscient state", async () => {
    const game = await board().build();
    await charmToLookPrompt(game);
    expect(game.p2.energy()).toBe(0);
    await game.p2.pick("titan");
    expect(publicReveals(game)).toEqual([expect.objectContaining({ cardIds: ["titan"], playerId: P2 })]);
    expect(game.p2.energy()).toBe(2);
    expect(game.view(P1).resources[P2]?.energy).toBe(2);
    expect(game.view(P2).resources[P2]?.energy).toBe(2);
    expect(game.p1.energy()).toBe(0); // the Add went to the revealer, not the turn player
  });

  test("(b) Undertitan is drawn; X and Y are recycled to the bottom of P2's deck; the Herald's ability has finished (chain empty, reveal window closed)", async () => {
    const game = await board().build();
    await charmToLookPrompt(game);
    const deckBefore = game.p2.deck().length;
    await game.p2.pick("titan");
    expect(game.zoneOf("titan")).toBe("hand");
    expect(game.p2.hand()).toEqual(["titan"]);
    expect(game.zoneOf("xx")).toBe("mainDeck");
    expect(game.zoneOf("yy")).toBe("mainDeck");
    expect([...game.p2.deck().slice(-2)].toSorted()).toEqual(["xx", "yy"]); // bottom two (416)
    expect(game.p2.deck()).toHaveLength(deckBefore - 1);
    expect(game.chain()).toEqual([]);
    expect(((game.gameState as { activeReveals?: string[] }).activeReveals ?? []) as string[]).toEqual([]); // 424.1.a.3
  });

  test("(b) afterwards P1's view of P2's hand is one anonymous placeholder (count 0→1) and P1's whole view names none of the three — the drawn card is private again where it sits (128.2.a), X/Y and their order were never exposed (108.4.d)", async () => {
    const game = await board().build();
    const p2HandSeenByP1 = () => (game.view(P1).zones.hand ?? []).filter((c) => c.owner === P2);
    expect(p2HandSeenByP1()).toHaveLength(0);
    await charmToLookPrompt(game);
    await game.p2.pick("titan");
    expect(p2HandSeenByP1()).toEqual([{ hidden: true, index: expect.any(Number), owner: P2, zone: "hand" }]);
    expect(leaksIn(game, P1)).toEqual([]);
    // P1 does learn THAT P2 revealed one card (the record entry exists, attributed to P2) — but the
    // seat view no longer names it once the window has closed.
    expect(game.view(P1).state.publicReveals ?? []).toEqual([expect.objectContaining({ cardIds: ["hidden"], playerId: P2 })]);
    // P2, of course, sees its own hand.
    expect(JSON.stringify((game.view(P2).zones.hand ?? []).filter((c) => c.owner === P2))).toContain("Undertitan");
    expect(game.violations()).toEqual([]);
  });

  // ---------------------------------------------------------------- (c)
  test("(c) P2 declines to reveal: no Reveal happened — public record empty, no [Add] (energy stays 0), hand unchanged, all three recycled to the bottom, and P1's view never contained any of the three identities", async () => {
    const game = await board().build();
    await charmToLookPrompt(game);
    expect(leaksIn(game, P1)).toEqual([]);
    await game.p2.decline();
    expect(publicReveals(game)).toEqual([]);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.hand()).toEqual([]);
    expect([...game.p2.deck().slice(-3)].toSorted()).toEqual(["titan", "xx", "yy"]);
    expect((game.view(P1).zones.hand ?? []).filter((c) => c.owner === P2)).toHaveLength(0);
    expect(leaksIn(game, P1)).toEqual([]);
    expect(game.chain()).toEqual([]);
  });

  test("(c) top three contain NO unit: nobody is left holding a reveal prompt, nothing is public, no Add, the three are recycled anonymously", async () => {
    const game = await board([CARD_X, CARD_X, CARD_Y], ["x1", "xx", "yy"]).build();
    await charmToLookPrompt(game);
    await game.settle(); // an empty optional pick (if surfaced at all) is declined by the passive policy
    const d = game.decision();
    expect(d?.kind).toBe("action"); // back to ordinary play (the bf1 showdown / main phase), not a pick
    expect(publicReveals(game)).toEqual([]);
    expect(game.p2.energy()).toBe(0);
    expect(game.p2.hand()).toEqual([]);
    expect([...game.p2.deck().slice(-3)].toSorted()).toEqual(["x1", "xx", "yy"]);
    const blob = JSON.stringify(game.view(P1));
    expect(["x1", "xx", "yy", "Card X", "Card Y"].filter((t) => blob.includes(t))).toEqual([]);
  });

  // ---------------------------------------------------------------- (d)
  test("(d) legality through privacy: Charm's only choices (target Herald, destination bf1) are public board objects visible in P1's own view; P2's reveal options are a subset of what P2's view shows; P1 cannot submit P2's prompt", async () => {
    const game = await board().build();
    const p1View = game.view(P1);
    const p2BaseSeenByP1 = (p1View.zones.base ?? []).filter((c) => c.owner === P2 && "id" in c).map((c) => ("id" in c ? c.id : ""));
    expect(p2BaseSeenByP1).toContain("herald");
    expect(p1View.battlefields.map((b) => b.id)).toEqual(["bf1"]);
    expect(game.p1.can("cast", "charm")).toBe(true);

    await charmToLookPrompt(game);
    const d = game.decision();
    const offered = d?.kind === "pick" ? d.options.map((o) => o.card as string) : [];
    const p2Sees = ((game.view(P2).state.pendingChoice as { revealed?: string[] } | undefined)?.revealed ?? []) as string[];
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.every((id) => p2Sees.includes(id))).toBe(true);

    const byP1 = await game.p1.try((p) => p.pick("titan"));
    expect(byP1.ok).toBe(false);
    expect(byP1.ok ? "" : byP1.error.code).toBe("NOT_YOUR_DECISION");
    const declineByP1 = await game.p1.try((p) => p.decline());
    expect(declineByP1.ok).toBe(false);
    expect(game.decision()).toMatchObject({ kind: "pick", seat: P2 }); // still P2's to answer
  });
});
