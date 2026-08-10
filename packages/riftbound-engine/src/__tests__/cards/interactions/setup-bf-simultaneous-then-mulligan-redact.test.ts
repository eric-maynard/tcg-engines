/**
 * Interaction (pregame privacy): Match-mode battlefield selection (486.5) followed by the Mulligan (117),
 * seen through each seat's redacted view.
 *   × The Candlelit Sanctum (ogn-291-298) · Obelisk of Power (ogn-284-298) · Zaun Warrens (ogn-298-298)
 *     — the three battlefields each player brought.
 *
 * Rules: 486.5 / 485.5 ("Each player selects one of THEIR three Battlefields … The selected Battlefields
 * are placed SIMULTANEOUSLY" — until everyone has chosen, a choice is hidden information; the other two
 * are set aside and never used); 117.1–117.3 (in turn order: choose up to two hand cards, set them aside,
 * draw that many, recycle the set-aside ones); 128.4 (hand = Private), 128.3 + 108.4.d (Main Deck order =
 * Secret, for its owner too), 424.2.a (setting aside / recycling is not a Reveal), 416 (recycle = bottom).
 *
 * Question.
 *   (a) P1 locks Obelisk of Power while P2 has not chosen: P2's view (= the bot seat's observation) must
 *       omit P1's pick entirely — no id, no name, no hint which two were set aside — until P2 also locks;
 *       then both appear at once in both views. P2 picks among P2's OWN three only.
 *   (b) P1's mulligan prompt: P2 sees only that P1 has a pending decision + P1's hand COUNT (4); nothing is
 *       revealed, redraws are private, recycled positions secret (even P1's own view lists no deck order).
 *   (c) P2's mulligan: symmetric; P1 cannot answer it.
 *   (d) Parity: the seat handle's view is the same object graph as game.view(seat); zone summaries give
 *       the other hand as count/invisible and every deck as invisible for everyone.
 *
 * Construction: the scenario builder starts mid-game, so — exactly like mulligan-turn-order-seat2-own-
 * decision.test.ts — the pregame is a fresh engine in its `setup` segment driven by the engine's own
 * setup moves (rollForFirst → chooseFirstPlayer → selectBattlefield → decks → drawInitialHand); everything
 * asserted is read through `Game.attach(engine)` (views, decisions, seat handles).
 */
import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import { riftboundDefinition } from "../../../game-definition/definition";
import type { CardDefLike, CardView, HarnessEngine, Observation, Seat } from "../../../harness";
import { basicRuneDef, FILLER_UNIT_DEF, Game, getInternalState, loadDefaultCardPool, P1, P2, SPECTATOR, toLookupPayload } from "../../../harness";
import { CardDefinitionRegistry, getGlobalCardRegistry, setGlobalCardRegistry } from "../../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

const CANDLELIT_SANCTUM = "ogn-291-298";
const OBELISK_OF_POWER = "ogn-284-298";
const ZAUN_WARRENS = "ogn-298-298";
const BROUGHT = [CANDLELIT_SANCTUM, OBELISK_OF_POWER, ZAUN_WARRENS] as const; // index 0 / 1 / 2
const BF_NAMES = ["Candlelit Sanctum", "Obelisk of Power", "Zaun Warrens"];

interface Pregame {
  readonly engine: HarnessEngine;
  readonly game: Game;
  /** `${seat}-bf0..2` = Candlelit / Obelisk / Zaun for that seat. */
  bf(seat: Seat, i: 0 | 1 | 2): string;
  hand(seat: Seat): string[];
  deck(seat: Seat): string[];
  move(moveId: string, seat: Seat, params?: Record<string, unknown>): boolean;
  /** rule 486.5 — `seat` keeps battlefield i and sets the other two aside. */
  lock(seat: Seat, i: 0 | 1 | 2): boolean;
  /** 111–116 for both seats: decks in, shuffled, opening four drawn. */
  dealOpeningHands(): void;
}

