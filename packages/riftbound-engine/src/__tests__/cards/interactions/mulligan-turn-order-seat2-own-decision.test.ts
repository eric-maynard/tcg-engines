/**
 * Interaction (pregame): Loose Cannon (ogn-251-298, Legend · Jinx) with Jinx, Rebel (ogn-202-298)
 *   as seat 1's Chosen Champion  ×  Relentless Storm (ogn-249-298, Legend · Volibear) with
 *   Volibear, Furious as seat 2's Chosen Champion.  Two-player Duel; seat 1 is the First Player.
 *
 * Question — after 116 (each player draws 4):
 *   (1) Is a mulligan Decision surfaced to seat 1 FIRST, listing exactly seat 1's four hand
 *       instance-ids, "choose up to two" (0, 1 or 2 legal; 3 refused, not truncated)?
 *   (2) Only after seat 1 resolves, is a separate Decision surfaced whose player is seat 2 (not
 *       seat 1) listing seat 2's four cards — i.e. seat 1 cannot submit seat 2's mulligan and seat 2
 *       cannot act before seat 1?
 *   (3) After seat 1 mulligans once, is a second mulligan from seat 1 rejected?
 *   (4) If a seat keeps all 4 (chooses zero), is that recorded as its completed mulligan so play
 *       proceeds to 118 without re-prompting?
 *
 * Rules: 115.1.b.1 (First Player = who becomes Turn Player first), 116 (each draws 4), 117 ("In turn
 * order, players perform their Mulligan" — singular, once each), 117.1 (choose UP TO TWO cards in
 * THEIR hand, set aside), 117.2 (draw that many), 117.3 (recycle the set-aside cards), 118 (begin
 * play with the First Player taking their turn).
 *
 * NOTE on construction: the scenario builder starts mid-game (status "playing", no setup state), so
 * the pregame is driven the way the core-rules setup suite does it — a fresh engine in its `setup`
 * segment, the three real cards registered from the card pool, and the engine's own pregame moves
 * (rollForFirst → chooseFirstPlayer → placeLegend/Champion → decks → shuffle → drawInitialHand).
 * Everything under test (the `mulligan` move and what the harness `Game` surfaces) is then observed
 * through that engine / `Game.attach`.
 */
import { describe, expect, test } from "bun:test";
import { RuleEngine } from "@tcg/core";
import type { PlayerId as CorePlayerId } from "@tcg/core";
import { riftboundDefinition } from "../../../game-definition/definition";
import type { CardDefLike, CardPool, Decision, HarnessEngine } from "../../../harness";
import { basicRuneDef, FILLER_UNIT_DEF, Game, getInternalState, loadDefaultCardPool, P1, P2, toLookupPayload } from "../../../harness";
import { CardDefinitionRegistry, getGlobalCardRegistry, setGlobalCardRegistry } from "../../../operations/card-lookup";
import type { RiftboundCardMeta, RiftboundGameState, RiftboundMoves } from "../../../types";

const LOOSE_CANNON = "ogn-251-298"; // seat 1's legend (Jinx)
const JINX_REBEL = "ogn-202-298"; // seat 1's chosen champion
const RELENTLESS_STORM = "ogn-249-298"; // seat 2's legend (Volibear)
const VOLIBEAR_FURIOUS = "ogn-041-298"; // seat 2's chosen champion

interface Pregame {
  readonly engine: HarnessEngine;
  readonly pool: CardPool;
  /** A seat's hand / main deck (top first), read from the engine's zones. */
  hand(seat: string): string[];
  deck(seat: string): string[];
  /** Run a pregame move as `seat`; returns the engine's success flag. */
  move(moveId: string, seat: string, params?: Record<string, unknown>): boolean;
  /** The harness view of this engine (turn order P1, P2). */
  game(): Game;
}

/**
 * A Duel in its setup segment, driven up to and including rule 116: seat 1 = Loose Cannon + Jinx,
 * Rebel, seat 2 = Relentless Storm + Volibear, Furious, 39 vanilla main-deck cards and 12 basic runes
 * each; the roll winner names SEAT 1 First Player; legends and champions placed; decks shuffled; each
 * player has drawn their opening 4. Nobody has mulliganed.
 */
