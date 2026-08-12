/**
 * Interaction: hot seat (Goldfish — active) — ONE human drives both seats over one socket,
 * and each `switch_seat` must hand back THAT seat's own redacted view.
 *
 *   Swift Scout (ogn-263-298) · Legend
 *     "You may pay [1] to hide a card with [Hidden] instead of [rainbow].
 *      [1], [Exhaust]: Put a Teemo unit you own into your hand …"
 *   Block (ogn-057-298) · Spell 2 · [Hidden] [Action] · "Give a unit [Shield 3] and [Tank] this turn."
 *   Spiderling (ven-097-166) · Unit 3 · 1 [Might] · "[Hidden] … +1 [Might] for each other
 *      unit you control here with my name."
 *
 * Rules: 128.3 (Secret: NO player may look — the Main Deck's order, 108.4.d) ·
 * 128.4 (Private: only the controller of a facedown card may read it, whoever owns it) ·
 * 128.5 (Public) · 421.4 (a played/revealed hidden card becomes public) ·
 * 811.3 (a [Hidden] card may instead be played as normal) · 424.2.b (showing private
 * information is a choice of its holder, never a side effect of the client binding).
 *
 * Q: (a) does each switch_seat return the newly-bound seat's OWN view — its facedown named,
 *        the other seat's an opaque stand-in — or does hot seat fall back to the unredacted
 *        sandbox view because both seats are the same person?
 *    (b) does the sync also carry that seat's moves + pregame payload, so seat 2 can answer
 *        its own pregame prompts without reconnecting?
 *    (c) when Block is flipped and resolves, is it public in BOTH views while the still-hidden
 *        Spiderling stays private on the very next switch back?
 *    (d) is switch_seat refused (NOT_HOT_SEAT) in a duel and in a vs-Claude session?
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { createGameFromDecks, handlePregameMessage } from "../../../../../../apps/riftbound-app/server/pregame";
import type { GameSession, WsData } from "../../../../../../apps/riftbound-app/server/state";
import { gameSessions } from "../../../../../../apps/riftbound-app/server/state";
import { gameWsMessage } from "../../../../../../apps/riftbound-app/server/ws-game";

const SWIFT_SCOUT = "ogn-263-298";
const BLOCK = "ogn-057-298";
const SPIDERLING = "ven-097-166";

interface ZoneCard { id: string; definitionId: string; name: string; owner: string; cardType: string }
interface Frame {
  type: string;
  seat?: string;
  hotSeat?: boolean;
  seq?: number;
  moves?: unknown[];
  pregame?: { battlefieldOptions?: { id: string }[]; phase?: string } | null;
  errorCode?: string;
  state?: { zones: Record<string, ZoneCard[]> };
}

/** Seat 1's legend is Swift Scout; each seat holds a battlefield with a unit of its own. */
function board() {
  return scenario()
    .active(P1)
    .resources(P1, { energy: 2 })
    .legend(P1, SWIFT_SCOUT, "scout")
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "Scout Guard" }, "g1")
    .unit(P2, "bf2", { might: 2, name: "Spider Nest" }, "g2")
    .facedown(P2, "bf2", SPIDERLING, "spiderling")
    .hand(P1, BLOCK, "block")
    .hand(P2, "ogn-058-298", "p2card");
}

const made: string[] = [];
afterEach(() => {
  for (const id of made.splice(0)) {
    gameSessions.delete(id);
  }
});

/** One socket, bound to P1, on a session of the given kind. */
function seatedSocket(engine: unknown, kind: "hot-seat" | "duel" | "vs-claude") {
  const gameId = `hotseat-${made.length}-${Math.random().toString(36).slice(2)}`;
  const frames: Frame[] = [];
  const session: GameSession = {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Seat 1", [P2]: "Seat 2" },
    players: [P1, P2],
    sandbox: kind !== "duel",
    seq: 0,
  };
  if (kind === "hot-seat") {
    session.hotSeat = true;
  }
  if (kind === "vs-claude") {
    session.opponent = { info: { kind: "claude", label: "Claude Haiku 4.5", model: "haiku" }, thinking: false } as unknown as GameSession["opponent"];
  }
  const ws = {
    close: () => undefined,
    data: { connId: `only-${gameId}`, gameId, playerId: P1 },
    send: (s: string) => { frames.push(JSON.parse(s) as Frame); },
  } as unknown as ServerWebSocket<WsData>;
  session.clients.set(`only-${gameId}`, { playerId: P1, ws });
  gameSessions.set(gameId, session);
  made.push(gameId);
  const send = (msg: Record<string, unknown>) => { gameWsMessage(ws, msg); };
  return {
    frames,
    gameId,
    last: (type?: string) => [...frames].reverse().find((f) => !type || f.type === type),
    send,
    session,
    switchTo: (seat: string): Frame => {
      send({ playerId: seat, type: "switch_seat" });
      return [...frames].reverse().find((f) => f.type === "sync" || f.type === "error") as Frame;
    },
    ws,
  };
}

