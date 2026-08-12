/**
 * rule 357.1.a / 809.1.d — `reachablePlays` and `unaffordableTargets` answer
 * "what could THIS SEAT still pay for?", so a snapshot built with no viewer
 * ships them empty. Every frame a player actually reads must therefore be
 * built for their seat.
 *
 * Both surfaces below got that wrong, and both showed up as the same reported
 * symptom — an entirely inert hand at the start of a Main Phase, the moment
 * the pool is empty (167.1 / 316.3) and every card is one tap away:
 *
 *  1. The Goldfish auto-play broadcast built ONE seat-less snapshot and sent
 *     it to every client. The Goldfish auto-passes straight through to the
 *     human's next Main Phase, so that frame was the LAST one the human held
 *     while looking at their opening hand — no card marked reachable until
 *     they touched something themselves, at which point the per-seat
 *     `move_accepted` frame lit six cards at once.
 *  2. `GET /api/game/:id/state` has no user→seat binding at all, so it too
 *     answered empty for every caller. It now honours the seat the caller
 *     names, exactly as `/moves` does.
 *
 * A third bug lived one layer down and is covered here from the app side: a
 * card whose only blocker was a target's [Deflect] instalment priced as fully
 * funded, so it never reached `reachablePlays` — leaving the dimmed-target
 * screen unreachable in the one case it exists for.
 *
 * Per-seat privacy of the REST route is snapshot-privacy.test.ts's business;
 * this file only guards that a seated caller gets a real answer.
 */

import { afterAll, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { P1, P2, scenario } from "@tcg/riftbound/harness";

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "rb-reachable-rest-test-"));
process.env.RIFTBOUND_DB_PATH ??= path.join(TMP_DIR, "test.db");

const { closeDb } = await import("../../src/db/schema");
const { handleGameRoutes } = await import("../routes-game");
const { gameSessions } = await import("../state");
const { sandboxAutoPlay } = await import("../turn");

type GameSession = import("../state").GameSession;

afterAll(() => {
  closeDb();
  fs.rmSync(TMP_DIR, { force: true, recursive: true });
});

const POUTY_PORO = "ogn-013-298"; // [Deflect] — choosing it costs an extra [rainbow]
const CLEAVE = "ogn-004-298"; // 1 Energy · "Give a unit [Assault 3] this turn."

/** Unit · 2 Energy. */
const TWO_COST_UNIT = { cardType: "unit", domain: "fury", energyCost: 2, might: 2, name: "Filler Two Cost" };
/** Gear · 0 Energy + [fury]. */
const FURY_GEAR = { cardType: "gear", domain: "fury", energyCost: 0, name: "Filler Fury Gear", powerCost: ["fury"] };

type RestState = {
  reachablePlays: { cardId: string; moveId: string; needsAdd: { energy?: number; power?: Record<string, number>; reason: string } }[];
  unaffordableTargets: { cardId: string; targets: string[]; surcharge: number; needsAdd?: { reason: string } }[];
  runePools: Record<string, { energy: number; power: Record<string, number> }>;
};

function sessionOf(engine: unknown): GameSession {
  return {
    clients: new Map(),
    engine: engine as GameSession["engine"],
    log: [],
    playerNames: { [P1]: "Alice", [P2]: "Bob" },
    players: [P1, P2],
    sandbox: true,
    seq: 0,
  };
}

/** `GET /api/game/:id/state[?playerId=…]` against a freshly registered session. */
async function restState(session: GameSession, seat?: string): Promise<RestState> {
  const gameId = crypto.randomUUID();
  gameSessions.set(gameId, session);
  try {
    const req = new Request(`http://x/api/game/${gameId}/state${seat ? `?playerId=${seat}` : ""}`);
    const res = await handleGameRoutes(req, new URL(req.url), {} as never);
    expect(res?.status).toBe(200);
    return (await res!.json()) as RestState;
  } finally {
    gameSessions.delete(gameId);
  }
}

/** The start of a Main Phase: nothing pooled, five ready runes, a hand to look at. */
function openingMain() {
  let s = scenario().turn(9).active(P1).resources(P1, { energy: 0, power: {} });
  for (let i = 0; i < 5; i++) {
    s = s.rune(P1, "fury", { alias: `f${i}` });
  }
  return s.hand(P1, TWO_COST_UNIT, "two").hand(P1, FURY_GEAR, "gear");
}

