/**
 * Interaction: a facedown [Hidden] Block that survives to the end of game 1, and what the
 * match does with it once the game is won.
 *
 *   Block (ogn-057-298) · Spell 2 · [Hidden] [Action]
 *     "[Hidden] (Hide now for [rainbow] to react with later for [0].)
 *      Give a unit [Shield 3] and [Tank] this turn."
 *   Renata Glasc, Mastermind (sfd-088-221) · Unit 5 · 4 [Might]
 *     "[1][mind]: Draw 1.  [4][mind][mind][mind][mind], [Exhaust]: Score 1 point.
 *      Use my abilities only while I'm at a battlefield."
 *   Ahri, Alluring (ogn-066-298) · Unit 5 [calm] · 4 [Might] · "When I hold, you score 1 point."
 *
 * Rules: 128 / 128.4 (privacy tiers — a facedown card is Private to its controller) ·
 * 421.2.a / 421.3 (a hidden card is played face down and is private until revealed) ·
 * 421.4 (all facedown cards are revealed when the game ends) · 811 ([Hidden]: hide for
 * [rainbow], react later for [0]) · 194.1.c / 194.2 (scoring the Victory Score wins) ·
 * 319.5 (the win is noticed in the cleanup after the resolution) · 486.3 / 486.6 (a match
 * is a series of games; the game state is reset between them) · 650 (concede any time).
 *
 * Q: P1 sits on 7 of 8 with Renata at a battlefield; the opponent has a facedown Block at
 *    its own battlefield. P1 exhausts Renata for the 8th point and wins game 1.
 *    YES side — on the game-over screen, is the opponent's facedown Block face up and
 *    readable (421.4)? NO side — while the game ran, was that card absent from P1's wire
 *    frame (not merely styled face-down), and after "Continue to game 2" is game 1 — board,
 *    revealed Block, points — entirely gone, with the match score reading 1-0?
 */
import { describe, expect, test } from "bun:test";
import { afterEach, beforeEach } from "bun:test";
import type { ServerWebSocket } from "bun";
import type { Game } from "../../../harness";
import { P1, P2, scenario } from "../../../harness";
import { buildDefaultDeck } from "../../../../../../apps/riftbound-app/server/decks";
import { matchSummary } from "../../../../../../apps/riftbound-app/server/match-state";
import { noteGameState, voteContinue } from "../../../../../../apps/riftbound-app/server/match";
import { handleGameRoutes } from "../../../../../../apps/riftbound-app/server/routes-game";
import { buildGameSnapshot } from "../../../../../../apps/riftbound-app/server/snapshot";
import type { GameSession, RouteCtx, WsData } from "../../../../../../apps/riftbound-app/server/state";
import { gameSessions } from "../../../../../../apps/riftbound-app/server/state";

const BLOCK = "ogn-057-298";
const RENATA = "sfd-088-221";
const AHRI = "ogn-066-298";

/**
 * P1 on 7 of 8: Ahri + Renata hold bf2; the opponent holds bf1 with a unit and a facedown
 * Block; P1 has the [4][mind][mind][mind][mind] for Renata's score ability and a raider in base.
 */
function board() {
  return scenario()
    .active(P1)
    .points(P1, 7)
    .victoryScore(8)
    .resources(P1, { energy: 4, power: { mind: 4 } })
    .battlefield("bf1", { controller: P2 })
    .battlefield("bf2", { controller: P1 })
    .unit(P2, "bf1", { might: 2, name: "Goldfish Holder" }, "holder")
    .facedown(P2, "bf1", BLOCK, "block")
    .unit(P1, "bf2", AHRI, "ahri")
    .unit(P1, "bf2", RENATA, "renata")
    .unit(P1, "base", { might: 2, name: "Raider" }, "raider");
}

type ZoneCard = { id: string; definitionId: string; name: string; owner: string; cardType: string };

const facedownAt = (session: GameSession, viewer: string, bf: string): ZoneCard[] =>
  ((buildGameSnapshot(session, viewer).zones as Record<string, ZoneCard[]>)[`facedown-${bf}`] ?? []);

let made: string[] = [];
beforeEach(() => {
  made = [];
});
afterEach(() => {
  for (const id of made.splice(0)) {
    gameSessions.delete(id);
  }
});