const zonesOf = (f: Frame) => f.state?.zones ?? {};
const facedown = (f: Frame, bf: string): ZoneCard[] => zonesOf(f)[`facedown-${bf}`] ?? [];
const handOf = (f: Frame, owner: string): ZoneCard[] => (zonesOf(f).hand ?? []).filter((c) => c.owner === owner);

describe("(a) each switch_seat returns that seat's own redacted view", () => {
  test("bound to seat 1: its Block is named, seat 2's Spiderling is an opaque stand-in with no defId, name or telling instance id (128.4)", async () => {
    const game = await board().build();
    await game.p1.hide("block", "bf1"); // Swift Scout: [1] instead of [rainbow]
    const c = seatedSocket(game.engine, "hot-seat");

    const sync = c.switchTo(P1);
    expect(sync).toMatchObject({ hotSeat: true, seat: P1, type: "sync" });
    expect(facedown(sync, "bf1")[0]).toMatchObject({ definitionId: BLOCK, id: "block", owner: P1 });
    const theirs = facedown(sync, "bf2")[0];
    expect(theirs).toMatchObject({ cardType: "unknown", definitionId: "", name: "Hidden card", owner: P2 });
    expect(theirs?.id).toBe("hidden-facedown-bf2-player-2-0");
    expect(JSON.stringify(zonesOf(sync))).not.toContain(SPIDERLING);
    expect(JSON.stringify(zonesOf(sync))).not.toContain("Spiderling");
  });

  test("bound to seat 2 the two swap over — hot seat is explicitly redacted, not the unredacted sandbox view", async () => {
    const game = await board().build();
    await game.p1.hide("block", "bf1");
    const c = seatedSocket(game.engine, "hot-seat");

    const sync = c.switchTo(P2);
    expect(sync).toMatchObject({ hotSeat: true, seat: P2 });
    expect(facedown(sync, "bf2")[0]).toMatchObject({ definitionId: SPIDERLING, id: "spiderling", owner: P2 });
    expect(facedown(sync, "bf1")[0]).toMatchObject({ definitionId: "", name: "Hidden card", owner: P1 });
    expect(JSON.stringify(zonesOf(sync))).not.toContain(BLOCK);
  });

  test("hands follow the same rule: the bound seat reads its own, the other seat's are opaque", async () => {
    const game = await board().build();
    const c = seatedSocket(game.engine, "hot-seat");

    const one = c.switchTo(P1);
    expect(handOf(one, P1).map((h) => h.definitionId)).toEqual([BLOCK]);
    expect(handOf(one, P2).every((h) => h.definitionId === "" && h.name === "Hidden card")).toBe(true);

    const two = c.switchTo(P2);
    expect(handOf(two, P2).map((h) => h.definitionId)).toEqual(["ogn-058-298"]);
    expect(handOf(two, P1).every((h) => h.definitionId === "")).toBe(true);
    // The socket really re-bound — the server-side client entry moved with it.
    expect(c.ws.data.playerId).toBe(P2);
    expect(c.session.clients.get(`only-${c.gameId}`)?.playerId).toBe(P2);
  });

  test("a seat's OWN Main Deck order is Secret to everyone (108.4.d / 128.3), but the sync ships that seat its own deck in order", async () => {
    // Expected: mainDeck entries are opaque for BOTH bindings — nobody may read the order.
    // Actual: `isPrivateZone` is only enforced against the OTHER owner, so the bound seat
    // receives its own deck's definition ids, in deck order, on the wire.
    const game = await board().build();
    const c = seatedSocket(game.engine, "hot-seat");
    const one = c.switchTo(P1);
    const ownDeck = (zonesOf(one).mainDeck ?? []).filter((card) => card.owner === P1);
    expect(ownDeck.length).toBeGreaterThan(0);
    expect(ownDeck.every((card) => card.definitionId === "")).toBe(true);
  });

  test("the other seat's deck IS opaque in both bindings", async () => {
    const game = await board().build();
    const c = seatedSocket(game.engine, "hot-seat");
    const one = c.switchTo(P1);
    expect((zonesOf(one).mainDeck ?? []).filter((card) => card.owner === P2).every((card) => card.definitionId === "")).toBe(true);
    const two = c.switchTo(P2);
    expect((zonesOf(two).mainDeck ?? []).filter((card) => card.owner === P1).every((card) => card.definitionId === "")).toBe(true);
  });
});

