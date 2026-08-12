/**
 * Interaction (Bo3 game 2 vs a Claude seat): the two pregame windows the bot must not stall in —
 * the sideboard swap window and the Mulligan — and what each seat is allowed to know.
 *   Bottled Constellation (ven-067-166) · Gear · Mind · 10 + [mind][mind]
 *     "At the start of your Main Phase, you may kill 3 other friendly units and/or gear to score 1 point."
 *     — the Claude seat's main deck is 40 copies of it, so its opening four is four 10-cost gears:
 *       exactly the hand a player would want to mulligan.
 *   Sideboard (Claude's, registered): Fallen Feline (ven-132-166) · Find Your Center (ogn-047-298).
 *
 * Question.
 *   (a) Sideboard phase: the app never asks the model to sideboard — does the Claude seat lock in
 *       immediately with a no-change swap so the phase completes as soon as the HUMAN locks, and is the
 *       human ever blocked waiting on a seat that will never answer?
 *   (b) Does the human's pregame payload ever name Claude's sideboard cards, and does
 *       `describeDeckForSeat` give Claude — and only Claude — its own post-sideboard list?
 *   (c) Mulligan (117): is the decision raised for the Claude seat, who answers it, is a SECOND
 *       mulligan from that seat refused, and does "keep all four" count as a completed mulligan?
 *   (d) Are the set-aside cards recycled to the bottom (117.3 / 416) with the resulting deck order
 *       Secret to BOTH seats — including each seat's own deck — and does play then begin (118) with no
 *       state in which each side is waiting on the other?
 *
 * Rules: 117, 117.1, 117.2, 117.3, 416, 118, 128.3, 128.4, 486.6.
 *
 * The engine-side shape of 117 (a per-seat Decision, in turn order, over that seat's own four cards,
 * unanswerable by the opponent) is covered by mulligan-turn-order-seat2-own-decision and
 * setup-bf-simultaneous-then-mulligan-redact. THIS file asserts the app path a Bo3-vs-Claude session
 * actually takes: `pregame.ts` + `ai-opponent.ts`, driven exactly as the browser drives them.
 */
import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { P1, P2 } from "../../../harness";
import {
  ClaudeOpponent,
  type CallModel,
  type ModelRequest,
  describeDeckForSeat,
  systemPromptFor,
} from "../../../../../../apps/riftbound-app/server/ai-opponent";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import {
  buildPregamePayload,
  createGameFromDecks,
  handlePregameMessage,
  runBotPregame,
  selectBattlefield,
  sideboardWindowOpen,
} from "../../../../../../apps/riftbound-app/server/pregame";
import { buildGameSnapshot } from "../../../../../../apps/riftbound-app/server/snapshot";
import type { GameSession, WsData } from "../../../../../../apps/riftbound-app/server/state";

const BOTTLED_CONSTELLATION = "ven-067-166";
const FALLEN_FELINE = "ven-132-166";
const FIND_YOUR_CENTER = "ogn-047-298";

const HUMAN_DECK = { ...buildDefaultDeck(), sideboardCardIds: ["ogn-005-298", "ogn-008-298"] };
const CLAUDE_DECK = {
  ...buildDefaultDeck("calm", "order"),
  mainDeckCardIds: Array.from({ length: 40 }, () => BOTTLED_CONSTELLATION),
  sideboardCardIds: [FALLEN_FELINE, FIND_YOUR_CENTER],
};
const FAKE_KEY = "sk-ant-api03-testkeytestkey";

let seq = 0;

interface SnapshotCard {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly definitionId: string;
  readonly cardType: string;
}
type Snapshot = { zones?: Record<string, SnapshotCard[]> } & Record<string, unknown>;

const zoneOf = (snap: Snapshot, zone: string, owner: string): SnapshotCard[] =>
  (snap.zones?.[zone] ?? []).filter((c) => c.owner === owner);

/** A Bo3 GAME 2 whose seat 2 is a Claude opponent; game 1's loser (the bot) chooses who goes first. */
function game2(): { session: GameSession; calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  const callModel: CallModel = async (req) => {
    calls.push(req);
    return { input: { index: 0, rationale: "fine" }, name: "choose" };
  };
  const session = createGameFromDecks(HUMAN_DECK, CLAUDE_DECK, `claude-sb-${++seq}`, {
    gameMode: "match",
    gameNumber: 2,
    initiative: { afterGame: 1, chooser: P2, kind: "loser_chooses" },
    names: { [P1]: "Alice", [P2]: "Claude Haiku 4.5" },
    sandbox: true,
  });
  session.opponent = new ClaudeOpponent("haiku", FAKE_KEY, { backoffMs: 0, callModel, lookupTools: [], pacingMs: 0 });
  return { calls, session };
}