async function pregame(seed = "bf-then-mulligan"): Promise<Pregame> {
  const pool = await loadDefaultCardPool();
  setGlobalCardRegistry(new CardDefinitionRegistry());
  const engine: HarnessEngine = new RuleEngine<RiftboundGameState, RiftboundMoves, unknown, RiftboundCardMeta>(
    riftboundDefinition,
    [
      { id: P1, name: "Seat 1" },
      { id: P2, name: "Seat 2" },
    ],
    { seed },
  );
  const internal = getInternalState(engine);
  const registry = getGlobalCardRegistry();
  const put = (id: string, def: CardDefLike, owner: string): string => {
    internal.cards[id] = { controller: owner, definitionId: (def.id as string | undefined) ?? id, owner, zone: "staging" } as never;
    internal.cardMetas[id] = { buffed: false, combatRole: null, damage: 0, exhausted: false, hidden: false, stunned: false } as never;
    registry.register(id, toLookupPayload(def, id, def.cardType === "rune" ? { cardType: "rune", energyCost: 0 } : undefined));
    return id;
  };
  const real = (defId: string): CardDefLike => {
    const def = pool.get(defId);
    if (!def) {
      throw new Error(`card ${defId} missing from the pool`);
    }
    return def;
  };
  const move = (moveId: string, seat: string, params: Record<string, unknown> = {}): boolean =>
    engine.executeMove(moveId as keyof RiftboundMoves & string, {
      params: { playerId: seat, ...params } as never,
      playerId: seat as CorePlayerId,
    }).success;

  const kits: Record<string, { bfs: string[]; main: string[]; runes: string[] }> = {};
  for (const seat of [P1, P2]) {
    kits[seat] = {
      bfs: BROUGHT.map((defId, i) => put(`${seat}-bf${i}`, real(defId), seat)),
      main: Array.from({ length: 39 }, (_, i) => put(`${seat}-card${i}`, FILLER_UNIT_DEF, seat)),
      runes: Array.from({ length: 12 }, (_, i) => put(`${seat}-rune${i}`, basicRuneDef(pool, "fury"), seat)),
    };
  }
  for (let round = 0; round < 50 && engine.getState().setup?.rollWinner === undefined; round++) {
    move("rollForFirst", P1);
    move("rollForFirst", P2);
  }
  const winner = engine.getState().setup?.rollWinner as string;
  expect(winner).toBeDefined();
  expect(move("chooseFirstPlayer", winner, { firstPlayerId: P1 })).toBe(true);

  const zone = (zoneId: string, seat: string): string[] =>
    (internal.zones[zoneId]?.cardIds ?? []).filter((id: string) => internal.cards[id]?.owner === seat);
  const game = Game.attach(engine, { players: [P1, P2], pool });
  const bf = (seat: Seat, i: 0 | 1 | 2): string => kits[seat]!.bfs[i] as string;
  return {
    bf,
    dealOpeningHands: () => {
      for (const seat of [P1, P2]) {
        const kit = kits[seat]!;
        expect(move("initializeMainDeck", seat, { cardIds: kit.main })).toBe(true);
        expect(move("initializeRuneDeck", seat, { runeIds: kit.runes })).toBe(true);
        expect(move("shuffleDecks", seat)).toBe(true);
        expect(move("drawInitialHand", seat)).toBe(true);
      }
    },
    deck: (seat) => zone("mainDeck", seat),
    engine,
    game,
    hand: (seat) => zone("hand", seat),
    lock: (seat, i) =>
      move("selectBattlefield", seat, { battlefieldId: bf(seat, i), discardIds: kits[seat]!.bfs.filter((id) => id !== bf(seat, i)) }),
    move,
  };
}

/** Which of `tokens` occur anywhere in the serialised observation. */
function leaks(obs: Observation, tokens: readonly string[]): string[] {
  const blob = JSON.stringify(obs);
  return tokens.filter((t) => blob.includes(t));
}

const ofOwner = (cards: readonly CardView[] | undefined, owner: Seat): CardView[] => (cards ?? []).filter((c) => c.owner === owner);
const allHidden = (cards: readonly CardView[]): boolean => cards.every((c) => "hidden" in c && c.hidden === true && !("id" in c));