/** A registered Bo3 session around a harness board. `mode` picks the redaction regime. */
function sessionFor(game: Game, mode: "duel" | "vs-claude" | "goldfish"): { gameId: string; session: GameSession; frames: Record<string, unknown>[] } {
  const gameId = `hidden-block-${made.length}-${Math.random().toString(36).slice(2)}`;
  const frames: Record<string, unknown>[] = [];
  const session: GameSession = {
    clients: new Map(),
    decks: { [P1]: buildDefaultDeck(), [P2]: buildDefaultDeck("calm", "mind") },
    engine: game.engine as GameSession["engine"],
    gameMode: "match",
    gameNumber: 1,
    log: [],
    playerNames: { [P1]: "Tester", [P2]: "Goldfish" },
    players: [P1, P2],
    sandbox: mode !== "duel",
    seq: 0,
  };
  if (mode === "vs-claude") {
    session.opponent = { info: { kind: "claude", label: "Claude Sonnet 5", model: "sonnet" }, thinking: false } as unknown as GameSession["opponent"];
  }
  for (const seat of [P1, P2]) {
    const ws = {
      close: () => undefined,
      data: { connId: `${seat}-${gameId}`, gameId, playerId: seat },
      send: (s: string) => { frames.push(JSON.parse(s) as Record<string, unknown>); },
    } as unknown as ServerWebSocket<WsData>;
    session.clients.set(`${seat}-${gameId}`, { playerId: seat, ws });
  }
  gameSessions.set(gameId, session);
  made.push(gameId);
  return { frames, gameId, session };
}

