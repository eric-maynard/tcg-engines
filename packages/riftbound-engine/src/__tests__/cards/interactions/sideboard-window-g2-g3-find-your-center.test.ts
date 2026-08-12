/**
 * Interaction: the Bo3 sideboard window × cards that read the CURRENT game's
 * Victory Score.
 *
 *   Find Your Center (ogn-047-298) — "[Action] If an opponent's score is within
 *     3 points of the Victory Score, this costs [2] less. Draw 1 and channel 1
 *     rune exhausted."   (base cost [3])
 *   Aspirant's Climb  (ogn-276-298) — battlefield: "Increase the points needed
 *     to win the game by 1."
 *   Chem-Baroness     (sfd-201-221) — legend: "While your score is within 3
 *     points of the Victory Score, your Gold [ADD] an additional [1]."
 *
 * Q: (a) is there a sideboard window before game 1?  (b) where does it sit in
 * game 2's pregame, and what must a legal swap look like?  (c) with BOTH scores
 * at 5, are the two cards' "within 3 of the Victory Score" clauses live — in
 * game 1 (Aspirant's Climb in play, VS 9) versus game 2 (Climb gone, VS 8)?
 * (d) does game 3 sideboard from the REGISTERED lists or from game 2's
 * post-swap lists?  (e) what must be refused, and what must never appear in
 * the opponent's view?
 *
 * Rules: 486.5 (a won game's battlefields are removed for the rest of the
 * match), 486.6 (Bo3: reset, remove the battlefields in play, choose new ones),
 * 485.3 / 486.3 (Victory Score 8), 194.3.a (card effects and modes may alter
 * the Victory Score — so it is a LIVE, board-derived value), 485.3, 103.2.b
 * (≤3 copies of a name, counted across champion + main deck + sideboard),
 * 128.4 (Private: a seat's own lists only).
 *
 * Halves (c) run on the engine harness; (a)/(b)/(d)/(e) drive the server
 * pregame + match modules that own the swap window.
 */
import { describe, expect, test } from "bun:test";
import { P1, P2, scenario } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { startNextGame } from "../../../../../../apps/riftbound-app/server/match";
import {
  advancePastReveal,
  buildPregamePayload,
  createGameFromDecks,
  lockSideboard,
  sideboardWindowOpen,
  swapSideboard,
} from "../../../../../../apps/riftbound-app/server/pregame";
import { type GameSession, getInternalSnapshot } from "../../../../../../apps/riftbound-app/server/state";

const FIND_YOUR_CENTER = "ogn-047-298";
const ASPIRANTS_CLIMB = "ogn-276-298";
const CHEM_BARONESS = "sfd-201-221";
const GOLD_TOKEN = "sfd-t03";

// ---------------------------------------------------------------------------
// (c) — Victory Score is read from the CURRENT board, never cached
// ---------------------------------------------------------------------------

/**
 * Both seats on 5 points. `climb` seats the real Aspirant's Climb as the
 * battlefield card (its static bumps every seat's victoryScoreModifier), so the
 * effective Victory Score is 9 in "game 1" and the printed 8 in "game 2".
 */
async function scored(climb: boolean) {
  return scenario()
    .points(P1, 5)
    .points(P2, 5)
    .victoryScore(8) // rule 485.3 / 486.3
    .battlefield("bf1", climb ? { controller: P1, def: ASPIRANTS_CLIMB, inert: false } : { controller: P1 })
    .unit(P1, "bf1", { might: 2 }, "anchor")
    .resources(P1, { energy: 6, power: { calm: 3 } })
    .legend(P1, CHEM_BARONESS, "baroness")
    .gear(P1, GOLD_TOKEN, "gold")
    .hand(P1, FIND_YOUR_CENTER, "fyc")
    .build();
}

describe("Victory-Score-relative cards read the game they are in", () => {
  test("(c) game 1 — Aspirant's Climb makes the Victory Score 9, so 5 is NOT within 3: Find Your Center costs its full [3]", async () => {
    const game = await scored(true);
    const before = game.p1.energy();
    await game.p1.cast("fyc");
    await game.settle();
    expect(before - game.p1.energy()).toBe(3);
  });

  test("(c) game 2 — the Climb is gone under 486.5, the Victory Score is back to 8 and 8−5=3 IS within 3: Find Your Center costs [1]", async () => {
    const game = await scored(false);
    const before = game.p1.energy();
    await game.p1.cast("fyc");
    await game.settle();
    expect(before - game.p1.energy()).toBe(1);
  });

  test("(c) Chem-Baroness's Gold bonus follows the same live value: off at VS 9, on at VS 8 — on an otherwise identical board", async () => {
    const g1 = await scored(true);
    await g1.p1.activate("gold");
    await g1.settle();
    expect(g1.p1.resources()).toEqual({ energy: 6, power: { calm: 3, rainbow: 1 } });

    const g2 = await scored(false);
    await g2.p1.activate("gold");
    await g2.settle();
    expect(g2.p1.resources()).toEqual({ energy: 7, power: { calm: 3, rainbow: 1 } });
  });
});