describe("every frame a seat reads is built for that seat — it is told what it could still pay for", () => {
  test("0 pooled Energy with ready runes: reachablePlays is NOT empty and each card carries its pay line", async () => {
    const game = await openingMain().build();
    const state = await restState(sessionOf(game.engine), P1);

    expect(state.runePools[P1]).toEqual({ energy: 0, power: {} });
    expect(state.reachablePlays.length).toBeGreaterThan(0);
    expect(state.reachablePlays.map((r) => r.cardId).sort()).toEqual([game.card("gear"), game.card("two")].sort());
    expect(state.reachablePlays.find((r) => r.cardId === game.card("two"))).toMatchObject({
      moveId: "playUnit",
      needsAdd: { energy: 2, reason: "tap 2 runes first" },
    });
    expect(state.reachablePlays.find((r) => r.cardId === game.card("gear"))).toMatchObject({
      moveId: "playGear",
      needsAdd: { power: { fury: 1 }, reason: "recycle a rune for [fury] first" },
    });
  });

  test("the seatless caller still gets the seatless answer (no per-seat lists invented for a viewer that has no seat)", async () => {
    const game = await openingMain().build();
    expect((await restState(sessionOf(game.engine))).reachablePlays).toEqual([]);
  });

  test("the Goldfish auto-play frame is built per SEAT: the human's next Main Phase arrives with its hand already marked reachable", async () => {
    // The Goldfish's turn, with nothing to do but end it — which walks the
    // game into the human's Main Phase and fires the auto-play broadcast.
    let s = scenario().turn(4).active(P2).resources(P1, { energy: 0, power: {} });
    for (let i = 0; i < 5; i++) {
      s = s.rune(P1, "fury", { alias: `f${i}` });
    }
    const game = await s.hand(P1, TWO_COST_UNIT, "two").hand(P1, FURY_GEAR, "gear").build();

    const session = sessionOf(game.engine);
    const frames: { type: string; state: RestState }[] = [];
    session.clients.set("c1", {
      playerId: P1,
      ws: { send: (raw: string) => frames.push(JSON.parse(raw) as { type: string; state: RestState }) },
    } as unknown as NonNullable<ReturnType<typeof sessionOf>["clients"]> extends Map<string, infer C> ? C : never);

    sandboxAutoPlay(session, P2);

    const last = frames.at(-1);
    expect(last?.type).toBe("state_update");
    expect(last?.state.runePools[P1]).toEqual({ energy: 0, power: {} });
    expect(last?.state.reachablePlays.length).toBeGreaterThan(0);
    const offered = (last?.state.reachablePlays ?? []).map((r) => r.cardId);
    expect(offered).toContain(game.card("two"));
    expect(offered).toContain(game.card("gear"));
  });

  test("809.1.d — a spell whose ONLY target is [Deflect]-surcharged rides on BOTH lists, quoting the same Add", async () => {
    const game = await scenario()
      .turn(9)
      .active(P1)
      .resources(P1, { energy: 4, power: {} })
      .battlefield("bf1", { controller: P2 })
      .unit(P2, "bf1", POUTY_PORO, "poro")
      .hand(P1, CLEAVE, "cleave")
      .rune(P1, "fury", { alias: "r1" })
      .rune(P1, "fury", { alias: "r2" })
      .build();
    const state = await restState(sessionOf(game.engine), P1);

    const dimmed = state.unaffordableTargets.find((t) => t.cardId === game.card("cleave"));
    expect(dimmed).toMatchObject({ surcharge: 1 });
    expect(dimmed?.targets).toContain(game.card("poro"));

    // The card itself must be offered too — otherwise clicking it is a no-op
    // and the dimmed-target screen can never be reached.
    const offered = state.reachablePlays.find((r) => r.cardId === game.card("cleave"));
    expect(offered).toMatchObject({ moveId: "playSpell" });
    expect(offered?.needsAdd.reason).toBe(dimmed?.needsAdd?.reason);
  });
});