async function pregameThroughOpeningDraw(seed = "mulligan-order"): Promise<Pregame> {
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

  const kits: Record<string, { legend: string; champion: string; main: string[]; runes: string[] }> = {};
  for (const [seat, legendId, championId] of [
    [P1, LOOSE_CANNON, JINX_REBEL],
    [P2, RELENTLESS_STORM, VOLIBEAR_FURIOUS],
  ] as const) {
    kits[seat] = {
      champion: put(`${seat}-champion`, real(championId), seat),
      legend: put(`${seat}-legend`, real(legendId), seat),
      main: Array.from({ length: 39 }, (_, i) => put(`${seat}-card${i}`, FILLER_UNIT_DEF, seat)),
      runes: Array.from({ length: 12 }, (_, i) => put(`${seat}-rune${i}`, basicRuneDef(pool, "fury"), seat)),
    };
  }

  // 115: roll (ties re-roll) — whoever wins names SEAT 1 as the First Player.
  for (let round = 0; round < 50 && engine.getState().setup?.rollWinner === undefined; round++) {
    move("rollForFirst", P1);
    move("rollForFirst", P2);
  }
  const winner = engine.getState().setup?.rollWinner as string;
  expect(winner).toBeDefined();
  expect(move("chooseFirstPlayer", winner, { firstPlayerId: P1 })).toBe(true);
  expect(engine.getState().setup).toMatchObject({ firstPlayer: P1, secondPlayer: P2 });
  // 111–114, 116.
  for (const seat of [P1, P2]) {
    const kit = kits[seat]!;
    expect(move("placeLegend", seat, { legendId: kit.legend })).toBe(true);
    expect(move("placeChampion", seat, { championId: kit.champion })).toBe(true);
    expect(move("initializeMainDeck", seat, { cardIds: kit.main })).toBe(true);
    expect(move("initializeRuneDeck", seat, { runeIds: kit.runes })).toBe(true);
    expect(move("shuffleDecks", seat)).toBe(true);
    expect(move("drawInitialHand", seat)).toBe(true);
  }

  const zone = (zoneId: string, seat: string): string[] =>
    (internal.zones[zoneId]?.cardIds ?? []).filter((id: string) => internal.cards[id]?.owner === seat);
  let attached: Game | undefined;
  return {
    deck: (seat) => zone("mainDeck", seat),
    engine,
    game: () => (attached ??= Game.attach(engine, { players: [P1, P2], pool })),
    hand: (seat) => zone("hand", seat),
    move,
    pool,
  };
}

const asPick = (d: Decision | null) => (d?.kind === "pick" ? (d as Extract<Decision, { kind: "pick" }>) : undefined);