describe("(b) the sync carries the newly-bound seat's moves and pregame payload", () => {
  test("in a running game: hotSeat, seat, seq, moves and a (null) pregame all ride on the same frame", async () => {
    const game = await board().build();
    const c = seatedSocket(game.engine, "hot-seat");
    const sync = c.switchTo(P2);
    expect(sync.type).toBe("sync");
    expect(sync).toMatchObject({ hotSeat: true, seat: P2 });
    expect(typeof sync.seq).toBe("number");
    expect(Array.isArray(sync.moves)).toBe(true);
    expect(sync.pregame ?? null).toBeNull(); // no pregame is open
    expect(sync.state).toBeDefined();
  });

  test("during the pregame: switching to seat 2 returns SEAT 2's battlefield options, and its own pick then goes through the ordinary handler", () => {
    const gameId = `hotseat-pregame-${made.length}-${Math.random().toString(36).slice(2)}`;
    const session = createGameFromDecks(buildDefaultDeck("fury", "body"), buildDefaultDeck("calm", "mind"), gameId, {
      firstPlayer: P1,
      gameMode: "match",
      hotSeat: true,
      names: { [P1]: "Seat 1", [P2]: "Seat 2" },
      sandbox: true,
    });
    gameSessions.set(gameId, session);
    made.push(gameId);
    const frames: Frame[] = [];
    const ws = {
      close: () => undefined,
      data: { connId: `only-${gameId}`, gameId, playerId: P1 },
      send: (s: string) => { frames.push(JSON.parse(s) as Frame); },
    } as unknown as ServerWebSocket<WsData>;
    session.clients.set(`only-${gameId}`, { playerId: P1, ws });

    expect(session.pregame?.phase).toBe("battlefield_select");
    expect(session.pregame?.sandbox).toBe(false); // hot seat: BOTH seats answer for themselves

    // Seat 1 (the current binding) picks first.
    const ownOptions = session.pregame?.battlefieldOptions[P1] ?? [];
    handlePregameMessage(ws, { battlefieldId: ownOptions[0], type: "pregame_battlefield_select" }, session, gameId, P1);
    expect(session.pregame?.battlefieldSelections[P1]).toBe(ownOptions[0] as string);

    gameWsMessage(ws, { playerId: P2, type: "switch_seat" });
    const sync = [...frames].reverse().find((f) => f.type === "sync") as Frame;
    expect(sync).toMatchObject({ hotSeat: true, seat: P2 });
    const offered = (sync.pregame?.battlefieldOptions ?? []).map((b) => b.id);
    expect(offered).toEqual(session.pregame?.battlefieldOptions[P2] ?? []);
    // The payload is SEAT 2's: seat 1's pick is not reported as this seat's selection.
    expect((sync.pregame as { battlefieldSelected?: string | null } | null)?.battlefieldSelected ?? null).toBeNull();

    // Seat 2 answers through the ordinary per-seat pregame handler, no reconnect.
    handlePregameMessage(ws, { battlefieldId: offered[0], type: "pregame_battlefield_select" }, session, gameId, ws.data.playerId);
    expect(session.pregame?.battlefieldSelections[P2]).toBe(offered[0]);
    expect(ws.data.playerId).toBe(P2);
  });
});

describe("(c) revealing one facedown card does not un-redact the zone", () => {
  test("the flipped Block is public in BOTH views; the untouched Spiderling is still Private on the very next switch", async () => {
    const game = await board().build();
    await game.p1.hide("block", "bf1");
    await game.advanceTurn(); // 811: hidden now, react LATER
    await game.advanceTurn();
    expect(game.turnPlayer()).toBe(P1);

    await game.p1.reveal("block"); // 811.3 / 421.4 — flipping it makes it public
    await game.settle();
    expect(game.zoneOf("block")).toBe("trash");

    const c = seatedSocket(game.engine, "hot-seat");
    const asOne = c.switchTo(P1);
    const asTwo = c.switchTo(P2);
    const trashIds = (f: Frame) => (zonesOf(f).trash ?? []).map((card) => card.definitionId);
    expect(trashIds(asOne)).toContain(BLOCK); // 128.5 — public in the trash
    expect(trashIds(asTwo)).toContain(BLOCK);

    // …and the other hidden card is untouched: still an opaque token for the seat that
    // does not control it, and still readable by the seat that does.
    expect(facedown(asOne, "bf2")[0]).toMatchObject({ definitionId: "", name: "Hidden card" });
    expect(facedown(asTwo, "bf2")[0]).toMatchObject({ definitionId: SPIDERLING, id: "spiderling" });
  });
});

describe("(d) switch_seat exists only in hot seat", () => {
  test("vs-Claude: refused with NOT_HOT_SEAT and the socket keeps its seat — a human can never rebind to the Claude seat and read its hand", async () => {
    const game = await board().build();
    const c = seatedSocket(game.engine, "vs-claude");
    const reply = c.switchTo(P2);
    expect(reply).toMatchObject({ errorCode: "NOT_HOT_SEAT", type: "error" });
    expect(c.ws.data.playerId).toBe(P1);
    expect(c.session.clients.get(`only-${c.gameId}`)?.playerId).toBe(P1);
    expect(c.frames.some((f) => f.type === "sync")).toBe(false);
  });

  test("duel: same refusal", async () => {
    const game = await board().build();
    const c = seatedSocket(game.engine, "duel");
    expect(c.switchTo(P2)).toMatchObject({ errorCode: "NOT_HOT_SEAT", type: "error" });
    expect(c.ws.data.playerId).toBe(P1);
  });

  test("hot seat still refuses an unknown seat (BAD_SEAT) without moving the binding", async () => {
    const game = await board().build();
    const c = seatedSocket(game.engine, "hot-seat");
    expect(c.switchTo("player-9")).toMatchObject({ errorCode: "BAD_SEAT", type: "error" });
    expect(c.ws.data.playerId).toBe(P1);
  });
});