describe("486.5 battlefield selection is simultaneous — an early lock stays hidden from the other seat", () => {
  // Expected (486.5 / 485.5): the selections are placed SIMULTANEOUSLY, so while P2 is still choosing,
  // P2's view carries nothing about P1's pick. Actual: `selectBattlefield` moves the kept card into the
  // public battlefieldRow and `state.battlefields` at once and the harness observation reads the raw
  // state (not the engine's createPlayerView, which does filter `battlefields`), so P2's view names
  // "Obelisk of Power" in `battlefields`, `state.battlefields`, `state.setup.battlefieldChoices` and
  // `zones.battlefieldRow` before P2 has chosen.
  test("(a) P1 locks Obelisk while P2 has not chosen — P2's view must not contain P1's selection (no id, no name, no battlefield entry, no hint which two were set aside) (486.5)", async () => {
    const pg = await pregame();
    const before = pg.game.view(P2);
    expect(before.battlefields).toEqual([]);
    expect(pg.lock(P1, 1)).toBe(true); // Obelisk of Power
    const v = pg.game.view(P2);
    expect(v.battlefields).toEqual([]);
    expect(Object.keys(v.state.battlefields ?? {})).toEqual([]);
    expect(leaks(v, [pg.bf(P1, 0), pg.bf(P1, 1), pg.bf(P1, 2), ...BF_NAMES, ...BROUGHT])).toEqual([]);
  });

  test("(a) P1's OWN view shows exactly its selection (Obelisk of Power) and a second selection by P1 is refused (485.4.a: only one is used)", async () => {
    const pg = await pregame();
    expect(pg.lock(P1, 1)).toBe(true);
    const mine = pg.game.view(P1);
    expect(mine.battlefields.map((b) => ({ id: b.id, name: b.name }))).toEqual([{ id: pg.bf(P1, 1), name: "Obelisk of Power" }]);
    expect(pg.move("selectBattlefield", P1, { battlefieldId: pg.bf(P1, 0), discardIds: [] })).toBe(false);
    expect(pg.game.gameState.setup?.battlefieldChoices).toEqual({ [P1]: pg.bf(P1, 1) });
  });

  test("(a) once P2 also locks (Zaun Warrens) both selections are public at once: both views list both battlefields with ids and names, identically", async () => {
    const pg = await pregame();
    expect(pg.lock(P1, 1)).toBe(true);
    expect(pg.lock(P2, 2)).toBe(true);
    const want = [
      { id: pg.bf(P1, 1), name: "Obelisk of Power" },
      { id: pg.bf(P2, 2), name: "Zaun Warrens" },
    ];
    for (const viewer of [P1, P2]) {
      const v = pg.game.view(viewer);
      expect(v.battlefields.map((b) => ({ id: b.id, name: b.name }))).toEqual(want);
      expect(Object.keys(v.state.battlefields ?? {}).toSorted()).toEqual(want.map((w) => w.id).toSorted());
    }
    expect(pg.game.zoneOf(pg.bf(P1, 1))).toBe("battlefieldRow");
    expect(pg.game.zoneOf(pg.bf(P2, 2))).toBe("battlefieldRow");
  });

  // Expected (486.5 "the other two are set aside and will not be used"; the engine's own zone config marks
  // `setAside` as SECRET): the opponent never learns which two battlefields P1 did not pick. Actual: the
  // harness redactor only treats mainDeck/runeDeck as secret, so P2's view lists P1's two set-aside
  // battlefield cards with full identity in `zones.setAside`.
  test("(a) the two battlefields P1 set aside are never shown to P2 — P2's view of the set-aside pile carries no P1 identities (486.5, setAside is a Secret zone)", async () => {
    const pg = await pregame();
    expect(pg.lock(P1, 1)).toBe(true);
    expect(pg.lock(P2, 2)).toBe(true);
    expect(pg.game.zoneOf(pg.bf(P1, 0))).toBe("setAside");
    expect(pg.game.zoneOf(pg.bf(P1, 2))).toBe("setAside");
    const v = pg.game.view(P2);
    const p1Aside = ofOwner(v.zones.setAside, P1);
    expect(allHidden(p1Aside)).toBe(true); // placeholders (or nothing at all) — never identities
    expect(leaks(v, [pg.bf(P1, 0), pg.bf(P1, 2), "Candlelit Sanctum"])).toEqual([]);
  });

  // rule 486.5 "each player selects one of THEIR three": P2's legal picks are P2's own three cards,
  // so naming one of P1's battlefields is refused (`selectBattlefield` checks the card's owner).
  test("(a) P2's pick is among P2's OWN three only — selecting one of P1's battlefields is refused and records nothing (486.5)", async () => {
    const pg = await pregame();
    expect(pg.move("selectBattlefield", P2, { battlefieldId: pg.bf(P1, 0), discardIds: [] })).toBe(false);
    expect(pg.game.gameState.setup?.battlefieldChoices?.[P2]).toBeUndefined();
    expect(pg.lock(P2, 0)).toBe(true); // its own Candlelit Sanctum is fine
  });

  test("(a) P2's decision needs only P2-visible info: with P1 locked or not, P2's own lock of any of its three succeeds the same way and lands the same board", async () => {
    const early = await pregame("same");
    expect(early.lock(P2, 0)).toBe(true); // P2 first this time
    expect(early.lock(P1, 1)).toBe(true);
    const late = await pregame("same");
    expect(late.lock(P1, 1)).toBe(true);
    expect(late.lock(P2, 0)).toBe(true);
    const ids = (g: Game) => g.view(P2).battlefields.map((b) => b.name).toSorted();
    expect(ids(early.game)).toEqual(["Obelisk of Power", "The Candlelit Sanctum"].toSorted());
    expect(ids(late.game)).toEqual(ids(early.game));
  });
});

