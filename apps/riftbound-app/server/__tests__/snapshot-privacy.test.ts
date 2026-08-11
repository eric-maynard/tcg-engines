/**
 * The REST snapshot surface is unauthenticated — there is no user→seat binding
 * on `GET /api/game/:id/state` (the same reason REST moves are sandbox-only,
 * server/routes-game.ts). So for a real duel it must never carry the identity
 * of anyone's private cards: rule 108.7.c / 128.4 (hand and decks are private)
 * and rule 723 (a facedown card is private to its owner), with rule 421.4
 * (facedown cards are public once the game ends) as the only relaxation.
 *
 * Per-seat redaction of the WS snapshot, the rule 127 look grant and the
 * harness-view agreement are covered by snapshot-redaction.test.ts; this file
 * guards the REST path, which used to build the snapshot with no viewer at all
 * and therefore served the full unredacted state to any caller.
 */

import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { P1, P2, scenario } from "@tcg/riftbound/harness";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rb-privacy-test-"));
process.env.RIFTBOUND_DB_PATH ??= path.join(TMP_DIR, "test.db");

const { closeDb } = await import("../../src/db/schema");
const { handleGameRoutes } = await import("../routes-game");
const { gameSessions } = await import("../state");

type GameSession = import("../state").GameSession;

afterAll(() => {
  closeDb();
  fs.rmSync(TMP_DIR, { force: true, recursive: true });
});

const CONSULT_THE_PAST = "ogn-083-298";

type ZoneCard = { id: string; definitionId: string; name: string; owner: string; cardType: string };

function sessionOf(engine: unknown, sandbox: boolean): GameSession {
  return {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Alice", [P2]: "Bob" },
    players: [P1, P2],
    sandbox,
    seq: 0,
  };
}

function board(victoryScore = 15) {
  return scenario()
    .turn(3)
    .active(P1)
    .victoryScore(victoryScore)
    .resources(P1, { energy: 5 })
    .battlefield("bf1", { controller: P1 })
    .battlefield("bf2", { controller: P2 })
    .unit(P1, "bf1", { might: 2, name: "P1 Holder" }, "h1")
    .unit(P2, "bf2", { might: 3, name: "Defender D" }, "d")
    .facedown(P2, "bf2", CONSULT_THE_PAST, "ctp");
}

/** Register a session under a fresh id and fetch its REST state snapshot. */
async function restState(session: GameSession): Promise<{ zones: Record<string, ZoneCard[]> }> {
  const gameId = crypto.randomUUID();
  gameSessions.set(gameId, session);
  try {
    const req = new Request(`http://x/api/game/${gameId}/state`);
    const res = await handleGameRoutes(req, new URL(req.url), {} as never);
    expect(res?.status).toBe(200);
    return (await res!.json()) as { zones: Record<string, ZoneCard[]> };
  } finally {
    gameSessions.delete(gameId);
  }
}

describe("GET /api/game/:id/state — an unauthenticated caller never sees private cards", () => {
  test("duel: the facedown card at bf2 is only an opaque token, with its owner but no defId / name / instance id", async () => {
    const game = await board().build();
    const state = await restState(sessionOf(game.engine, false));

    const facedown = state.zones["facedown-bf2"] ?? [];
    expect(facedown).toHaveLength(1); // rule 723: the SLOT is public, the identity is not
    expect(facedown[0]).toMatchObject({ cardType: "unknown", definitionId: "", name: "Hidden card", owner: P2 });
    expect(facedown[0]?.id.startsWith("hidden-facedown-bf2-")).toBe(true);

    const wire = JSON.stringify(state.zones);
    expect(wire).not.toContain(CONSULT_THE_PAST);
    expect(wire).not.toContain("Consult the Past");
    expect(wire).not.toContain('"ctp"');
  });

  test("duel: neither seat's hand or deck is named on the REST wire (rule 108.7.c / 128.4)", async () => {
    const game = await board().build();
    const state = await restState(sessionOf(game.engine, false));

    for (const zoneId of ["hand", "mainDeck", "runeDeck"]) {
      for (const card of state.zones[zoneId] ?? []) {
        expect(card).toMatchObject({ definitionId: "", name: "Hidden card" });
        expect(card.id.startsWith(`hidden-${zoneId}-`)).toBe(true);
      }
    }
    // Public zones still render normally — redaction is scoped to private zones.
    expect((state.zones["battlefield-bf1"] ?? []).map((c) => c.id)).toContain("h1");
  });

  test("goldfish sandbox (one human drives both seats): the REST snapshot is unredacted", async () => {
    const game = await board().build();
    const state = await restState(sessionOf(game.engine, true));
    expect(state.zones["facedown-bf2"]?.[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp" });
  });

  test("vs-Claude: the AI seat is a real opponent, so REST redacts there too", async () => {
    const game = await board().build();
    const vsAi = sessionOf(game.engine, true);
    vsAi.opponent = { info: { kind: "claude", label: "Claude", model: "haiku" }, thinking: false } as unknown as GameSession["opponent"];
    const state = await restState(vsAi);
    expect(state.zones["facedown-bf2"]?.[0]).toMatchObject({ definitionId: "", name: "Hidden card" });
  });

  test("rule 421.4: once the game has ended the facedown card is public on REST as well", async () => {
    const game = await board(1).build();
    const session = sessionOf(game.engine, false);
    expect((await restState(session)).zones["facedown-bf2"]?.[0]).toMatchObject({ definitionId: "" });

    await game.p1.endTurn();
    await game.settle();
    expect(game.gameState.status).toBe("finished");

    const ended = await restState(session);
    expect(ended.zones["facedown-bf2"]?.[0]).toMatchObject({ definitionId: CONSULT_THE_PAST, id: "ctp", owner: P2 });
    // Hands stay private after the game ends — the reveal is facedown-only.
    for (const card of ended.zones["hand"] ?? []) {
      expect(card).toMatchObject({ definitionId: "", name: "Hidden card" });
    }
  });
});