// ---------------------------------------------------------------------------
// (a) (b) (d) (e) — the swap window itself
// ---------------------------------------------------------------------------

const BASE = buildDefaultDeck();
/** In-identity spells the starter does not already run, used as sideboard fixtures. */
const SIDE = [FIND_YOUR_CENTER, "ogn-005-298", "ogn-008-298"].filter((id) => !BASE.mainDeckCardIds.includes(id));

function withSide(side: readonly string[]) {
  return { ...BASE, sideboardCardIds: [...side] };
}

function handOf(session: GameSession, pid: string): string[] {
  const internal = getInternalSnapshot(session.engine);
  return (internal.zones.hand?.cardIds ?? []).filter((id) => internal.cards[id]?.owner === pid);
}
function deckOf(session: GameSession, pid: string): string[] {
  const internal = getInternalSnapshot(session.engine);
  return (internal.zones.mainDeck?.cardIds ?? []).filter((id) => internal.cards[id]?.owner === pid);
}

/** A Bo3 game `n` sitting in its sideboard phase, both seats carrying `SIDE`. */
function atSideboard(n: number, seed: string): GameSession {
  const s = createGameFromDecks(withSide(SIDE), withSide(SIDE), seed, { gameMode: "match", gameNumber: n });
  s.pregame!.battlefieldSelections[P1] = BASE.battlefieldIds[0] as string;
  s.pregame!.battlefieldSelections[P2] = BASE.battlefieldIds[1] as string;
  advancePastReveal(s);
  return s;
}