describe("117 mulligan in turn order — the other seat sees a pending decision and a hand COUNT, nothing else", () => {
  async function atP1Mulligan(): Promise<Pregame> {
    const pg = await pregame();
    expect(pg.lock(P1, 1)).toBe(true);
    expect(pg.lock(P2, 2)).toBe(true);
    pg.dealOpeningHands();
    return pg;
  }

  test("(b) P1's 'up to two' prompt: P1 sees a pick over exactly its four hand ids; P2's view shows only {seat P1, kind pick} with no options, P1's hand as 4 anonymous placeholders, and none of P1's hand ids anywhere; P2 cannot answer it", async () => {
    const pg = await atP1Mulligan();
    const { game } = pg;
    const p1Hand = pg.hand(P1);
    expect(p1Hand).toHaveLength(4);
    const d = game.decision();
    expect(d).toMatchObject({ kind: "pick", max: 2, min: 0, seat: P1, source: { moveId: "mulligan" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual([...p1Hand].toSorted());

    const v = game.view(P2);
    expect(v.decision).toEqual({ context: undefined, id: expect.any(String), kind: "pick", prompt: expect.any(String), seat: P1 });
    expect("options" in (v.decision ?? {})).toBe(false);
    const p1HandSeen = ofOwner(v.zones.hand, P1);
    expect(p1HandSeen).toHaveLength(4);
    expect(allHidden(p1HandSeen)).toBe(true);
    expect(leaks(v, p1Hand)).toEqual([]);

    const byP2 = await game.p2.try((p) => p.pick(p1Hand[0] as string));
    expect(byP2.ok).toBe(false);
    expect(byP2.ok ? "" : byP2.error.code).toBe("NOT_YOUR_DECISION");
    expect((await game.p2.try((p) => p.decline())).ok).toBe(false);
    expect(game.decision()?.seat).toBe(P1);
  });

  test("(b) P1 mulligans two: nothing is revealed (no public-reveal record), P2's view before/after differs in no identity — still 4 placeholders, deck count 35, neither the shipped nor the drawn ids appear; the recycled cards sit at the bottom of a Secret deck so even P1's own view lists no deck identities (117.3, 128.3, 424.2.a)", async () => {
    const pg = await atP1Mulligan();
    const { game } = pg;
    const before = [...pg.hand(P1)];
    const shipped = before.slice(0, 2);
    const p2Summary = () => game.p2.listZones({ all: true }).filter((z) => z.owner === P1 && (z.zone === "hand" || z.zone === "mainDeck"));
    expect(p2Summary()).toEqual([
      { count: 35, owner: P1, visible: false, zone: "mainDeck" },
      { count: 4, owner: P1, visible: false, zone: "hand" },
    ]);

    await game.p1.pick(...(shipped as [string, string]));
    const after = pg.hand(P1);
    const drawn = after.filter((id) => !before.includes(id));
    expect(drawn).toHaveLength(2);
    expect([...pg.deck(P1).slice(-2)].toSorted()).toEqual([...shipped].toSorted()); // 117.3 / 416: bottom
    expect(game.gameState.setup?.mulliganedBy).toEqual([P1]);

    expect((game.gameState as { publicReveals?: unknown[] }).publicReveals ?? []).toEqual([]);
    const v = game.view(P2);
    expect(allHidden(ofOwner(v.zones.hand, P1))).toBe(true);
    expect(ofOwner(v.zones.hand, P1)).toHaveLength(4);
    expect(leaks(v, [...before, ...after])).toEqual([]);
    expect(p2Summary()).toEqual([
      { count: 35, owner: P1, visible: false, zone: "mainDeck" },
      { count: 4, owner: P1, visible: false, zone: "hand" },
    ]); // the only public residue is the action itself (how many), never which
    // 108.4.d — deck order is Secret for its owner too: P1's own view names nothing in its Main Deck,
    // in particular not the two cards it just recycled.
    const mine = game.view(P1);
    expect(allHidden(ofOwner(mine.zones.mainDeck, P1))).toBe(true);
    expect(leaks({ ...mine, zones: { mainDeck: mine.zones.mainDeck ?? [] } } as Observation, shipped)).toEqual([]);
    expect(JSON.stringify(ofOwner(mine.zones.hand, P1))).toContain(drawn[0] as string); // …while its new hand is of course visible to P1
  });

  test("(c) then P2's mulligan, symmetric: the prompt opens only after P1's completes and belongs to P2; P1's view is the redacted summary + 4 placeholders with none of P2's ids; P1 cannot submit it; P2 keeping all four completes setup's mulligans", async () => {
    const pg = await atP1Mulligan();
    const { game } = pg;
    expect(game.decision()?.seat).toBe(P1);
    await game.p1.decline(); // P1 keeps
    const d = game.decision();
    const p2Hand = pg.hand(P2);
    expect(d).toMatchObject({ kind: "pick", max: 2, min: 0, seat: P2, source: { moveId: "mulligan" } });
    expect(d?.kind === "pick" ? d.options.map((o) => o.card).toSorted() : []).toEqual([...p2Hand].toSorted());

    const v = game.view(P1);
    expect(v.decision).toEqual({ context: undefined, id: expect.any(String), kind: "pick", prompt: expect.any(String), seat: P2 });
    expect(ofOwner(v.zones.hand, P2)).toHaveLength(4);
    expect(allHidden(ofOwner(v.zones.hand, P2))).toBe(true);
    expect(leaks(v, p2Hand)).toEqual([]);

    const byP1 = await game.p1.try((p) => p.pick(p2Hand[0] as string));
    expect(byP1.ok).toBe(false);
    expect(byP1.ok ? "" : byP1.error.code).toBe("NOT_YOUR_DECISION");
    expect(pg.move("mulligan", P1, { keepCards: [p2Hand[0]] })).toBe(false); // nor through the raw move (P1 already went, and they are not P1's cards)

    await game.p2.decline();
    expect(game.gameState.setup?.mulliganedBy).toEqual([P1, P2]);
    expect(pg.hand(P2)).toEqual(p2Hand);
    expect(game.decision()).toBeNull(); // nobody owes a mulligan any more (118 is the table's transitionToPlay)
  });

  test("(d) parity: at every pregame step the seat handle's observation IS game.view(seat); zone summaries give the other hand as an invisible count and EVERY deck (own included) as invisible; only the spectator sees identities", async () => {
    const pg = await pregame();
    const { game } = pg;
    const same = () => {
      for (const seat of [P1, P2]) {
        expect(game.seat(seat).view()).toEqual(game.view(seat));
      }
    };
    same();
    expect(pg.lock(P1, 1)).toBe(true);
    same();
    expect(pg.lock(P2, 2)).toBe(true);
    same();
    pg.dealOpeningHands();
    same();

    // `zone hand <otherSeat>` / `zone deck <anySeat>` of the bot surface are rendered from exactly these:
    for (const [viewer, other] of [
      [P1, P2],
      [P2, P1],
    ] as const) {
      const zs = game.seat(viewer).listZones({ all: true });
      expect(zs.find((z) => z.zone === "hand" && z.owner === other)).toEqual({ count: 4, owner: other, visible: false, zone: "hand" });
      expect(zs.find((z) => z.zone === "hand" && z.owner === viewer)).toEqual({ count: 4, owner: viewer, visible: true, zone: "hand" });
      for (const owner of [P1, P2]) {
        expect(zs.find((z) => z.zone === "mainDeck" && z.owner === owner)).toEqual({ count: 35, owner, visible: false, zone: "mainDeck" });
        expect(zs.find((z) => z.zone === "runeDeck" && z.owner === owner)).toEqual({ count: 12, owner, visible: false, zone: "runeDeck" });
        expect(allHidden(ofOwner(game.view(viewer).zones.mainDeck, owner))).toBe(true);
        expect(allHidden(ofOwner(game.view(viewer).zones.runeDeck, owner))).toBe(true);
      }
      expect(allHidden(ofOwner(game.view(viewer).zones.hand, other))).toBe(true);
      expect(allHidden(ofOwner(game.view(viewer).zones.hand, viewer))).toBe(false);
    }
    const spec = game.view(SPECTATOR);
    expect(ofOwner(spec.zones.hand, P1).every((c) => "id" in c)).toBe(true);
    expect(ofOwner(spec.zones.mainDeck, P2).every((c) => "id" in c)).toBe(true);

    await game.p1.decline();
    same();
    await game.p2.pick(pg.hand(P2)[0] as string);
    same();
  });
});