function fakeGameWs(session: GameSession, playerId: string) {
  const sent: Record<string, unknown>[] = [];
  const connId = `c-${++seq}`;
  const ws = {
    close() { /* no-op */ },
    data: { connId, gameId: "g", playerId } as WsData,
    send(s: string) { sent.push(JSON.parse(s) as Record<string, unknown>); },
  } as unknown as ServerWebSocket<WsData>;
  session.clients.set(connId, { playerId, ws });
  return { sent, ws };
}

/** Bot battlefield → human battlefield → the sideboard window is open with the bot already locked. */
async function atSideboard(): Promise<{ session: GameSession; calls: ModelRequest[] }> {
  const { calls, session } = game2();
  await runBotPregame(session);
  expect(selectBattlefield(session, P1, HUMAN_DECK.battlefieldIds[0] as string)).toMatchObject({ ok: true });
  await runBotPregame(session);
  expect(session.pregame?.phase).toBe("sideboard");
  return { calls, session };
}

/** …then the human locks too, so the bot answers the initiative step and the Mulligan opens. */
async function atMulligan(): Promise<{ session: GameSession; calls: ModelRequest[]; me: ReturnType<typeof fakeGameWs> }> {
  const { calls, session } = await atSideboard();
  const me = fakeGameWs(session, P1);
  expect(handlePregameMessage(me.ws, { type: "sideboard_lock" }, session, "g", P1)).toBe(true);
  await runBotPregame(session);
  expect(session.pregame?.phase).toBe("mulligan");
  return { calls, me, session };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// (a) the sideboard window
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe("(a) the Claude seat locks a no-change sideboard the moment the window opens", () => {
  test("the window is a BETWEEN-games one: closed for game 1, open for game 2", async () => {
    expect(sideboardWindowOpen({ gameNumber: 1 })).toBe(false);
    expect(sideboardWindowOpen({ gameNumber: 2 })).toBe(true);
    expect(sideboardWindowOpen({ gameNumber: 1, sideboardBeforeGame1: true })).toBe(true);
  });

  test("the bot's lock is recorded BEFORE the human's — the human never waits on a seat that will not answer", async () => {
    const { session } = await atSideboard();
    expect(session.pregame?.sideboard?.[P2]?.locked).toBe(true);
    expect(session.pregame?.sideboard?.[P1]?.locked).toBe(false);
    expect(session.pregame?.handsDrawn).toBe(false);
  });

  test("sideboarding costs ZERO model calls — the only call this pregame made was the battlefield pick", async () => {
    const { calls, session } = await atSideboard();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.meta.menu).toHaveLength(3);
    await runBotPregame(session); // idempotent: no second lock, no second call
    expect(calls).toHaveLength(1);
    expect(session.pregame?.phase).toBe("sideboard");
  });

  test("the human's lock completes the phase immediately — no path leaves 'sideboard' with only one seat locked", async () => {
    const { session } = await atMulligan();
    expect(session.pregame?.sideboard?.[P1]?.locked).toBe(true);
    expect(session.pregame?.sideboard?.[P2]?.locked).toBe(true);
    expect(session.pregame?.phase).toBe("mulligan");
    expect(session.pregame?.firstPlayer).toBe(P2); // the bot also answered its 'loser chooses' step
    expect(session.pregame?.handsDrawn).toBe(true);
  });

  test("the bot's lock really is a NO-CHANGE swap: its post-sideboard main deck is its registered one and the sideboard is untouched", async () => {
    const { session } = await atMulligan();
    const after = session.postSideboardDecks?.[P2];
    expect(after).toBeDefined();
    expect(after?.mainDeckCardIds.toSorted()).toEqual([...CLAUDE_DECK.mainDeckCardIds].toSorted());
    expect(after?.sideboardCardIds?.toSorted()).toEqual([FALLEN_FELINE, FIND_YOUR_CENTER].toSorted());
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// (b) whose list each side is told about
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe("(b) 128.4 — a seat's registered private list is its own", () => {
  test("the human's sideboard payload carries its OWN rows and an opponent block with no sideboard at all", async () => {
    const { session } = await atSideboard();
    const payload = buildPregamePayload(session, P1) as {
      you: { side: { name: string }[]; main: unknown[]; locked: boolean };
      opponent: Record<string, unknown>;
    };
    expect(payload.you.locked).toBe(false);
    expect(payload.you.side).toHaveLength(HUMAN_DECK.sideboardCardIds.length);
    expect(payload.you.main.length).toBeGreaterThan(0);
    expect(Object.keys(payload.opponent).toSorted()).toEqual(["battlefields", "champion", "id", "legend", "name", "status"]);
    expect(payload.opponent.status).toBe("locked");
  });

  test("Claude's sideboard ids and names never reach the human's payload", async () => {
    const { session } = await atSideboard();
    const blob = JSON.stringify(buildPregamePayload(session, P1));
    for (const id of [FALLEN_FELINE, FIND_YOUR_CENTER]) {
      expect(blob).not.toContain(id);
    }
    expect(blob).not.toContain("Fallen Feline");
    expect(blob).not.toContain("Find Your Center");
  });

  test("describeDeckForSeat gives the Claude seat its OWN list, sideboard included, and the system prompt carries it", async () => {
    const { session } = await atSideboard();
    const mine = describeDeckForSeat(session, P2) as string;
    expect(mine).toContain("40× Bottled Constellation");
    expect(mine).toContain("Sideboard (not in play): 1× Fallen Feline, 1× Find Your Center");
    expect(systemPromptFor(session, P2, "Claude Haiku 4.5")).toContain("Sideboard (not in play): 1× Fallen Feline");
  });

  test("…and nothing of the HUMAN's list: the human's own description names neither of Claude's sideboard cards, and Claude's names none of the human's", async () => {
    const { session } = await atSideboard();
    const human = describeDeckForSeat(session, P1) as string;
    expect(human).not.toContain("Fallen Feline");
    expect(human).not.toContain("Find Your Center");
    const claude = describeDeckForSeat(session, P2) as string;
    for (const id of HUMAN_DECK.sideboardCardIds) {
      expect(claude).not.toContain(id);
    }
  });

  test("it prefers the POST-sideboard list once the window has closed", async () => {
    const { session } = await atMulligan();
    expect(session.postSideboardDecks?.[P2]).toBeDefined();
    const mine = describeDeckForSeat(session, P2) as string;
    expect(mine).toContain("Bottled Constellation");
    expect(mine).toContain("Sideboard (not in play):");
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// (c) the Mulligan
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe("(c) 117 — the Mulligan is answered for both seats without a model call", () => {
  test("the phase opens with hands dealt (four each, four Bottled Constellations for Claude) and neither seat marked complete", async () => {
    const { session } = await atMulligan();
    expect(session.pregame?.mulliganComplete.size).toBe(0);
    const spectator = buildGameSnapshot(session) as Snapshot;
    expect(zoneOf(spectator, "hand", P1)).toHaveLength(4);
    const botHand = zoneOf(spectator, "hand", P2);
    expect(botHand).toHaveLength(4);
    expect(botHand.every((c) => c.definitionId === BOTTLED_CONSTELLATION)).toBe(true);
  });

  test("the human's answer completes the bot's too (no model call) and the game starts: status playing, turn 1, no pregame left", async () => {
    const { calls, me, session } = await atMulligan();
    handlePregameMessage(me.ws, { sendBack: [], type: "pregame_mulligan" }, session, "g", P1);
    expect(session.pregame).toBeUndefined(); // both seats' mulligans completed by that one message
    // Exactly ONE pregame model call was ever made — the battlefield pick. Neither the sideboard nor
    // the mulligan asked the model anything (any later call is the seat playing turn 1).
    expect(calls.filter((c) => /^PREGAME/.test(String(c.messages[0]?.content ?? "")))).toHaveLength(1);
    expect(session.pregame).toBeUndefined();
    expect(session.engine.getState().status).toBe("playing");
    expect(session.engine.getState().turn?.number).toBe(1);
    expect(session.engine.getState().turn?.activePlayer).toBe(P2); // the bot chose to go first
  });

  test("'keep all four' IS a completed mulligan (117.1 is 'up to two'): nothing is recycled or redrawn, both seats are logged, and setup moves on", async () => {
    const { me, session } = await atMulligan();
    const before = zoneOf(buildGameSnapshot(session) as Snapshot, "hand", P1).map((c) => c.id);
    handlePregameMessage(me.ws, { sendBack: [], type: "pregame_mulligan" }, session, "g", P1);
    // P1 is the SECOND player here, so its four cards are untouched; the turn player has since drawn.
    expect(zoneOf(buildGameSnapshot(session) as Snapshot, "hand", P1).map((c) => c.id)).toEqual(before);
    expect(session.log.filter((e) => /finalized mulligan \(0 recycled, 0 redrawn\)/.test(e.text))).toHaveLength(2);
    expect(session.pregame).toBeUndefined();
  });

  test("a mulligan from a seat already marked complete is refused: no move, no log line, no second redraw", async () => {
    const { me, session } = await atMulligan();
    session.pregame!.mulliganComplete.add(P1); // as if this seat had already answered
    const hand = zoneOf(buildGameSnapshot(session) as Snapshot, "hand", P1).map((c) => c.id);
    const logLen = session.log.length;
    handlePregameMessage(me.ws, { sendBack: hand.slice(0, 2), type: "pregame_mulligan" }, session, "g", P1);
    expect(session.log).toHaveLength(logLen);
    expect(zoneOf(buildGameSnapshot(session) as Snapshot, "hand", P1).map((c) => c.id)).toEqual(hand);
    expect(session.pregame?.phase).toBe("mulligan"); // still waiting for the other seat
  });

  test("…and once BOTH are complete the pregame is gone, so a late mulligan message is not handled at all", async () => {
    const { me, session } = await atMulligan();
    handlePregameMessage(me.ws, { sendBack: [], type: "pregame_mulligan" }, session, "g", P1);
    expect(session.pregame).toBeUndefined();
    const hand = zoneOf(buildGameSnapshot(session) as Snapshot, "hand", P1).map((c) => c.id);
    expect(handlePregameMessage(me.ws, { sendBack: hand.slice(0, 2), type: "pregame_mulligan" }, session, "g", P1)).toBe(false);
    expect(zoneOf(buildGameSnapshot(session) as Snapshot, "hand", P1).map((c) => c.id)).toEqual(hand);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// (d) recycle to the bottom, and how secret the resulting order is
// ═════════════════════════════════════════════════════════════════════════════════════════════════

describe("(d) 117.2 / 117.3 / 416 / 128.3 — the redraw, the bottom of the deck, and who may see the order", () => {
  test("sending two back draws two replacements and recycles the set-aside pair to the BOTTOM of the deck", async () => {
    const { me, session } = await atMulligan();
    const before = zoneOf(buildGameSnapshot(session) as Snapshot, "hand", P1).map((c) => c.id);
    const sentBack = before.slice(0, 2);
    handlePregameMessage(me.ws, { sendBack: sentBack, type: "pregame_mulligan" }, session, "g", P1);

    const snap = buildGameSnapshot(session) as Snapshot;
    const hand = zoneOf(snap, "hand", P1).map((c) => c.id);
    expect(hand).toHaveLength(4);
    expect(hand.filter((id) => sentBack.includes(id))).toEqual([]); // 117.2 — two fresh cards
    const deck = zoneOf(snap, "mainDeck", P1).map((c) => c.id);
    expect(deck.slice(-2).toSorted()).toEqual([...sentBack].toSorted()); // 117.3 / 416 — bottom
  });

  test("the OPPONENT's deck and hand are redacted in the human's snapshot — placeholders with no identity (128.3 / 128.4)", async () => {
    const { session } = await atMulligan();
    const mine = buildGameSnapshot(session, P1) as Snapshot;
    const theirDeck = zoneOf(mine, "mainDeck", P2);
    expect(theirDeck.length).toBeGreaterThan(0);
    expect(theirDeck.every((c) => c.name === "Hidden card" && c.definitionId === "")).toBe(true);
    expect(zoneOf(mine, "hand", P2).every((c) => c.name === "Hidden card")).toBe(true);
    expect(JSON.stringify(theirDeck)).not.toContain(BOTTLED_CONSTELLATION);
  });

  test("deck order is Secret to its OWNER too — the human's own snapshot enumerates its whole Main Deck, in order, card by card (128.3 / 108.4.d)", async () => {
    // Expected (128.3 + 108.4.d, asserted for the engine's own views in
    // setup-bf-simultaneous-then-mulligan-redact: "even P1's own view lists no deck order"): a seat may
    // know its LIST, never its draw order. Actual: `buildGameSnapshot`'s redaction only hides private
    // zones whose owner is NOT the viewer, so the viewer's `zones.mainDeck` ships every card's id,
    // definitionId, name and rules text in draw order — including, right after a mulligan, exactly
    // where the two recycled cards went.
    const { session } = await atMulligan();
    const mine = buildGameSnapshot(session, P1) as Snapshot;
    const ownDeck = zoneOf(mine, "mainDeck", P1);
    expect(ownDeck.length).toBeGreaterThan(0);
    expect(ownDeck.every((c) => c.name === "Hidden card" && c.definitionId === "")).toBe(true);
  });

  test("118 — play begins with nobody waiting: no pregame, status playing, and both seats have a live snapshot", async () => {
    const { me, session } = await atMulligan();
    handlePregameMessage(me.ws, { sendBack: [], type: "pregame_mulligan" }, session, "g", P1);
    expect(session.pregame).toBeUndefined();
    expect(session.engine.getState().status).toBe("playing");
    expect(session.engine.getState().turn?.activePlayer).toBe(P2);
    // The first player has already taken its Draw Step for turn 1; the second seat still holds its four.
    expect(zoneOf(buildGameSnapshot(session, P2) as Snapshot, "hand", P2)).toHaveLength(5);
    expect(zoneOf(buildGameSnapshot(session, P1) as Snapshot, "hand", P1)).toHaveLength(4);
  });
});