describe("Mulligan in turn order — seat 1 (Loose Cannon / Jinx) first, then seat 2 (Relentless Storm / Volibear) gets its OWN decision", () => {
  test("116: after the opening draw each seat holds exactly 4 of its own cards (35 left in each 39-card deck); legends and champions are in their zones; nobody has mulliganed and the game is still in setup", async () => {
    const pg = await pregameThroughOpeningDraw();
    for (const seat of [P1, P2]) {
      expect(pg.hand(seat)).toHaveLength(4);
      expect(pg.hand(seat).every((id) => id.startsWith(`${seat}-card`))).toBe(true);
      expect(pg.deck(seat)).toHaveLength(35);
    }
    const st = pg.engine.getState();
    expect(st.status).toBe("setup");
    expect(st.setup?.firstPlayer).toBe(P1);
    expect(st.setup?.mulliganedBy ?? []).toEqual([]);
    const game = pg.game();
    expect(game.p1.legend()).toBe(`${P1}-legend`);
    expect(game.state(`${P1}-legend`).name).toBe("Loose Cannon");
    expect(game.p1.champion()).toBe(`${P1}-champion`);
    expect(game.state(`${P1}-champion`).name).toBe("Jinx, Rebel");
    expect(game.state(`${P2}-legend`).name).toBe("Relentless Storm");
    expect(game.state(`${P2}-champion`).name).toBe("Volibear, Furious");
  });

  // Expected (117 + harness contract): right after 116 the game owes seat 1 — the First Player — a
  // decision: a `pick` owned by P1 over exactly P1's four hand instance ids, min 0 / max 2. Actual:
  // the harness derives no Decision at all while the engine status is "setup" (`decision()` is null)
  // and even the raw escape hatch `seat.do("mulligan")` is bounced as GAME_OVER — the pregame is not
  // reachable through the Decision/Answer protocol.
  test("(1) a mulligan Decision is surfaced to SEAT 1 first — kind pick, seat P1, options = seat 1's exact four hand ids, 'up to two' (117, 117.1)", async () => {
    const pg = await pregameThroughOpeningDraw();
    const game = pg.game();
    const d = asPick(game.decision());
    expect(d).toBeDefined();
    expect(d?.seat).toBe(P1);
    expect((d?.options ?? []).map((o) => o.card ?? o.key).sort()).toEqual([...pg.hand(P1)].sort());
    expect(d?.min).toBe(0);
    expect(d?.max).toBe(2);
    // and it is answerable through the harness
    const r = await game.p1.try((p) => p.pick());
    expect(r.ok).toBe(true);
  });

  test("(1) 117.1 'up to two': setting aside 0, 1 or 2 cards are each a legal mulligan — hand stays 4, the deck stays 35, and the set-aside cards end up on the BOTTOM of the deck (117.2, 117.3)", async () => {
    for (const n of [0, 1, 2]) {
      const pg = await pregameThroughOpeningDraw(`upto-${n}`);
      const before = pg.hand(P1);
      const setAside = before.slice(0, n);
      expect(pg.move("mulligan", P1, { keepCards: setAside })).toBe(true); // (the param is the SET-ASIDE list despite its name)
      const after = pg.hand(P1);
      expect(after).toHaveLength(4);
      expect(pg.deck(P1)).toHaveLength(35);
      for (const kept of before.slice(n)) {
        expect(after).toContain(kept);
      }
      for (const gone of setAside) {
        expect(after).not.toContain(gone);
      }
      expect([...pg.deck(P1).slice(35 - n)].sort()).toEqual([...setAside].sort());
      expect(pg.engine.getState().setup?.mulliganedBy).toEqual([P1]);
    }
  });

  test("(1) 117.1: a THREE-card request is refused outright — not truncated to two: seat 1's hand and deck are unchanged and seat 1 still owes its mulligan", async () => {
    const pg = await pregameThroughOpeningDraw();
    const hand0 = [...pg.hand(P1)];
    const deck0 = [...pg.deck(P1)];
    expect(pg.move("mulligan", P1, { keepCards: hand0.slice(0, 3) })).toBe(false);
    expect(pg.hand(P1)).toEqual(hand0);
    expect(pg.deck(P1)).toEqual(deck0);
    expect(pg.engine.getState().setup?.mulliganedBy ?? []).toEqual([]);
    // …and a legal request afterwards still goes through (the refusal consumed nothing).
    expect(pg.move("mulligan", P1, { keepCards: hand0.slice(0, 2) })).toBe(true);
  });

  test("(2) 117 'in turn order': seat 2 trying to mulligan BEFORE seat 1 has resolved is refused — nothing of seat 2's moves, nothing is recorded", async () => {
    const pg = await pregameThroughOpeningDraw();
    const p2Hand0 = [...pg.hand(P2)];
    const p2Deck0 = [...pg.deck(P2)];
    expect(pg.move("mulligan", P2, { keepCards: [] })).toBe(false);
    expect(pg.move("mulligan", P2, { keepCards: [p2Hand0[0]] })).toBe(false);
    expect(pg.hand(P2)).toEqual(p2Hand0);
    expect(pg.deck(P2)).toEqual(p2Deck0);
    expect(pg.engine.getState().setup?.mulliganedBy ?? []).toEqual([]);
  });

  test("(2) 117.1 'cards in THEIR hand': seat 1 cannot mulligan seat 2's cards — naming a seat-2 hand card (or a card in seat 1's own deck) is refused with no zone change on either side", async () => {
    const pg = await pregameThroughOpeningDraw();
    const p1Hand0 = [...pg.hand(P1)];
    const p2Hand0 = [...pg.hand(P2)];
    expect(pg.move("mulligan", P1, { keepCards: [p2Hand0[0]] })).toBe(false);
    expect(pg.move("mulligan", P1, { keepCards: [pg.deck(P1)[0]] })).toBe(false);
    expect(pg.hand(P1)).toEqual(p1Hand0);
    expect(pg.hand(P2)).toEqual(p2Hand0);
    expect(pg.engine.getState().setup?.mulliganedBy ?? []).toEqual([]);
  });

  // Expected: once seat 1's mulligan is in, the cursor moves to seat 2 — a NEW pick Decision whose
  // seat is P2 (never P1) over exactly seat 2's four cards. Actual: as above, no Decision exists during
  // setup, so nothing tells seat 2 it is up (nor stops a client from thinking seat 1 still is).
  test("(2) after seat 1 resolves, a separate Decision owned by SEAT 2 lists seat 2's four hand ids (117 in turn order)", async () => {
    const pg = await pregameThroughOpeningDraw();
    expect(pg.move("mulligan", P1, { keepCards: [pg.hand(P1)[0]] })).toBe(true);
    const game = pg.game();
    const d = asPick(game.decision());
    expect(d).toBeDefined();
    expect(d?.seat).toBe(P2);
    expect(d?.seat).not.toBe(P1);
    expect((d?.options ?? []).map((o) => o.card ?? o.key).sort()).toEqual([...pg.hand(P2)].sort());
    expect(d?.max).toBe(2);
    // seat 1 has no say in it
    const bySeat1 = await game.p1.try((p) => p.pick(pg.hand(P2)[0] as string));
    expect(bySeat1.ok).toBe(false);
  });

  test("(3) 117 is performed ONCE: after seat 1's one-card mulligan a second mulligan from seat 1 (any size, even zero) is refused and changes nothing", async () => {
    const pg = await pregameThroughOpeningDraw();
    expect(pg.move("mulligan", P1, { keepCards: [pg.hand(P1)[0]] })).toBe(true);
    const hand1 = [...pg.hand(P1)];
    const deck1 = [...pg.deck(P1)];
    expect(pg.move("mulligan", P1, { keepCards: [hand1[0]] })).toBe(false);
    expect(pg.move("mulligan", P1, { keepCards: [] })).toBe(false);
    expect(pg.hand(P1)).toEqual(hand1);
    expect(pg.deck(P1)).toEqual(deck1);
    expect(pg.engine.getState().setup?.mulliganedBy).toEqual([P1]);
  });

  test("(4) keeping all four (zero set aside) IS seat 1's completed mulligan: it is recorded, seat 2 may now take its own (here: two cards), and neither seat can go again", async () => {
    const pg = await pregameThroughOpeningDraw();
    const p1Hand0 = [...pg.hand(P1)];
    expect(pg.move("mulligan", P1, { keepCards: [] })).toBe(true);
    expect(pg.hand(P1)).toEqual(p1Hand0); // nothing moved …
    expect(pg.engine.getState().setup?.mulliganedBy).toEqual([P1]); // … but it counted
    expect(pg.move("mulligan", P1, { keepCards: [p1Hand0[0]] })).toBe(false); // no second go for seat 1

    const p2Hand0 = [...pg.hand(P2)];
    const back = p2Hand0.slice(0, 2);
    expect(pg.move("mulligan", P2, { keepCards: back })).toBe(true); // seat 2 is now in turn
    expect(pg.hand(P2)).toHaveLength(4);
    expect(pg.hand(P2)).toContain(p2Hand0[2]);
    expect(pg.hand(P2)).toContain(p2Hand0[3]);
    expect([...pg.deck(P2).slice(-2)].sort()).toEqual([...back].sort());
    expect(pg.engine.getState().setup?.mulliganedBy).toEqual([P1, P2]);
    expect(pg.move("mulligan", P2, { keepCards: [] })).toBe(false); // once for seat 2 as well
    expect(pg.hand(P1)).toEqual(p1Hand0); // seat 2's mulligan never touched seat 1
  });

  test("(4) → 118: with both mulligans done play begins with SEAT 1 (the First Player) as the turn-1 Turn Player; the harness cursor now belongs to seat 1 and nobody is asked to mulligan again; hands are the post-mulligan 4 (Loose Cannon's start-of-Beginning trigger finds 4 > 1 cards and draws nothing)", async () => {
    const pg = await pregameThroughOpeningDraw();
    expect(pg.move("mulligan", P1, { keepCards: [] })).toBe(true);
    expect(pg.move("mulligan", P2, { keepCards: [] })).toBe(true);
    const p1Hand = [...pg.hand(P1)];
    const p2Hand = [...pg.hand(P2)];
    expect(pg.move("transitionToPlay", P1)).toBe(true); // what the table does once every mulligan is in
    const game = pg.game();
    expect(game.isOver()).toBe(false);
    expect(game.gameState.status).toBe("playing");
    expect(game.turnNumber()).toBe(1);
    expect(game.turnPlayer()).toBe(P1);
    const d = game.decision();
    expect(d?.seat).toBe(P1);
    expect(d?.kind).toBe("action"); // a turn to play — not a mulligan prompt
    expect(asPick(d)).toBeUndefined();
    // Seat 2 keeps its post-mulligan hand untouched until its own turn; seat 1 has at least its 4.
    expect(game.p2.hand().sort()).toEqual([...p2Hand].sort());
    for (const id of p1Hand) {
      expect(game.p1.hand()).toContain(id);
    }
  });

  // Expected: the Mulligan is a step of setup (110–118) that each player performs once; once play has
  // begun (118) there is no such action any more, so a `mulligan` move must be refused. Actual: the
  // move's gate reads the setup record, and once play starts that record is gone — the condition then
  // ALLOWS the move, so a mid-game "mulligan" (draw N, tuck N under the deck) is accepted.
  test("after 118 (play has begun) a mulligan move from either seat must be refused — the engine accepts it once the setup record is cleared", async () => {
    const pg = await pregameThroughOpeningDraw();
    expect(pg.move("mulligan", P1, { keepCards: [] })).toBe(true);
    expect(pg.move("mulligan", P2, { keepCards: [] })).toBe(true);
    expect(pg.move("transitionToPlay", P1)).toBe(true);
    expect(pg.engine.getState().status).toBe("playing");
    const p1Hand = [...pg.hand(P1)];
    expect(pg.move("mulligan", P1, { keepCards: [p1Hand[0]] })).toBe(false);
    expect(pg.move("mulligan", P2, { keepCards: [] })).toBe(false);
    expect(pg.hand(P1)).toEqual(p1Hand);
  });
});