describe("facedown Block: private while game 1 runs, public when it ends, gone in game 2", () => {
  test("while the game runs the Block is Private to its controller — P1's wire frame carries no definition id, name or instance id for it (128.4 / 421.3)", async () => {
    const game = await board().build();
    const { session } = sessionFor(game, "duel");

    expect(facedownAt(session, P2, "bf1")[0]).toMatchObject({ definitionId: BLOCK, id: "block", owner: P2 });
    const seen = facedownAt(session, P1, "bf1");
    expect(seen).toHaveLength(1); // the SLOT is public: everyone sees a card was hidden there
    expect(seen[0]).toMatchObject({ cardType: "unknown", definitionId: "", name: "Hidden card", owner: P2 });

    const wire = JSON.stringify(buildGameSnapshot(session, P1));
    expect(wire).not.toContain(BLOCK);
    expect(wire).not.toContain("Block");
    expect(wire).not.toContain('"block"');
  });

  test("vs-Claude redacts it the same way; a passive-Goldfish sandbox (one human on both seats) deliberately does not", async () => {
    const game = await board().build();
    expect(facedownAt(sessionFor(game, "vs-claude").session, P1, "bf1")[0]).toMatchObject({ definitionId: "", name: "Hidden card" });
    // DESIGN: `redactFor` is set for duel / vs-Claude / hot seat only — in a plain sandbox
    // the one human drives BOTH seats, so hiding a seat's own card from itself is pointless.
    expect(facedownAt(sessionFor(game, "goldfish").session, P1, "bf1")[0]).toMatchObject({ definitionId: BLOCK, id: "block" });
  });

  test("[Hidden] Block is offered to its controller for [0] inside a showdown, and never to the opponent (811 / 421.2.a)", async () => {
    const game = await board().build();
    await game.p1.move("raider", "bf1"); // opens a combat showdown at bf1
    expect(game.gameState.interaction?.showdownStack?.at(-1)).toMatchObject({ active: true, battlefieldId: "bf1" });

    expect(game.p1.can("reveal", "block")).toBe(false); // not P1's card, and P1 cannot even see it
    expect(game.p2.can("reveal", "block")).toBe(false); // P1 (the attacker) still holds Focus
    await game.p1.passFocus();
    expect(game.p2.can("reveal", "block")).toBe(true); // [0] on a later turn — 811
    const before = game.p2.resources();
    await game.p2.reveal("block");
    await game.p2.pick("holder"); // Block's target, chosen as it is played (355.5)
    expect(game.p2.resources()).toEqual(before); // the react-later line is free

    await game.settle();
    expect(game.zoneOf("block")).toBe("trash"); // revealed, resolved, public
    expect(game.state("holder").grantedKeywords).toEqual(
      expect.arrayContaining([
        { duration: "turn", keyword: "Shield", value: 3 },
        expect.objectContaining({ duration: "turn", keyword: "Tank" }),
      ]),
    );
  });

  test("Renata's score ability needs her AT a battlefield, costs [4] + four [mind] + [Exhaust], and is never forced (194.1.c)", async () => {
    const inBase = await scenario()
      .active(P1)
      .resources(P1, { energy: 4, power: { mind: 4 } })
      .unit(P1, "base", RENATA, "renata")
      .build();
    expect(inBase.p1.can("activate", "renata")).toBe(false); // "Use my abilities only while I'm at a battlefield"

    const game = await board().build();
    expect(game.p1.can("activate", "renata")).toBe(true); // an activated ability is opt-in: declining is just not doing it
    await game.p1.activate("renata", 1);
    await game.settle();
    expect(game.p1.energy()).toBe(0);
    expect(game.p1.power("mind")).toBe(0);
    expect(game.state("renata").isExhausted).toBe(true);
  });

  test("YES side — the 8th point ends the game (319.5 / 194.2) and every facedown card is revealed to all players (421.4): P1's own view now names the Block", async () => {
    const game = await board().build();
    const { frames, session } = sessionFor(game, "duel");
    expect(facedownAt(session, P1, "bf1")[0]?.definitionId).toBe("");

    await game.p1.activate("renata", 1);
    await game.settle();
    expect(game.p1.points()).toBe(8);
    expect(game.isOver()).toBe(true);
    expect(game.winner()).toBe(P1);

    noteGameState(session);
    expect(frames.some((f) => f.type === "game_over")).toBe(true);

    const revealed = facedownAt(session, P1, "bf1");
    expect(revealed[0]).toMatchObject({ definitionId: BLOCK, id: "block", owner: P2 });
    expect(revealed[0]?.name).toBe("Block");
    expect(JSON.stringify(buildGameSnapshot(session, P1))).toContain(BLOCK);
  });

  test("NO side — Continue to game 2 throws game 1 away (486.6): a NEW engine, no points, no board, no Block, and the match line reads 1-0", async () => {
    const game = await board().build();
    const { gameId, session } = sessionFor(game, "duel");
    await game.p1.activate("renata", 1);
    await game.settle();
    noteGameState(session, gameId);
    const oldEngine = session.engine;

    expect(voteContinue(session, gameId, P1)).toEqual({ ok: true });
    expect(voteContinue(session, gameId, P2)).toEqual({ ok: true });

    expect(session.engine).not.toBe(oldEngine); // 486.6 — a fresh game state
    expect(session.gameNumber).toBe(2);
    expect(session.pregame?.phase).toBe("battlefield_select");
    const fresh = session.engine.getState();
    expect(fresh.status).not.toBe("finished");
    expect(fresh.players[P1]?.victoryPoints ?? 0).toBe(0);
    expect(fresh.players[P2]?.victoryPoints ?? 0).toBe(0);

    const snap = buildGameSnapshot(session, P1);
    expect(JSON.stringify(snap.zones)).not.toContain(BLOCK); // the revealed Block does not bleed through
    expect(JSON.stringify(snap.zones)).not.toContain(RENATA);
    expect((snap.zones as Record<string, ZoneCard[]>)["facedown-bf1"] ?? []).toEqual([]);

    const summary = matchSummary(session);
    expect(summary.gameNumber).toBe(2);
    expect(summary.score).toMatchObject({ [P1]: 1, [P2]: 0 });
    expect(summary.decided).toBe(false);
  });

  test("leaving the match frees the session server-side: a state fetch for the old game id is a 404", async () => {
    const game = await board().build();
    const { gameId, session } = sessionFor(game, "duel");
    const url = new URL(`http://x/api/game/${gameId}/state`);
    const ok = await handleGameRoutes(new Request(url), url, {} as RouteCtx);
    expect(ok?.status).toBe(200);

    // Leaving = the sockets close and the session is released (server/state.ts reaper).
    session.clients.clear();
    gameSessions.delete(gameId);
    const gone = await handleGameRoutes(new Request(url), url, {} as RouteCtx);
    expect(gone?.status).toBe(404);
    expect(await gone?.json()).toMatchObject({ error: "Game not found" });
  });
});