describe("the sideboard window across a Bo3", () => {
  test("(a) no window before game 1: battlefield_select runs straight into the mulligan and the sideboard rides along unreachable", () => {
    expect(SIDE).toHaveLength(3);
    expect(sideboardWindowOpen({ gameNumber: 1 })).toBe(false);
    const s = createGameFromDecks(withSide(SIDE), withSide(SIDE), "fyc-g1", { gameMode: "match", gameNumber: 1 });
    expect(s.pregame?.phase).toBe("battlefield_select");
    expect(s.pregame?.sideboard).toBeUndefined();
    expect(handOf(s, P1)).toHaveLength(4); // hands already drawn — no phase to wait for
    expect(swapSideboard(s, P1, "x", "y")).toEqual({ error: "Not in the sideboard phase", ok: false });
    // Find Your Center is registered but is NOT an engine card this game.
    expect(deckOf(s, P1).some((id) => id.includes(FIND_YOUR_CENTER))).toBe(false);
    expect(s.decks?.[P1]?.sideboardCardIds).toEqual(SIDE);
  });

  test("(b) games 2 and 3 order it battlefield_select → sideboard → mulligan, and hands are NOT drawn until the swap window locks", () => {
    for (const n of [2, 3]) {
      expect(sideboardWindowOpen({ gameNumber: n })).toBe(true);
      const s = createGameFromDecks(withSide(SIDE), withSide(SIDE), `fyc-g${n}`, { gameMode: "match", gameNumber: n });
      expect(s.pregame?.phase).toBe("battlefield_select");
      expect(handOf(s, P1)).toHaveLength(0);
      s.pregame!.battlefieldSelections[P1] = BASE.battlefieldIds[0] as string;
      s.pregame!.battlefieldSelections[P2] = BASE.battlefieldIds[1] as string;
      advancePastReveal(s);
      expect(s.pregame?.phase).toBe("sideboard");
      expect(handOf(s, P1)).toHaveLength(0);
    }
  });

  test("(b) a legal 1-for-1 swap: the card swapped OUT is absent from the game-2 deck and from the opening hand; Find Your Center is in", () => {
    const s = atSideboard(2, "fyc-swap");
    const seat = s.pregame!.sideboard![P1]!;
    const outCard = seat.main[5]!;
    const inCard = seat.side.find((c) => c.defId === FIND_YOUR_CENTER)!;
    expect(swapSideboard(s, P1, outCard.id, inCard.id)).toEqual({ ok: true });

    expect(lockSideboard(s, P1).ok).toBe(true);
    expect(lockSideboard(s, P2).completed).toBe(true);
    expect(s.pregame?.phase).toBe("mulligan");

    const deck = deckOf(s, P1);
    const hand = handOf(s, P1);
    expect(deck).toHaveLength(40 - 4); // 40-card deck, opening hand of 4 (rule 116)
    expect(hand).toHaveLength(4);
    expect([...deck, ...hand]).toContain(inCard.id);
    expect([...deck, ...hand]).not.toContain(outCard.id);
    // The post-swap lists are what the next game is built from.
    expect(s.postSideboardDecks?.[P1]?.mainDeckCardIds).toContain(FIND_YOUR_CENTER);
    expect(s.postSideboardDecks?.[P1]?.sideboardCardIds).toContain(outCard.defId);
  });

  test("(d) game 2's swap is STICKY into game 3 — startNextGame builds from postSideboardDecks and overwrites session.decks, so a registered main-deck card swapped out for game 2 cannot come back", () => {
    // JUDGE CALL, pinned deliberately: organized play normally re-sideboards
    // from the REGISTERED pool each game (486.6 resets the game state, not the
    // deck registration). match.ts's `deckFor` instead resolves
    // postSideboardDecks ?? decks ?? registered and then writes the result into
    // session.decks, making each game's configuration the base for the next.
    // Both surfaces are asserted here so a deliberate change to the policy has
    // to come through this test rather than silently.
    const s = atSideboard(2, "fyc-sticky");
    const seat = s.pregame!.sideboard![P1]!;
    const outCard = seat.main[5]!;
    const inCard = seat.side.find((c) => c.defId === FIND_YOUR_CENTER)!;
    swapSideboard(s, P1, outCard.id, inCard.id);
    lockSideboard(s, P1);
    lockSideboard(s, P2);
    const registeredMain = s.registeredDecks?.[P1]?.mainDeckCardIds ?? BASE.mainDeckCardIds;
    expect(registeredMain).toContain(outCard.defId);

    startNextGame(s, undefined, { rematch: false });
    expect(s.gameNumber).toBe(3);
    // Game 3 starts from the post-swap list: Find Your Center is in the main
    // deck and the swapped-out card is only in the sideboard.
    expect(s.decks?.[P1]?.mainDeckCardIds).toContain(FIND_YOUR_CENTER);
    expect(s.decks?.[P1]?.sideboardCardIds).toContain(outCard.defId);
    expect(s.pregame?.sideboard?.[P1]?.main.some((c) => c.defId === FIND_YOUR_CENTER)).toBe(true);
    expect(s.postSideboardDecks).toBeUndefined();

    // A rematch, by contrast, resets to the registered decks and to game 1.
    startNextGame(s, undefined, { rematch: true });
    expect(s.gameNumber).toBe(1);
    expect(s.decks?.[P1]?.mainDeckCardIds).toEqual(registeredMain as string[]);
    expect(s.pregame?.sideboard).toBeUndefined(); // game 1 ⇒ no window
  });

  test("(e) illegal swaps are refused with the seat's lists unchanged: after lock, non-1-for-1, unknown ids, and the other seat's cards", () => {
    const s = atSideboard(2, "fyc-refuse");
    const seat = s.pregame!.sideboard![P1]!;
    const other = s.pregame!.sideboard![P2]!;
    const before = { main: seat.main.map((c) => c.id), side: seat.side.map((c) => c.id) };
    const mine = seat.main[3]!.id;
    const myIn = seat.side[0]!.id;

    expect(swapSideboard(s, P1, mine, undefined).ok).toBe(false); // not 1-for-1
    expect(swapSideboard(s, P1, "no-such-card", myIn).ok).toBe(false); // unknown out
    expect(swapSideboard(s, P1, mine, "no-such-card").ok).toBe(false); // unknown in
    expect(swapSideboard(s, P1, other.main[0]!.id, myIn).ok).toBe(false); // other seat's main deck
    expect(swapSideboard(s, P1, mine, other.side[0]!.id).ok).toBe(false); // other seat's sideboard
    expect({ main: seat.main.map((c) => c.id), side: seat.side.map((c) => c.id) }).toEqual(before);

    lockSideboard(s, P1);
    expect(swapSideboard(s, P1, mine, myIn)).toEqual({ error: "Sideboard already locked in", ok: false });
    expect({ main: seat.main.map((c) => c.id), side: seat.side.map((c) => c.id) }).toEqual(before);
  });

  test("(e) neither seat's pregame payload carries the opponent's main-deck or sideboard lists (128.4) — only legend / champion / this game's battlefield", () => {
    const s = atSideboard(2, "fyc-privacy");
    const seat = s.pregame!.sideboard![P1]!;
    swapSideboard(s, P1, seat.main[7]!.id, seat.side[0]!.id);

    for (const [me, them] of [[P1, P2], [P2, P1]] as const) {
      const payload = buildPregamePayload(s, me) as {
        you: { main: { id: string }[]; side: { id: string }[] } | null;
        opponent: Record<string, unknown>;
      };
      expect(payload.you?.main.every((c) => c.id.startsWith(me))).toBe(true);
      expect(payload.you?.side.every((c) => c.id.startsWith(me))).toBe(true);
      expect(Object.keys(payload.opponent).sort()).toEqual(["battlefields", "champion", "id", "legend", "name", "status"]);
      expect(JSON.stringify(payload.opponent)).not.toContain(`${them}-main-`);
      expect(JSON.stringify(payload.opponent)).not.toContain(`${them}-side-`);
    }
  });
});
